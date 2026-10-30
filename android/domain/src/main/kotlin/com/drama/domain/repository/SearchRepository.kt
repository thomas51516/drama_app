package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.SearchResult
import kotlinx.coroutines.flow.Flow

/** Search (M-03): server queries plus the locally kept recent searches. */
interface SearchRepository {
    suspend fun search(
        query: String,
        genre: String? = null,
        page: Int = 1,
        pageSize: Int = DEFAULT_PAGE_SIZE,
    ): AppResult<SearchResult>

    /** Title prefix completions (8 max); an empty list when the query is too short or the server has none. */
    suspend fun suggest(query: String): AppResult<List<String>>

    /** Most recent first, at most [MAX_RECENT] entries, de-duplicated case-insensitively. */
    val recentSearches: Flow<List<String>>

    suspend fun addRecentSearch(query: String)

    suspend fun removeRecentSearch(query: String)

    suspend fun clearRecentSearches()

    companion object {
        const val DEFAULT_PAGE_SIZE = 20
        const val MAX_RECENT = 10
        const val MIN_QUERY_LENGTH = 2
    }
}
