package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.FeedPage

/** `GET /feed` with cursor pagination (M-02). Not cached: previews are signed and short-lived. */
interface FeedRepository {
    suspend fun load(
        cursor: String?,
        limit: Int = DEFAULT_PAGE_SIZE,
    ): AppResult<FeedPage>

    companion object {
        const val DEFAULT_PAGE_SIZE = 10
    }
}
