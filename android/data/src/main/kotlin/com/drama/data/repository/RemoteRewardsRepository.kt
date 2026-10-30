package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.RewardsApi
import com.drama.core.network.call
import com.drama.core.network.dto.IdempotentRequestDto
import com.drama.data.mapper.toDomain
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.CheckInResult
import com.drama.domain.model.CheckInStatus
import com.drama.domain.model.RewardTask
import com.drama.domain.model.TaskClaimResult
import com.drama.domain.repository.RewardsRepository
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Check-in and tasks (S08-A1-02). Claims carry a client UUID kept in memory until the server answered 2xx or
 * with a definitive 4xx, so a retry after a timeout reuses the same key (spec §8.4). Credited wallets feed the
 * shared [WalletStore]; the app never adds coins itself.
 */
@Singleton
class RemoteRewardsRepository
    @Inject
    constructor(
        private val api: RewardsApi,
        private val walletStore: WalletStore,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : RewardsRepository {
        private val pendingKeys = mutableMapOf<String, String>()

        override suspend fun checkInStatus(): AppResult<CheckInStatus> =
            errorMapper.call { api.checkInStatus() }.map { it.toDomain() }

        override suspend fun claimCheckIn(): AppResult<CheckInResult> {
            val key = keyFor(CHECKIN_KEY)
            return errorMapper
                .call { api.checkIn(IdempotentRequestDto(key)) }
                .map { it.toDomain() }
                .also { result -> settle(CHECKIN_KEY, result, result.getOrNullWallet()) }
        }

        override suspend fun tasks(): AppResult<List<RewardTask>> =
            errorMapper.call { api.tasks() }.map { dto -> dto.all.map { it.toDomain() } }

        override suspend fun claimTask(taskId: String): AppResult<TaskClaimResult> {
            val entry = "task:$taskId"
            val key = keyFor(entry)
            return errorMapper
                .call { api.claimTask(taskId, IdempotentRequestDto(key)) }
                .map { it.toDomain() }
                .also { result -> settle(entry, result, (result as? AppResult.Success)?.value?.wallet) }
        }

        private fun AppResult<CheckInResult>.getOrNullWallet() = (this as? AppResult.Success)?.value?.wallet

        private fun keyFor(entry: String): String =
            synchronized(pendingKeys) { pendingKeys.getOrPut(entry) { UUID.randomUUID().toString() } }

        /** Network failures keep the key (same request on retry); any server answer closes it. */
        private fun settle(
            entry: String,
            result: AppResult<*>,
            wallet: com.drama.domain.model.Wallet?,
        ) {
            when (result) {
                is AppResult.Success -> {
                    synchronized(pendingKeys) { pendingKeys.remove(entry) }
                    wallet?.let(walletStore::publish)
                    logger.i(TAG, "claimed $entry")
                }
                is AppResult.Failure -> {
                    if (result.error !is AppError.Network) synchronized(pendingKeys) { pendingKeys.remove(entry) }
                    logger.w(TAG, "claim $entry failed: ${result.error}")
                }
            }
        }

        private companion object {
            const val TAG = "Rewards"
            const val CHECKIN_KEY = "checkin"
        }
    }
