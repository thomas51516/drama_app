package com.drama.domain.model

/** Why the viewer cannot watch a rewarded ad for this episode (`GET /ads/eligibility`, M-22). */
enum class AdIneligibleReason {
    CAP_REACHED,
    SERIES_NOT_ELIGIBLE,
    ALREADY_UNLOCKED,
    NO_PROVIDER,
    UNKNOWN,
    ;

    companion object {
        fun from(raw: String?): AdIneligibleReason? =
            raw?.let { r -> entries.firstOrNull { it.name.equals(r, ignoreCase = true) } ?: UNKNOWN }
    }
}

data class AdEligibility(
    val eligible: Boolean,
    val remainingToday: Int,
    val dailyCap: Int,
    val reason: AdIneligibleReason?,
    /** Ad unit the client must load; null when the provider is not configured. */
    val adUnitId: String?,
    /** `admob` | `fake`. */
    val provider: String?,
)

/** `POST /ads/sessions`: the session the server will expect in the SSV callback (`customData`). */
data class AdSession(
    val sessionId: String,
    val customData: String,
    val expiresAtEpochMs: Long?,
)

enum class AdSessionState {
    PENDING,
    REWARDED,
    EXPIRED,
    REJECTED,
    UNKNOWN,
    ;

    companion object {
        fun from(raw: String?): AdSessionState =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: UNKNOWN

        fun isFinal(state: AdSessionState): Boolean = state != PENDING && state != UNKNOWN
    }
}

/** `GET /ads/sessions/{id}`, polled by the app after the ad closed. */
data class AdSessionStatus(
    val state: AdSessionState,
    val unlocked: Boolean,
)

/** What the ad network needs to show one rewarded ad with server-side verification. */
data class RewardedAdRequest(
    val sessionId: String,
    val adUnitId: String,
    /** Server user id passed as SSV `user_id`; null for a session without user. */
    val userId: String?,
    /** Opaque string from [AdSession.customData], passed as SSV `custom_data`. */
    val customData: String,
)

/** End of [com.drama.domain.repository.AdGateway.showRewardedAd]. */
sealed interface AdOutcome {
    /** The viewer earned the reward client-side; the server decides through the SSV callback. */
    data object Rewarded : AdOutcome

    /** Closed before the end: no reward. */
    data object Dismissed : AdOutcome

    /** No fill, network not initialised, store missing... */
    data class Unavailable(
        val reason: String?,
    ) : AdOutcome

    data class Failed(
        val code: Int,
        val message: String?,
    ) : AdOutcome
}

/** Marker for the screen hosting the ad network's full-screen ad (an Activity on Android); opaque to the domain. */
interface AdUiHost

/** The simulated ad the fake gateway asks the UI to render full screen (debug builds). */
data class FakeAdPrompt(
    val request: RewardedAdRequest,
    val durationSeconds: Int,
)
