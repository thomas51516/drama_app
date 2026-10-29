package com.drama.app.startup

import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.domain.model.SessionState
import com.drama.domain.repository.SessionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Process-start work: `app_open`, guest session bootstrap, analytics user id. */
@Singleton
class AppStartup
    @Inject
    constructor(
        private val sessionRepository: SessionRepository,
        private val analytics: AnalyticsTracker,
        private val dispatchers: DispatcherProvider,
        private val logger: Logger,
    ) {
        private val scope = CoroutineScope(SupervisorJob() + dispatchers.io)

        fun onAppCreate() {
            analytics.track(AnalyticsEvent.AppOpen)
            scope.launch {
                sessionRepository.state
                    .distinctUntilChanged()
                    .onEach { state ->
                        if (state is SessionState.Authenticated) analytics.setUserId(state.userId)
                        logger.i(TAG, "session state: $state")
                    }.collect()
            }
            scope.launch {
                when (val result = sessionRepository.ensureSession()) {
                    is AppResult.Success -> logger.i(TAG, "guest session ready user=${result.value.userId}")
                    is AppResult.Failure -> logger.w(TAG, "guest session not available yet: ${result.error}")
                }
            }
        }

        private companion object {
            const val TAG = "AppStartup"
        }
    }
