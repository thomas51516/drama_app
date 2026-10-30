package com.drama.feature.player

import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdOutcome
import com.drama.domain.model.AdSession
import com.drama.domain.model.AdSessionStatus
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.FakeAdPrompt
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Offers
import com.drama.domain.model.PromoRedemption
import com.drama.domain.model.RewardedAdRequest
import com.drama.domain.model.UnlockAllQuote
import com.drama.domain.model.UnlockAllResult
import com.drama.domain.model.UnlockMethod
import com.drama.domain.model.UnlockResult
import com.drama.domain.model.Wallet
import com.drama.domain.repository.AdGateway
import com.drama.domain.repository.AdRepository
import com.drama.domain.repository.OffersRepository
import com.drama.domain.repository.UnlockRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.AdUnlockResult
import com.drama.domain.usecase.UnlockEpisodeUseCase
import com.drama.domain.usecase.WatchRewardedAdUseCase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import com.drama.core.ui.R as CoreR

/** Paywall decisions (M-20/M-21): can unlock, insufficient balance -> shop, auto-unlock switch. */
@OptIn(ExperimentalCoroutinesApi::class)
class PaywallViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val wallet = FakeWalletRepository()
    private val analytics = RecordingAnalytics()
    private val episode =
        Episode(
            id = "ep3",
            seriesId = "s1",
            index = 3,
            title = "Three",
            durationMs = 30_000,
            thumbnailUrl = null,
            access = EpisodeAccess.LOCKED,
            coinCost = 10,
        )
    private var unlockResult: AppResult<UnlockResult> =
        AppResult.Success(
            UnlockResult("ep3", UnlockMethod.COINS, chargedBonus = 4, chargedPurchased = 6, wallet = null),
        )
    private val unlockCalls = mutableListOf<String>()
    private val unlockEpisode =
        UnlockEpisodeUseCase { e ->
            unlockCalls += e.id
            unlockResult
        }

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val unlocks = FakeUnlockRepository()
    private val ads = FakeAdRepository()
    private val adGateway = FakeAdGateway()
    private val watchAd = WatchRewardedAdUseCase { _, _, _ -> AdUnlockResult.Dismissed }
    private val offers = FakeOffersRepository()

    private fun viewModel() =
        PaywallViewModel(
            wallet,
            unlockEpisode,
            unlocks,
            ads,
            watchAd,
            adGateway,
            offers,
            analytics,
            Clock { 0L },
            NoOpLogger,
        )

    @Test
    fun `balance covers the cost - unlock enabled, unlock event emitted and tracked`() =
        runTest(dispatcher) {
            wallet.state.value = Wallet(purchased = 20, bonus = 5, total = 25, autoUnlock = false)
            val vm = viewModel()
            val events = mutableListOf<PaywallEvent>()
            val collector = launch { vm.events.collect { events += it } }
            vm.show(PaywallTarget(2, episode, coinCost = 10))
            advanceUntilIdle()

            val state = vm.uiState.value
            assertEquals(25, state.balance)
            assertTrue(state.canUnlock)
            assertFalse(state.isInsufficient)

            vm.onUnlock()
            advanceUntilIdle()
            assertEquals(listOf("ep3"), unlockCalls)
            assertEquals(listOf<PaywallEvent>(PaywallEvent.Unlocked("ep3")), events)
            assertTrue(analytics.events.contains(AnalyticsEvent.Unlock("s1", "ep3", "coins", 10)))
            collector.cancel()
        }

    @Test
    fun `insufficient balance - unlock disabled, missing coins computed, shop opened on tap`() =
        runTest(dispatcher) {
            wallet.state.value = Wallet(purchased = 3, bonus = 0, total = 3, autoUnlock = false)
            val vm = viewModel()
            val events = mutableListOf<PaywallEvent>()
            val collector = launch { vm.events.collect { events += it } }
            vm.show(PaywallTarget(2, episode, coinCost = 10))
            advanceUntilIdle()

            val state = vm.uiState.value
            assertFalse(state.canUnlock)
            assertTrue(state.isInsufficient)
            assertEquals(7, state.missingCoins)

            vm.onUnlock()
            advanceUntilIdle()
            assertTrue(unlockCalls.isEmpty())
            assertEquals(listOf<PaywallEvent>(PaywallEvent.OpenShop("coins", 7)), events)
            collector.cancel()
        }

    @Test
    fun `server 402 sends to the shop with the server's missing amount`() =
        runTest(dispatcher) {
            wallet.state.value = Wallet(purchased = 20, bonus = 0, total = 20, autoUnlock = false)
            // Client thought it had enough; the server (source of truth) says 8 short.
            unlockResult = AppResult.Failure(AppError.InsufficientCoins(cost = 10, balance = 2))
            val vm = viewModel()
            val events = mutableListOf<PaywallEvent>()
            val collector = launch { vm.events.collect { events += it } }
            vm.show(PaywallTarget(2, episode, coinCost = 10))
            advanceUntilIdle()

            vm.onUnlock()
            advanceUntilIdle()
            assertEquals(listOf<PaywallEvent>(PaywallEvent.OpenShop("coins", 8)), events)
            assertEquals(2, vm.uiState.value.balance)
            collector.cancel()
        }

    @Test
    fun `balance hint from the 403 is shown until the wallet answers`() =
        runTest(dispatcher) {
            wallet.refreshResult = AppResult.Failure(AppError.Network())
            val vm = viewModel()
            vm.show(PaywallTarget(2, episode, coinCost = 10, balanceHint = 12))
            advanceUntilIdle()
            assertEquals(12, vm.uiState.value.balance)
            assertTrue(vm.uiState.value.canUnlock)
        }

    @Test
    fun `auto-unlock switch saves through PATCH me and rolls back on failure`() =
        runTest(dispatcher) {
            wallet.state.value = Wallet(purchased = 20, bonus = 0, total = 20, autoUnlock = false)
            val vm = viewModel()
            vm.show(PaywallTarget(2, episode, coinCost = 10))
            advanceUntilIdle()

            vm.onAutoUnlockChanged(true)
            advanceUntilIdle()
            assertEquals(listOf(true), wallet.autoUnlockCalls)
            assertTrue(vm.uiState.value.autoUnlock)

            wallet.autoUnlockResult = AppResult.Failure(AppError.Network())
            vm.onAutoUnlockChanged(false)
            advanceUntilIdle()
            assertTrue(vm.uiState.value.autoUnlock)
            assertEquals(UiText.Res(CoreR.string.error_network_short), vm.uiState.value.message)
        }

    @Test
    fun `become vip opens the vip tab`() =
        runTest(dispatcher) {
            val vm = viewModel()
            val events = mutableListOf<PaywallEvent>()
            val collector = launch { vm.events.collect { events += it } }
            vm.onBecomeVip()
            advanceUntilIdle()
            assertEquals(listOf<PaywallEvent>(PaywallEvent.OpenShop("vip", 0)), events)
            collector.cancel()
        }

    private class FakeUnlockRepository : UnlockRepository {
        override suspend fun unlock(
            seriesId: String,
            episodeId: String,
        ): AppResult<UnlockResult> = error("not used")

        override suspend fun refreshUnlocks(seriesId: String): AppResult<Set<String>> = AppResult.Success(emptySet())

        override suspend fun quoteUnlockAll(seriesId: String): AppResult<UnlockAllQuote> =
            AppResult.Success(UnlockAllQuote(lockedCount = 0, fullPrice = 0, discountPercent = 0, price = 0))

        override suspend fun unlockAll(seriesId: String): AppResult<UnlockAllResult> = error("not used")
    }

    private class FakeAdRepository : AdRepository {
        override suspend fun eligibility(episodeId: String): AppResult<AdEligibility> =
            AppResult.Success(
                AdEligibility(
                    eligible = false,
                    remainingToday = 0,
                    dailyCap = 0,
                    reason = null,
                    adUnitId = null,
                    provider = null,
                ),
            )

        override suspend fun createSession(episodeId: String): AppResult<AdSession> = error("not used")

        override suspend fun sessionStatus(
            sessionId: String,
            seriesId: String,
            episodeId: String,
        ): AppResult<AdSessionStatus> = error("not used")

        override suspend fun simulateServerReward(request: RewardedAdRequest): AppResult<Unit> = error("not used")
    }

    private class FakeAdGateway : AdGateway {
        override val isAvailable: Boolean = true
        override val fakeAd: StateFlow<FakeAdPrompt?> = MutableStateFlow(null).asStateFlow()

        override suspend fun showRewardedAd(
            host: AdUiHost,
            request: RewardedAdRequest,
        ): AdOutcome = AdOutcome.Dismissed

        override fun finishFakeAd(completed: Boolean) = Unit
    }

    private class FakeOffersRepository : OffersRepository {
        override suspend fun offers(): AppResult<Offers> = AppResult.Success(Offers.NONE)

        override suspend fun redeemPromo(code: String): AppResult<PromoRedemption> = error("not used")
    }

    private class RecordingAnalytics : AnalyticsTracker {
        val events = mutableListOf<AnalyticsEvent>()

        override fun track(event: AnalyticsEvent) {
            events += event
        }

        override fun setUserId(userId: String?) = Unit
    }

    private class FakeWalletRepository : WalletRepository {
        val state = MutableStateFlow<Wallet?>(null)
        var refreshResult: AppResult<Wallet>? = null
        var autoUnlockResult: AppResult<Unit> = AppResult.Success(Unit)
        val autoUnlockCalls = mutableListOf<Boolean>()
        override val wallet: Flow<Wallet?> = state

        override suspend fun refresh(): AppResult<Wallet> {
            val forced = refreshResult
            if (forced != null) return forced
            val current = state.value ?: Wallet.EMPTY
            state.value = current
            return AppResult.Success(current)
        }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> = AppResult.Success(LedgerPage(emptyList(), 0, page, pageSize))

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> {
            autoUnlockCalls += enabled
            if (autoUnlockResult is AppResult.Success) {
                state.value =
                    (state.value ?: Wallet.EMPTY).copy(autoUnlock = enabled)
            }
            return autoUnlockResult
        }
    }
}
