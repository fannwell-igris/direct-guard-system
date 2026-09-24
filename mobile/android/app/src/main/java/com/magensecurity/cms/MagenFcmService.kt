package com.magensecurity.cms

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.random.Random

/**
 * Receives push notifications sent by the backend's push-notifier
 * (backend/src/modules/alerts/push-notifier.ts) and shows them as a
 * normal Android notification. Tapping one just opens the app -- the
 * category/referenceId in the data payload is available for a future
 * "deep link straight to that alert" if that's ever worth building.
 */
class MagenFcmService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        reregisterRotatedToken(applicationContext, token)
    }

    // POST_NOTIFICATIONS is requested at login time in MainActivity; if the
    // person declined it, notify() below is silently a no-op rather than a
    // crash, so suppressing the lint check here is safe.
    @SuppressLint("MissingPermission")
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title = message.notification?.title ?: "Magen CMS"
        val body = message.notification?.body ?: return

        createNotificationChannel(applicationContext)

        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, flags)

        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.magen_green))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        // A random id per notification so multiple alerts stack instead of
        // overwriting each other.
        NotificationManagerCompat.from(this).notify(Random.nextInt(), notification)
    }
}
