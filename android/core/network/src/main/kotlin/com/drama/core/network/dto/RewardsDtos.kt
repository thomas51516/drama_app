package com.drama.core.network.dto

import kotlinx.serialization.Serializable

/** `GET /rewards/checkin` (contract v1.5). */
@Serializable
data class CheckInStatusDto(
    val scale: List<Int> = emptyList(),
    val streakDay: Int = 0,
    val claimedToday: Boolean = false,
    val nextClaimAt: String? = null,
    val resetOnMiss: Boolean = true,
)

@Serializable
data class IdempotentRequestDto(
    val idempotencyKey: String,
)

/** `POST /rewards/checkin` answer. */
@Serializable
data class CheckInResultDto(
    val day: Int = 0,
    val coins: Int = 0,
    val wallet: WalletDto? = null,
)

@Serializable
data class RewardTaskDto(
    val id: String,
    val key: String = "",
    val title: String = "",
    val description: String? = null,
    val coins: Int = 0,
    val target: Int = 0,
    val progress: Int = 0,
    val status: String = "AVAILABLE",
    val expiresAt: String? = null,
)

/** `GET /rewards/tasks`: `{tasks: [...]}` (contract) or a bare `{items}` shape. */
@Serializable
data class RewardTasksDto(
    val tasks: List<RewardTaskDto> = emptyList(),
    val items: List<RewardTaskDto> = emptyList(),
) {
    val all: List<RewardTaskDto> get() = tasks.ifEmpty { items }
}

/** `POST /rewards/tasks/{id}/claim` answer. */
@Serializable
data class ClaimTaskResultDto(
    val coins: Int = 0,
    val wallet: WalletDto? = null,
)
