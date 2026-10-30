package com.drama.core.billing

import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.consumePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.domain.model.BillingOutcome
import com.drama.domain.model.BillingProduct
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPrompt
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingPurchase
import com.drama.domain.model.BillingPurchaseState
import com.drama.domain.model.BillingUiHost
import com.drama.domain.repository.BillingGateway
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Google Play Billing Library wrapper (S07-A2-01, spec §10). Connection is lazy and single-flight; product
 * details are cached per sku so the purchase flow does not query again. The purchase sheet result arrives
 * through [PurchasesUpdatedListener]: the matching [purchase] call is completed, anything else (pending payment
 * settled later, purchase made on another device) is published on [purchaseUpdates]. Consumption / acknowledgement
 * only happens in [finish], after the backend verified and credited the token.
 */
@Singleton
class PlayBillingGateway
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val logger: Logger,
    ) : BillingGateway {
        private val connectMutex = Mutex()

        /** Guards [details] and [awaiting]: touched from coroutines and from the main-thread listener. */
        private val lock = Any()
        private val details = mutableMapOf<String, ProductDetails>()
        private val awaiting = mutableMapOf<String, CompletableDeferred<BillingOutcome>>()
        private val updates = MutableSharedFlow<BillingPurchase>(extraBufferCapacity = 8)

        private val client: BillingClient by lazy {
            BillingClient
                .newBuilder(context)
                .setListener { result, purchases -> onPurchasesUpdated(result, purchases) }
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build()
        }

        override val isAvailable: Boolean = true
        override val prompt: StateFlow<BillingPrompt?> = MutableStateFlow<BillingPrompt?>(null).asStateFlow()
        override val purchaseUpdates: Flow<BillingPurchase> = updates

        override fun answerPrompt(answer: BillingPromptAnswer) = Unit

        override suspend fun queryProducts(
            skus: List<String>,
            type: BillingProductType,
        ): AppResult<List<BillingProduct>> {
            if (skus.isEmpty()) return AppResult.Success(emptyList())
            connect()?.let { return AppResult.Failure(it) }
            val params =
                QueryProductDetailsParams
                    .newBuilder()
                    .setProductList(
                        skus.map { sku ->
                            QueryProductDetailsParams.Product
                                .newBuilder()
                                .setProductId(sku)
                                .setProductType(type.storeType)
                                .build()
                        },
                    ).build()
            val result = withContext(Dispatchers.IO) { client.queryProductDetails(params) }
            if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                logger.w(TAG, "queryProductDetails failed: ${result.billingResult.describe()}")
                return AppResult.Failure(result.billingResult.toError())
            }
            val list = result.productDetailsList.orEmpty()
            synchronized(lock) { list.forEach { details[it.productId] = it } }
            return AppResult.Success(list.mapNotNull { it.toProduct(type) })
        }

        override suspend fun purchase(
            host: BillingUiHost,
            sku: String,
            type: BillingProductType,
        ): BillingOutcome {
            val activity =
                (host as? ActivityBillingHost)?.activity
                    ?: return BillingOutcome.Unavailable("no activity to host the purchase sheet")
            connect()?.let { return BillingOutcome.Unavailable(it.toString()) }
            val product =
                synchronized(lock) { details[sku] } ?: run {
                    queryProducts(listOf(sku), type)
                    synchronized(lock) { details[sku] }
                } ?: return BillingOutcome.Unavailable("product $sku unknown to the store")
            val offerToken = product.subscriptionOfferDetails?.firstOrNull()?.offerToken
            val productParams =
                BillingFlowParams.ProductDetailsParams
                    .newBuilder()
                    .setProductDetails(product)
                    .apply { if (offerToken != null) setOfferToken(offerToken) }
                    .build()
            val params = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(productParams)).build()
            val deferred = CompletableDeferred<BillingOutcome>()
            synchronized(lock) {
                if (awaiting.containsKey(sku)) return BillingOutcome.Failed(-1, "purchase already in progress")
                awaiting[sku] = deferred
            }
            val launch = withContext(Dispatchers.Main) { client.launchBillingFlow(activity, params) }
            if (launch.responseCode != BillingClient.BillingResponseCode.OK) {
                synchronized(lock) { awaiting.remove(sku) }
                logger.w(TAG, "launchBillingFlow failed: ${launch.describe()}")
                return launch.toOutcome()
            }
            return try {
                deferred.await()
            } finally {
                synchronized(lock) { awaiting.remove(sku) }
            }
        }

        override suspend fun queryPurchases(type: BillingProductType): AppResult<List<BillingPurchase>> {
            connect()?.let { return AppResult.Failure(it) }
            val params = QueryPurchasesParams.newBuilder().setProductType(type.storeType).build()
            val result = withContext(Dispatchers.IO) { client.queryPurchasesAsync(params) }
            if (result.billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
                return AppResult.Failure(result.billingResult.toError())
            }
            return AppResult.Success(result.purchasesList.flatMap { it.toPurchases(type) })
        }

        override suspend fun finish(purchase: BillingPurchase): AppResult<Unit> {
            connect()?.let { return AppResult.Failure(it) }
            val result =
                withContext(Dispatchers.IO) {
                    when (purchase.type) {
                        BillingProductType.INAPP ->
                            client
                                .consumePurchase(ConsumeParams.newBuilder().setPurchaseToken(purchase.token).build())
                                .billingResult
                        BillingProductType.SUBS ->
                            if (purchase.acknowledged) {
                                null
                            } else {
                                client.acknowledgePurchase(
                                    AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.token).build(),
                                )
                            }
                    }
                }
            if (result != null && result.responseCode != BillingClient.BillingResponseCode.OK) {
                logger.w(TAG, "finish failed sku=${purchase.sku}: ${result.describe()}")
                return AppResult.Failure(result.toError())
            }
            logger.i(TAG, "purchase finished sku=${purchase.sku} type=${purchase.type.wireName}")
            return AppResult.Success(Unit)
        }

        /** Null when connected, the error otherwise. */
        private suspend fun connect(): AppError? =
            connectMutex.withLock {
                if (client.isReady) return null
                val result =
                    suspendCancellableCoroutine { continuation ->
                        client.startConnection(
                            object : BillingClientStateListener {
                                override fun onBillingSetupFinished(billingResult: BillingResult) {
                                    if (continuation.isActive) continuation.resume(billingResult)
                                }

                                override fun onBillingServiceDisconnected() {
                                    logger.w(TAG, "billing service disconnected; reconnect on next call")
                                }
                            },
                        )
                    }
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    logger.i(TAG, "billing client connected")
                    null
                } else {
                    logger.w(TAG, "billing setup failed: ${result.describe()}")
                    result.toError()
                }
            }

        private fun onPurchasesUpdated(
            result: BillingResult,
            purchases: List<Purchase>?,
        ) {
            val code = result.responseCode
            val list = purchases.orEmpty()
            if (code != BillingClient.BillingResponseCode.OK) {
                val outcome = result.toOutcome()
                synchronized(lock) { awaiting.values.toList() }.forEach { it.complete(outcome) }
                return
            }
            list.forEach { purchase ->
                purchase.toPurchases(null).forEach { converted ->
                    val deferred = synchronized(lock) { awaiting[converted.sku] }
                    val outcome =
                        if (converted.state == BillingPurchaseState.PENDING) {
                            BillingOutcome.Pending(converted)
                        } else {
                            BillingOutcome.Purchased(converted)
                        }
                    if (deferred != null && !deferred.isCompleted) {
                        deferred.complete(outcome)
                    } else {
                        logger.i(TAG, "purchase update outside a flow sku=${converted.sku} state=${converted.state}")
                        updates.tryEmit(converted)
                    }
                }
            }
        }

        /** One [BillingPurchase] per product of the store purchase (multi-item carts are not used, but tolerated). */
        private fun Purchase.toPurchases(type: BillingProductType?): List<BillingPurchase> =
            products.map { productId ->
                BillingPurchase(
                    sku = productId,
                    type = type ?: knownType(productId),
                    token = purchaseToken,
                    state =
                        if (purchaseState == Purchase.PurchaseState.PENDING) {
                            BillingPurchaseState.PENDING
                        } else {
                            BillingPurchaseState.PURCHASED
                        },
                    acknowledged = isAcknowledged,
                )
            }

        private fun knownType(productId: String): BillingProductType =
            if (synchronized(lock) { details[productId]?.productType } == BillingClient.ProductType.SUBS) {
                BillingProductType.SUBS
            } else {
                BillingProductType.INAPP
            }

        private fun ProductDetails.toProduct(type: BillingProductType): BillingProduct? {
            val oneTime = oneTimePurchaseOfferDetails
            if (oneTime != null) {
                return BillingProduct(
                    sku = productId,
                    type = type,
                    formattedPrice = oneTime.formattedPrice,
                    priceMicros = oneTime.priceAmountMicros,
                    currency = oneTime.priceCurrencyCode,
                )
            }
            // Subscriptions: the recurring phase is the last one (trial / intro phases come first).
            val phase =
                subscriptionOfferDetails
                    ?.firstOrNull()
                    ?.pricingPhases
                    ?.pricingPhaseList
                    ?.lastOrNull() ?: return null
            return BillingProduct(
                sku = productId,
                type = type,
                formattedPrice = phase.formattedPrice,
                priceMicros = phase.priceAmountMicros,
                currency = phase.priceCurrencyCode,
            )
        }

        private val BillingProductType.storeType: String
            get() =
                when (this) {
                    BillingProductType.INAPP -> BillingClient.ProductType.INAPP
                    BillingProductType.SUBS -> BillingClient.ProductType.SUBS
                }

        private fun BillingResult.describe(): String = "code=$responseCode message=$debugMessage"

        private fun BillingResult.toError(): AppError =
            AppError.Http(responseCode, "BILLING_$responseCode", debugMessage)

        private fun BillingResult.toOutcome(): BillingOutcome =
            when (responseCode) {
                BillingClient.BillingResponseCode.USER_CANCELED -> BillingOutcome.Cancelled
                BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> BillingOutcome.AlreadyOwned
                BillingClient.BillingResponseCode.BILLING_UNAVAILABLE,
                BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE,
                BillingClient.BillingResponseCode.SERVICE_DISCONNECTED,
                BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED,
                -> BillingOutcome.Unavailable(debugMessage)
                else -> BillingOutcome.Failed(responseCode, debugMessage)
            }

        private companion object {
            const val TAG = "PlayBilling"
        }
    }
