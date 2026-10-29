package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import com.drama.core.common.result.map
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.call
import com.drama.data.cache.isFresh
import com.drama.data.cache.staleWhileRevalidate
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.local.CatalogLocalDataSource.Companion.KEY_HOME
import com.drama.data.local.CatalogLocalDataSource.Companion.episodesKey
import com.drama.data.local.CatalogLocalDataSource.Companion.seriesKey
import com.drama.data.mapper.toDomain
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.Episode
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRow
import com.drama.domain.model.Series
import com.drama.domain.repository.CatalogRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Catalogue over the real API with a Room cache (S02-A1-01, S02-A1-03).
 * TTL: 5 min for home, 10 min for series/episodes. Episode `access` is per viewer, so the episodes
 * cache is also invalidated by [DefaultSessionRepository.logout].
 */
@Singleton
class RemoteCatalogRepository(
    private val api: CatalogApi,
    private val local: CatalogLocalDataSource,
    private val errorMapper: ApiErrorMapper,
    private val media: MediaUrlResolver,
    private val clock: Clock,
    private val logger: Logger,
    private val homeTtlMs: Long = HOME_TTL_MS,
    private val seriesTtlMs: Long = SERIES_TTL_MS,
) : CatalogRepository {
    @Inject
    constructor(
        api: CatalogApi,
        local: CatalogLocalDataSource,
        errorMapper: ApiErrorMapper,
        media: MediaUrlResolver,
        clock: Clock,
        logger: Logger,
    ) : this(api, local, errorMapper, media, clock, logger, HOME_TTL_MS, SERIES_TTL_MS)

    override fun observeHome(): Flow<Resource<HomeContent>> =
        staleWhileRevalidate(
            nowEpochMs = clock::nowEpochMs,
            ttlMs = homeTtlMs,
            fetchedAt = { local.fetchedAt(KEY_HOME) },
            readCache = { local.getHome() },
            observeCache = { local.observeHome() },
            refresh = ::refreshHome,
        )

    override fun observeSeries(seriesId: String): Flow<Resource<Series>> =
        staleWhileRevalidate(
            nowEpochMs = clock::nowEpochMs,
            ttlMs = seriesTtlMs,
            fetchedAt = { local.fetchedAt(seriesKey(seriesId)) },
            readCache = { local.getSeries(seriesId) },
            observeCache = { local.observeSeries(seriesId) },
            refresh = { refreshSeries(seriesId).map { } },
        )

    override fun observeEpisodes(seriesId: String): Flow<Resource<List<Episode>>> =
        staleWhileRevalidate(
            nowEpochMs = clock::nowEpochMs,
            ttlMs = seriesTtlMs,
            fetchedAt = { local.fetchedAt(episodesKey(seriesId)) },
            readCache = { local.getEpisodes(seriesId) },
            observeCache = { local.observeEpisodes(seriesId) },
            refresh = { refreshEpisodes(seriesId).map { } },
        )

    override suspend fun getSeries(seriesId: String): AppResult<Series> {
        val cached = local.getSeries(seriesId)
        if (cached != null && isFresh(local.fetchedAt(seriesKey(seriesId)), clock.nowEpochMs(), seriesTtlMs)) {
            return AppResult.Success(cached)
        }
        return when (val result = refreshSeries(seriesId)) {
            is AppResult.Success -> result
            is AppResult.Failure -> fallback(result.error, cached)
        }
    }

    override suspend fun getEpisodes(seriesId: String): AppResult<List<Episode>> {
        val cached = local.getEpisodes(seriesId)
        if (cached != null && isFresh(local.fetchedAt(episodesKey(seriesId)), clock.nowEpochMs(), seriesTtlMs)) {
            return AppResult.Success(cached)
        }
        return when (val result = refreshEpisodes(seriesId)) {
            is AppResult.Success -> result
            is AppResult.Failure -> fallback(result.error, cached)
        }
    }

    private suspend fun refreshHome(): AppResult<Unit> =
        errorMapper
            .call { api.home() }
            .map { dto ->
                HomeContent(
                    banners = dto.banners.map { it.toDomain(media) },
                    rows =
                        dto.rows.map { row ->
                            HomeRow(
                                key = row.key,
                                title = row.title,
                                items =
                                    row.items.map { item ->
                                        HomeItem(
                                            series = item.series.toDomain(media),
                                            episode = item.episode?.toDomain(media),
                                            positionMs = item.positionSeconds?.let { (it * MS_PER_SECOND).toLong() },
                                        )
                                    },
                            )
                        },
                )
            }.also { result -> if (result is AppResult.Success) local.saveHome(result.value, clock.nowEpochMs()) }
            .map { }

    private suspend fun refreshSeries(seriesId: String): AppResult<Series> =
        errorMapper
            .call { api.seriesDetail(seriesId) }
            .map { it.toDomain(media) }
            .also { result -> if (result is AppResult.Success) local.saveSeries(result.value, clock.nowEpochMs()) }

    private suspend fun refreshEpisodes(seriesId: String): AppResult<List<Episode>> =
        errorMapper
            .call { api.episodes(seriesId) }
            .map { list -> list.map { it.toDomain(media) }.sortedBy { it.index } }
            .also { result ->
                if (result is AppResult.Success) local.saveEpisodes(seriesId, result.value, clock.nowEpochMs())
            }

    /** Network failed: serve the stale copy when there is one (offline-first), otherwise surface the error. */
    private fun <T> fallback(
        error: AppError,
        cached: T?,
    ): AppResult<T> {
        if (cached != null && error !is AppError.NotFound) {
            logger.w(TAG, "refresh failed ($error), serving stale cache")
            return AppResult.Success(cached)
        }
        return AppResult.Failure(error)
    }

    companion object {
        private const val TAG = "Catalog"
        private const val MS_PER_SECOND = 1_000.0
        const val HOME_TTL_MS = 5 * 60 * 1_000L
        const val SERIES_TTL_MS = 10 * 60 * 1_000L
    }
}
