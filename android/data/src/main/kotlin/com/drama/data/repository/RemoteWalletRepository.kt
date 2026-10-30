package com.drama.data.repository

import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.UserApi
import com.drama.core.network.api.WalletApi
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.auth.SessionStatus
import com.drama.core.network.call
import com.drama.core.network.dto.UpdateMeRequestDto
import com.drama.data.mapper.toDomain
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Wallet
import com.drama.domain.repository.WalletRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/** `GET /wallet`, `GET /wallet/transactions`, `PATCH /me autoUnlock` (S07-A1-03). */
@Singleton
class RemoteWalletRepository
    @Inject
    constructor(
        private val api: WalletApi,
        private val userApi: UserApi,
        private val store: WalletStore,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
        sessionManager: SessionManager,
        dispatchers: DispatcherProvider,
    ) : WalletRepository {
        private val scope = CoroutineScope(SupervisorJob() + dispatchers.io)

        init {
            // The wallet belongs to a user: forget it when the session changes (logout, sign-in, replaced guest).
            scope.launch {
                sessionManager.status
                    .filterIsInstance<SessionStatus.Authenticated>()
                    .map { it.userId }
                    .distinctUntilChanged()
                    .collect { store.clear() }
            }
        }

        override val wallet: Flow<Wallet?> = store.wallet

        override suspend fun refresh(): AppResult<Wallet> =
            errorMapper
                .call { api.wallet() }
                .map { it.toDomain() }
                .also { result -> if (result is AppResult.Success) store.publish(result.value) }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> =
            errorMapper
                .call { api.transactions(page, pageSize, type?.name) }
                .map { it.toDomain(fallbackPageSize = pageSize) }

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> =
            when (val result = errorMapper.call { userApi.updateMe(UpdateMeRequestDto(autoUnlock = enabled)) }) {
                is AppResult.Failure -> {
                    logger.w(TAG, "PATCH /me autoUnlock=$enabled failed: ${result.error}")
                    result
                }
                is AppResult.Success -> {
                    val applied = result.value.autoUnlock ?: enabled
                    store.wallet.value?.let { store.publish(it.copy(autoUnlock = applied)) }
                        ?: store.publish(Wallet.EMPTY.copy(autoUnlock = applied))
                    AppResult.Success(Unit)
                }
            }

        private companion object {
            const val TAG = "Wallet"
        }
    }
