package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.ShopApi
import com.drama.core.network.call
import com.drama.core.network.dto.VerifyPurchaseRequestDto
import com.drama.data.mapper.toDomain
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.PurchaseVerification
import com.drama.domain.model.ShopCatalog
import com.drama.domain.model.Subscription
import com.drama.domain.repository.ShopRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Shop and purchase verification over the contract v1.4 (S07-A2-02, S07-A2-03). */
@Singleton
class DefaultShopRepository
    @Inject
    constructor(
        private val api: ShopApi,
        private val walletStore: WalletStore,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : ShopRepository {
        override suspend fun getShop(): AppResult<ShopCatalog> = errorMapper.call { api.shop() }.map { it.toDomain() }

        override suspend fun verifyPurchase(
            purchaseToken: String,
            productId: String,
            type: BillingProductType,
            idempotencyKey: String,
        ): AppResult<PurchaseVerification> =
            errorMapper
                .call {
                    api.verify(
                        VerifyPurchaseRequestDto(
                            purchaseToken = purchaseToken,
                            productId = productId,
                            type = type.wireName,
                            idempotencyKey = idempotencyKey,
                        ),
                    )
                }.map { it.toDomain() }
                .also { result ->
                    when (result) {
                        is AppResult.Success -> {
                            result.value.wallet?.let(walletStore::publish)
                            logger.i(TAG, "purchase verified product=$productId status=${result.value.status}")
                        }
                        is AppResult.Failure ->
                            logger.w(
                                TAG,
                                "purchase verification failed product=$productId: ${result.error}",
                            )
                    }
                }

        override suspend fun getSubscription(): AppResult<Subscription> =
            errorMapper.call { api.subscription() }.map { it.toDomain() }

        private companion object {
            const val TAG = "Shop"
        }
    }
