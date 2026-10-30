package com.drama.core.network.api

import com.drama.core.network.dto.AdEligibilityDto
import com.drama.core.network.dto.AdSessionDto
import com.drama.core.network.dto.AdSessionStatusDto
import com.drama.core.network.dto.CreateAdSessionRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

/** Rewarded ads (contract v1.5, M-22). */
interface AdsApi {
    @GET("ads/eligibility")
    suspend fun eligibility(
        @Query("episodeId") episodeId: String,
    ): AdEligibilityDto

    @POST("ads/sessions")
    suspend fun createSession(
        @Body body: CreateAdSessionRequestDto,
    ): AdSessionDto

    @GET("ads/sessions/{id}")
    suspend fun session(
        @Path("id") sessionId: String,
    ): AdSessionStatusDto

    /**
     * SSV callback of the ad network, normally called by the network's servers. Debug builds call it themselves
     * for the simulated ad, with the `fake` provider's HMAC signature (`AD_SSV_FAKE_SECRET`).
     */
    @GET("ads/reward")
    suspend fun fakeReward(
        @QueryMap params: Map<String, String>,
    ): Response<Unit>
}
