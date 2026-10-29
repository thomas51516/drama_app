package com.drama.domain.repository

import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import kotlinx.coroutines.flow.Flow

/** Local (Room) playback positions; the server copy is written through [PlaybackRepository]. */
interface WatchProgressRepository {
    suspend fun save(progress: WatchProgress)

    suspend fun get(episodeId: String): WatchProgress?

    fun observeForSeries(seriesId: String): Flow<List<WatchProgress>>
}

interface WatchHistoryRepository {
    suspend fun recordWatch(
        seriesId: String,
        episodeId: String,
        episodeIndex: Int,
        positionMs: Long,
    )

    fun observeRecent(limit: Int = 20): Flow<List<WatchHistoryEntry>>

    /** Last episode watched in [seriesId], null when the series was never opened. */
    fun observeForSeries(seriesId: String): Flow<WatchHistoryEntry?>

    suspend fun clear()
}
