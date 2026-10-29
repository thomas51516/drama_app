package com.drama.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class PlayDrmDto(
    /** `none` | `aes-128` | `widevine`. */
    val type: String = "none",
    val licenseUrl: String? = null,
)

@Serializable
data class PlaySubtitleDto(
    val language: String,
    val url: String,
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
