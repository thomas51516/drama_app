package com.drama.domain.model

/** `GET /home`: banners plus editorial rows (trending, new, continue_watching, genre:<genre>). */
data class HomeContent(
    val banners: List<Series>,
    val rows: List<HomeRow>,
) {
    val isEmpty: Boolean get() = banners.isEmpty() && rows.all { it.items.isEmpty() }
}

data class HomeRow(
    val key: String,
    val title: String,
    val items: List<HomeItem>,
)

data class HomeItem(
    val series: Series,
    /** Present on the "continue watching" row only. */
    val episode: Episode? = null,
    val positionMs: Long? = null,
)
