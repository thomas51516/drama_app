package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.OffersApi
import com.drama.core.network.call
import com.drama.core.network.dto.PromoRedeemRequestDto
import com.drama.data.mapper.toDomain
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.Offers
import com.drama.domain.model.PromoRedemption
import com.drama.domain.repository.OffersRepository
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** `GET /offers`, `POST /promo/redeem` (S10-A1-01, M-24). */
@Singleton
class RemoteOffersRepository
    @Inject
    constructor(
        private val api: OffersApi,
        private val walletStore: WalletStore,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : OffersRepository {
        private val pendingKeys = mutableMapOf<String, String>()

        override suspend fun offers(): AppResult<Offers> =
            when (val result = errorMapper.call { api.offers() }.map { it.toDomain() }) {
                is AppResult.Success -> result
                is AppResult.Failure ->
                    // A backend without the route (or an older contract) simply has no offers to show.
                    if (result.error is AppError.NotFound ||
                        (result.error as? AppError.Http)?.code == HTTP_NOT_IMPLEMENTED
                    ) {
                        AppResult.Success(Offers.NONE)
                    } else {
                        result
                    }
            }

        override suspend fun redeemPromo(code: String): AppResult<PromoRedemption> {
            val normalized = code.trim().uppercase(Locale.ROOT)
            val key = synchronized(pendingKeys) { pendingKeys.getOrPut(normalized) { UUID.randomUUID().toString() } }
            return errorMapper
                .call { api.redeemPromo(PromoRedeemRequestDto(code = normalized, idempotencyKey = key)) }
                .map { it.toDomain() }
                .also { result ->
                    when (result) {
                        is AppResult.Success -> {
                            synchronized(pendingKeys) { pendingKeys.remove(normalized) }
                            result.value.wallet?.let(walletStore::publish)
                            logger.i(TAG, "promo redeemed coins=${result.value.coins}")
                        }
                        is AppResult.Failure -> {
                            if (result.error !is AppError.Network) {
                                synchronized(pendingKeys) { pendingKeys.remove(normalized) }
                            }
                            logger.w(TAG, "promo redeem failed: ${result.error}")
                        }
                    }
                }
        }

        private companion object {
            const val TAG = "Offers"
            const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
