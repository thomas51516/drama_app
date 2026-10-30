package com.drama.app.push

import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.domain.model.NotificationRouting
import com.drama.domain.repository.NotificationsRepository
import com.drama.domain.repository.PushRepository
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * FCM entry point (M-54). The backend sends data messages (`title`, `body`, `type`, `seriesId`, `episodeId`,
 * `notificationId`, `deepLink`); a `notification` block, if any, only provides the texts. In the foreground the
 * message becomes a snackbar, otherwise a status-bar notification on the channel of its type.
 */
@AndroidEntryPoint
class DramaMessagingService : FirebaseMessagingService() {
    @Inject
    lateinit var pushRepository: PushRepository

    @Inject
    lateinit var notificationsRepository: NotificationsRepository

    @Inject
    lateinit var notifier: PushNotifier

    @Inject
    lateinit var foregroundBus: ForegroundPushBus

    @Inject
    lateinit var dispatchers: DispatcherProvider

    @Inject
    lateinit var logger: Logger

    private val scope by lazy { CoroutineScope(SupervisorJob() + dispatchers.io) }

    override fun onNewToken(token: String) {
        logger.i(PushNotifier.TAG, "FCM token refreshed")
        scope.launch { pushRepository.onNewToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data =
            buildMap {
                putAll(message.data)
                message.notification?.title?.let { putIfAbsent(NotificationRouting.KEY_TITLE, it) }
                message.notification?.body?.let { putIfAbsent(NotificationRouting.KEY_BODY, it) }
            }
        val push = NotificationRouting.parsePayload(data)
        if (push == null) {
            logger.w(PushNotifier.TAG, "push ignored (no title): keys=${data.keys}")
            return
        }
        logger.i(
            PushNotifier.TAG,
            "push received id=${push.id} type=${push.type} foreground=${foregroundBus.isForeground}",
        )
        notificationsRepository.invalidate()
        if (foregroundBus.isForeground) foregroundBus.publish(push) else notifier.show(push)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
