package com.drama.core.player.engine

import com.drama.domain.model.Subtitle
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality

/**
 * Pure mapping between the user-facing settings (M-13 quality, M-14 subtitles) and what the track selector
 * needs. Vertical 9:16 renditions are 360x640 .. 1080x1920, so "360p" refers to the short side of the frame:
 * the cap passed to `setMaxVideoSize` is the long side of a 16:9 frame at that quality (360p -> 640 px),
 * which bounds both portrait and landscape renditions the same way.
 */
object TrackSelectionMapper {
    private const val LONG_SIDE_NUMERATOR = 16
    private const val LONG_SIDE_DENOMINATOR = 9

    /** Max width and height passed to the track selector for [quality]; `Int.MAX_VALUE` for AUTO. */
    fun longSideCap(quality: VideoQuality): Int = longSideCap(quality.maxHeight)

    fun longSideCap(shortSide: Int): Int =
        if (shortSide <= 0) Int.MAX_VALUE else shortSide * LONG_SIDE_NUMERATOR / LONG_SIDE_DENOMINATOR

    /** Short side ("p" value) of a rendition. */
    fun shortSide(
        width: Int,
        height: Int,
    ): Int = minOf(width, height)

    /**
     * Quality entries to offer: AUTO plus every quality that has at least one rendition in its band
     * (`(lower quality, this quality]`). With no rendition known yet, every quality is offered.
     */
    fun qualityOptions(availableShortSides: Collection<Int>): List<VideoQuality> {
        if (availableShortSides.isEmpty()) return VideoQuality.entries
        val manual = VideoQuality.entries.filter { it != VideoQuality.AUTO }.sortedBy { it.maxHeight }
        val offered =
            manual.filterIndexed { index, quality ->
                val lower = manual.getOrNull(index - 1)?.maxHeight ?: 0
                availableShortSides.any { it in (lower + 1)..quality.maxHeight }
            }
        return listOf(VideoQuality.AUTO) + offered.sortedByDescending { it.maxHeight }
    }

    /**
     * Subtitle language to enable for the current episode, or null for none:
     * - [SubtitleMode.Off] -> null
     * - [SubtitleMode.Language] -> that language when the episode offers it, otherwise null
     * - [SubtitleMode.Auto] -> the device language when offered, otherwise null
     */
    fun resolveSubtitleLanguage(
        mode: SubtitleMode,
        available: List<Subtitle>,
        deviceLanguage: String,
    ): String? {
        val languages = available.map { it.language.lowercase() }
        return when (mode) {
            SubtitleMode.Off -> null
            is SubtitleMode.Language -> mode.code.lowercase().takeIf { it in languages }
            SubtitleMode.Auto -> deviceLanguage.lowercase().takeIf { it in languages }
        }
    }

    fun speedLabel(speed: Float): String =
        if (speed == speed.toLong().toFloat()) "${speed.toLong()}x" else "${speed.toString().trimEnd('0')}x"

    fun qualityLabel(quality: VideoQuality): String =
        if (quality == VideoQuality.AUTO) "Auto" else "${quality.maxHeight}p"
}
