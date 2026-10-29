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
