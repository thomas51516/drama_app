package com.drama.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Local playback position per episode (M-15: resume to the second; synced to the server later). */
@Entity(tableName = "watch_progress")
data class WatchProgressEntity(
    @PrimaryKey val episodeId: String,
    val seriesId: String,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAtEpochMs: Long,
)
