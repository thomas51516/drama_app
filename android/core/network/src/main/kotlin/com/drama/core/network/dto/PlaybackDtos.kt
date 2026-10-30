package com.drama.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class PlayDrmDto(
    /** `none` | `aes-128` | `widevine`. */
    val type: String = "none",
    val licenseUrl: String? = null,
)

/** `{language, label, url}` (addendum v1.1); [label] was absent in v1.0 and then defaults to the language. */
@Serializable
data class PlaySubtitleDto(
    val language: String,
    val url: String,
    val label: String? = null,
)

@Serializable
data class PlaySessionDto(
    val episodeId: String,
    val seriesId: String,
    val episodeNumber: Int,
    val access: String,
    val manifestUrl: String,
    /** ISO-8601 expiry of [manifestUrl]. */
    val expiresAt: String,
    val drm: PlayDrmDto = PlayDrmDto(),
    val subtitles: List<PlaySubtitleDto> = emptyList(),
    val resumePositionSeconds: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val nextEpisodeId: String? = null,
    /** v1.4: true when this call auto-unlocked the episode (M-21). */
    val unlocked: Boolean = false,
)

@Serializable
data class UpdateProgressDto(
    val episodeId: String,
    /** Whole seconds: the backend validates an integer in 0..86400. */
    val positionSeconds: Int,
    val completed: Boolean = false,
)

@Serializable
data class WatchProgressDto(
    val episodeId: String,
    val positionSeconds: Double,
    val completed: Boolean,
    val updatedAt: String,
)
