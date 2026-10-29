package com.drama.domain.model

/** Where and how an episode is streamed. Widevine license info arrives with signed playback (S04/S10). */
data class PlaybackSource(
    val url: String,
    val format: StreamFormat,
    val drmLicenseUrl: String? = null,
)

enum class StreamFormat {
    HLS,
    DASH,
    PROGRESSIVE,
}
