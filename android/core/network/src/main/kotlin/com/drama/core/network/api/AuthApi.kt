package com.drama.core.network.api

import com.drama.core.network.dto.AuthResponseDto
import com.drama.core.network.dto.GuestAuthRequestDto
import com.drama.core.network.dto.RefreshTokenRequestDto
import retrofit2.http.Body
import retrofit2.http.POST

/** The `/auth` endpoints, served by the bare OkHttp client (no bearer, no authenticator) to avoid refresh loops. */
interface AuthApi {
    @POST("auth/guest")
    suspend fun guest(
        @Body body: GuestAuthRequestDto,
    ): AuthResponseDto

    @POST("auth/refresh")
    suspend fun refresh(
        @Body body: RefreshTokenRequestDto,
    ): AuthResponseDto
}
