package com.drama.domain.model

data class Series(
    val id: String,
    val title: String,
    val synopsis: String,
    val posterUrl: String?,
    val genres: List<String>,
    val episodeCount: Int,
)
