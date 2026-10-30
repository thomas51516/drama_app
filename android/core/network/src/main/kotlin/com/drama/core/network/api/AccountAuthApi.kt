package com.drama.core.network.api

import com.drama.core.network.dto.AuthResponseDto
import com.drama.core.network.dto.EmailAuthRequestDto
import com.drama.core.network.dto.GoogleAuthRequestDto
import com.drama.core.network.dto.LogoutRequestDto
import com.drama.core.network.dto.OtpRequestDto
import com.drama.core.network.dto.OtpRequestResponseDto
import com.drama.core.network.dto.OtpVerifyRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Sign-in and linking endpoints (contract v1.2, M-50/M-51). Served by the "link" client: the current (guest)
 * bearer is attached so the server can convert or merge the guest account, but no authenticator runs, so a
 * 401 `INVALID_CREDENTIALS` never triggers a token refresh.
 */
interface AccountAuthApi {
    @POST("auth/google")
    suspend fun google(
        @Body body: GoogleAuthRequestDto,
    ): AuthResponseDto

    @POST("auth/otp/request")
    suspend fun otpRequest(
        @Body body: OtpRequestDto,
    ): OtpRequestResponseDto

    @POST("auth/otp/verify")
    suspend fun otpVerify(
        @Body body: OtpVerifyRequestDto,
    ): AuthResponseDto

    @POST("auth/email/register")
    suspend fun emailRegister(
        @Body body: EmailAuthRequestDto,
    ): AuthResponseDto

    @POST("auth/email/login")
    suspend fun emailLogin(
        @Body body: EmailAuthRequestDto,
    ): AuthResponseDto

    /** 204. */
    @POST("auth/logout")
    suspend fun logout(
        @Body body: LogoutRequestDto,
    ): Response<Unit>
}
