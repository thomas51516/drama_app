package com.drama.data.repository

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.database.preferences.UserPreferencesDataSource
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.call
import com.drama.data.mapper.toDomain
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.SearchResult
import com.drama.domain.repository.SearchRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** `GET /search` + `GET /search/suggest` (M-03); recent searches live in the `user_preferences` DataStore. */
@Singleton
class RemoteSearchRepository
    @Inject
    constructor(
        private val api: CatalogApi,
        private val errorMapper: ApiErrorMapper,
        private val media: MediaUrlResolver,
        private val preferences: UserPreferencesDataSource,
    ) : SearchRepository {
        override suspend fun search(
            query: String,
            genre: String?,
            page: Int,
            pageSize: Int,
        ): AppResult<SearchResult> {
            val trimmed = query.trim()
            if (trimmed.length < SearchRepository.MIN_QUERY_LENGTH) {
                return AppResult.Success(SearchResult(trimmed, emptyList(), 0, page, pageSize, emptyList()))
            }
            return errorMapper
                .call {
                    api.search(
                        query = trimmed.take(MAX_QUERY_LENGTH),
                        genre = genre,
                        page = page,
                        pageSize = pageSize,
                    )
                }.map { dto ->
                    SearchResult(
                        query = trimmed,
                        items = dto.items.map { it.toDomain(media) },
                        total = dto.total,
                        page = dto.page,
                        pageSize = dto.pageSize.takeIf { it > 0 } ?: pageSize,
                        suggestions = dto.suggestions,
                    )
                }
        }

        /** A missing endpoint (404/501) or any failure degrades to "no suggestions": the field keeps working. */
        override suspend fun suggest(query: String): AppResult<List<String>> {
            val trimmed = query.trim()
            if (trimmed.length < SearchRepository.MIN_QUERY_LENGTH) return AppResult.Success(emptyList())
            return when (val result = errorMapper.call { api.suggest(trimmed.take(MAX_QUERY_LENGTH)) }) {
                is AppResult.Success -> AppResult.Success(result.value.suggestions.take(MAX_SUGGESTIONS))
                is AppResult.Failure ->
                    when (result.error) {
                        is AppError.NotFound, is AppError.Http, is AppError.Server -> AppResult.Success(emptyList())
                        else -> result
                    }
            }
        }

        override val recentSearches: Flow<List<String>> =
            preferences.preferences.map { it.recentSearches }.distinctUntilChanged()

        override suspend fun addRecentSearch(query: String) {
            val trimmed = query.trim()
            if (trimmed.isEmpty()) return
            val current = preferences.preferences.first().recentSearches
            val updated =
                (listOf(trimmed) + current.filterNot { it.equals(trimmed, ignoreCase = true) })
                    .take(SearchRepository.MAX_RECENT)
            preferences.setRecentSearches(updated)
        }

        override suspend fun removeRecentSearch(query: String) {
            val current = preferences.preferences.first().recentSearches
            preferences.setRecentSearches(current.filterNot { it.equals(query, ignoreCase = true) })
        }

        override suspend fun clearRecentSearches() = preferences.setRecentSearches(emptyList())

        private companion object {
            const val MAX_QUERY_LENGTH = 100
            const val MAX_SUGGESTIONS = 8
        }
    }
