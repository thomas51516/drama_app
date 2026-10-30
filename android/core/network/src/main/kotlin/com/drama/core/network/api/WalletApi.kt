package com.drama.core.network.api

import com.drama.core.network.dto.LedgerPageDto
import com.drama.core.network.dto.SeriesUnlocksDto
import com.drama.core.network.dto.UnlockRequestDto
import com.drama.core.network.dto.UnlockResponseDto
import com.drama.core.network.dto.WalletDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Wallet and unlocks (contract v1.4, M-21 / M-32). */
interface WalletApi {
    @GET("wallet")
    suspend fun wallet(): WalletDto

    @GET("wallet/transactions")
    suspend fun transactions(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("type") type: String? = null,
    ): LedgerPageDto

    /** 402 `INSUFFICIENT_COINS` (details.cost, details.balance) when the balance is too low. */
    @POST("episodes/{id}/unlock")
    suspend fun unlock(
        @Path("id") episodeId: String,
        @Body body: UnlockRequestDto,
    ): UnlockResponseDto

    @GET("series/{id}/unlocks")
    suspend fun unlocks(
        @Path("id") seriesId: String,
    ): SeriesUnlocksDto
}
