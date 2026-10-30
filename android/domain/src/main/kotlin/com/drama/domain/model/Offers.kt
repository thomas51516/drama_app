package com.drama.domain.model

/** `GET /series/{id}/unlock-all/quote` (M-23): price of every still-locked episode, discounted. */
data class UnlockAllQuote(
    val lockedCount: Int,
    val fullPrice: Int,
    val discountPercent: Int,
    val price: Int,
) {
    val hasDiscount: Boolean get() = discountPercent > 0 && price < fullPrice
}

/** `POST /series/{id}/unlock-all` answer. */
data class UnlockAllResult(
    val unlockedEpisodeIds: List<String>,
    val charged: Int,
    val wallet: Wallet?,
)

/** First-purchase bonus (M-24), valid until [expiresAtEpochMs]. */
data class WelcomeOffer(
    val packSku: String?,
    val bonusPercent: Int,
    val expiresAtEpochMs: Long?,
) {
    fun isActive(nowEpochMs: Long): Boolean = expiresAtEpochMs == null || expiresAtEpochMs > nowEpochMs
}

/** Time-limited bonus on one pack (M-24). */
data class LimitedOffer(
    val id: String,
    val title: String?,
    val packSku: String,
    val bonusPercent: Int,
    val endsAtEpochMs: Long?,
) {
    fun isActive(nowEpochMs: Long): Boolean = endsAtEpochMs == null || endsAtEpochMs > nowEpochMs
}

/** `GET /offers`. */
data class Offers(
    val welcome: WelcomeOffer?,
    val limited: List<LimitedOffer>,
) {
    fun limitedFor(sku: String): LimitedOffer? = limited.firstOrNull { it.packSku == sku }

    companion object {
        val NONE = Offers(welcome = null, limited = emptyList())
    }
}

/** `POST /promo/redeem` answer. */
data class PromoRedemption(
    val coins: Int,
    val wallet: Wallet?,
)
