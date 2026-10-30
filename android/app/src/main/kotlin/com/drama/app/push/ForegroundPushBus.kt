package com.drama.app.push

import android.app.Activity
import android.app.Application
import android.os.Bundle
import com.drama.domain.model.PushMessage
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pushes received while the app is in the foreground are shown as a snackbar by [com.drama.app.navigation.DramaNavHost]
 * instead of a status-bar notification. Foreground = at least one started activity.
 */
@Singleton
class ForegroundPushBus
    @Inject
    constructor() : Application.ActivityLifecycleCallbacks {
        private val messagesFlow = MutableSharedFlow<PushMessage>(extraBufferCapacity = BUFFER)
        val messages: SharedFlow<PushMessage> = messagesFlow.asSharedFlow()

        @Volatile
        private var startedActivities = 0

        val isForeground: Boolean get() = startedActivities > 0

        fun publish(message: PushMessage) {
            messagesFlow.tryEmit(message)
        }

        override fun onActivityStarted(activity: Activity) {
            startedActivities++
        }

        override fun onActivityStopped(activity: Activity) {
            startedActivities = (startedActivities - 1).coerceAtLeast(0)
        }

        override fun onActivityCreated(
            activity: Activity,
            savedInstanceState: Bundle?,
        ) = Unit

        override fun onActivityResumed(activity: Activity) = Unit

        override fun onActivityPaused(activity: Activity) = Unit

        override fun onActivitySaveInstanceState(
            activity: Activity,
            outState: Bundle,
        ) = Unit

        override fun onActivityDestroyed(activity: Activity) = Unit

        private companion object {
            const val BUFFER = 8
        }
    }
