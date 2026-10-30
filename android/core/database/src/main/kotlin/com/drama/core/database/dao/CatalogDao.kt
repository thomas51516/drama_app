package com.drama.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.drama.core.database.entity.CacheMetaEntity
import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.HomeBannerEntity
import com.drama.core.database.entity.HomeRowEntity
import com.drama.core.database.entity.HomeRowItemEntity
import com.drama.core.database.entity.SeriesEntity
import kotlinx.coroutines.flow.Flow

/** Catalogue cache (S02-A1-03). Writers replace whole slices atomically so readers never see a half-written list. */
@Dao
interface CatalogDao {
    // --- series ---

    @Upsert
    suspend fun upsertSeries(series: List<SeriesEntity>)

    @Query("SELECT * FROM series WHERE id = :seriesId")
    suspend fun getSeries(seriesId: String): SeriesEntity?

    @Query("SELECT * FROM series WHERE id = :seriesId")
    fun observeSeries(seriesId: String): Flow<SeriesEntity?>

    @Query("SELECT * FROM series WHERE id IN (:ids)")
    fun observeSeriesByIds(ids: List<String>): Flow<List<SeriesEntity>>

    @Query("SELECT * FROM series")
    fun observeAllSeries(): Flow<List<SeriesEntity>>

    /** "J'aime" state (M-16); [likes] null leaves the count unchanged. */
    @Query("UPDATE series SET liked = :liked, likes = COALESCE(:likes, likes) WHERE id = :seriesId")
    suspend fun updateLike(
        seriesId: String,
        liked: Boolean,
        likes: Int?,
    )

    // --- episodes ---

    @Upsert
    suspend fun upsertEpisodes(episodes: List<EpisodeEntity>)

    @Query("DELETE FROM episodes WHERE seriesId = :seriesId")
    suspend fun deleteEpisodesOfSeries(seriesId: String)

    @Transaction
    suspend fun replaceEpisodes(
        seriesId: String,
        episodes: List<EpisodeEntity>,
    ) {
        deleteEpisodesOfSeries(seriesId)
        upsertEpisodes(episodes)
    }

    @Query("SELECT * FROM episodes WHERE seriesId = :seriesId ORDER BY number ASC")
    suspend fun getEpisodes(seriesId: String): List<EpisodeEntity>

    @Query("SELECT * FROM episodes WHERE seriesId = :seriesId ORDER BY number ASC")
    fun observeEpisodes(seriesId: String): Flow<List<EpisodeEntity>>

    @Query("SELECT * FROM episodes WHERE id IN (:ids)")
    fun observeEpisodesByIds(ids: List<String>): Flow<List<EpisodeEntity>>

    // --- home ---

    @Upsert
    suspend fun upsertHomeRows(rows: List<HomeRowEntity>)

    @Upsert
    suspend fun upsertHomeRowItems(items: List<HomeRowItemEntity>)

    @Query("DELETE FROM home_rows")
    suspend fun deleteHomeRows()

    @Query("DELETE FROM home_row_items")
    suspend fun deleteHomeRowItems()

    @Upsert
    suspend fun upsertHomeBanners(banners: List<HomeBannerEntity>)

    @Query("DELETE FROM home_banners")
    suspend fun deleteHomeBanners()

    @Transaction
    suspend fun replaceHome(
        banners: List<HomeBannerEntity>,
        rows: List<HomeRowEntity>,
        items: List<HomeRowItemEntity>,
        series: List<SeriesEntity>,
        episodes: List<EpisodeEntity>,
    ) {
        deleteHomeRowItems()
        deleteHomeRows()
        deleteHomeBanners()
        upsertSeries(series)
        if (episodes.isNotEmpty()) upsertEpisodes(episodes)
        upsertHomeBanners(banners)
        upsertHomeRows(rows)
        upsertHomeRowItems(items)
    }

    @Query("SELECT * FROM home_banners ORDER BY position ASC")
    fun observeHomeBanners(): Flow<List<HomeBannerEntity>>

    @Query("SELECT * FROM home_rows ORDER BY position ASC")
    fun observeHomeRows(): Flow<List<HomeRowEntity>>

    @Query("SELECT * FROM home_row_items ORDER BY rowKey, position ASC")
    fun observeHomeRowItems(): Flow<List<HomeRowItemEntity>>

    // --- cache meta ---

    @Upsert
    suspend fun upsertCacheMeta(meta: CacheMetaEntity)

    @Query("SELECT fetchedAtEpochMs FROM cache_meta WHERE `key` = :key")
    suspend fun getFetchedAt(key: String): Long?

    @Query("SELECT fetchedAtEpochMs FROM cache_meta WHERE `key` = :key")
    fun observeFetchedAt(key: String): Flow<Long?>

    @Transaction
    suspend fun clearCatalogCache() {
        deleteHomeRowItems()
        deleteHomeRows()
        deleteHomeBanners()
        clearEpisodes()
        clearSeries()
        clearCacheMeta()
    }

    @Query("DELETE FROM episodes")
    suspend fun clearEpisodes()

    @Query("DELETE FROM series")
    suspend fun clearSeries()

    @Query("DELETE FROM cache_meta")
    suspend fun clearCacheMeta()
}
