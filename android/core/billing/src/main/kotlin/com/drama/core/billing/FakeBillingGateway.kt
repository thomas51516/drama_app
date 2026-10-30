package com.drama.core.billing

import com.drama.core.common.logging.Logger
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Simulated store for debug builds and tests (S07-A2-01). A purchase publishes a [BillingPrompt]; the shop screen
 * renders it as a dialog and the answer decides the outcome. Tokens are `fake:<sku>:<uuid>`, which the backend's
 * `BILLING_VERIFIER=fake` accepts. A pending purchase is settled by the next [queryPurchases] (what a restore
 * does), mirroring Google completing a deferred payment. No store price is known: the shop shows the local price.
 */
@Singleton
class FakeBillingGateway
    @Inject
    constructor(
        private val logger: Logger,
    ) : BillingGateway {
        private val mutex = Mutex()
        private val promptFlow = MutableStateFlow<BillingPrompt?>(null)
        private var pendingAnswer: CompletableDeferred<BillingPromptAnswer>? = null

        /** Purchases the "store" still holds: not finished yet (consumed / acknowledged) or pending. */
        private val held = mutableListOf<BillingPurchase>()
        private val updates = MutableSharedFlow<BillingPurchase>(extraBufferCapacity = 8)

        override val isAvailable: Boolean = true
        override val prompt: StateFlow<BillingPrompt?> = promptFlow.asStateFlow()
        override val purchaseUpdates: Flow<BillingPurchase> = updates

        override suspend fun queryProducts(
            skus: List<String>,
            type: BillingProductType,
        ): AppResult<List<BillingProduct>> = AppResult.Success(emptyList())

        override suspend fun purchase(
            host: BillingUiHost,
            sku: String,
            type: BillingProductType,
        ): BillingOutcome {
            val answer =
                mutex.withLock {
                    if (pendingAnswer != null) return BillingOutcome.Failed(code = -1, message = "purchase in progress")
                    if (held.any { it.sku == sku && it.type == type && it.state == BillingPurchaseState.PURCHASED }) {
                        return BillingOutcome.AlreadyOwned
                    }
                    CompletableDeferred<BillingPromptAnswer>().also {
                        pendingAnswer = it
                        promptFlow.value = BillingPrompt(sku, type)
                    }
                }
            val choice =
                try {
                    answer.await()
                } finally {
                    mutex.withLock {
                        pendingAnswer = null
                        promptFlow.value = null
                    }
                }
            logger.i(TAG, "fake purchase sku=$sku type=${type.wireName} answer=$choice")
            return when (choice) {
                BillingPromptAnswer.CANCEL -> BillingOutcome.Cancelled
                BillingPromptAnswer.SUCCESS -> BillingOutcome.Purchased(hold(sku, type, BillingPurchaseState.PURCHASED))
                BillingPromptAnswer.PENDING -> BillingOutcome.Pending(hold(sku, type, BillingPurchaseState.PENDING))
            }
        }

        override fun answerPrompt(answer: BillingPromptAnswer) {
            pendingAnswer?.complete(answer)
        }

        override suspend fun queryPurchases(type: BillingProductType): AppResult<List<BillingPurchase>> =
            mutex.withLock {
                // A deferred payment "settles" when the store is asked again, like Google's pending purchases.
                val settled =
                    held.map { p ->
                        if (p.state ==
                            BillingPurchaseState.PENDING
                        ) {
                            p.copy(state = BillingPurchaseState.PURCHASED)
                        } else {
                            p
                        }
                    }
                held.clear()
                held += settled
                AppResult.Success(settled.filter { it.type == type })
            }

        override suspend fun finish(purchase: BillingPurchase): AppResult<Unit> =
            mutex.withLock {
                when (purchase.type) {
                    BillingProductType.INAPP -> held.removeAll { it.token == purchase.token }
                    BillingProductType.SUBS ->
                        held.replaceAll { if (it.token == purchase.token) it.copy(acknowledged = true) else it }
                }
                logger.i(TAG, "fake purchase finished token=${purchase.token}")
                AppResult.Success(Unit)
            }

        private suspend fun hold(
            sku: String,
            type: BillingProductType,
            state: BillingPurchaseState,
        ): BillingPurchase =
            BillingPurchase(
                sku = sku,
                type = type,
                token = fakeToken(sku),
                state = state,
                acknowledged = false,
            ).also { mutex.withLock { held += it } }

        companion object {
            private const val TAG = "FakeBilling"

            fun fakeToken(sku: String): String = "fake:$sku:${UUID.randomUUID()}"
        }
    }
