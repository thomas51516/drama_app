package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.call
import com.drama.data.mapper.toDomain
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.FeedPage
import com.drama.domain.repository.FeedRepository
import javax.inject.Inject
import javax.inject.Singleton

/** `GET /feed` (M-02). Pages are not cached: preview URLs are signed and expire within minutes. */
@Singleton
class RemoteFeedRepository
    @Inject
    constructor(
        private val api: CatalogApi,
        private val errorMapper: ApiErrorMapper,
        private val media: MediaUrlResolver,
        private val clock: Clock,
    ) : FeedRepository {
        override suspend fun load(
            cursor: String?,
            limit: Int,
        ): AppResult<FeedPage> =
            errorMapper
                .call { api.feed(cursor = cursor, limit = limit) }
                .map { dto ->
                    val now = clock.nowEpochMs()
                    FeedPage(
                        items = dto.items.map { it.toDomain(media, now) },
                        nextCursor = dto.nextCursor?.takeIf { it.isNotBlank() },
                    )
                }
    }
