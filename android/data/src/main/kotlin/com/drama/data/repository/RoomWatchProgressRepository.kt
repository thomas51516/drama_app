package com.drama.data.repository

import com.drama.core.common.time.Clock
import com.drama.core.database.dao.WatchHistoryDao
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.entity.WatchHistoryEntity
import com.drama.core.database.entity.WatchProgressEntity
import com.drama.data.mapper.toDomain
import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class RoomWatchProgressRepository
    @Inject
    constructor(
        private val dao: WatchProgressDao,
        private val clock: Clock,
    ) : WatchProgressRepository {
        override suspend fun save(progress: WatchProgress) {
            dao.upsert(
                WatchProgressEntity(
                    episodeId = progress.episodeId,
                    seriesId = progress.seriesId,
                    positionMs = progress.positionMs,
                    durationMs = progress.durationMs,
                    updatedAtEpochMs = clock.nowEpochMs(),
                    completed = progress.completed,
                ),
            )
        }

        override suspend fun get(episodeId: String): WatchProgress? = dao.getByEpisode(episodeId)?.toDomain()

        override fun observeForSeries(seriesId: String): Flow<List<WatchProgress>> =
            dao.observeBySeries(seriesId).map { list -> list.map { it.toDomain() } }
    }

class RoomWatchHistoryRepository
    @Inject
    constructor(
        private val dao: WatchHistoryDao,
        private val clock: Clock,
    ) : WatchHistoryRepository {
        override suspend fun recordWatch(
            seriesId: String,
            episodeId: String,
            episodeIndex: Int,
            positionMs: Long,
        ) {
            dao.upsert(
                WatchHistoryEntity(
                    seriesId = seriesId,
                    episodeId = episodeId,
                    episodeIndex = episodeIndex,
                    positionMs = positionMs,
                    lastWatchedAtEpochMs = clock.nowEpochMs(),
                ),
            )
        }

        override fun observeRecent(limit: Int): Flow<List<WatchHistoryEntry>> =
            dao.observeRecent(limit).map { list -> list.map { it.toDomain() } }

        override fun observeForSeries(seriesId: String): Flow<WatchHistoryEntry?> =
            dao.observeBySeries(seriesId).map { it?.toDomain() }

        override suspend fun clear() = dao.clear()
    }
