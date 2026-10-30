package com.drama.app.push

import android.content.Intent
import androidx.core.net.toUri
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.domain.model.NotificationRouting
import com.drama.domain.repository.EventsRepository
import com.drama.domain.repository.NotificationsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Side effects of a notification tap (S06-A1-02): `push_open` to Firebase and `POST /events`, the entry marked
 * read. Two intent shapes are handled once each:
 * - our own status-bar notification ([PushNotifier]): deep-link URI + [PushNotifier.EXTRA_PUSH_TYPE] extras;
 * - a notification displayed by FCM itself (app in background, `notification` block): the launcher intent
 *   carries the `data` keys (`type`, `notificationId`, `seriesId`, ...) as extras; the deep link is derived from
 *   them and set on the intent so the NavHost routes it like any other.
 */
@Singleton
class PushOpenHandler
    @Inject
    constructor(
        private val analytics: AnalyticsTracker,
        private val events: EventsRepository,
        private val notifications: NotificationsRepository,
        private val logger: Logger,
        dispatchers: DispatcherProvider,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + dispatchers.io)

        fun onIntent(intent: Intent?) {
            if (intent == null) return
            val ownType = intent.getStringExtra(PushNotifier.EXTRA_PUSH_TYPE)
            if (ownType != null) {
                val id = intent.getStringExtra(PushNotifier.EXTRA_PUSH_ID)
                intent.removeExtra(PushNotifier.EXTRA_PUSH_TYPE)
                intent.removeExtra(PushNotifier.EXTRA_PUSH_ID)
                opened(id, ownType, intent)
                return
            }
            // FCM-rendered notification: data keys are plain extras alongside google.message_id.
            val fcmType = intent.getStringExtra(NotificationRouting.KEY_TYPE)
            if (fcmType != null &&
                (intent.hasExtra(FCM_MESSAGE_ID) || intent.hasExtra(NotificationRouting.KEY_NOTIFICATION_ID))
            ) {
                val data =
                    intent.extras
                        ?.keySet()
                        .orEmpty()
                        .mapNotNull { key -> intent.extras?.getString(key)?.let { key to it } }
                        .toMap()
                val id = data[NotificationRouting.KEY_NOTIFICATION_ID]
                intent.removeExtra(NotificationRouting.KEY_TYPE)
                intent.removeExtra(FCM_MESSAGE_ID)
                val target = NotificationRouting.target(fcmType, data)
                intent.action = Intent.ACTION_VIEW
                intent.data = NotificationRouting.deepLink(target).toUri()
                opened(id, fcmType, intent)
            }
        }

        private fun opened(
            id: String?,
            type: String,
            intent: Intent,
        ) {
            logger.i(PushNotifier.TAG, "push opened id=$id type=$type uri=${intent.data}")
            analytics.track(AnalyticsEvent.PushOpen(id, type))
            events.track(
                "push_open",
                buildMap {
                    put("type", type)
                    id?.let { put("notification_id", it) }
                },
            )
            if (id != null) {
                scope.launch {
                    notifications.markRead(id)
                    notifications.invalidate()
                }
            }
        }

        private companion object {
            const val FCM_MESSAGE_ID = "google.message_id"
        }
    }
