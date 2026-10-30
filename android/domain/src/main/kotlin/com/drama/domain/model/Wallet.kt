package com.drama.domain.model

/** `GET /wallet` (contract v1.4): the server-side projection of the coin ledger. Never computed client-side. */
data class Wallet(
    val purchased: Int,
    val bonus: Int,
    val total: Int,
    /** Whether the next locked episode is debited without confirmation (M-21, `PATCH /me autoUnlock`). */
    val autoUnlock: Boolean,
    val bonusExpiring: List<BonusExpiry> = emptyList(),
) {
    /** Bonus coins expiring within [withinMs] of [nowEpochMs], summed. */
    fun bonusExpiringWithin(
        nowEpochMs: Long,
        withinMs: Long,
    ): BonusExpiry? {
        val soon = bonusExpiring.filter { it.expiresAtEpochMs in nowEpochMs..(nowEpochMs + withinMs) }
        if (soon.isEmpty()) return null
        return BonusExpiry(amount = soon.sumOf { it.amount }, expiresAtEpochMs = soon.minOf { it.expiresAtEpochMs })
    }

    companion object {
        val EMPTY = Wallet(purchased = 0, bonus = 0, total = 0, autoUnlock = false)
    }
}

data class BonusExpiry(
    val amount: Int,
    val expiresAtEpochMs: Long,
)

enum class LedgerBucket {
    PURCHASED,
    BONUS,
    ;

    companion object {
        fun from(raw: String?): LedgerBucket =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: PURCHASED
    }
}

/** `LedgerEntry.type`; [UNKNOWN] keeps forward compatibility with new server types. */
enum class LedgerType {
    PURCHASE,
    BONUS,
    UNLOCK,
    ADJUSTMENT,
    EXPIRY,
    REFUND,
    MERGE,
    UNKNOWN,
    ;

    companion object {
        fun from(raw: String?): LedgerType = entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: UNKNOWN
    }
}

/** One line of `coin_ledger` as listed by `GET /wallet/transactions`; [amount] is signed. */
data class LedgerEntry(
    val id: String,
    val amount: Int,
    val bucket: LedgerBucket,
    val type: LedgerType,
    val reference: String?,
    val description: String?,
    val expiresAtEpochMs: Long?,
    val createdAtEpochMs: Long?,
)

data class LedgerPage(
    val items: List<LedgerEntry>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
) {
    val hasMore: Boolean get() = page * pageSize < total
}
