package com.drama.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.ui.text.UiText
import com.drama.domain.model.BonusExpiry
import com.drama.domain.model.LedgerEntry
import com.drama.domain.model.Wallet
import com.drama.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

data class WalletUiState(
    val wallet: Wallet? = null,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Bonus coins expiring within [WalletViewModel.EXPIRING_SOON_MS]; null when none. */
    val bonusExpiringSoon: BonusExpiry? = null,
    val entries: List<LedgerEntry> = emptyList(),
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val isSavingAutoUnlock: Boolean = false,
    val error: UiText? = null,
    val message: UiText? = null,
) {
    val showError: Boolean get() = error != null && wallet == null
}

/** "Mon portefeuille" (S07-A1-03, M-32): balances, expiring bonus, paginated ledger. */
@HiltViewModel
class WalletViewModel
    @Inject
    constructor(
        private val walletRepository: WalletRepository,
        private val clock: Clock,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(WalletUiState())
        val uiState: StateFlow<WalletUiState> = uiStateFlow.asStateFlow()

        private var nextPage = 1
        private var pageJob: Job? = null

        init {
            viewModelScope.launch {
                walletRepository.wallet.collect { wallet ->
                    uiStateFlow.update {
                        it.copy(
                            wallet = wallet ?: it.wallet,
                            bonusExpiringSoon = wallet?.bonusExpiringWithin(clock.nowEpochMs(), EXPIRING_SOON_MS),
                        )
                    }
                }
            }
            refresh()
        }

        fun refresh() {
            if (uiStateFlow.value.isRefreshing) return
            uiStateFlow.update { it.copy(isRefreshing = it.wallet != null, error = null) }
            viewModelScope.launch {
                val wallet = walletRepository.refresh()
                if (wallet is AppResult.Failure) {
                    logger.w(TAG, "GET /wallet failed: ${wallet.error}")
                    uiStateFlow.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            error = wallet.error.toMessage(),
                        )
                    }
                    return@launch
                }
                nextPage = 1
                loadPage(reset = true)
            }
        }

        fun loadMore() {
            val state = uiStateFlow.value
            if (!state.hasMore || state.isLoadingMore || state.isLoading) return
            loadPage(reset = false)
        }

        /** The wallet also offers the auto-unlock switch (M-21); optimistic, rolled back on failure. */
        fun onAutoUnlockChanged(enabled: Boolean) {
            val current = uiStateFlow.value.wallet ?: return
            if (current.autoUnlock == enabled || uiStateFlow.value.isSavingAutoUnlock) return
            uiStateFlow.update { it.copy(wallet = current.copy(autoUnlock = enabled), isSavingAutoUnlock = true) }
            viewModelScope.launch {
                when (val result = walletRepository.setAutoUnlock(enabled)) {
                    is AppResult.Success -> uiStateFlow.update { it.copy(isSavingAutoUnlock = false) }
                    is AppResult.Failure ->
                        uiStateFlow.update {
                            it.copy(
                                isSavingAutoUnlock = false,
                                wallet = it.wallet?.copy(autoUnlock = current.autoUnlock),
                                message = result.error.toMessage(),
                            )
                        }
                }
            }
        }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        private fun loadPage(reset: Boolean) {
            pageJob?.cancel()
            uiStateFlow.update { it.copy(isLoadingMore = !reset) }
            pageJob =
                viewModelScope.launch {
                    val page = if (reset) 1 else nextPage
                    when (val result = walletRepository.transactions(page = page, pageSize = PAGE_SIZE)) {
                        is AppResult.Success -> {
                            nextPage = result.value.page + 1
                            uiStateFlow.update {
                                it.copy(
                                    isLoading = false,
                                    isRefreshing = false,
                                    isLoadingMore = false,
                                    entries = if (reset) result.value.items else it.entries + result.value.items,
                                    hasMore = result.value.hasMore && result.value.items.isNotEmpty(),
                                    error = null,
                                )
                            }
                        }
                        is AppResult.Failure -> {
                            logger.w(TAG, "GET /wallet/transactions page=$page failed: ${result.error}")
                            uiStateFlow.update {
                                it.copy(
                                    isLoading = false,
                                    isRefreshing = false,
                                    isLoadingMore = false,
                                    // The balance is already shown: a history failure is a notice, not an error screen.
                                    error = if (it.wallet == null) result.error.toMessage() else it.error,
                                    message = if (it.wallet != null) result.error.toMessage() else it.message,
                                )
                            }
                        }
                    }
                }
        }

        private fun AppError.toMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                is AppError.NotFound -> UiText.Res(CoreR.string.state_coming_soon)
                is AppError.Http ->
                    if (code ==
                        HTTP_NOT_IMPLEMENTED
                    ) {
                        UiText.Res(CoreR.string.state_coming_soon)
                    } else {
                        UiText.Res(R.string.wallet_error_load)
                    }
                else -> UiText.Res(R.string.wallet_error_load)
            }

        companion object {
            private const val TAG = "WalletVM"
            const val PAGE_SIZE = 20
            const val EXPIRING_SOON_MS = 7L * 24 * 60 * 60 * 1_000
            private const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
