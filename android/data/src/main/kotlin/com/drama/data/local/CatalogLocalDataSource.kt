package com.drama.data.local

import com.drama.domain.model.Episode
import com.drama.domain.model.HomeContent
import com.drama.domain.model.Series
import kotlinx.coroutines.flow.Flow

/**
 * Catalogue cache seen from the repository: domain models in, domain models out. The Room implementation
 * lives in [RoomCatalogLocalDataSource]; tests use an in-memory fake.
 */
interface CatalogLocalDataSource {
    suspend fun fetchedAt(key: String): Long?

    suspend fun getHome(): HomeContent?

    fun observeHome(): Flow<HomeContent?>

    suspend fun saveHome(
        content: HomeContent,
        nowEpochMs: Long,
    )

    suspend fun getSeries(seriesId: String): Series?

    fun observeSeries(seriesId: String): Flow<Series?>

    suspend fun saveSeries(
        series: Series,
        nowEpochMs: Long,
    )

    /** Null when the series' episodes were never fetched (an empty list is a valid cached answer). */
    suspend fun getEpisodes(seriesId: String): List<Episode>?

    fun observeEpisodes(seriesId: String): Flow<List<Episode>?>

    suspend fun saveEpisodes(
        seriesId: String,
        episodes: List<Episode>,
        nowEpochMs: Long,
    )

    suspend fun clear()

    companion object {
        const val KEY_HOME = "home"

        fun seriesKey(seriesId: String) = "series:$seriesId"

        fun episodesKey(seriesId: String) = "episodes:$seriesId"
    }
}
