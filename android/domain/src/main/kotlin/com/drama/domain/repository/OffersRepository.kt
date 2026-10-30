package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.Offers
import com.drama.domain.model.PromoRedemption

/** Welcome / limited offers and promo codes (M-24, contract v1.5). */
interface OffersRepository {
    /** `GET /offers`; a backend without the route answers [Offers.NONE] rather than an error. */
    suspend fun offers(): AppResult<Offers>

    /**
     * `POST /promo/redeem` with a client idempotency key kept per code until the server answered; `404 PROMO_INVALID`
     * and `409 PROMO_ALREADY_USED | PROMO_EXPIRED | PROMO_EXHAUSTED` surface as typed HTTP errors.
     */
    suspend fun redeemPromo(code: String): AppResult<PromoRedemption>
}
