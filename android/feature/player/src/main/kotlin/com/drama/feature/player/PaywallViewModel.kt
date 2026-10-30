package com.drama.feature.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdIneligibleReason
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.Episode
import com.drama.domain.model.FakeAdPrompt
import com.drama.domain.model.UnlockAllQuote
import com.drama.domain.model.WelcomeOffer
import com.drama.domain.repository.AdGateway
import com.drama.domain.repository.AdRepository
import com.drama.domain.repository.OffersRepository
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.AdUnlockResult
import com.drama.domain.usecase.PaywallRules
import com.drama.domain.usecase.UnlockEpisodeUseCase
import com.drama.domain.usecase.WatchRewardedAdUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
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

/** "Regarder une pub" offer (M-22) as `GET /ads/eligibility` describes it. */
data class AdOfferUi(
    val isLoading: Boolean = true,
    /** Null while unknown or when the route does not exist on the server (button stays "bientôt"). */
    val eligibility: AdEligibility? = null,
    val isWatching: Boolean = false,
) {
    val enabled: Boolean get() = eligibility?.eligible == true && !isWatching
    val remaining: Int get() = eligibility?.remainingToday ?: 0
    val reason: AdIneligibleReason? get() = eligibility?.takeIf { !it.eligible }?.reason
}

data class PaywallUiState(
    val episode: Episode? = null,
    val coinCost: Int = 0,
    /** Server balance; null while unknown (first `GET /wallet` in flight, offline). */
    val balance: Int? = null,
    val autoUnlock: Boolean = false,
    val isUnlocking: Boolean = false,
    val isSavingAutoUnlock: Boolean = false,
    val ad: AdOfferUi = AdOfferUi(),
    /** Simulated ad to draw full screen (debug builds), null otherwise. */
    val fakeAd: FakeAdPrompt? = null,
    /** Whole-series offer (M-23); null until quoted or when nothing is left to unlock. */
    val unlockAll: UnlockAllQuote? = null,
    val isUnlockingAll: Boolean = false,
    val confirmUnlockAll: Boolean = false,
    /** Welcome offer still running (M-24), shown as a hint next to "Recharger". */
    val welcomeOffer: WelcomeOffer? = null,
    val message: UiText? = null,
) {
    val canUnlock: Boolean get() = PaywallRules.canUnlock(balance, coinCost) && !isUnlocking && !isUnlockingAll
    val missingCoins: Int get() = PaywallRules.missingCoins(balance, coinCost)
    val isInsufficient: Boolean get() = balance != null && !PaywallRules.canUnlock(balance, coinCost)
    val canUnlockAll: Boolean get() = unlockAll != null && unlockAll.lockedCount > 0 && !isUnlockingAll && !isUnlocking
    val isBusy: Boolean get() = isUnlocking || isUnlockingAll || ad.isWatching
}

sealed interface PaywallEvent {
    data class Unlocked(
        val episodeId: String,
    ) : PaywallEvent

    /** Several episodes unlocked at once (M-23); [currentEpisodeId] is the one to play. */
    data class SeriesUnlocked(
        val currentEpisodeId: String,
        val episodeIds: List<String>,
    ) : PaywallEvent

    /** [tab] = `coins` | `vip`; [missingCoins] feeds "Il vous manque N pièces". */
    data class OpenShop(
        val tab: String,
        val missingCoins: Int,
    ) : PaywallEvent
}

/**
 * Paywall decisions (S07-A1-01/02, S08-A1-01, S10-A1-01; M-20/M-21/M-22/M-23): balance from the wallet flow
 * (never computed locally), unlock through the idempotent use case, rewarded ad through [WatchRewardedAdUseCase]
 * (the server confirms by SSV, the app only polls), whole-series unlock after a confirmation, auto-unlock switch
 * saved with `PATCH /me`. The player owns *when* the sheet shows; this view model owns what it offers.
 */
@HiltViewModel
class PaywallViewModel
    @Inject
    constructor(
        private val wallet: WalletRepository,
        private val unlockEpisode: UnlockEpisodeUseCase,
        private val unlocks: UnlockRepository,
        private val ads: AdRepository,
        private val watchAd: WatchRewardedAdUseCase,
        private val adGateway: AdGateway,
        private val offers: OffersRepository,
        private val analytics: AnalyticsTracker,
        private val clock: Clock,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(PaywallUiState())
        val uiState: StateFlow<PaywallUiState> = uiStateFlow.asStateFlow()

        /** Buffered: an event emitted before the screen collects (first composition) is not lost. */
        private val eventsChannel = Channel<PaywallEvent>(Channel.BUFFERED)
        val events: Flow<PaywallEvent> = eventsChannel.receiveAsFlow()

        private var eligibilityJob: Job? = null
        private var quoteJob: Job? = null

        init {
            viewModelScope.launch {
                wallet.wallet.collect { w ->
                    if (w != null) uiStateFlow.update { it.copy(balance = w.total, autoUnlock = w.autoUnlock) }
                }
            }
            viewModelScope.launch {
                adGateway.fakeAd.collect { prompt ->
                    uiStateFlow.update { it.copy(fakeAd = prompt) }
                }
            }
            viewModelScope.launch {
                val result = offers.offers()
                if (result is AppResult.Success) {
                    val welcome = result.value.welcome?.takeIf { it.isActive(clock.nowEpochMs()) }
                    uiStateFlow.update { it.copy(welcomeOffer = welcome) }
                }
            }
        }

        /** Called whenever the player shows the sheet for [target]; refreshes the balance, the ad offer and the quote. */
        fun show(target: PaywallTarget) {
            uiStateFlow.update {
                it.copy(
                    episode = target.episode,
                    coinCost = target.coinCost,
                    balance = target.balanceHint ?: it.balance,
                    isUnlocking = false,
                    ad = AdOfferUi(isLoading = true),
                    confirmUnlockAll = false,
                    message = null,
                )
            }
            viewModelScope.launch {
                val result = wallet.refresh()
                if (result is AppResult.Failure) logger.w(TAG, "GET /wallet failed on paywall: ${result.error}")
            }
            loadEligibility(target.episode)
            loadQuote(target.episode.seriesId)
        }

        private fun loadEligibility(episode: Episode) {
            eligibilityJob?.cancel()
            eligibilityJob =
                viewModelScope.launch {
                    val eligibility =
                        when (val result = ads.eligibility(episode.id)) {
                            is AppResult.Success -> result.value
                            is AppResult.Failure -> {
                                logger.w(TAG, "GET /ads/eligibility failed: ${result.error}")
                                null
                            }
                        }
                    if (uiStateFlow.value.episode?.id == episode.id) {
                        uiStateFlow.update { it.copy(ad = AdOfferUi(isLoading = false, eligibility = eligibility)) }
                    }
                }
        }

        private fun loadQuote(seriesId: String) {
            quoteJob?.cancel()
            quoteJob =
                viewModelScope.launch {
                    when (val result = unlocks.quoteUnlockAll(seriesId)) {
                        is AppResult.Success ->
                            uiStateFlow.update { it.copy(unlockAll = result.value.takeIf { q -> q.lockedCount > 0 }) }
                        is AppResult.Failure -> {
                            logger.w(TAG, "unlock-all quote failed: ${result.error}")
                            uiStateFlow.update { it.copy(unlockAll = null) }
                        }
                    }
                }
        }

        /** "Débloquer pour N pièces". A 402 sends the viewer to the shop with the missing amount. */
        fun onUnlock() {
            val state = uiStateFlow.value
            val episode = state.episode ?: return
            if (state.isBusy) return
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

        /** "Regarder une pub" (M-22): ad network, then the server confirms (SSV) and the page is resolved again. */
        fun onWatchAd(host: AdUiHost) {
            val state = uiStateFlow.value
            val episode = state.episode ?: return
            if (state.isBusy || !state.ad.enabled) return
            uiStateFlow.update { it.copy(ad = it.ad.copy(isWatching = true), message = null) }
            viewModelScope.launch {
                val result = watchAd(host, episode, state.ad.eligibility)
                val provider = state.ad.eligibility?.provider
                logger.i(TAG, "rewarded ad episode=${episode.id} -> ${result::class.simpleName}")
                analytics.track(AnalyticsEvent.AdReward(episode.seriesId, episode.id, provider, result.analyticsName()))
                when (result) {
                    is AdUnlockResult.Unlocked -> {
                        analytics.track(AnalyticsEvent.Unlock(episode.seriesId, episode.id, METHOD_AD, 0))
                        uiStateFlow.update { it.copy(ad = it.ad.copy(isWatching = false)) }
                        eventsChannel.trySend(PaywallEvent.Unlocked(episode.id))
                    }
                    else -> {
                        uiStateFlow.update {
                            it.copy(ad = it.ad.copy(isWatching = false), message = result.toMessage())
                        }
                        // Remaining count and cap may have changed: ask again.
                        loadEligibility(episode)
                    }
                }
            }
        }

        /** The simulated ad (debug) reached its end or was closed by the viewer. */
        fun onFakeAdFinished(completed: Boolean) = adGateway.finishFakeAd(completed)

        /** "Débloquer toute la série" (M-23): asks for a confirmation first. */
        fun onUnlockAllRequested() {
            if (uiStateFlow.value.canUnlockAll) uiStateFlow.update { it.copy(confirmUnlockAll = true) }
        }

        fun onUnlockAllDismissed() = uiStateFlow.update { it.copy(confirmUnlockAll = false) }

        fun onUnlockAllConfirmed() {
            val state = uiStateFlow.value
            val episode = state.episode ?: return
            val quote = state.unlockAll ?: return
            if (state.isBusy) return
            if (state.balance != null && state.balance < quote.price) {
                uiStateFlow.update { it.copy(confirmUnlockAll = false) }
                eventsChannel.trySend(PaywallEvent.OpenShop(TAB_COINS, quote.price - state.balance))
                return
            }
            uiStateFlow.update { it.copy(confirmUnlockAll = false, isUnlockingAll = true, message = null) }
            viewModelScope.launch {
                when (val result = unlocks.unlockAll(episode.seriesId)) {
                    is AppResult.Success -> {
                        val unlocked = result.value
                        analytics.track(
                            AnalyticsEvent.UnlockAll(
                                episode.seriesId,
                                unlocked.unlockedEpisodeIds.size,
                                unlocked.charged,
                            ),
                        )
                        uiStateFlow.update { it.copy(isUnlockingAll = false, unlockAll = null) }
                        eventsChannel.trySend(PaywallEvent.SeriesUnlocked(episode.id, unlocked.unlockedEpisodeIds))
                    }
                    is AppResult.Failure -> {
                        val error = result.error
                        logger.w(TAG, "unlock-all failed series=${episode.seriesId}: $error")
                        if (error is AppError.InsufficientCoins) {
                            uiStateFlow.update {
                                it.copy(
                                    isUnlockingAll = false,
                                    balance = error.balance ?: it.balance,
                                )
                            }
                            eventsChannel.trySend(
                                PaywallEvent.OpenShop(
                                    TAB_COINS,
                                    error.missing ?: PaywallRules.missingCoins(error.balance, quote.price),
                                ),
                            )
                        } else {
                            uiStateFlow.update { it.copy(isUnlockingAll = false, message = error.toMessage()) }
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

        private fun AdUnlockResult.analyticsName(): String =
            when (this) {
                is AdUnlockResult.Unlocked -> "unlocked"
                is AdUnlockResult.NotEligible -> "not_eligible"
                AdUnlockResult.Dismissed -> "dismissed"
                AdUnlockResult.Pending -> "pending"
                AdUnlockResult.Rejected -> "rejected"
                is AdUnlockResult.AdUnavailable -> "unavailable"
                is AdUnlockResult.Failed -> "failed"
            }

        private fun AdUnlockResult.toMessage(): UiText? =
            when (this) {
                is AdUnlockResult.Unlocked, AdUnlockResult.Dismissed -> null
                is AdUnlockResult.NotEligible ->
                    when (reason) {
                        AdIneligibleReason.CAP_REACHED -> UiText.Res(R.string.player_ad_cap_reached)
                        AdIneligibleReason.ALREADY_UNLOCKED -> null
                        else -> UiText.Res(R.string.player_ad_not_eligible)
                    }
                AdUnlockResult.Pending -> UiText.Res(R.string.player_ad_pending)
                AdUnlockResult.Rejected -> UiText.Res(R.string.player_ad_rejected)
                is AdUnlockResult.AdUnavailable -> UiText.Res(R.string.player_ad_unavailable)
                is AdUnlockResult.Failed -> error.toMessage()
            }

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
            const val METHOD_AD = "ad"
            private const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
