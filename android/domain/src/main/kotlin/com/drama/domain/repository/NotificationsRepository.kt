package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.NotificationPage
import kotlinx.coroutines.flow.Flow

/** In-app notification history (M-54, `GET /me/notifications`). */
interface NotificationsRepository {
    /** Bumped whenever a push arrives while the app runs, so open lists refresh. */
    val invalidations: Flow<Long>

    suspend fun getPage(
        page: Int,
        pageSize: Int = DEFAULT_PAGE_SIZE,
    ): AppResult<NotificationPage>

    suspend fun markRead(id: String): AppResult<Unit>

    fun invalidate()

    companion object {
        const val DEFAULT_PAGE_SIZE = 30
    }
}
