package com.drama.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class GuestAuthRequestDto(
    /** App-generated installation id (UUID), never a hardware identifier. 8..128 chars. */
    val deviceId: String,
    val platform: String = "android",
    val language: String = "fr",
    val country: String? = null,
)

@Serializable
data class RefreshTokenRequestDto(
    val refreshToken: String,
)

@Serializable
data class LogoutRequestDto(
    val refreshToken: String,
)

@Serializable
data class GoogleAuthRequestDto(
    val idToken: String,
    val deviceId: String,
)

@Serializable
data class OtpRequestDto(
    /** E.164. */
    val phone: String,
)

/**
 * `POST /auth/otp/request`. Contract v1.2 names the fields `requestId` / `resendAfter`; the v1 stub used
 * `challengeId` / `resendAfterSeconds`. Both spellings are accepted.
 */
@Serializable
data class OtpRequestResponseDto(
    val requestId: String? = null,
    val challengeId: String? = null,
    val expiresIn: Int = DEFAULT_EXPIRES_IN_S,
    val resendAfter: Int? = null,
    val resendAfterSeconds: Int? = null,
) {
    val id: String? get() = requestId ?: challengeId
    val resendAfterS: Int get() = resendAfter ?: resendAfterSeconds ?: DEFAULT_RESEND_AFTER_S

    companion object {
        const val DEFAULT_EXPIRES_IN_S = 300
        const val DEFAULT_RESEND_AFTER_S = 60
    }
}

/** Only one of [requestId] / [challengeId] is sent (the server rejects unknown keys). */
@Serializable
data class OtpVerifyRequestDto(
    val code: String,
    val deviceId: String,
    val requestId: String? = null,
    val challengeId: String? = null,
)

@Serializable
data class EmailAuthRequestDto(
    val email: String,
    val password: String,
    val deviceId: String,
)

/**
 * `AuthSession` of the contract v1.2 (`{accessToken, refreshToken, expiresIn, user, linked}`), also accepting the
 * v1 shape (`{user, tokens}`) still used by `/auth/guest` and `/auth/refresh`.
 */
@Serializable
data class AuthResponseDto(
    val user: AuthUserDto,
    val tokens: AuthTokensDto? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    /** Seconds (v1.2 flat shape). */
    val expiresIn: Long? = null,
    val refreshTokenExpiresAt: String? = null,
    /** True when the guest account was converted or merged into the signed-in account (M-50). */
    val linked: Boolean = false,
) {
    val accessTokenValue: String? get() = tokens?.accessToken ?: accessToken
    val refreshTokenValue: String? get() = tokens?.refreshToken ?: refreshToken
    val accessTokenExpiresInS: Long get() = tokens?.accessTokenExpiresIn ?: expiresIn ?: DEFAULT_ACCESS_TTL_S
    val refreshTokenExpiresAtIso: String? get() = tokens?.refreshTokenExpiresAt ?: refreshTokenExpiresAt

    companion object {
        const val DEFAULT_ACCESS_TTL_S = 900L
    }
}

/** `UserDto` (v1.2) and the v1 `AuthUserDto`; every field beyond [id] and [type] is optional. */
@Serializable
data class AuthUserDto(
    val id: String,
    val type: String,
    val status: String? = null,
    val language: String? = null,
    val country: String? = null,
    val isVip: Boolean = false,
    /** v1.2: `none` | `active` | ... */
    val vipStatus: String? = null,
    val vipExpiresAt: String? = null,
    val createdAt: String? = null,
    val displayName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val providers: List<String> = emptyList(),
    val deletionScheduledAt: String? = null,
    /** v1.3: push preferences (absent on servers before the sprint 5 contract = all true). */
    val notificationPreferences: NotificationPreferencesDto? = null,
    /** v1.4: auto-unlock flag (M-21); null on older servers. */
    val autoUnlock: Boolean? = null,
)

@Serializable
data class AuthTokensDto(
    val tokenType: String = "Bearer",
    val accessToken: String,
    /** Seconds. */
    val accessTokenExpiresIn: Long,
    /** Opaque, single use: every refresh rotates it. */
    val refreshToken: String,
    /** ISO-8601. */
    val refreshTokenExpiresAt: String,
)
