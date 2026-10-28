package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.Episode
import com.drama.domain.model.Series

interface CatalogRepository {
    suspend fun getSeries(seriesId: String): AppResult<Series>

    suspend fun getEpisodes(seriesId: String): AppResult<List<Episode>>
}
