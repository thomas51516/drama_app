package com.drama.domain.model

/** Pure helpers for the vertical feed order (M-11: swipe up = next episode). */
object EpisodeNavigation {
    fun nextIndex(
        current: Int,
        count: Int,
    ): Int? = if (current + 1 in 0 until count) current + 1 else null

    fun previousIndex(current: Int): Int? = if (current - 1 >= 0) current - 1 else null

    /** Indices worth preloading around [current]: the next one first, then the previous one. */
    fun preloadCandidates(
        current: Int,
        count: Int,
    ): List<Int> = listOfNotNull(nextIndex(current, count), previousIndex(current))
}
