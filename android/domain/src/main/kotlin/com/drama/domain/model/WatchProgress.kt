package com.drama.domain.model

data class WatchProgress(
    val episodeId: String,
    val seriesId: String,
    val positionMs: Long,
    val durationMs: Long,
    val completed: Boolean = false,
    /** 1-based episode number, used for the per-series history row. */
    val episodeIndex: Int = 0,
)

/** Last episode watched per series, newest first on the home "continue watching" row and in the account. */
data class WatchHistoryEntry(
    val seriesId: String,
    val episodeId: String,
    val episodeIndex: Int,
    val positionMs: Long,
    val lastWatchedAtEpochMs: Long,
)
