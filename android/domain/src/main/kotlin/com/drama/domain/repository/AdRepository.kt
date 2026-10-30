package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdSession
import com.drama.domain.model.AdSessionStatus
import com.drama.domain.model.RewardedAdRequest

/** Rewarded-ad sessions (M-22, contract v1.5). The server alone decides the unlock, through the SSV callback. */
interface AdRepository {
    suspend fun eligibility(episodeId: String): AppResult<AdEligibility>

    suspend fun createSession(episodeId: String): AppResult<AdSession>

    /** `GET /ads/sessions/{id}`; when `unlocked` the cached episode status is flipped to unlocked. */
    suspend fun sessionStatus(
        sessionId: String,
        seriesId: String,
        episodeId: String,
    ): AppResult<AdSessionStatus>

    /**
     * Debug builds only: plays the ad network's SSV callback for the simulated ad with the fake HMAC secret the
     * backend's `fake` verifier accepts. Fails on a build without the secret (release) or when the server refuses.
     */
    suspend fun simulateServerReward(request: RewardedAdRequest): AppResult<Unit>
}
