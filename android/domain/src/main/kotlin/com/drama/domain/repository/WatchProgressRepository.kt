package com.drama.domain.repository

import com.drama.domain.model.WatchProgress
import kotlinx.coroutines.flow.Flow

interface WatchProgressRepository {
    suspend fun save(progress: WatchProgress)

    suspend fun get(episodeId: String): WatchProgress?

    fun observeForSeries(seriesId: String): Flow<List<WatchProgress>>
}
