package com.drama.domain.usecase

import com.drama.core.common.result.AppResult
import com.drama.domain.model.Series
import com.drama.domain.repository.CatalogRepository

fun interface GetSeriesUseCase {
    suspend operator fun invoke(seriesId: String): AppResult<Series>
}

class DefaultGetSeriesUseCase(
    private val catalogRepository: CatalogRepository,
) : GetSeriesUseCase {
    override suspend fun invoke(seriesId: String): AppResult<Series> = catalogRepository.getSeries(seriesId)
}
