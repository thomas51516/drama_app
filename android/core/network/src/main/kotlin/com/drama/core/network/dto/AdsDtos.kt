package com.drama.core.network.dto

import kotlinx.serialization.Serializable

/** `GET /ads/eligibility?episodeId` (contract v1.5, M-22). */
@Serializable
data class AdEligibilityDto(
    val eligible: Boolean = false,
    val remainingToday: Int = 0,
    val dailyCap: Int = 0,
    val reason: String? = null,
    val adUnitId: String? = null,
    val provider: String? = null,
)

@Serializable
data class CreateAdSessionRequestDto(
    val episodeId: String,
)

/** `POST /ads/sessions` -> `201 {sessionId, customData, expiresAt}`. */
@Serializable
data class AdSessionDto(
    val sessionId: String,
    val customData: String = "",
    val expiresAt: String? = null,
)

/** `GET /ads/sessions/{id}`. */
@Serializable
data class AdSessionStatusDto(
    val status: String = "PENDING",
    val unlocked: Boolean = false,
)
