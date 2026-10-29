package com.drama.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class SeriesSummaryDto(
    val id: String,
    val slug: String,
    val title: String,
    val genres: List<String> = emptyList(),
    val posterVerticalUrl: String? = null,
    val posterHorizontalUrl: String? = null,
    val episodeCount: Int = 0,
    val freeEpisodeCount: Int = 0,
    val coinCostPerEpisode: Int = 0,
    val ageRating: String = "ALL",
    val publishedAt: String? = null,
)

@Serializable
data class SeriesDetailDto(
    val id: String,
    val slug: String,
    val title: String,
    val genres: List<String> = emptyList(),
    val posterVerticalUrl: String? = null,
    val posterHorizontalUrl: String? = null,
    val episodeCount: Int = 0,
    val freeEpisodeCount: Int = 0,
    val coinCostPerEpisode: Int = 0,
    val ageRating: String = "ALL",
    val publishedAt: String? = null,
    val synopsis: String = "",
    val tags: List<String> = emptyList(),
    val originalLanguage: String? = null,
    val status: String? = null,
)

@Serializable
data class EpisodeSummaryDto(
    val id: String,
    val seriesId: String,
    val number: Int,
    val title: String? = null,
    val durationSeconds: Double = 0.0,
    val thumbnailUrl: String? = null,
    /** `free` | `unlocked` | `locked` for the current viewer. */
    val access: String,
    val coinCost: Int = 0,
    val subtitleLanguages: List<String> = emptyList(),
    /** Addendum v1.1: full tracks `{language,label,url}`; empty until the backend exposes them. */
    val subtitles: List<PlaySubtitleDto> = emptyList(),
    val publishedAt: String? = null,
)

@Serializable
data class HomeItemDto(
    val series: SeriesSummaryDto,
    val episode: EpisodeSummaryDto? = null,
    val positionSeconds: Double? = null,
)

@Serializable
data class HomeRowDto(
    val key: String,
    val title: String,
    /** `MANUAL|TRENDING|NEW|GENRE|CONTINUE_WATCHING` once the configured home lands; inferred from [key] otherwise. */
    val type: String? = null,
    val items: List<HomeItemDto> = emptyList(),
)

/**
 * Banner of `GET /home`. The backend (S04-BE-01) sends the series summary enriched with the banner fields
 * (`bannerId`, `imageUrl`, `bannerTitle`, `bannerSubtitle`); the addendum's canonical shape
 * (`{id, seriesId, imageUrl, title, subtitle}`) and the v1.0 plain summary are accepted too: every field but
 * `id` and `title` is optional and the mapper falls back to the series posters.
 */
@Serializable
data class HomeBannerDto(
    val id: String,
    val title: String,
    val bannerId: String? = null,
    val seriesId: String? = null,
    val imageUrl: String? = null,
    val bannerTitle: String? = null,
    val bannerSubtitle: String? = null,
    val subtitle: String? = null,
    val posterHorizontalUrl: String? = null,
    val posterVerticalUrl: String? = null,
)

@Serializable
data class HomeResponseDto(
    val banners: List<HomeBannerDto> = emptyList(),
    val rows: List<HomeRowDto> = emptyList(),
)

@Serializable
data class PaginatedSeriesDto(
    val items: List<SeriesSummaryDto> = emptyList(),
    val page: Int = 1,
    val pageSize: Int = 0,
    val total: Int = 0,
)

@Serializable
data class FeedItemDto(
    val series: SeriesSummaryDto,
    val episode: EpisodeSummaryDto,
    val previewUrl: String? = null,
)

@Serializable
data class FeedResponseDto(
    val items: List<FeedItemDto> = emptyList(),
    val nextCursor: String? = null,
)
