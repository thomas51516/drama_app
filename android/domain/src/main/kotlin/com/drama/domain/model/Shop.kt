package com.drama.domain.model

/** Local price of the viewer's country (`GET /shop`, `X-Country`); [amountMinor] in the currency's minor unit. */
data class Price(
    val currency: String,
    val amountMinor: Long,
)

data class CoinPack(
    val id: String,
    /** Play Console product id, identical to the back-office sku. */
    val sku: String,
    val coins: Int,
    val bonusCoins: Int,
    val price: Price,
    val badge: String?,
    val position: Int,
) {
    val totalCoins: Int get() = coins + bonusCoins
}

enum class VipPeriod {
    WEEK,
    MONTH,
    YEAR,
    ;

    companion object {
        fun from(raw: String?): VipPeriod = entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: MONTH
    }
}

data class VipPlan(
    val id: String,
    val sku: String,
    val period: VipPeriod,
    val price: Price,
    val trialDays: Int,
    val badge: String?,
)

data class ShopCatalog(
    val currency: String,
    val coinPacks: List<CoinPack>,
    val vipPlans: List<VipPlan>,
) {
    fun pack(sku: String): CoinPack? = coinPacks.firstOrNull { it.sku == sku }

    fun plan(sku: String): VipPlan? = vipPlans.firstOrNull { it.sku == sku }
}

enum class SubscriptionStatus {
    NONE,
    ACTIVE,
    CANCELLED,
    EXPIRED,
    GRACE,
    ;

    companion object {
        fun from(raw: String?): SubscriptionStatus =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: NONE
    }
}

/** `GET /me/subscription` (M-33). */
data class Subscription(
    val status: SubscriptionStatus,
    val planSku: String?,
    val startedAtEpochMs: Long?,
    val expiresAtEpochMs: Long?,
    val autoRenew: Boolean,
    val store: String?,
) {
    val isActive: Boolean get() = status == SubscriptionStatus.ACTIVE || status == SubscriptionStatus.GRACE
}
