package com.drama.domain.usecase

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdIneligibleReason
import com.drama.domain.model.AdOutcome
import com.drama.domain.model.AdSessionState
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.Episode
import com.drama.domain.model.RewardedAdRequest
import com.drama.domain.model.SessionState
import com.drama.domain.repository.AdGateway
import com.drama.domain.repository.AdRepository
import com.drama.domain.repository.SessionRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

/** End of the "watch an ad to unlock" flow (M-22). */
sealed interface AdUnlockResult {
    /** The server confirmed the reward: the episode is unlocked (`method: "ad"`). */
    data class Unlocked(
        val episodeId: String,
    ) : AdUnlockResult

    data class NotEligible(
        val reason: AdIneligibleReason?,
        val remainingToday: Int,
    ) : AdUnlockResult

    /** Ad closed before the end. */
    data object Dismissed : AdUnlockResult

    /** The ad played but the server did not confirm within the polling window. */
    data object Pending : AdUnlockResult

    /** The server refused the session (expired, signature...). */
    data object Rejected : AdUnlockResult

    data class AdUnavailable(
        val reason: String?,
    ) : AdUnlockResult

    data class Failed(
        val error: AppError,
    ) : AdUnlockResult
}

fun interface WatchRewardedAdUseCase {
    /** Eligibility is re-checked server-side even when [eligibility] was fetched a moment ago. */
    suspend operator fun invoke(
        host: AdUiHost,
        episode: Episode,
        eligibility: AdEligibility?,
    ): AdUnlockResult
}

/**
 * `GET /ads/eligibility` -> `POST /ads/sessions` -> ad network -> poll `GET /ads/sessions/{id}` until the server
 * recorded the SSV callback (at most [POLL_TIMEOUT_MS]). The client never grants the reward itself.
 */
class DefaultWatchRewardedAdUseCase(
    private val ads: AdRepository,
    private val gateway: AdGateway,
    private val session: SessionRepository,
    private val clock: Clock,
    private val pollIntervalMs: Long = POLL_INTERVAL_MS,
    private val pollTimeoutMs: Long = POLL_TIMEOUT_MS,
) : WatchRewardedAdUseCase {
    override suspend fun invoke(
        host: AdUiHost,
        episode: Episode,
        eligibility: AdEligibility?,
    ): AdUnlockResult {
        val check =
            eligibility ?: when (val result = ads.eligibility(episode.id)) {
                is AppResult.Success -> result.value
                is AppResult.Failure -> return AdUnlockResult.Failed(result.error)
            }
        if (!check.eligible) return AdUnlockResult.NotEligible(check.reason, check.remainingToday)
        val adUnitId = check.adUnitId ?: return AdUnlockResult.AdUnavailable(AdIneligibleReason.NO_PROVIDER.name)
        if (!gateway.isAvailable) return AdUnlockResult.AdUnavailable(null)
        val adSession =
            when (val result = ads.createSession(episode.id)) {
                is AppResult.Success -> result.value
                is AppResult.Failure -> return AdUnlockResult.Failed(result.error)
            }
        val userId =
            (
                session.state.first { it is SessionState.Authenticated || it is SessionState.SignedOut }
                    as? SessionState.Authenticated
            )?.userId
        val request =
            RewardedAdRequest(
                sessionId = adSession.sessionId,
                adUnitId = adUnitId,
                userId = userId,
                customData = adSession.customData,
            )
        when (val outcome = gateway.showRewardedAd(host, request)) {
            AdOutcome.Dismissed -> return AdUnlockResult.Dismissed
            is AdOutcome.Unavailable -> return AdUnlockResult.AdUnavailable(outcome.reason)
            is AdOutcome.Failed -> return AdUnlockResult.Failed(
                AppError.Unknown(IllegalStateException(outcome.message)),
            )
            AdOutcome.Rewarded -> Unit
        }
        return poll(adSession.sessionId, episode)
    }

    private suspend fun poll(
        sessionId: String,
        episode: Episode,
    ): AdUnlockResult {
        val deadline = clock.nowEpochMs() + pollTimeoutMs
        var lastError: AppError? = null
        while (true) {
            when (val status = ads.sessionStatus(sessionId, episode.seriesId, episode.id)) {
                is AppResult.Success -> {
                    val value = status.value
                    when {
                        value.unlocked || value.state == AdSessionState.REWARDED -> return AdUnlockResult.Unlocked(
                            episode.id,
                        )
                        AdSessionState.isFinal(value.state) -> return AdUnlockResult.Rejected
                    }
                }
                is AppResult.Failure -> lastError = status.error
            }
            if (clock.nowEpochMs() >= deadline) {
                return lastError?.let { AdUnlockResult.Failed(it) } ?: AdUnlockResult.Pending
            }
            delay(pollIntervalMs)
        }
    }

    companion object {
        const val POLL_INTERVAL_MS = 1_000L
        const val POLL_TIMEOUT_MS = 15_000L
    }
}
