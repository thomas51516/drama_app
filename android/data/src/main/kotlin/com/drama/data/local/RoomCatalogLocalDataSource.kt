package com.drama.data.local

import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.entity.CacheMetaEntity
import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.HomeBannerEntity
import com.drama.core.database.entity.HomeRowEntity
import com.drama.core.database.entity.HomeRowItemEntity
import com.drama.core.database.entity.SeriesEntity
import com.drama.data.local.CatalogLocalDataSource.Companion.KEY_HOME
import com.drama.data.local.CatalogLocalDataSource.Companion.episodesKey
import com.drama.data.local.CatalogLocalDataSource.Companion.seriesKey
import com.drama.data.mapper.toDomain
import com.drama.data.mapper.toEntity
import com.drama.domain.model.Episode
import com.drama.domain.model.HomeBanner
import com.drama.domain.model.HomeContent
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRow
import com.drama.domain.model.HomeRowType
import com.drama.domain.model.Series
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoomCatalogLocalDataSource
    @Inject
    constructor(
        private val dao: CatalogDao,
    ) : CatalogLocalDataSource {
        override suspend fun fetchedAt(key: String): Long? = dao.getFetchedAt(key)

        override suspend fun getHome(): HomeContent? = observeHome().first()

        @OptIn(ExperimentalCoroutinesApi::class)
        override fun observeHome(): Flow<HomeContent?> =
            combine(
                dao.observeHomeBanners(),
                dao.observeHomeRows(),
                dao.observeHomeRowItems(),
                dao.observeAllSeries(),
            ) { banners, rows, items, series -> HomeTables(banners, rows, items, series) }
                .flatMapLatest { tables ->
                    val episodeIds = tables.items.mapNotNull { it.episodeId }.distinct()
                    val episodesFlow =
                        if (episodeIds.isEmpty()) flowOf(emptyList()) else dao.observeEpisodesByIds(episodeIds)
                    episodesFlow.map { episodes -> buildHome(tables, episodes) }
                }.distinctUntilChanged()

        private data class HomeTables(
            val banners: List<HomeBannerEntity>,
            val rows: List<HomeRowEntity>,
            val items: List<HomeRowItemEntity>,
            val series: List<SeriesEntity>,
        )

        private fun buildHome(
            tables: HomeTables,
            episodes: List<EpisodeEntity>,
        ): HomeContent? {
            // The marker row is written on every save, so "no rows" means "never cached".
            if (tables.rows.none { it.key == MARKER_ROW_KEY }) return null
            val seriesById = tables.series.associateBy { it.id }
            val episodesById = episodes.associateBy { it.id }
            val itemsByRow = tables.items.groupBy { it.rowKey }
            val banners =
                tables.banners
                    .sortedBy { it.position }
                    .map { HomeBanner(it.id, it.seriesId, it.imageUrl, it.title, it.subtitle) }
            val domainRows =
                tables.rows
                    .filter { it.key != MARKER_ROW_KEY }
                    .sortedBy { it.position }
                    .map { row ->
                        HomeRow(
                            key = row.key,
                            title = row.title,
                            type = HomeRowType.from(row.type, row.key),
                            items =
                                itemsByRow[row.key].orEmpty().sortedBy { it.position }.mapNotNull { item ->
                                    seriesById[item.seriesId]?.let { s ->
                                        HomeItem(
                                            series = s.toDomain(),
                                            episode = item.episodeId?.let { episodesById[it]?.toDomain() },
                                            positionMs = item.positionMs,
                                        )
                                    }
                                },
                        )
                    }
            return HomeContent(banners = banners, rows = domainRows)
        }

        override suspend fun saveHome(
            content: HomeContent,
            nowEpochMs: Long,
        ) {
            val rows = mutableListOf(HomeRowEntity(key = MARKER_ROW_KEY, position = -1, title = ""))
            val items = mutableListOf<HomeRowItemEntity>()
            val series = linkedMapOf<String, Series>()
            val episodes = linkedMapOf<String, Episode>()
            val banners =
                content.banners.mapIndexed { index, b ->
                    HomeBannerEntity(b.id, index, b.seriesId, b.imageUrl, b.title, b.subtitle)
                }
            content.rows.forEachIndexed { rowIndex, row ->
                rows += HomeRowEntity(key = row.key, position = rowIndex, title = row.title, type = row.type.name)
                row.items.forEachIndexed { index, item ->
                    series.putIfAbsent(item.series.id, item.series)
                    item.episode?.let { episodes.putIfAbsent(it.id, it) }
                    items += HomeRowItemEntity(row.key, index, item.series.id, item.episode?.id, item.positionMs)
                }
            }
            val seriesEntities =
                series.values.map { s -> s.toEntity(nowEpochMs, detail = false, previous = dao.getSeries(s.id)) }
            dao.replaceHome(banners, rows, items, seriesEntities, episodes.values.map { it.toEntity(nowEpochMs) })
            dao.upsertCacheMeta(CacheMetaEntity(KEY_HOME, nowEpochMs))
        }

        override suspend fun getSeries(seriesId: String): Series? = dao.getSeries(seriesId)?.toDomain()

        override fun observeSeries(seriesId: String): Flow<Series?> = dao.observeSeries(seriesId).map { it?.toDomain() }

        override suspend fun saveSeries(
            series: Series,
            nowEpochMs: Long,
        ) {
            dao.upsertSeries(listOf(series.toEntity(nowEpochMs, detail = true, previous = dao.getSeries(series.id))))
            dao.upsertCacheMeta(CacheMetaEntity(seriesKey(series.id), nowEpochMs))
        }

        override suspend fun getEpisodes(seriesId: String): List<Episode>? {
            dao.getFetchedAt(episodesKey(seriesId)) ?: return null
            return dao.getEpisodes(seriesId).map { it.toDomain() }
        }

        override fun observeEpisodes(seriesId: String): Flow<List<Episode>?> =
            combine(dao.observeFetchedAt(episodesKey(seriesId)), dao.observeEpisodes(seriesId)) { fetchedAt, episodes ->
                if (fetchedAt == null) null else episodes.map { it.toDomain() }
            }.distinctUntilChanged()

        override suspend fun saveEpisodes(
            seriesId: String,
            episodes: List<Episode>,
            nowEpochMs: Long,
        ) {
            dao.replaceEpisodes(seriesId, episodes.map { it.toEntity(nowEpochMs) })
            dao.upsertCacheMeta(CacheMetaEntity(episodesKey(seriesId), nowEpochMs))
        }

        override suspend fun markEpisodesUnlocked(
            seriesId: String,
            episodeIds: List<String>,
        ) {
            if (episodeIds.isNotEmpty()) dao.markEpisodesUnlocked(episodeIds)
        }

        override suspend fun clear() = dao.clearCatalogCache()

        private companion object {
            /** Pseudo-row always present once the home was cached (an empty home is a valid cached answer). */
            const val MARKER_ROW_KEY = "__home"
        }
    }
