package com.drama.domain.model

/** `GET /rankings?period` (M-04). */
enum class RankingPeriod(
    val wireName: String,
) {
    DAY("day"),
    WEEK("week"),
    ALL("all"),
    ;

    companion object {
        fun from(raw: String?): RankingPeriod =
            entries.firstOrNull { it.wireName.equals(raw, ignoreCase = true) } ?: DAY
    }
}

data class RankingItem(
    val rank: Int,
    val series: Series,
    /** Distinct viewers over the period; null when the server does not send it. */
    val viewers: Int?,
)

data class Rankings(
    val period: RankingPeriod,
    val genre: String?,
    val items: List<RankingItem>,
)
