package com.drama.domain.model

/** One vertical episode. [index] is 1-based and drives the episode grid order and the swipe order. */
data class Episode(
    val id: String,
    val seriesId: String,
    val index: Int,
    val title: String,
    val durationMs: Long?,
    val access: EpisodeAccess,
    val playback: PlaybackSource,
)

enum class EpisodeAccess {
    FREE,
    UNLOCKED,
    LOCKED,
}
