package com.drama.core.common.analytics

/**
 * Tracking plan (spec §13). Event names and parameter keys are the ones sent to Firebase Analytics;
 * keep them snake_case and under 40 characters.
 */
sealed class AnalyticsEvent(
    val name: String,
    val params: Map<String, Any>,
) {
    data object AppOpen : AnalyticsEvent("app_open", emptyMap())

    data class SeriesView(
        val seriesId: String,
        val source: String,
    ) : AnalyticsEvent("series_view", mapOf("series_id" to seriesId, "source" to source))

    data class EpisodeStart(
        val seriesId: String,
        val episodeId: String,
        val episodeNumber: Int,
        val resumed: Boolean,
    ) : AnalyticsEvent(
            "episode_start",
            mapOf(
                "series_id" to seriesId,
                "episode_id" to episodeId,
                "episode_number" to episodeNumber,
                "resumed" to resumed,
            ),
        )

    data class EpisodeComplete(
        val seriesId: String,
        val episodeId: String,
        val episodeNumber: Int,
    ) : AnalyticsEvent(
            "episode_complete",
            mapOf("series_id" to seriesId, "episode_id" to episodeId, "episode_number" to episodeNumber),
        )

    data class PaywallView(
        val seriesId: String,
        val episodeId: String,
        val episodeNumber: Int,
        val coinCost: Int?,
    ) : AnalyticsEvent(
            "paywall_view",
            buildMap {
                put("series_id", seriesId)
                put("episode_id", episodeId)
                put("episode_number", episodeNumber)
                coinCost?.let { put("coin_cost", it) }
            },
        )

    /** Share sheet opened for a series (M-16). [source] = `series` | `player` | `feed`. */
    data class Share(
        val seriesId: String,
        val source: String,
    ) : AnalyticsEvent("share", mapOf("series_id" to seriesId, "source" to source))

    /** Existing identity signed in (M-51). [provider] = `google` | `phone` | `email`. */
    data class Login(
        val provider: String,
        val linked: Boolean,
    ) : AnalyticsEvent("login", mapOf("provider" to provider, "linked" to linked))

    /** New identity created (M-51). [provider] = `google` | `phone` | `email`. */
    data class Signup(
        val provider: String,
        val linked: Boolean,
    ) : AnalyticsEvent("signup", mapOf("provider" to provider, "linked" to linked))

    data class Search(
        val query: String,
        val resultCount: Int,
    ) : AnalyticsEvent("search", mapOf("query" to query, "result_count" to resultCount))

    /** Push notification tapped (M-54); also sent to `POST /events`. */
    data class PushOpen(
        val notificationId: String?,
        val type: String,
    ) : AnalyticsEvent(
            "push_open",
            buildMap {
                put("type", type)
                notificationId?.let { put("notification_id", it) }
            },
        )

    /** Episode unlocked (M-21). [method] = `coins` | `auto` | `vip` | `free` | `ad`. */
    data class Unlock(
        val seriesId: String,
        val episodeId: String,
        val method: String,
        val coinCost: Int,
    ) : AnalyticsEvent(
            "unlock",
            mapOf("series_id" to seriesId, "episode_id" to episodeId, "method" to method, "coin_cost" to coinCost),
        )

    /** Coin pack credited after server verification (M-31). [amount] is the local price in major units. */
    data class Purchase(
        val productId: String,
        val amount: Double,
        val currency: String,
        val coins: Int,
    ) : AnalyticsEvent(
            "purchase",
            mapOf("product_id" to productId, "amount" to amount, "currency" to currency, "coins" to coins),
        )

    /** VIP subscription started (M-31/M-33). [period] = `WEEK` | `MONTH` | `YEAR`. */
    data class SubscriptionStart(
        val productId: String,
        val period: String,
        val amount: Double,
        val currency: String,
    ) : AnalyticsEvent(
            "subscription_start",
            mapOf("product_id" to productId, "period" to period, "amount" to amount, "currency" to currency),
        )

    /** "Ma liste" heart toggled (M-16). */
    data class Favorite(
        val seriesId: String,
        val added: Boolean,
        val source: String,
    ) : AnalyticsEvent("favorite", mapOf("series_id" to seriesId, "added" to added, "source" to source))
}

/** Implemented by Firebase Analytics when configured, by a Logcat tracker otherwise (S02-A1-04). */
interface AnalyticsTracker {
    fun track(event: AnalyticsEvent)

    /** Correlates events with the guest/user id (hashed server-side id, never a hardware identifier). */
    fun setUserId(userId: String?)
}

object NoOpAnalyticsTracker : AnalyticsTracker {
    override fun track(event: AnalyticsEvent) = Unit

    override fun setUserId(userId: String?) = Unit
}
