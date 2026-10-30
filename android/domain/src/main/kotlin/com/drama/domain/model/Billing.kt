package com.drama.domain.model

/** Play product type as the store and the backend name it. */
enum class BillingProductType(
    val wireName: String,
) {
    INAPP("inapp"),
    SUBS("subs"),
}

/** What the store knows about a sku: the price it will charge, formatted by the store in the viewer's currency. */
data class BillingProduct(
    val sku: String,
    val type: BillingProductType,
    val formattedPrice: String,
    val priceMicros: Long,
    val currency: String,
)

enum class BillingPurchaseState {
    PURCHASED,
    PENDING,
}

/** A store purchase; [token] is what the backend verifies (`POST /billing/google/verify`). */
data class BillingPurchase(
    val sku: String,
    val type: BillingProductType,
    val token: String,
    val state: BillingPurchaseState,
    val acknowledged: Boolean,
)

/** End of a purchase flow started by [BillingGateway.purchase]. */
sealed interface BillingOutcome {
    data class Purchased(
        val purchase: BillingPurchase,
    ) : BillingOutcome

    /** Deferred payment (cash, bank transfer): the store will complete it later, see [BillingGateway.queryPurchases]. */
    data class Pending(
        val purchase: BillingPurchase,
    ) : BillingOutcome

    data object Cancelled : BillingOutcome

    /** The store already holds an unconsumed purchase of this sku; a restore will credit it. */
    data object AlreadyOwned : BillingOutcome

    data class Unavailable(
        val reason: String?,
    ) : BillingOutcome

    data class Failed(
        val code: Int,
        val message: String?,
    ) : BillingOutcome
}

/** Marker for the screen hosting the store's purchase UI (an Activity on Android); opaque to the domain. */
interface BillingUiHost

/** A question the (fake) store asks the viewer before finishing a purchase; the real store never asks any. */
data class BillingPrompt(
    val sku: String,
    val type: BillingProductType,
)

enum class BillingPromptAnswer {
    SUCCESS,
    PENDING,
    CANCEL,
}

/** `POST /billing/google/verify` answer. */
enum class PurchaseVerificationStatus {
    CREDITED,
    ALREADY_PROCESSED,
    SUBSCRIPTION_ACTIVE,
    ;

    companion object {
        fun from(raw: String?): PurchaseVerificationStatus? =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) }
    }
}

data class PurchaseVerification(
    val status: PurchaseVerificationStatus,
    val wallet: Wallet?,
    val vipActive: Boolean?,
)
