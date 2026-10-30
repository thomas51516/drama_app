package com.drama.domain.model

/** How an episode became watchable; the server records it in `unlocks`. */
enum class UnlockMethod(
    val wireName: String,
) {
    COINS("coins"),
    AUTO("auto"),
    VIP("vip"),
    FREE("free"),
    AD("ad"),
    UNKNOWN("unknown"),
    ;

    companion object {
        fun from(raw: String?): UnlockMethod =
            entries.firstOrNull { it.wireName.equals(raw, ignoreCase = true) } ?: UNKNOWN
    }
}

/** `POST /episodes/{id}/unlock` answer (contract v1.4). An already unlocked episode comes back with zero charges. */
data class UnlockResult(
    val episodeId: String,
    val method: UnlockMethod,
    val chargedBonus: Int,
    val chargedPurchased: Int,
    /** Wallet after the debit when the server sends it. */
    val wallet: Wallet?,
) {
    val charged: Int get() = chargedBonus + chargedPurchased
}
