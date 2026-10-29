package com.drama.domain.model

/**
 * One vertical episode as listed by `GET /series/{id}/episodes`. [index] is the 1-based episode number and
 * drives the grid order and the swipe order. The stream itself comes from `POST /episodes/{id}/play`
 * (see [PlaySession]): the list never carries manifest URLs.
 */
data class Episode(
    val id: String,
    val seriesId: String,
    val index: Int,
    val title: String,
    val durationMs: Long?,
    val thumbnailUrl: String?,
    val access: EpisodeAccess,
    val coinCost: Int,
)

enum class EpisodeAccess {
    FREE,
    UNLOCKED,
    LOCKED,
}
