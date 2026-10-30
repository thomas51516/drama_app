package com.drama.core.network.api

import com.drama.core.network.dto.CheckInResultDto
import com.drama.core.network.dto.CheckInStatusDto
import com.drama.core.network.dto.ClaimTaskResultDto
import com.drama.core.network.dto.IdempotentRequestDto
import com.drama.core.network.dto.RewardTasksDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Check-in and tasks (contract v1.5, M-40 / M-41). */
interface RewardsApi {
    @GET("rewards/checkin")
    suspend fun checkInStatus(): CheckInStatusDto

    /** 409 `CHECKIN_ALREADY_CLAIMED` (details.nextClaimAt). */
    @POST("rewards/checkin")
    suspend fun checkIn(
        @Body body: IdempotentRequestDto,
    ): CheckInResultDto

    @GET("rewards/tasks")
    suspend fun tasks(): RewardTasksDto

    /** 409 `TASK_NOT_CLAIMABLE`, 404 `TASK_NOT_FOUND`. */
    @POST("rewards/tasks/{id}/claim")
    suspend fun claimTask(
        @Path("id") taskId: String,
        @Body body: IdempotentRequestDto,
    ): ClaimTaskResultDto
}
