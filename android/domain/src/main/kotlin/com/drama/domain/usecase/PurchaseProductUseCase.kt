package com.drama.domain.usecase

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.domain.model.BillingOutcome
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPurchase
import com.drama.domain.model.BillingPurchaseState
import com.drama.domain.model.BillingUiHost
import com.drama.domain.model.PurchaseVerification
import com.drama.domain.model.PurchaseVerificationStatus
import com.drama.domain.repository.BillingGateway
import com.drama.domain.repository.ShopRepository
import java.nio.charset.StandardCharsets
import java.util.UUID

/** Result of a purchase attempt as the shop screen sees it. */
sealed interface PurchaseResult {
    /** The backend credited the account (or had already done so). */
    data class Credited(
        val purchase: BillingPurchase,
        val verification: PurchaseVerification,
        /** False for `already_processed`: nothing new to announce. */
        val isNew: Boolean,
    ) : PurchaseResult

    /** Deferred payment: coins arrive once the store confirms, through a restore or the update listener. */
    data class Pending(
        val purchase: BillingPurchase,
    ) : PurchaseResult

    data object Cancelled : PurchaseResult

    data object AlreadyOwned : PurchaseResult

    data class StoreError(
        val code: Int?,
        val message: String?,
    ) : PurchaseResult

    /** The store charged but the backend refused or could not be reached: nothing is consumed, a restore retries. */
    data class VerificationFailed(
        val purchase: BillingPurchase,
        val error: AppError,
    ) : PurchaseResult
}

/** Store purchase then backend verification (M-31); consumption happens only after a successful verification. */
fun interface PurchaseProductUseCase {
    suspend operator fun invoke(
        host: BillingUiHost,
        sku: String,
        type: BillingProductType,
    ): PurchaseResult
}

/** Verifies every purchase the store still holds (M-31 "restauration des achats"); returns the credited ones. */
fun interface RestorePurchasesUseCase {
    suspend operator fun invoke(): AppResult<List<PurchaseResult.Credited>>
}

/** Verifies one purchase with the backend and finishes it on the store side when the server credited it. */
class VerifyPurchase(
    private val billing: BillingGateway,
    private val shop: ShopRepository,
) {
    suspend operator fun invoke(purchase: BillingPurchase): PurchaseResult {
        if (purchase.state == BillingPurchaseState.PENDING) return PurchaseResult.Pending(purchase)
        return when (
            val verified =
                shop.verifyPurchase(
                    purchaseToken = purchase.token,
                    productId = purchase.sku,
                    type = purchase.type,
                    idempotencyKey = idempotencyKeyFor(purchase.token),
                )
        ) {
            is AppResult.Failure -> PurchaseResult.VerificationFailed(purchase, verified.error)
            is AppResult.Success -> {
                // Consume / acknowledge only now: an unfinished purchase is refunded by Google after 3 days, which is
                // the right outcome when the backend never credited it.
                billing.finish(purchase)
                PurchaseResult.Credited(
                    purchase = purchase,
                    verification = verified.value,
                    isNew = verified.value.status != PurchaseVerificationStatus.ALREADY_PROCESSED,
                )
            }
        }
    }

    companion object {
        /** Deterministic per token: a retry of the same purchase always carries the same key, without persistence. */
        fun idempotencyKeyFor(purchaseToken: String): String =
            UUID.nameUUIDFromBytes(purchaseToken.toByteArray(StandardCharsets.UTF_8)).toString()
    }
}

class DefaultPurchaseProductUseCase(
    private val billing: BillingGateway,
    private val verify: VerifyPurchase,
) : PurchaseProductUseCase {
    override suspend fun invoke(
        host: BillingUiHost,
        sku: String,
        type: BillingProductType,
    ): PurchaseResult =
        when (val outcome = billing.purchase(host, sku, type)) {
            is BillingOutcome.Purchased -> verify(outcome.purchase)
            is BillingOutcome.Pending -> PurchaseResult.Pending(outcome.purchase)
            BillingOutcome.Cancelled -> PurchaseResult.Cancelled
            BillingOutcome.AlreadyOwned -> PurchaseResult.AlreadyOwned
            is BillingOutcome.Unavailable -> PurchaseResult.StoreError(null, outcome.reason)
            is BillingOutcome.Failed -> PurchaseResult.StoreError(outcome.code, outcome.message)
        }
}

class DefaultRestorePurchasesUseCase(
    private val billing: BillingGateway,
    private val verify: VerifyPurchase,
) : RestorePurchasesUseCase {
    override suspend fun invoke(): AppResult<List<PurchaseResult.Credited>> {
        val credited = mutableListOf<PurchaseResult.Credited>()
        var firstError: AppError? = null
        for (type in BillingProductType.entries) {
            when (val held = billing.queryPurchases(type)) {
                is AppResult.Failure -> firstError = firstError ?: held.error
                is AppResult.Success ->
                    held.value
                        .filter { it.state == BillingPurchaseState.PURCHASED }
                        .forEach { purchase ->
                            when (val result = verify(purchase)) {
                                is PurchaseResult.Credited -> credited += result
                                is PurchaseResult.VerificationFailed -> firstError = firstError ?: result.error
                                else -> Unit
                            }
                        }
            }
        }
        val error = firstError
        return if (credited.isEmpty() && error != null) AppResult.Failure(error) else AppResult.Success(credited)
    }
}
