package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.NotificationsApi
import com.drama.core.network.call
import com.drama.core.network.callUnit
import com.drama.data.mapper.toDomain
import com.drama.domain.model.NotificationPage
import com.drama.domain.repository.NotificationsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** In-app notification history (S06-A1-02). */
@Singleton
class DefaultNotificationsRepository
    @Inject
    constructor(
        private val api: NotificationsApi,
        private val errorMapper: ApiErrorMapper,
    ) : NotificationsRepository {
        private val invalidationFlow = MutableStateFlow(0L)
        override val invalidations: Flow<Long> = invalidationFlow.asStateFlow()

        override suspend fun getPage(
            page: Int,
            pageSize: Int,
        ): AppResult<NotificationPage> =
            errorMapper
                .call { api.notifications(page = page, pageSize = pageSize) }
                .map { response ->
                    val items = response.items.map { it.toDomain() }
                    val total = response.total ?: items.size
                    val currentPage = response.page ?: page
                    val size = response.pageSize ?: pageSize
                    NotificationPage(
                        items = items,
                        total = total,
                        page = currentPage,
                        hasMore = response.nextCursor != null || currentPage * size < total,
                    )
                }

        override suspend fun markRead(id: String): AppResult<Unit> = errorMapper.callUnit { api.markRead(id) }

        override fun invalidate() {
            invalidationFlow.value = invalidationFlow.value + 1
        }
    }
