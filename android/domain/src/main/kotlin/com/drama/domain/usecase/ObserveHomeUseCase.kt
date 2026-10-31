package com.drama.domain.usecase

import com.drama.core.common.result.Resource
import com.drama.domain.model.HomeContent
import com.drama.domain.repository.CatalogRepository
import kotlinx.coroutines.flow.Flow

fun interface ObserveHomeUseCase {
    // Kotlin forbids a default value on a fun-interface's abstract method; callers (HomeViewModel.load)
    // always pass it explicitly, so this costs nothing in practice.
    operator fun invoke(force: Boolean): Flow<Resource<HomeContent>>
}

class DefaultObserveHomeUseCase(
    private val catalogRepository: CatalogRepository,
) : ObserveHomeUseCase {
    override fun invoke(force: Boolean): Flow<Resource<HomeContent>> = catalogRepository.observeHome(force)
}
