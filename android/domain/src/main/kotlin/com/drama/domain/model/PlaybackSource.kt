package com.drama.domain.model

/** Where and how an episode is streamed. Widevine license info arrives with signed playback (S04/S10). */
data class PlaybackSource(
    val url: String,
    val format: StreamFormat,
    val drmLicenseUrl: String? = null,
    /** Side-loaded text tracks attached to the media item (M-14). */
    val subtitles: List<Subtitle> = emptyList(),
)

enum class StreamFormat {
    HLS,
    DASH,
    PROGRESSIVE,
}
