package com.drama.domain.usecase

import com.drama.core.common.result.Resource
import com.drama.domain.model.HomeContent
import com.drama.domain.repository.CatalogRepository
import kotlinx.coroutines.flow.Flow

fun interface ObserveHomeUseCase {
    operator fun invoke(): Flow<Resource<HomeContent>>
}

class DefaultObserveHomeUseCase(
    private val catalogRepository: CatalogRepository,
) : ObserveHomeUseCase {
    override fun invoke(): Flow<Resource<HomeContent>> = catalogRepository.observeHome()
}
