package com.drama.domain.model

/** Playback preferences persisted on the device (M-13 speed and quality, M-14 subtitles). */
data class PlayerSettings(
    val speed: Float = DEFAULT_SPEED,
    val quality: VideoQuality = VideoQuality.AUTO,
    val subtitles: SubtitleMode = SubtitleMode.Auto,
) {
    companion object {
        const val DEFAULT_SPEED = 1f
        val SPEEDS: List<Float> = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)
    }
}

/** Manual quality cap applied through the track selector; [AUTO] lets ABR pick the variant. */
enum class VideoQuality(
    /** Maximum video height in pixels; 0 means no constraint. */
    val maxHeight: Int,
) {
    AUTO(0),
    P1080(1080),
    P720(720),
    P540(540),
    P360(360),
    ;

    companion object {
        fun fromMaxHeight(maxHeight: Int): VideoQuality = entries.firstOrNull { it.maxHeight == maxHeight } ?: AUTO
    }
}

/** Subtitle preference. [Auto] means "the device language when the episode offers it, otherwise off". */
sealed interface SubtitleMode {
    data object Auto : SubtitleMode

    data object Off : SubtitleMode

    data class Language(
        val code: String,
    ) : SubtitleMode

    companion object {
        const val AUTO = "auto"
        const val OFF = "off"

        fun parse(raw: String?): SubtitleMode =
            when {
                raw.isNullOrBlank() || raw == AUTO -> Auto
                raw == OFF -> Off
                else -> Language(raw)
            }

        fun serialize(mode: SubtitleMode): String =
            when (mode) {
                Auto -> AUTO
                Off -> OFF
                is Language -> mode.code
            }
    }
}
