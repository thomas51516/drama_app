package com.drama.domain.model

/** Where and how an episode is streamed. DRM (Widevine) license info arrives in Sprint 4 with signed playback. */
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
