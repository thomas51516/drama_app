package com.drama.core.network.api

import com.drama.core.network.dto.PlaySessionDto
import com.drama.core.network.dto.UpdateProgressDto
import com.drama.core.network.dto.WatchProgressDto
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/** Authenticated playback endpoints. */
interface PlaybackApi {
    /** 403 `EPISODE_LOCKED` (details.coinCost) when the viewer has no entitlement. */
    @POST("episodes/{id}/play")
    suspend fun play(
        @Path("id") episodeId: String,
    ): PlaySessionDto

    @PUT("progress")
    suspend fun updateProgress(
        @Body body: UpdateProgressDto,
    ): WatchProgressDto
}
