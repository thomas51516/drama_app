package com.drama.domain.model

data class WatchProgress(
    val episodeId: String,
    val seriesId: String,
    val positionMs: Long,
    val durationMs: Long,
)
