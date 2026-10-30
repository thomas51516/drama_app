package com.drama.domain.repository

import com.drama.domain.model.AdOutcome
import com.drama.domain.model.AdUiHost
import com.drama.domain.model.FakeAdPrompt
import com.drama.domain.model.RewardedAdRequest
import kotlinx.coroutines.flow.StateFlow

/**
 * Port to the ad network (M-22). `AdMobAdGateway` wraps the Mobile Ads SDK (rewarded ad with server-side
 * verification options), `FakeAdGateway` simulates a 5-second ad in debug builds (`BuildConfig.FAKE_ADS`) and
 * then plays the SSV callback itself through [AdRepository.simulateServerReward]. The reward is never granted
 * client-side: callers poll the session status after the ad closed.
 */
interface AdGateway {
    /** True when the network can show ads at all (SDK present, initialised or initialisable). */
    val isAvailable: Boolean

    /** Loads and shows one rewarded ad for [request] over [host]; returns when the ad closed. */
    suspend fun showRewardedAd(
        host: AdUiHost,
        request: RewardedAdRequest,
    ): AdOutcome

    /** Simulated ad to render full screen (fake gateway only, null for the real network). */
    val fakeAd: StateFlow<FakeAdPrompt?>

    /** The UI finished rendering the simulated ad: [completed] false when the viewer closed it early. */
    fun finishFakeAd(completed: Boolean)
}
