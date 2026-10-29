package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.common.result.onFailure
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.PlaybackApi
import com.drama.core.network.call
import com.drama.core.network.dto.UpdateProgressDto
import com.drama.data.mapper.toDomain
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.PlaySession
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.PlaybackRepository
import com.drama.domain.repository.WatchHistoryRepository
import com.drama.domain.repository.WatchProgressRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemotePlaybackRepository
    @Inject
    constructor(
        private val api: PlaybackApi,
        private val errorMapper: ApiErrorMapper,
        private val media: MediaUrlResolver,
        private val clock: Clock,
        private val watchProgress: WatchProgressRepository,
        private val watchHistory: WatchHistoryRepository,
        private val logger: Logger,
    ) : PlaybackRepository {
        override suspend fun startPlayback(episodeId: String): AppResult<PlaySession> =
            errorMapper.call { api.play(episodeId) }.map { it.toDomain(media, clock.nowEpochMs()) }

        override suspend fun reportProgress(progress: WatchProgress): AppResult<Unit> {
            watchProgress.save(progress)
            watchHistory.recordWatch(progress.seriesId, progress.episodeId, progress.episodeIndex, progress.positionMs)
            return errorMapper
                .call {
                    api.updateProgress(
                        UpdateProgressDto(
                            episodeId = progress.episodeId,
                            positionSeconds = (progress.positionMs / MS_PER_SECOND).toInt().coerceIn(0, MAX_POSITION_S),
                            completed = progress.completed,
                        ),
                    )
                }.map { }
                .onFailure { logger.w(TAG, "PUT /progress failed for ${progress.episodeId}: $it") }
        }

        private companion object {
            const val TAG = "Playback"
            const val MS_PER_SECOND = 1_000L
            const val MAX_POSITION_S = 86_400
        }
    }
