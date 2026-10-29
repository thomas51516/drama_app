package com.drama.domain.model

/** Series summary as listed on the home rows; [synopsis] is empty until the detail endpoint is fetched. */
data class Series(
    val id: String,
    val slug: String,
    val title: String,
    val synopsis: String,
    val posterVerticalUrl: String?,
    val posterHorizontalUrl: String?,
    val genres: List<String>,
    val episodeCount: Int,
    val freeEpisodeCount: Int,
    val coinCostPerEpisode: Int,
    val ageRating: String,
)
