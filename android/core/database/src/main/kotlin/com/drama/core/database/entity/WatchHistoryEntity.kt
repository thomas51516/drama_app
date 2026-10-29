package com.drama.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** One row per series: the last episode watched and when (home "continue watching", account history). */
@Entity(
    tableName = "watch_history",
    indices = [Index(value = ["lastWatchedAtEpochMs"])],
)
data class WatchHistoryEntity(
    @PrimaryKey val seriesId: String,
    val episodeId: String,
    val episodeIndex: Int,
    val positionMs: Long,
    val lastWatchedAtEpochMs: Long,
)
