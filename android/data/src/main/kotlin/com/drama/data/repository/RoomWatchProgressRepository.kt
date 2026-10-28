package com.drama.data.repository

import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.entity.WatchProgressEntity
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class RoomWatchProgressRepository
    @Inject
    constructor(
        private val dao: WatchProgressDao,
    ) : WatchProgressRepository {
        override suspend fun save(progress: WatchProgress) {
            dao.upsert(
                WatchProgressEntity(
                    episodeId = progress.episodeId,
                    seriesId = progress.seriesId,
                    positionMs = progress.positionMs,
                    durationMs = progress.durationMs,
                    updatedAtEpochMs = System.currentTimeMillis(),
                ),
            )
        }

        override suspend fun get(episodeId: String): WatchProgress? = dao.getByEpisode(episodeId)?.toDomain()

        override fun observeForSeries(seriesId: String): Flow<List<WatchProgress>> =
            dao.observeBySeries(seriesId).map { list -> list.map { it.toDomain() } }

        private fun WatchProgressEntity.toDomain() =
            WatchProgress(
                episodeId = episodeId,
                seriesId = seriesId,
                positionMs = positionMs,
                durationMs = durationMs,
            )
    }
