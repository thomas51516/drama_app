package com.drama.feature.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.Episode
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.PaywallRules
import com.drama.domain.usecase.UnlockEpisodeUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

/** The locked episode the sheet is about; [balanceHint] is the balance the 403 answer carried, if any. */
data class PaywallTarget(
    val index: Int,
    val episode: Episode,
    val coinCost: Int,
    val balanceHint: Int? = null,
)

data class PaywallUiState(
    val episode: Episode? = null,
    val coinCost: Int = 0,
    /** Server balance; null while unknown (first `GET /wallet` in flight, offline). */
    val balance: Int? = null,
    val autoUnlock: Boolean = false,
    val isUnlocking: Boolean = false,
    val isSavingAutoUnlock: Boolean = false,
    val message: UiText? = null,
) {
    val canUnlock: Boolean get() = PaywallRules.canUnlock(balance, coinCost) && !isUnlocking
    val missingCoins: Int get() = PaywallRules.missingCoins(balance, coinCost)
    val isInsufficient: Boolean get() = balance != null && !PaywallRules.canUnlock(balance, coinCost)
}

sealed interface PaywallEvent {
    data class Unlocked(
        val episodeId: String,
    ) : PaywallEvent

    /** [tab] = `coins` | `vip`; [missingCoins] feeds "Il vous manque N pièces". */
    data class OpenShop(
        val tab: String,
        val missingCoins: Int,
    ) : PaywallEvent
}

/**
 * Paywall decisions (S07-A1-01/02, M-20/M-21): balance from the wallet flow (never computed locally), unlock
 * through the idempotent use case, auto-unlock switch saved with `PATCH /me`. The player owns *when* the sheet
 * shows; this view model owns what it offers.
 */
@HiltViewModel
class PaywallViewModel
    @Inject
    constructor(
        private val wallet: WalletRepository,
        private val unlockEpisode: UnlockEpisodeUseCase,
        private val analytics: AnalyticsTracker,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(PaywallUiState())
        val uiState: StateFlow<PaywallUiState> = uiStateFlow.asStateFlow()

        /** Buffered: an event emitted before the screen collects (first composition) is not lost. */
        private val eventsChannel = Channel<PaywallEvent>(Channel.BUFFERED)
        val events: Flow<PaywallEvent> = eventsChannel.receiveAsFlow()

        init {
            viewModelScope.launch {
                wallet.wallet.collect { w ->
                    if (w != null) uiStateFlow.update { it.copy(balance = w.total, autoUnlock = w.autoUnlock) }
                }
            }
        }

        /** Called whenever the player shows the sheet for [target]; refreshes the balance from the server. */
        fun show(target: PaywallTarget) {
            uiStateFlow.update {
                it.copy(
                    episode = target.episode,
                    coinCost = target.coinCost,
                    balance = target.balanceHint ?: it.balance,
                    isUnlocking = false,
                    message = null,
                )
            }
            viewModelScope.launch {
                val result = wallet.refresh()
                if (result is AppResult.Failure) logger.w(TAG, "GET /wallet failed on paywall: ${result.error}")
            }
        }

        /** "Débloquer pour N pièces". A 402 sends the viewer to the shop with the missing amount. */
        fun onUnlock() {
            val state = uiStateFlow.value
            val episode = state.episode ?: return
            if (state.isUnlocking) return
            if (!PaywallRules.canUnlock(state.balance, state.coinCost) && state.balance != null) {
                eventsChannel.trySend(PaywallEvent.OpenShop(TAB_COINS, state.missingCoins))
                return
            }
            uiStateFlow.update { it.copy(isUnlocking = true, message = null) }
            viewModelScope.launch {
                when (val result = unlockEpisode(episode)) {
                    is AppResult.Success -> {
                        val unlock = result.value
                        analytics.track(
                            AnalyticsEvent.Unlock(episode.seriesId, episode.id, unlock.method.wireName, unlock.charged),
                        )
                        uiStateFlow.update { it.copy(isUnlocking = false) }
                        eventsChannel.trySend(PaywallEvent.Unlocked(episode.id))
                    }
                    is AppResult.Failure -> {
                        val error = result.error
                        logger.w(TAG, "unlock failed episode=${episode.id}: $error")
                        if (error is AppError.InsufficientCoins) {
                            uiStateFlow.update {
                                it.copy(isUnlocking = false, balance = error.balance ?: it.balance)
                            }
                            eventsChannel.trySend(
                                PaywallEvent.OpenShop(
                                    TAB_COINS,
                                    error.missing ?: PaywallRules.missingCoins(error.balance, state.coinCost),
                                ),
                            )
                        } else {
                            uiStateFlow.update { it.copy(isUnlocking = false, message = error.toMessage()) }
                        }
                    }
                }
            }
        }

        /** Switch "Débloquer automatiquement les prochains épisodes" (M-21): optimistic, rolled back on failure. */
        fun onAutoUnlockChanged(enabled: Boolean) {
            val previous = uiStateFlow.value.autoUnlock
            if (previous == enabled || uiStateFlow.value.isSavingAutoUnlock) return
            uiStateFlow.update { it.copy(autoUnlock = enabled, isSavingAutoUnlock = true) }
            viewModelScope.launch {
                when (val result = wallet.setAutoUnlock(enabled)) {
                    is AppResult.Success -> uiStateFlow.update { it.copy(isSavingAutoUnlock = false) }
                    is AppResult.Failure -> {
                        logger.w(TAG, "PATCH /me autoUnlock failed: ${result.error}")
                        uiStateFlow.update {
                            it.copy(
                                isSavingAutoUnlock = false,
                                autoUnlock = previous,
                                message = result.error.toMessage(),
                            )
                        }
                    }
                }
            }
        }

        fun onBecomeVip() {
            eventsChannel.trySend(PaywallEvent.OpenShop(TAB_VIP, 0))
        }

        fun onRecharge() {
            eventsChannel.trySend(PaywallEvent.OpenShop(TAB_COINS, uiStateFlow.value.missingCoins))
        }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        private fun AppError.toMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                is AppError.Http ->
                    if (code ==
                        HTTP_NOT_IMPLEMENTED
                    ) {
                        UiText.Res(CoreR.string.state_coming_soon)
                    } else {
                        UiText.Res(R.string.player_paywall_error)
                    }
                is AppError.NotFound -> UiText.Res(CoreR.string.state_coming_soon)
                else -> UiText.Res(R.string.player_paywall_error)
            }

        companion object {
            private const val TAG = "Paywall"
            const val TAB_COINS = "coins"
            const val TAB_VIP = "vip"
            private const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
