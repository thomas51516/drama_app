package com.drama.domain.model

/**
 * `GET /home` (addendum v1.1): configured banners first, then the active rows for the viewer's country,
 * titled in the viewer's language. Both lists may be empty while the back-office has nothing configured.
 */
data class HomeContent(
    val banners: List<HomeBanner>,
    val rows: List<HomeRow>,
) {
    val isEmpty: Boolean get() = banners.isEmpty() && rows.all { it.items.isEmpty() }
}

/** One editorial banner (B-05). [imageUrl] is the 16:9 visual; tapping opens [seriesId]. */
data class HomeBanner(
    val id: String,
    val seriesId: String,
    val imageUrl: String?,
    val title: String,
    val subtitle: String?,
)

/** Row types configured in the back-office; [UNKNOWN] keeps forward compatibility with new types. */
enum class HomeRowType {
    TRENDING,
    NEW,
    GENRE,
    MANUAL,
    CONTINUE_WATCHING,
    UNKNOWN,
    ;

    companion object {
        /** Parses the explicit `type` when the API sends one, otherwise infers it from the stable key. */
        fun from(
            type: String?,
            key: String,
        ): HomeRowType {
            type?.uppercase()?.let { explicit -> entries.firstOrNull { it.name == explicit }?.let { return it } }
            return when {
                key == "trending" -> TRENDING
                key == "new" -> NEW
                key == "continue_watching" -> CONTINUE_WATCHING
                key.startsWith("genre:") -> GENRE
                type == null -> MANUAL
                else -> UNKNOWN
            }
        }
    }
}

data class HomeRow(
    val key: String,
    val title: String,
    val items: List<HomeItem>,
    val type: HomeRowType = HomeRowType.from(null, key),
)

data class HomeItem(
    val series: Series,
    /** Present on the "continue watching" row only. */
    val episode: Episode? = null,
    val positionMs: Long? = null,
) {
    /** 0..1 watched fraction for the continue-watching card; null when the duration is unknown. */
    val progressFraction: Float?
        get() {
            val duration = episode?.durationMs?.takeIf { it > 0 } ?: return null
            val position = positionMs ?: return null
            return (position.toFloat() / duration).coerceIn(0f, 1f)
        }
}
