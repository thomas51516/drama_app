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
data class AuthResponseDto(
    val user: AuthUserDto,
    val tokens: AuthTokensDto,
)

@Serializable
data class AuthUserDto(
    val id: String,
    val type: String,
    val status: String,
    val language: String? = null,
    val country: String? = null,
    val isVip: Boolean = false,
    val vipExpiresAt: String? = null,
    val createdAt: String? = null,
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
