package com.drama.core.ads

import android.content.Context
import com.drama.core.common.logging.Logger
import com.drama.domain.model.AdOutcome
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.FakeAdPrompt
import com.drama.domain.model.RewardedAdRequest
import com.drama.domain.repository.AdGateway
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Google Mobile Ads rewarded ad (S08-A1-01, release builds). The ad unit comes from `GET /ads/eligibility`; the
 * session's `customData` and the user id are attached as server-side verification options so AdMob's callback
 * to `GET /ads/reward` identifies the session. Nothing is credited client-side: `onUserEarnedReward` only tells
 * the caller to start polling the session.
 */
@Singleton
class AdMobAdGateway
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val logger: Logger,
    ) : AdGateway {
        @Volatile
        private var initialised = false

        override val isAvailable: Boolean = true
        override val fakeAd: StateFlow<FakeAdPrompt?> = MutableStateFlow(null)

        override fun finishFakeAd(completed: Boolean) = Unit

        override suspend fun showRewardedAd(
            host: AdUiHost,
            request: RewardedAdRequest,
        ): AdOutcome {
            val activity = (host as? ActivityAdHost)?.activity ?: return AdOutcome.Unavailable("no activity")
            return withContext(Dispatchers.Main) {
                ensureInitialised()
                val ad =
                    when (val loaded = load(request.adUnitId)) {
                        is Loaded.Ready -> loaded.ad
                        is Loaded.Failed -> return@withContext loaded.outcome
                    }
                ad.setServerSideVerificationOptions(
                    ServerSideVerificationOptions
                        .Builder()
                        .apply { request.userId?.let(::setUserId) }
                        .setCustomData(request.customData)
                        .build(),
                )
                suspendCancellableCoroutine { continuation ->
                    var rewarded = false
                    ad.fullScreenContentCallback =
                        object : FullScreenContentCallback() {
                            override fun onAdDismissedFullScreenContent() {
                                if (continuation.isActive) {
                                    continuation.resume(if (rewarded) AdOutcome.Rewarded else AdOutcome.Dismissed)
                                }
                            }

                            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                                logger.w(TAG, "rewarded ad failed to show: ${error.code} ${error.message}")
                                if (continuation.isActive) {
                                    continuation.resume(
                                        AdOutcome.Failed(error.code, error.message),
                                    )
                                }
                            }
                        }
                    ad.show(activity) { item ->
                        rewarded = true
                        logger.i(TAG, "reward earned client-side: ${item.amount} ${item.type} (server decides)")
                    }
                }
            }
        }

        private suspend fun ensureInitialised() {
            if (initialised) return
            suspendCancellableCoroutine { continuation ->
                MobileAds.initialize(context) {
                    initialised = true
                    if (continuation.isActive) continuation.resume(Unit)
                }
            }
        }

        private suspend fun load(adUnitId: String): Loaded =
            suspendCancellableCoroutine { continuation ->
                RewardedAd.load(
                    context,
                    adUnitId,
                    AdRequest.Builder().build(),
                    object : RewardedAdLoadCallback() {
                        override fun onAdLoaded(ad: RewardedAd) {
                            if (continuation.isActive) continuation.resume(Loaded.Ready(ad))
                        }

                        override fun onAdFailedToLoad(error: LoadAdError) {
                            logger.w(TAG, "rewarded ad failed to load unit=$adUnitId: ${error.code} ${error.message}")
                            val outcome =
                                if (error.code == AdRequest.ERROR_CODE_NO_FILL) {
                                    AdOutcome.Unavailable(error.message)
                                } else {
                                    AdOutcome.Failed(error.code, error.message)
                                }
                            if (continuation.isActive) continuation.resume(Loaded.Failed(outcome))
                        }
                    },
                )
            }

        private sealed interface Loaded {
            data class Ready(
                val ad: RewardedAd,
            ) : Loaded

            data class Failed(
                val outcome: AdOutcome,
            ) : Loaded
        }

        private companion object {
            const val TAG = "AdMob"
        }
    }
