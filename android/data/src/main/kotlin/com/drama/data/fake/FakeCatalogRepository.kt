package com.drama.data.fake

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import com.drama.core.network.BuildConfig
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRow
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.Series
import com.drama.domain.model.StreamFormat
import com.drama.domain.model.WatchProgress
import com.drama.domain.repository.CatalogRepository
import com.drama.domain.repository.PlaybackRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

/**
 * Sprint 1 stand-in for the catalogue API, kept for unit tests and for the debug toggle
 * `-PdramaUseFakeCatalog=true` (no backend needed): one series whose three 9:16 HLS episodes come from the
 * dev MinIO ([BuildConfig.MEDIA_BASE_URL]). The third episode is locked to exercise the paywall placeholder.
 */
class FakeCatalogRepository
    @Inject
    constructor() : CatalogRepository {
        override fun observeHome(): Flow<Resource<HomeContent>> =
            flow {
                emit(Resource.Loading())
                delay(SIMULATED_LATENCY_MS)
                emit(
                    Resource.Success(
                        HomeContent(
                            banners = listOf(testSeries),
                            rows = listOf(HomeRow("trending", "Tendances", listOf(HomeItem(testSeries)))),
                        ),
                    ),
                )
            }

        override fun observeSeries(seriesId: String): Flow<Resource<Series>> =
            flow {
                when (val result = getSeries(seriesId)) {
                    is AppResult.Success -> emit(Resource.Success(result.value))
                    is AppResult.Failure -> emit(Resource.Error(result.error))
                }
            }

        override fun observeEpisodes(seriesId: String): Flow<Resource<List<Episode>>> =
            flow {
                when (val result = getEpisodes(seriesId)) {
                    is AppResult.Success -> emit(Resource.Success(result.value))
                    is AppResult.Failure -> emit(Resource.Error(result.error))
                }
            }

        override suspend fun getSeries(seriesId: String): AppResult<Series> {
            delay(SIMULATED_LATENCY_MS)
            return if (seriesId == TEST_SERIES_ID) {
                AppResult.Success(testSeries)
            } else {
                AppResult.Failure(AppError.NotFound("series:$seriesId"))
            }
        }

        override suspend fun getEpisodes(seriesId: String): AppResult<List<Episode>> {
            delay(SIMULATED_LATENCY_MS)
            return if (seriesId == TEST_SERIES_ID) {
                AppResult.Success(testEpisodes)
            } else {
                AppResult.Failure(AppError.NotFound("series:$seriesId"))
            }
        }

        companion object {
            const val TEST_SERIES_ID = "test-series"
            private const val SIMULATED_LATENCY_MS = 50L
            private const val SAMPLE_EPISODE_COUNT = 3
            private const val FREE_EPISODES = 2
            private const val COIN_COST = 10

            val testSeries =
                Series(
                    id = TEST_SERIES_ID,
                    slug = "serie-de-test",
                    title = "Série de test verticale",
                    synopsis = "Trois épisodes 9:16 en HLS multi-débits pour le spike lecteur (S01-A2-01).",
                    posterVerticalUrl = null,
                    posterHorizontalUrl = null,
                    genres = listOf("test"),
                    episodeCount = SAMPLE_EPISODE_COUNT,
                    freeEpisodeCount = FREE_EPISODES,
                    coinCostPerEpisode = COIN_COST,
                    ageRating = "ALL",
                )

            val testEpisodes: List<Episode> =
                (1..SAMPLE_EPISODE_COUNT).map { index ->
                    Episode(
                        id = episodeId(index),
                        seriesId = TEST_SERIES_ID,
                        index = index,
                        title = "Test vertical 9:16",
                        durationMs = null,
                        thumbnailUrl = null,
                        access = if (index <= FREE_EPISODES) EpisodeAccess.FREE else EpisodeAccess.LOCKED,
                        coinCost = if (index <= FREE_EPISODES) 0 else COIN_COST,
                    )
                }

            fun episodeId(index: Int) = "$TEST_SERIES_ID-ep$index"

            fun manifestUrl(index: Int) = "${BuildConfig.MEDIA_BASE_URL}/hls/samples/ep$index/master.m3u8"
        }
    }

/** Companion of [FakeCatalogRepository]: `/play` answers from the sample manifests, progress kept in memory. */
class FakePlaybackRepository
    @Inject
    constructor() : PlaybackRepository {
        private val progress = mutableMapOf<String, WatchProgress>()

        override suspend fun startPlayback(episodeId: String): AppResult<PlaySession> {
            val episode =
                FakeCatalogRepository.testEpisodes.firstOrNull { it.id == episodeId }
                    ?: return AppResult.Failure(AppError.NotFound("EPISODE_NOT_FOUND"))
            if (episode.access == EpisodeAccess.LOCKED) {
                return AppResult.Failure(AppError.Locked(episode.id, episode.seriesId, episode.coinCost))
            }
            val next = FakeCatalogRepository.testEpisodes.firstOrNull { it.index == episode.index + 1 }
            val saved = progress[episodeId]
            return AppResult.Success(
                PlaySession(
                    episodeId = episode.id,
                    seriesId = episode.seriesId,
                    episodeNumber = episode.index,
                    source = PlaybackSource(FakeCatalogRepository.manifestUrl(episode.index), StreamFormat.HLS),
                    expiresAtEpochMs = Long.MAX_VALUE,
                    resumePositionMs = saved?.takeIf { !it.completed }?.positionMs ?: 0L,
                    durationMs = saved?.durationMs ?: 0L,
                    nextEpisodeId = next?.id,
                    subtitles = emptyList(),
                ),
            )
        }

        override suspend fun reportProgress(progress: WatchProgress): AppResult<Unit> {
            this.progress[progress.episodeId] = progress
            return AppResult.Success(Unit)
        }
    }
