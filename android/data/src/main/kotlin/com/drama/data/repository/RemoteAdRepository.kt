package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.BuildConfig
import com.drama.core.network.api.AdsApi
import com.drama.core.network.call
import com.drama.core.network.callUnit
import com.drama.core.network.dto.CreateAdSessionRequestDto
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.mapper.toDomain
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdSession
import com.drama.domain.model.AdSessionStatus
import com.drama.domain.model.RewardedAdRequest
import com.drama.domain.repository.AdRepository
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** Ads endpoints over the contract v1.5 (S08-A1-01). The unlock is recorded by the server's SSV callback. */
@Singleton
class RemoteAdRepository
    @Inject
    constructor(
        private val api: AdsApi,
        private val catalogLocal: CatalogLocalDataSource,
        private val errorMapper: ApiErrorMapper,
        private val clock: Clock,
        private val logger: Logger,
    ) : AdRepository {
        override suspend fun eligibility(episodeId: String): AppResult<AdEligibility> =
            errorMapper.call { api.eligibility(episodeId) }.map { it.toDomain() }

        override suspend fun createSession(episodeId: String): AppResult<AdSession> =
            errorMapper.call { api.createSession(CreateAdSessionRequestDto(episodeId)) }.map { it.toDomain() }

        override suspend fun sessionStatus(
            sessionId: String,
            seriesId: String,
            episodeId: String,
        ): AppResult<AdSessionStatus> =
            errorMapper
                .call { api.session(sessionId) }
                .map { it.toDomain() }
                .also { result ->
                    if (result is AppResult.Success && result.value.unlocked) {
                        catalogLocal.markEpisodesUnlocked(seriesId, listOf(episodeId))
                        logger.i(TAG, "ad session $sessionId rewarded: episode=$episodeId unlocked")
                    }
                }

        override suspend fun simulateServerReward(request: RewardedAdRequest): AppResult<Unit> {
            val secret = BuildConfig.AD_SSV_FAKE_SECRET
            if (secret.isEmpty()) {
                return AppResult.Failure(AppError.Unknown(IllegalStateException("AD_SSV_FAKE_SECRET not configured")))
            }
            val params = FakeAdSsv.params(request, clock.nowEpochMs(), UUID.randomUUID().toString())
            val signed = params + FakeAdSsv.signature(params, secret)
            logger.i(TAG, "playing fake SSV callback for session=${request.sessionId}")
            return errorMapper.callUnit { api.fakeReward(signed) }
        }

        private companion object {
            const val TAG = "Ads"
        }
    }
