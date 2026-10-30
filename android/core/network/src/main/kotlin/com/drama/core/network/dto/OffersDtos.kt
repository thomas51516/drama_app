package com.drama.core.network.dto

import kotlinx.serialization.Serializable

/** `GET /series/{id}/unlock-all/quote` (contract v1.5, M-23). */
@Serializable
data class UnlockAllQuoteDto(
    val lockedCount: Int = 0,
    val fullPrice: Int = 0,
    val discountPercent: Int = 0,
    val price: Int = 0,
)

/** `POST /series/{id}/unlock-all` answer. */
@Serializable
data class UnlockAllResponseDto(
    val unlockedEpisodeIds: List<String> = emptyList(),
    val charged: Int = 0,
    val wallet: WalletDto? = null,
)

@Serializable
data class WelcomeOfferDto(
    val packSku: String? = null,
    val bonusPercent: Int = 0,
    val expiresAt: String? = null,
)

@Serializable
data class LimitedOfferDto(
    val id: String,
    val title: String? = null,
    val packSku: String,
    val bonusPercent: Int = 0,
    val endsAt: String? = null,
)

/** `GET /offers` (M-24). */
@Serializable
data class OffersDto(
    val welcome: WelcomeOfferDto? = null,
    val limited: List<LimitedOfferDto> = emptyList(),
)

@Serializable
data class PromoRedeemRequestDto(
    val code: String,
    val idempotencyKey: String,
)

/** `POST /promo/redeem` answer. */
@Serializable
data class PromoRedeemResponseDto(
    val coins: Int = 0,
    val wallet: WalletDto? = null,
)
