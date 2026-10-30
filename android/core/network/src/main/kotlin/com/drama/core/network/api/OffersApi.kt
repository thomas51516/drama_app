package com.drama.core.network.api

import com.drama.core.network.dto.IdempotentRequestDto
import com.drama.core.network.dto.OffersDto
import com.drama.core.network.dto.PromoRedeemRequestDto
import com.drama.core.network.dto.PromoRedeemResponseDto
import com.drama.core.network.dto.UnlockAllQuoteDto
import com.drama.core.network.dto.UnlockAllResponseDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Whole-series unlock, offers and promo codes (contract v1.5, M-23 / M-24). */
interface OffersApi {
    @GET("series/{id}/unlock-all/quote")
    suspend fun unlockAllQuote(
        @Path("id") seriesId: String,
    ): UnlockAllQuoteDto

    /** 402 `INSUFFICIENT_COINS`. */
    @POST("series/{id}/unlock-all")
    suspend fun unlockAll(
        @Path("id") seriesId: String,
        @Body body: IdempotentRequestDto,
    ): UnlockAllResponseDto

    @GET("offers")
    suspend fun offers(): OffersDto

    /** 404 `PROMO_INVALID`, 409 `PROMO_ALREADY_USED | PROMO_EXPIRED | PROMO_EXHAUSTED`. */
    @POST("promo/redeem")
    suspend fun redeemPromo(
        @Body body: PromoRedeemRequestDto,
    ): PromoRedeemResponseDto
}
