package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.BillingOutcome
import com.drama.domain.model.BillingProduct
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPrompt
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingPurchase
import com.drama.domain.model.BillingUiHost
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * Port to the store (M-31). `PlayBillingGateway` wraps the Google Play Billing Library, `FakeBillingGateway`
 * simulates it in debug builds (`BuildConfig.FAKE_BILLING`). Purchases are consumed / acknowledged only through
 * [finish], which the use cases call after the backend credited the account (spec §10).
 */
interface BillingGateway {
    /** True when purchases can be made at all (store app present, connection possible). */
    val isAvailable: Boolean

    /** Store prices for the skus of `GET /shop`; unknown skus are simply absent. */
    suspend fun queryProducts(
        skus: List<String>,
        type: BillingProductType,
    ): AppResult<List<BillingProduct>>

    /** Opens the store purchase UI for [sku] and waits for its end. */
    suspend fun purchase(
        host: BillingUiHost,
        sku: String,
        type: BillingProductType,
    ): BillingOutcome

    /** Purchases the store still holds for this account (not yet consumed / acknowledged, or pending). */
    suspend fun queryPurchases(type: BillingProductType): AppResult<List<BillingPurchase>>

    /** Consumes a coin pack or acknowledges a subscription once the backend credited it. */
    suspend fun finish(purchase: BillingPurchase): AppResult<Unit>

    /** Purchases completed outside a [purchase] call (pending payment settled, other device); verify and finish them. */
    val purchaseUpdates: Flow<BillingPurchase>

    /** Pending question of the simulated store (null for the real store); answered with [answerPrompt]. */
    val prompt: StateFlow<BillingPrompt?>

    fun answerPrompt(answer: BillingPromptAnswer)
}
