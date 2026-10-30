package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.WalletApi
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.call
import com.drama.core.network.dto.UnlockRequestDto
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.mapper.toDomain
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.UnlockResult
import com.drama.domain.repository.UnlockKeyStore
import com.drama.domain.repository.UnlockRepository
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * `POST /episodes/{id}/unlock` with a client idempotency key (S07-A1-02). The key is created on the first attempt
 * for a (user, episode) pair, persisted, reused by every retry and dropped only once the server answered 2xx or
 * with a definitive 4xx (insufficient coins): a timeout can never charge the viewer twice (spec §8.4).
 */
@Singleton
class RemoteUnlockRepository
    @Inject
    constructor(
        private val api: WalletApi,
        private val keys: UnlockKeyStore,
        private val walletStore: WalletStore,
        private val catalogLocal: CatalogLocalDataSource,
        private val sessionManager: SessionManager,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : UnlockRepository {
        override suspend fun unlock(
            seriesId: String,
            episodeId: String,
        ): AppResult<UnlockResult> {
            val userId = sessionManager.currentSession()?.userId ?: ANONYMOUS
            val key = keys.getOrCreate(userId, episodeId) { UUID.randomUUID().toString() }
            return when (val result = errorMapper.call { api.unlock(episodeId, UnlockRequestDto(key)) }) {
                is AppResult.Success -> {
                    val unlock = result.value.toDomain(episodeId)
                    keys.clear(userId, episodeId)
                    catalogLocal.markEpisodesUnlocked(seriesId, listOf(episodeId))
                    unlock.wallet?.let(walletStore::publish)
                    logger.i(TAG, "unlocked episode=$episodeId method=${unlock.method} charged=${unlock.charged}")
                    AppResult.Success(unlock)
                }
                is AppResult.Failure -> {
                    // A refused unlock is final for this key: the next attempt (after a recharge) is a new request.
                    if (result.error is com.drama.core.common.result.AppError.InsufficientCoins) {
                        keys.clear(
                            userId,
                            episodeId,
                        )
                    }
                    logger.w(TAG, "unlock failed episode=$episodeId key=$key: ${result.error}")
                    result
                }
            }
        }

        override suspend fun refreshUnlocks(seriesId: String): AppResult<Set<String>> =
            errorMapper
                .call { api.unlocks(seriesId) }
                .map { it.unlockedEpisodeIds.toSet() }
                .also { result ->
                    if (result is AppResult.Success && result.value.isNotEmpty()) {
                        catalogLocal.markEpisodesUnlocked(seriesId, result.value.toList())
                    }
                }

        private companion object {
            const val TAG = "Unlock"
            const val ANONYMOUS = "anonymous"
        }
    }
