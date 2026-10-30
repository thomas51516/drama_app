package com.drama.core.ads

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.domain.model.AdOutcome
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.FakeAdPrompt
import com.drama.domain.model.RewardedAdRequest
import com.drama.domain.repository.AdGateway
import com.drama.domain.repository.AdRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Simulated ad network for debug builds and tests (S08-A1-01). [showRewardedAd] publishes a [FakeAdPrompt] that
 * the player renders full screen (countdown, close only once complete); when the viewer watched it to the end the
 * gateway plays the SSV callback through [AdRepository.simulateServerReward], exactly where AdMob's servers would
 * call the backend. The reward itself is still decided by the server: callers poll the session afterwards.
 */
@Singleton
class FakeAdGateway
    @Inject
    constructor(
        private val ads: AdRepository,
        private val logger: Logger,
    ) : AdGateway {
        private val mutex = Mutex()
        private val promptFlow = MutableStateFlow<FakeAdPrompt?>(null)
        private var pending: CompletableDeferred<Boolean>? = null

        override val isAvailable: Boolean = true
        override val fakeAd: StateFlow<FakeAdPrompt?> = promptFlow.asStateFlow()

        override suspend fun showRewardedAd(
            host: AdUiHost,
            request: RewardedAdRequest,
        ): AdOutcome {
            val answer =
                mutex.withLock {
                    if (pending != null) return AdOutcome.Failed(code = -1, message = "ad in progress")
                    CompletableDeferred<Boolean>().also {
                        pending = it
                        promptFlow.value = FakeAdPrompt(request, DURATION_SECONDS)
                    }
                }
            val completed =
                try {
                    answer.await()
                } finally {
                    mutex.withLock {
                        pending = null
                        promptFlow.value = null
                    }
                }
            logger.i(TAG, "fake ad session=${request.sessionId} completed=$completed")
            if (!completed) return AdOutcome.Dismissed
            return when (val ssv = ads.simulateServerReward(request)) {
                is AppResult.Success -> AdOutcome.Rewarded
                is AppResult.Failure -> {
                    logger.w(TAG, "fake SSV callback refused: ${ssv.error}")
                    // The ad was watched: let the caller poll; the server will say REJECTED or stay PENDING.
                    AdOutcome.Rewarded
                }
            }
        }

        override fun finishFakeAd(completed: Boolean) {
            pending?.complete(completed)
        }

        companion object {
            private const val TAG = "FakeAds"
            const val DURATION_SECONDS = 5
        }
    }
