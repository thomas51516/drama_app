package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class PriceDto(
    val currency: String,
    val amountMinor: Long,
)

@Serializable
data class CoinPackDto(
    val id: String,
    val sku: String,
    val coins: Int,
    val bonusCoins: Int = 0,
    val price: PriceDto,
    val badge: String? = null,
    val position: Int = 0,
)

@Serializable
data class VipPlanDto(
    val id: String,
    val sku: String,
    val period: String,
    val price: PriceDto,
    val trialDays: Int = 0,
    val badge: String? = null,
)

/** `GET /shop` (contract v1.4). [welcomeOffer] stays opaque until M-24. */
@Serializable
data class ShopDto(
    val currency: String = "USD",
    val coinPacks: List<CoinPackDto> = emptyList(),
    val vipPlans: List<VipPlanDto> = emptyList(),
    val welcomeOffer: JsonElement? = null,
)

@Serializable
data class VerifyPurchaseRequestDto(
    val purchaseToken: String,
    val productId: String,
    /** `inapp` | `subs`. */
    val type: String,
    val idempotencyKey: String,
)

@Serializable
data class VerifyPurchaseResponseDto(
    /** `credited` | `already_processed` | `subscription_active`. */
    val status: String,
    val wallet: WalletDto? = null,
    val vip: VipStatusDto? = null,
)

@Serializable
data class VipStatusDto(
    val status: String? = null,
    val active: Boolean? = null,
    val expiresAt: String? = null,
)

/** `GET /me/subscription`. */
@Serializable
data class SubscriptionDto(
    val status: String = "none",
    val plan: String? = null,
    val startedAt: String? = null,
    val expiresAt: String? = null,
    val autoRenew: Boolean = false,
    val store: String? = null,
)
