package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.RankingsApi
import com.drama.core.network.call
import com.drama.data.mapper.toDomain
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.RankingPeriod
import com.drama.domain.model.Rankings
import com.drama.domain.repository.RankingsRepository
import javax.inject.Inject
import javax.inject.Singleton

/** `GET /rankings` (S10-A1-02, M-04); the last answer per (period, genre) is served while the network fails. */
@Singleton
class RemoteRankingsRepository
    @Inject
    constructor(
        private val api: RankingsApi,
        private val media: MediaUrlResolver,
        private val errorMapper: ApiErrorMapper,
    ) : RankingsRepository {
        private val lastAnswers = mutableMapOf<Pair<RankingPeriod, String?>, Rankings>()

        override suspend fun rankings(
            period: RankingPeriod,
            genre: String?,
        ): AppResult<Rankings> {
            val key = period to genre?.takeIf { it.isNotBlank() }
            return when (val result = errorMapper.call { api.rankings(period.wireName, key.second) }) {
                is AppResult.Success -> {
                    val rankings = result.value.toDomain(media, key.second)
                    synchronized(lastAnswers) { lastAnswers[key] = rankings }
                    AppResult.Success(rankings)
                }
                is AppResult.Failure ->
                    synchronized(lastAnswers) { lastAnswers[key] }?.let { AppResult.Success(it) } ?: result
            }
        }
    }
