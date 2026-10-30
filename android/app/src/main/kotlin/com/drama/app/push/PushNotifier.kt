package com.drama.app.push

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import com.drama.app.MainActivity
import com.drama.app.R
import com.drama.core.common.logging.Logger
import com.drama.domain.model.NotificationRouting
import com.drama.domain.model.PushMessage
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Posts a status-bar notification for a [PushMessage]. The tap opens [MainActivity] on the `drama://` deep link
 * of the routing target and carries the notification id/type so the open is tracked (`push_open`) and marked read.
 */
@Singleton
class PushNotifier
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val logger: Logger,
    ) {
        fun canPost(): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED

        fun show(message: PushMessage) {
            if (!canPost() || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                logger.w(TAG, "notification not shown (permission or channel disabled): ${message.title}")
                return
            }
            NotificationChannels.ensure(context)
            val notificationId = message.id?.hashCode() ?: message.title.hashCode()
            val notification =
                NotificationCompat
                    .Builder(context, message.channel.id)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setColor(ContextCompat.getColor(context, R.color.notification_accent))
                    .setContentTitle(message.title)
                    .setContentText(message.body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(message.body))
                    .setAutoCancel(true)
                    .setContentIntent(contentIntent(message, notificationId))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .build()
            try {
                NotificationManagerCompat.from(context).notify(notificationId, notification)
                logger.i(TAG, "notification shown id=${message.id} type=${message.type} channel=${message.channel.id}")
            } catch (e: SecurityException) {
                logger.w(TAG, "notification refused by the system", e)
            }
        }

        private fun contentIntent(
            message: PushMessage,
            requestCode: Int,
        ): PendingIntent {
            val intent =
                Intent(
                    Intent.ACTION_VIEW,
                    NotificationRouting.deepLink(message.target).toUri(),
                    context,
                    MainActivity::class.java,
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(EXTRA_PUSH_TYPE, message.type)
                    .apply { message.id?.let { putExtra(EXTRA_PUSH_ID, it) } }
            return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        companion object {
            const val TAG = "Push"
            const val EXTRA_PUSH_ID = "com.drama.app.push.NOTIFICATION_ID"
            const val EXTRA_PUSH_TYPE = "com.drama.app.push.NOTIFICATION_TYPE"
        }
    }
