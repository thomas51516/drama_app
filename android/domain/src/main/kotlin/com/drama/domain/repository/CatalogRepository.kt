package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import com.drama.domain.model.Episode
import com.drama.domain.model.HomeContent
import com.drama.domain.model.Series
import kotlinx.coroutines.flow.Flow

/**
 * Catalogue read model. `observe*` flows apply stale-while-revalidate: the Room cache is emitted first,
 * a refresh runs when the cache is missing or older than the TTL, and the refreshed value follows.
 * `get*` one-shots return a fresh cache hit or the network answer, falling back to a stale cache on error.
 */
interface CatalogRepository {
    fun observeHome(): Flow<Resource<HomeContent>>

    fun observeSeries(seriesId: String): Flow<Resource<Series>>

    fun observeEpisodes(seriesId: String): Flow<Resource<List<Episode>>>

    suspend fun getSeries(seriesId: String): AppResult<Series>

    suspend fun getEpisodes(seriesId: String): AppResult<List<Episode>>
}
