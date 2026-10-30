package com.drama.app.startup

import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.domain.model.SessionState
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.RemoteConfigRepository
import com.drama.domain.repository.SessionRepository
import com.drama.domain.usecase.RestorePurchasesUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** Process-start work: `app_open`, guest session bootstrap, analytics user id, push token registration. */
@Singleton
class AppStartup
    @Inject
    constructor(
        private val sessionRepository: SessionRepository,
        private val pushRepository: PushRepository,
        private val analytics: AnalyticsTracker,
        private val restorePurchases: RestorePurchasesUseCase,
        private val remoteConfig: RemoteConfigRepository,
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
            // M-54: (re)register the FCM token whenever the signed-in user changes (guest bootstrap, sign-in, logout).
            scope.launch {
                sessionRepository.state
                    .filterIsInstance<SessionState.Authenticated>()
                    .map { it.userId }
                    .distinctUntilChanged()
                    .collect { userId ->
                        when (val result = pushRepository.syncToken()) {
                            is AppResult.Success -> logger.i(TAG, "push token in sync for user=$userId")
                            is AppResult.Failure -> logger.w(TAG, "push token not registered: ${result.error}")
                        }
                        // M-31: a purchase paid but never verified (crash, offline) is credited at the next start.
                        when (val restored = restorePurchases()) {
                            is AppResult.Success ->
                                if (restored.value.isNotEmpty()) {
                                    logger.i(TAG, "recovered ${restored.value.size} unverified purchase(s)")
                                }
                            is AppResult.Failure -> logger.w(TAG, "purchase recovery skipped: ${restored.error}")
                        }
                    }
            }
            // M-34: Remote Config flags (mobile money link) refreshed once per process start.
            scope.launch { remoteConfig.refresh() }
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
