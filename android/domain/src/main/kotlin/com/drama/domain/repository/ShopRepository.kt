package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.PurchaseVerification
import com.drama.domain.model.ShopCatalog
import com.drama.domain.model.Subscription

/** Shop catalogue, purchase verification and VIP status (M-30, M-31, M-33). */
interface ShopRepository {
    /** `GET /shop`: packs and plans priced for the viewer's country (`X-Country`). */
    suspend fun getShop(): AppResult<ShopCatalog>

    /** `POST /billing/google/verify`; `already_processed` is a success. The wallet flow is updated on credit. */
    suspend fun verifyPurchase(
        purchaseToken: String,
        productId: String,
        type: BillingProductType,
        idempotencyKey: String,
    ): AppResult<PurchaseVerification>

    suspend fun getSubscription(): AppResult<Subscription>
}
