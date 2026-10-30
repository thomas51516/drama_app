package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.RankingPeriod
import com.drama.domain.model.Rankings

/** `GET /rankings?period&genre` (M-04); the server caches 10 min, the client keeps the last answer per key. */
interface RankingsRepository {
    suspend fun rankings(
        period: RankingPeriod,
        genre: String? = null,
    ): AppResult<Rankings>
}
