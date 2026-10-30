package com.drama.feature.wallet

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.billing.di.BillingConfig
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.BillingProduct
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPrompt
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingUiHost
import com.drama.domain.model.CoinPack
import com.drama.domain.model.Price
import com.drama.domain.model.ShopCatalog
import com.drama.domain.model.Subscription
import com.drama.domain.model.VipPlan
import com.drama.domain.model.Wallet
import com.drama.domain.repository.BillingGateway
import com.drama.domain.repository.ShopRepository
import com.drama.domain.repository.WalletRepository
import com.drama.domain.usecase.PurchaseProductUseCase
import com.drama.domain.usecase.PurchaseResult
import com.drama.domain.usecase.RestorePurchasesUseCase
import com.drama.feature.wallet.navigation.ShopRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

enum class ShopTab(
    val key: String,
) {
    COINS("coins"),
    VIP("vip"),
    ;

    companion object {
        fun fromKey(key: String?): ShopTab = entries.firstOrNull { it.key == key } ?: COINS
    }
}

/** Price shown on a product: the store's own string when known (what Google will charge), else the local price. */
sealed interface PriceDisplay {
    data class Store(
        val formatted: String,
    ) : PriceDisplay

    data class Local(
        val price: Price,
    ) : PriceDisplay
}

data class PackUi(
    val pack: CoinPack,
    val price: PriceDisplay,
)

data class PlanUi(
    val plan: VipPlan,
    val price: PriceDisplay,
)

data class ShopUiState(
    val tab: ShopTab = ShopTab.COINS,
    val isLoading: Boolean = true,
    val error: UiText? = null,
    val packs: List<PackUi> = emptyList(),
    val plans: List<PlanUi> = emptyList(),
    val wallet: Wallet? = null,
    val subscription: Subscription? = null,
    /** Coins short for the unlock that brought the viewer here (M-21 402). */
    val missingCoins: Int = 0,
    /** Sku whose purchase is in progress. */
    val purchasingSku: String? = null,
    val isRestoring: Boolean = false,
    val isFakeBilling: Boolean = false,
    /** Question of the simulated store, rendered as a dialog (debug builds). */
    val prompt: BillingPrompt? = null,
    val message: UiText? = null,
) {
    val isBusy: Boolean get() = purchasingSku != null || isRestoring
}

/**
 * Shop (S07-A2-02, S07-A2-03): packs and plans from `GET /shop`, store prices when Google knows the skus,
 * purchase through [PurchaseProductUseCase] (store -> backend verify -> consume), restore on demand.
 */
@HiltViewModel
class ShopViewModel
    @Inject
    constructor(
        savedStateHandle: SavedStateHandle,
        private val shop: ShopRepository,
        private val walletRepository: WalletRepository,
        private val billing: BillingGateway,
        private val purchaseProduct: PurchaseProductUseCase,
        private val restorePurchases: RestorePurchasesUseCase,
        private val analytics: AnalyticsTracker,
        private val logger: Logger,
        billingConfig: BillingConfig,
    ) : ViewModel() {
        private val uiStateFlow =
            MutableStateFlow(
                ShopUiState(
                    tab = ShopTab.fromKey(savedStateHandle[ShopRoute.ARG_TAB]),
                    missingCoins = savedStateHandle[ShopRoute.ARG_MISSING_COINS] ?: 0,
                    isFakeBilling = billingConfig.isFake,
                ),
            )
        val uiState: StateFlow<ShopUiState> = uiStateFlow.asStateFlow()

        private var catalog: ShopCatalog? = null

        init {
            viewModelScope.launch {
                walletRepository.wallet.collect { w ->
                    uiStateFlow.update { it.copy(wallet = w) }
                }
            }
            viewModelScope.launch { billing.prompt.collect { p -> uiStateFlow.update { it.copy(prompt = p) } } }
            viewModelScope.launch {
                // A pending payment settled or a purchase from another device: credit it right away.
                billing.purchaseUpdates.collect { update ->
                    logger.i(TAG, "purchase update sku=${update.sku}: restoring")
                    restore(silent = true)
                }
            }
            viewModelScope.launch { walletRepository.refresh() }
            viewModelScope.launch {
                val sub = shop.getSubscription()
                if (sub is AppResult.Success) uiStateFlow.update { it.copy(subscription = sub.value) }
            }
            load()
        }

        fun onTabSelected(tab: ShopTab) = uiStateFlow.update { it.copy(tab = tab) }

        fun retry() = load()

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        fun onPromptAnswer(answer: BillingPromptAnswer) = billing.answerPrompt(answer)

        /** Buys a coin pack (M-31); the snackbar announces the credited coins once the backend confirmed. */
        fun onBuyPack(
            host: BillingUiHost,
            pack: CoinPack,
        ) = purchase(host, pack.sku, BillingProductType.INAPP) { result ->
            val price = storePrice(pack.sku) ?: pack.price
            analytics.track(
                AnalyticsEvent.Purchase(
                    productId = pack.sku,
                    amount = PriceFormatter.majorAmount(price),
                    currency = price.currency,
                    coins = pack.totalCoins,
                ),
            )
            val credited = result.verification.wallet?.let { it.total - (uiStateFlow.value.wallet?.total ?: 0) }
            UiText.Plural(R.plurals.shop_msg_coins_credited, credited?.takeIf { it > 0 } ?: pack.totalCoins)
        }

        /** Subscribes to a VIP plan (M-31/M-33). */
        fun onSubscribe(
            host: BillingUiHost,
            plan: VipPlan,
        ) = purchase(host, plan.sku, BillingProductType.SUBS) {
            val price = storePrice(plan.sku) ?: plan.price
            analytics.track(
                AnalyticsEvent.SubscriptionStart(
                    productId = plan.sku,
                    period = plan.period.name,
                    amount = PriceFormatter.majorAmount(price),
                    currency = price.currency,
                ),
            )
            viewModelScope.launch {
                val sub = shop.getSubscription()
                if (sub is AppResult.Success) uiStateFlow.update { it.copy(subscription = sub.value) }
            }
            UiText.Res(R.string.shop_msg_vip_active)
        }

        /** "Restaurer les achats" (M-31): verifies what the store still holds. */
        fun onRestorePurchases() = restore(silent = false)

        private fun purchase(
            host: BillingUiHost,
            sku: String,
            type: BillingProductType,
            onCredited: (PurchaseResult.Credited) -> UiText,
        ) {
            if (uiStateFlow.value.isBusy) return
            uiStateFlow.update { it.copy(purchasingSku = sku) }
            viewModelScope.launch {
                val result = purchaseProduct(host, sku, type)
                logger.i(TAG, "purchase sku=$sku -> ${result::class.simpleName}")
                val message =
                    when (result) {
                        is PurchaseResult.Credited -> {
                            walletRepository.refresh()
                            // `already_processed`: the coins were credited earlier, nothing new to announce.
                            if (result.isNew) onCredited(result) else null
                        }
                        is PurchaseResult.Pending -> UiText.Res(R.string.shop_msg_pending)
                        PurchaseResult.Cancelled -> null
                        PurchaseResult.AlreadyOwned -> UiText.Res(R.string.shop_msg_already_owned)
                        is PurchaseResult.StoreError ->
                            result.message?.takeIf { it.isNotBlank() }?.let {
                                UiText.of(
                                    R.string.shop_msg_store_error,
                                    it,
                                )
                            }
                                ?: UiText.Res(R.string.shop_msg_store_unavailable)
                        is PurchaseResult.VerificationFailed -> result.error.toVerificationMessage()
                    }
                uiStateFlow.update {
                    it.copy(
                        purchasingSku = null,
                        message = message,
                        missingCoins = if (result is PurchaseResult.Credited) 0 else it.missingCoins,
                    )
                }
            }
        }

        private fun restore(silent: Boolean) {
            if (uiStateFlow.value.isRestoring) return
            uiStateFlow.update { it.copy(isRestoring = true) }
            viewModelScope.launch {
                val message =
                    when (val result = restorePurchases()) {
                        is AppResult.Success -> {
                            val fresh = result.value.filter { it.isNew }
                            if (fresh.isNotEmpty()) walletRepository.refresh()
                            when {
                                fresh.isNotEmpty() -> UiText.Plural(R.plurals.shop_msg_restored, fresh.size)
                                silent -> null
                                else -> UiText.Res(R.string.shop_msg_nothing_to_restore)
                            }
                        }
                        is AppResult.Failure -> if (silent) null else result.error.toVerificationMessage()
                    }
                uiStateFlow.update { it.copy(isRestoring = false, message = message ?: it.message) }
            }
        }

        private fun load() {
            uiStateFlow.update { it.copy(isLoading = it.packs.isEmpty() && it.plans.isEmpty(), error = null) }
            viewModelScope.launch {
                when (val result = shop.getShop()) {
                    is AppResult.Failure -> {
                        logger.w(TAG, "GET /shop failed: ${result.error}")
                        uiStateFlow.update { it.copy(isLoading = false, error = result.error.toLoadMessage()) }
                    }
                    is AppResult.Success -> {
                        catalog = result.value
                        publish(result.value, storeProducts = emptyMap())
                        val products = queryStorePrices(result.value)
                        if (products.isNotEmpty()) publish(result.value, products)
                    }
                }
            }
        }

        private suspend fun queryStorePrices(catalog: ShopCatalog): Map<String, BillingProduct> {
            if (!billing.isAvailable) return emptyMap()
            val inapp = billing.queryProducts(catalog.coinPacks.map { it.sku }, BillingProductType.INAPP)
            val subs = billing.queryProducts(catalog.vipPlans.map { it.sku }, BillingProductType.SUBS)
            return buildMap {
                (inapp as? AppResult.Success)?.value?.forEach { put(it.sku, it) }
                (subs as? AppResult.Success)?.value?.forEach { put(it.sku, it) }
            }
        }

        private fun publish(
            catalog: ShopCatalog,
            storeProducts: Map<String, BillingProduct>,
        ) {
            uiStateFlow.update {
                it.copy(
                    isLoading = false,
                    error = null,
                    packs =
                        catalog.coinPacks.map { pack ->
                            PackUi(pack, priceDisplay(pack.sku, pack.price, storeProducts))
                        },
                    plans =
                        catalog.vipPlans.map { plan ->
                            PlanUi(plan, priceDisplay(plan.sku, plan.price, storeProducts))
                        },
                )
            }
        }

        private fun storePrice(sku: String): Price? =
            storeProducts[sku]?.let { PriceFormatter.fromMicros(it.currency, it.priceMicros) }

        private val storeProducts = mutableMapOf<String, BillingProduct>()

        private fun priceDisplay(
            sku: String,
            local: Price,
            products: Map<String, BillingProduct>,
        ): PriceDisplay {
            val product = products[sku]
            if (product != null) storeProducts[sku] = product
            return product?.let { PriceDisplay.Store(it.formattedPrice) } ?: PriceDisplay.Local(local)
        }

        private fun AppError.toLoadMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network)
                is AppError.Server -> UiText.of(CoreR.string.error_server, code)
                is AppError.NotFound -> UiText.Res(CoreR.string.state_coming_soon)
                is AppError.Http ->
                    if (code ==
                        HTTP_NOT_IMPLEMENTED
                    ) {
                        UiText.Res(CoreR.string.state_coming_soon)
                    } else {
                        UiText.Res(R.string.shop_error_load)
                    }
                else -> UiText.Res(R.string.shop_error_load)
            }

        private fun AppError.toVerificationMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(R.string.shop_msg_verify_offline)
                is AppError.Http ->
                    when (serverCode) {
                        "PURCHASE_OWNED_BY_OTHER" -> UiText.Res(R.string.shop_msg_owned_by_other)
                        "PURCHASE_INVALID" -> UiText.Res(R.string.shop_msg_purchase_invalid)
                        else -> UiText.Res(R.string.shop_msg_verify_failed)
                    }
                else -> UiText.Res(R.string.shop_msg_verify_failed)
            }

        companion object {
            private const val TAG = "ShopVM"
            private const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
