package com.magensecurity.cms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives Firebase Cloud Messaging events for the Magen CMS app.
 *
 * Two responsibilities:
 *
 * 1. onNewToken — called whenever FCM assigns a fresh token to this device
 *    (first launch after install, after the app is cleared/reinstalled, or
 *    periodically when FCM rotates tokens). Stores the token locally so
 *    MainActivity can read it and pass it to the web app via the JS bridge,
 *    which in turn POSTs it to /api/push-tokens.
 *
 * 2. onMessageReceived — called when a data/notification message arrives
 *    while the app is in the foreground. When the app is in the background
 *    or killed, Firebase itself builds and shows the notification using the
 *    default channel/icon/color declared in AndroidManifest.xml, so we
 *    don't need to handle that case here.
 */
class MagenFcmService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Persist the token so MainActivity can pick it up as soon as the
        // WebView has loaded and the user is logged in.
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_FCM_TOKEN, token)
            .apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // Only build a notification manually when the app is foregrounded —
        // Firebase handles the background/killed cases automatically via the
        // manifest defaults.
        val title = message.notification?.title
            ?: message.data["title"]
            ?: "Magen CMS"
        val body = message.notification?.body
            ?: message.data["body"]
            ?: return   // nothing to show

        showNotification(title, body)
    }

    // ------------------------------------------------------------------ //

    private fun showNotification(title: String, body: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create the channel on Android 8+ (no-op if it already exists).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Magen CMS Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Operational alerts from the Magen CMS"
                enableVibration(true)
            }
            manager.createNotificationChannel(channel)
        }

        // Tapping the notification opens MainActivity (which already has
        // singleTop / singleTask launch mode via Android defaults, so it
        // won't stack a second instance).
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.magen_green))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        manager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        const val PREFS_NAME = "magen_cms_prefs"
        const val KEY_FCM_TOKEN = "fcm_token"
        private const val CHANNEL_ID = "magen_cms_alerts"
        private const val NOTIFICATION_ID = 1001
    }
}
