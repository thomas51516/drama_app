package com.drama.core.network.api

import com.drama.core.network.dto.NotificationsResponseDto
import com.drama.core.network.dto.PushDeviceRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Push devices and in-app notification history (M-54, contract v1.3). */
interface NotificationsApi {
    @PUT("me/devices/push")
    suspend fun registerPushDevice(
        @Body body: PushDeviceRequestDto,
    ): Response<Unit>

    @DELETE("me/devices/push/{token}")
    suspend fun unregisterPushDevice(
        @Path("token") token: String,
    ): Response<Unit>

    @GET("me/notifications")
    suspend fun notifications(
        @Query("page") page: Int? = null,
        @Query("pageSize") pageSize: Int? = null,
    ): NotificationsResponseDto

    @POST("me/notifications/{id}/read")
    suspend fun markRead(
        @Path("id") id: String,
    ): Response<Unit>
}
