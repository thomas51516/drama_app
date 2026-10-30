package com.drama.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationManagerCompat
import com.drama.app.R
import com.drama.domain.model.NotificationChannelKind

/** Creates (idempotently) the notification channels of M-54; names follow the app locale. */
object NotificationChannels {
    fun ensure(context: Context) {
        val manager = NotificationManagerCompat.from(context)
        NotificationChannelKind.entries.forEach { kind ->
            val (name, description, importance) =
                when (kind) {
                    NotificationChannelKind.NEW_EPISODES ->
                        Triple(
                            R.string.channel_new_episodes,
                            R.string.channel_new_episodes_description,
                            NotificationManager.IMPORTANCE_DEFAULT,
                        )
                    NotificationChannelKind.OFFERS ->
                        Triple(
                            R.string.channel_offers,
                            R.string.channel_offers_description,
                            NotificationManager.IMPORTANCE_LOW,
                        )
                    NotificationChannelKind.REMINDERS ->
                        Triple(
                            R.string.channel_reminders,
                            R.string.channel_reminders_description,
                            NotificationManager.IMPORTANCE_DEFAULT,
                        )
                    NotificationChannelKind.SUPPORT ->
                        Triple(
                            R.string.channel_support,
                            R.string.channel_support_description,
                            NotificationManager.IMPORTANCE_DEFAULT,
                        )
                }
            manager.createNotificationChannel(
                NotificationChannel(kind.id, context.getString(name), importance).apply {
                    setDescription(context.getString(description))
                },
            )
        }
    }
}
