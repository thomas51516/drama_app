package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** `Wallet` of the contract v1.4 (`GET /wallet`, embedded in unlock and verify answers). */
@Serializable
data class WalletDto(
    val purchased: Int = 0,
    val bonus: Int = 0,
    val total: Int = 0,
    val autoUnlock: Boolean = false,
    val bonusExpiring: List<BonusExpiringDto> = emptyList(),
)

@Serializable
data class BonusExpiringDto(
    val amount: Int,
    val expiresAt: String? = null,
)

/** [reference] is `{type, id}` on the v1.4 backend; a plain string is accepted too. */
@Serializable
data class LedgerEntryDto(
    val id: String,
    val amount: Int,
    val bucket: String? = null,
    val type: String? = null,
    val reference: JsonElement? = null,
    val description: String? = null,
    val expiresAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class LedgerPageDto(
    val items: List<LedgerEntryDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 0,
)

@Serializable
data class UnlockRequestDto(
    /** Client UUID, reused on retry (idempotence, spec §8.4). */
    val idempotencyKey: String,
)

@Serializable
data class UnlockChargedDto(
    val bonus: Int = 0,
    val purchased: Int = 0,
)

/**
 * `POST /episodes/{id}/unlock`: contract v1.4 `{episodeId, method, charged: {bonus, purchased}, wallet}`; the
 * earlier OpenAPI draft (`{method, coinsDebited, alreadyUnlocked, wallet}`) is read too.
 */
@Serializable
data class UnlockResponseDto(
    val episodeId: String? = null,
    val method: String? = null,
    val charged: UnlockChargedDto? = null,
    val coinsDebited: Int? = null,
    val alreadyUnlocked: Boolean? = null,
    val wallet: WalletDto? = null,
)

@Serializable
data class SeriesUnlocksDto(
    val unlockedEpisodeIds: List<String> = emptyList(),
)
