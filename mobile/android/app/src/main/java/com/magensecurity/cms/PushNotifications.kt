package com.magensecurity.cms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shared push-notification plumbing used by both MainActivity (registers
 * on login, unregisters on logout) and MagenFcmService (re-registers
 * automatically if Firebase rotates the token in the background). Kept
 * in one place so both call sites stay in sync.
 */
const val NOTIFICATION_CHANNEL_ID = "magen_cms_alerts"

// Same backend the WebView talks to (frontend/.env's VITE_API_URL in
// production) -- changing this requires a new build, same tradeoff as
// MainActivity's appUrl.
private const val API_BASE_URL = "https://company-management-system-production-4d77.up.railway.app/api"

private const val PREFS_NAME = "magen_cms"
private const val PREF_AUTH_TOKEN = "auth_token"
private const val PREF_FCM_TOKEN = "fcm_token"

private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val existing = manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID)
    if (existing != null) return

    val channel = NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "CMS Alerts",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Invoice, contract, payroll and roster alerts from the Magen CMS."
    }
    manager.createNotificationChannel(channel)
}

/**
 * Called right after a successful login (see MainActivity's NativeBridge)
 * and also opportunistically on every cold app start if a session is
 * already active. Fetches the device's current FCM token and registers
 * it against this user's account; safe to call repeatedly.
 */
fun registerPushToken(context: Context, authToken: String) {
    prefs(context).edit().putString(PREF_AUTH_TOKEN, authToken).apply()

    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (!task.isSuccessful) return@addOnCompleteListener
        val fcmToken = task.result ?: return@addOnCompleteListener
        prefs(context).edit().putString(PREF_FCM_TOKEN, fcmToken).apply()
        sendTokenToBackend(authToken, fcmToken)
    }
}

/** Called when Firebase rotates the token on its own, outside of any login flow. */
fun reregisterRotatedToken(context: Context, newFcmToken: String) {
    prefs(context).edit().putString(PREF_FCM_TOKEN, newFcmToken).apply()
    val authToken = prefs(context).getString(PREF_AUTH_TOKEN, null) ?: return
    sendTokenToBackend(authToken, newFcmToken)
}

/** Called on logout (see MainActivity's NativeBridge) to stop pushes to this device. */
fun unregisterStoredPushToken(context: Context) {
    val fcmToken = prefs(context).getString(PREF_FCM_TOKEN, null)
    val authToken = prefs(context).getString(PREF_AUTH_TOKEN, null)
    prefs(context).edit().remove(PREF_AUTH_TOKEN).apply()

    if (fcmToken == null || authToken == null) return
    Thread {
        try {
            val conn = URL("$API_BASE_URL/push-tokens").openConnection() as HttpURLConnection
            conn.requestMethod = "DELETE"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $authToken")
            conn.doOutput = true
            conn.outputStream.use { it.write(JSONObject().put("token", fcmToken).toString().toByteArray()) }
            conn.responseCode // trigger the request
            conn.disconnect()
        } catch (_: Exception) {
            // Best-effort -- if this fails, the token just goes stale on
            // the server until it's reassigned to whoever logs in next.
        }
    }.start()
}

private fun sendTokenToBackend(authToken: String, fcmToken: String) {
    Thread {
        try {
            val conn = URL("$API_BASE_URL/push-tokens").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $authToken")
            conn.doOutput = true
            val body = JSONObject().put("token", fcmToken).put("platform", "android")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            conn.responseCode // trigger the request
            conn.disconnect()
        } catch (_: Exception) {
            // Best-effort -- a transient network failure here just means
            // this device won't get pushes until the next successful
            // registration attempt (next login or token rotation).
        }
    }.start()
}
