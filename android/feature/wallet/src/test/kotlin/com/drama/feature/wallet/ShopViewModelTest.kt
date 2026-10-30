package com.drama.feature.wallet

import androidx.lifecycle.SavedStateHandle
import com.drama.core.billing.di.BillingConfig
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.BillingOutcome
import com.drama.domain.model.BillingProduct
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPrompt
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingPurchase
import com.drama.domain.model.BillingPurchaseState
import com.drama.domain.model.BillingUiHost
import com.drama.domain.model.CoinPack
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Price
import com.drama.domain.model.PurchaseVerification
import com.drama.domain.model.PurchaseVerificationStatus
import com.drama.domain.model.ShopCatalog
import com.drama.domain.model.Subscription
import com.drama.domain.model.SubscriptionStatus
import com.drama.domain.model.VipPeriod
import com.drama.domain.model.VipPlan
import com.drama.domain.model.Wallet
import com.drama.domain.repository.BillingGateway
import com.drama.domain.repository.ShopRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.PurchaseProductUseCase
import com.drama.domain.usecase.PurchaseResult
import com.drama.domain.usecase.RestorePurchasesUseCase
import com.drama.feature.wallet.navigation.ShopRoute
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Locale

@OptIn(ExperimentalCoroutinesApi::class)
class ShopViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val billing = FakeBilling()
    private val wallet = FakeWallet()
    private val analytics = RecordingAnalytics()
    private val pack100 =
        CoinPack("p1", "coins_100", coins = 100, bonusCoins = 10, price = Price("XOF", 500), badge = null, position = 1)
    private val pack500 =
        CoinPack(
            "p2",
            "coins_500",
            coins = 500,
            bonusCoins = 100,
            price = Price("XOF", 2000),
            badge = "Populaire",
            position = 2,
        )
    private val monthly = VipPlan("v1", "vip_month", VipPeriod.MONTH, Price("XOF", 1500), trialDays = 7, badge = null)
    private var catalog: AppResult<ShopCatalog> =
        AppResult.Success(
            ShopCatalog("XOF", listOf(pack100, pack500), listOf(monthly)),
        )
    private var purchaseResult: PurchaseResult = PurchaseResult.Cancelled
    private val purchaseCalls = mutableListOf<String>()
    private val purchase =
        PurchaseProductUseCase { _, sku, _ ->
            purchaseCalls += sku
            purchaseResult
        }
    private val restore = RestorePurchasesUseCase { AppResult.Success(emptyList()) }
    private val shop =
        object : ShopRepository {
            override suspend fun getShop(): AppResult<ShopCatalog> = catalog

            override suspend fun verifyPurchase(
                purchaseToken: String,
                productId: String,
                type: BillingProductType,
                idempotencyKey: String,
            ): AppResult<PurchaseVerification> = error("not used")

            override suspend fun getSubscription(): AppResult<Subscription> =
                AppResult.Success(Subscription(SubscriptionStatus.NONE, null, null, null, false, null))
        }
    private val host = object : BillingUiHost {}

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(
        tab: String = "coins",
        missing: Int = 0,
    ) = ShopViewModel(
        savedStateHandle = SavedStateHandle(mapOf(ShopRoute.ARG_TAB to tab, ShopRoute.ARG_MISSING_COINS to missing)),
        shop = shop,
        walletRepository = wallet,
        billing = billing,
        purchaseProduct = purchase,
        restorePurchases = restore,
        analytics = analytics,
        logger = NoOpLogger,
        billingConfig = BillingConfig(isFake = true),
    )

    @Test
    fun `local prices are shown in the viewer's currency with the right fraction digits`() {
        assertEquals("500 F CFA", PriceFormatter.format(Price("XOF", 500), Locale.FRANCE).normalizeSpaces())
        assertEquals("4,99 €", PriceFormatter.format(Price("EUR", 499), Locale.FRANCE).normalizeSpaces())
        assertEquals("$4.99", PriceFormatter.format(Price("USD", 499), Locale.US))
        assertEquals(4.99, PriceFormatter.majorAmount(Price("USD", 499)), 0.0001)
        assertEquals(Price("XOF", 500), PriceFormatter.fromMicros("XOF", 500_000_000))
        assertEquals(Price("EUR", 499), PriceFormatter.fromMicros("EUR", 4_990_000))
    }

    @Test
    fun `packs show the local price until the store answers, then the store price`() =
        runTest(dispatcher) {
            billing.products["coins_100"] =
                BillingProduct("coins_100", BillingProductType.INAPP, "CFA 550", 550_000_000, "XOF")
            val vm = viewModel(tab = "coins", missing = 7)
            advanceUntilIdle()

            val state = vm.uiState.value
            assertEquals(ShopTab.COINS, state.tab)
            assertEquals(7, state.missingCoins)
            assertEquals(2, state.packs.size)
            assertEquals(PriceDisplay.Store("CFA 550"), state.packs[0].price)
            assertEquals(PriceDisplay.Local(Price("XOF", 2000)), state.packs[1].price)
            assertEquals(PriceDisplay.Local(Price("XOF", 1500)), state.plans.single().price)
            assertTrue(state.isFakeBilling)
        }

    @Test
    fun `a credited pack refreshes the wallet, announces the coins and tracks purchase`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            purchaseResult =
                PurchaseResult.Credited(
                    purchase =
                        BillingPurchase(
                            "coins_100",
                            BillingProductType.INAPP,
                            "fake:coins_100:x",
                            BillingPurchaseState.PURCHASED,
                            false,
                        ),
                    verification =
                        PurchaseVerification(
                            PurchaseVerificationStatus.CREDITED,
                            Wallet(110, 10, 120, false),
                            null,
                        ),
                    isNew = true,
                )

            vm.onBuyPack(host, pack100)
            advanceUntilIdle()

            assertEquals(listOf("coins_100"), purchaseCalls)
            assertEquals(2, wallet.refreshes)
            assertEquals(UiText.Plural(R.plurals.shop_msg_coins_credited, 110), vm.uiState.value.message)
            assertEquals(0, vm.uiState.value.missingCoins)
            assertEquals(AnalyticsEvent.Purchase("coins_100", 500.0, "XOF", 110), analytics.events.single())
        }

    @Test
    fun `already processed and cancelled purchases stay silent`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            purchaseResult =
                PurchaseResult.Credited(
                    purchase =
                        BillingPurchase(
                            "coins_100",
                            BillingProductType.INAPP,
                            "t",
                            BillingPurchaseState.PURCHASED,
                            false,
                        ),
                    verification = PurchaseVerification(PurchaseVerificationStatus.ALREADY_PROCESSED, null, null),
                    isNew = false,
                )
            vm.onBuyPack(host, pack100)
            advanceUntilIdle()
            assertNull(vm.uiState.value.message)
            assertTrue(analytics.events.isEmpty())

            purchaseResult = PurchaseResult.Cancelled
            vm.onBuyPack(host, pack100)
            advanceUntilIdle()
            assertNull(vm.uiState.value.message)
        }

    @Test
    fun `pending and failed verification explain what happens next`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            val p = BillingPurchase("coins_100", BillingProductType.INAPP, "t", BillingPurchaseState.PENDING, false)
            purchaseResult = PurchaseResult.Pending(p)
            vm.onBuyPack(host, pack100)
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.shop_msg_pending), vm.uiState.value.message)

            purchaseResult = PurchaseResult.VerificationFailed(p, AppError.Http(409, "PURCHASE_OWNED_BY_OTHER"))
            vm.onBuyPack(host, pack100)
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.shop_msg_owned_by_other), vm.uiState.value.message)
        }

    @Test
    fun `vip tab from the route and subscription start tracked`() =
        runTest(dispatcher) {
            val vm = viewModel(tab = "vip")
            advanceUntilIdle()
            assertEquals(ShopTab.VIP, vm.uiState.value.tab)
            purchaseResult =
                PurchaseResult.Credited(
                    purchase =
                        BillingPurchase(
                            "vip_month",
                            BillingProductType.SUBS,
                            "t",
                            BillingPurchaseState.PURCHASED,
                            false,
                        ),
                    verification = PurchaseVerification(PurchaseVerificationStatus.SUBSCRIPTION_ACTIVE, null, true),
                    isNew = true,
                )
            vm.onSubscribe(host, monthly)
            advanceUntilIdle()
            assertEquals(UiText.Res(R.string.shop_msg_vip_active), vm.uiState.value.message)
            assertEquals(
                AnalyticsEvent.SubscriptionStart("vip_month", "MONTH", 1500.0, "XOF"),
                analytics.events.single(),
            )
        }

    private fun String.normalizeSpaces() = replace(' ', ' ').replace(' ', ' ')

    private class RecordingAnalytics : AnalyticsTracker {
        val events = mutableListOf<AnalyticsEvent>()

        override fun track(event: AnalyticsEvent) {
            events += event
        }

        override fun setUserId(userId: String?) = Unit
    }

    private class FakeWallet : WalletRepository {
        val state = MutableStateFlow<Wallet?>(null)
        var refreshes = 0
        override val wallet: Flow<Wallet?> = state

        override suspend fun refresh(): AppResult<Wallet> {
            refreshes++
            val w = Wallet(10, 0, 10, false)
            state.value = w
            return AppResult.Success(w)
        }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> = AppResult.Success(LedgerPage(emptyList(), 0, page, pageSize))

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> = AppResult.Success(Unit)
    }

    private class FakeBilling : BillingGateway {
        val products = mutableMapOf<String, BillingProduct>()
        override val isAvailable: Boolean = true
        override val purchaseUpdates: Flow<BillingPurchase> = MutableSharedFlow()
        override val prompt: StateFlow<BillingPrompt?> = MutableStateFlow(null)

        override suspend fun queryProducts(
            skus: List<String>,
            type: BillingProductType,
        ): AppResult<List<BillingProduct>> =
            AppResult.Success(skus.mapNotNull { products[it] }.filter { it.type == type })

        override suspend fun purchase(
            host: BillingUiHost,
            sku: String,
            type: BillingProductType,
        ): BillingOutcome = BillingOutcome.Cancelled

        override suspend fun queryPurchases(type: BillingProductType): AppResult<List<BillingPurchase>> =
            AppResult.Success(emptyList())

        override suspend fun finish(purchase: BillingPurchase): AppResult<Unit> = AppResult.Success(Unit)

        override fun answerPrompt(answer: BillingPromptAnswer) = Unit
    }
}
