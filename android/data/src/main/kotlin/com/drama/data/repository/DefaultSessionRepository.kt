package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.auth.SessionStatus
import com.drama.data.local.CatalogLocalDataSource
import com.drama.domain.model.SessionState
import com.drama.domain.repository.SessionRepository
import com.drama.domain.repository.WatchHistoryRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DefaultSessionRepository
    @Inject
    constructor(
        private val sessionManager: SessionManager,
        private val watchProgressDao: WatchProgressDao,
        private val watchHistory: WatchHistoryRepository,
        private val catalogLocal: CatalogLocalDataSource,
    ) : SessionRepository {
        override val state: Flow<SessionState> = sessionManager.status.map { it.toDomain() }

        override suspend fun ensureSession(): AppResult<SessionState.Authenticated> =
            sessionManager.ensureSession().map { SessionState.Authenticated(it.userId, it.isGuest) }

        /** Tokens, local progress, history and the per-viewer catalogue cache (episode `access`) are wiped. */
        override suspend fun logout() {
            sessionManager.logout()
            watchProgressDao.clear()
            watchHistory.clear()
            catalogLocal.clear()
        }

        private fun SessionStatus.toDomain(): SessionState =
            when (this) {
                SessionStatus.Unknown -> SessionState.Unknown
                SessionStatus.Connecting -> SessionState.Connecting
                is SessionStatus.Authenticated -> SessionState.Authenticated(userId, isGuest)
                SessionStatus.SignedOut -> SessionState.SignedOut
            }
    }
