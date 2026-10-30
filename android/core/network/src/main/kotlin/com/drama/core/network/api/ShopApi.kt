package com.drama.core.network.api

import com.drama.core.network.dto.ShopDto
import com.drama.core.network.dto.SubscriptionDto
import com.drama.core.network.dto.VerifyPurchaseRequestDto
import com.drama.core.network.dto.VerifyPurchaseResponseDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Shop and Google Play verification (contract v1.4, M-30 / M-31 / M-33). */
interface ShopApi {
    /** Prices follow `X-Country` (set by `LocaleHeadersInterceptor`), USD fallback. */
    @GET("shop")
    suspend fun shop(): ShopDto

    /** 400 `PURCHASE_INVALID`, 409 `PURCHASE_OWNED_BY_OTHER`. */
    @POST("billing/google/verify")
    suspend fun verify(
        @Body body: VerifyPurchaseRequestDto,
    ): VerifyPurchaseResponseDto

    @GET("me/subscription")
    suspend fun subscription(): SubscriptionDto
}
