package com.drama.domain.model

/**
 * One page of the "Pour vous" feed (M-02). [previewUrl] is a signed HLS excerpt playable without any
 * entitlement; it expires at [previewExpiresAtEpochMs] (S04-A2-01) and is then re-resolved through `/play`.
 */
data class FeedItem(
    val series: Series,
    val episode: Episode,
    val previewUrl: String?,
    val previewExpiresAtEpochMs: Long,
    val isFavorite: Boolean,
    val likes: Int?,
) {
    /** Stable key for the pager: a series appears once per page. */
    val key: String get() = "${series.id}:${episode.id}"
}

data class FeedPage(
    val items: List<FeedItem>,
    val nextCursor: String?,
)
