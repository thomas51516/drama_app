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
    val items: List<HomeItemDto> = emptyList(),
)

@Serializable
data class HomeResponseDto(
    val banners: List<SeriesSummaryDto> = emptyList(),
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
