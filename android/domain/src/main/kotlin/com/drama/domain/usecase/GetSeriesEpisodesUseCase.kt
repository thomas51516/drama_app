package com.drama.domain.usecase

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.domain.model.Episode
import com.drama.domain.repository.CatalogRepository

/** Episodes of a series, ordered by index, ready to be fed to the vertical player. */
fun interface GetSeriesEpisodesUseCase {
    suspend operator fun invoke(seriesId: String): AppResult<List<Episode>>
}

class DefaultGetSeriesEpisodesUseCase(
    private val catalogRepository: CatalogRepository,
) : GetSeriesEpisodesUseCase {
    override suspend fun invoke(seriesId: String): AppResult<List<Episode>> =
        catalogRepository.getEpisodes(seriesId).map { episodes -> episodes.sortedBy { it.index } }
}
