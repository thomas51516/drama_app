package com.drama.core.network.dto

import kotlinx.serialization.Serializable

/** `GET /rankings?period&genre` (contract v1.5, M-04). */
@Serializable
data class RankingItemDto(
    val rank: Int = 0,
    val series: SeriesSummaryDto,
    val viewers: Int? = null,
)

@Serializable
data class RankingsDto(
    val period: String = "day",
    val genre: String? = null,
    val items: List<RankingItemDto> = emptyList(),
)

/** `GET /genres?lang` (DEF-012). */
@Serializable
data class GenreDto(
    val key: String,
    val label: String = "",
)

@Serializable
data class GenresDto(
    val items: List<GenreDto> = emptyList(),
)
