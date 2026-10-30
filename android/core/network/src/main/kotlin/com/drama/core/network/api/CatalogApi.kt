package com.drama.core.network.api

import com.drama.core.network.dto.EpisodeSummaryDto
import com.drama.core.network.dto.FeedResponseDto
import com.drama.core.network.dto.HomeResponseDto
import com.drama.core.network.dto.LikeResponseDto
import com.drama.core.network.dto.PaginatedSeriesDto
import com.drama.core.network.dto.SeriesDetailDto
import com.drama.core.network.dto.SuggestResponseDto
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Public catalogue (OpenAPI v0.1). A bearer, when present, personalises `access` and the continue-watching row. */
interface CatalogApi {
    @GET("home")
    suspend fun home(): HomeResponseDto

    @GET("series")
    suspend fun series(
        @Query("genre") genre: String? = null,
        @Query("page") page: Int? = null,
        @Query("pageSize") pageSize: Int? = null,
    ): PaginatedSeriesDto

    @GET("series/{id}")
    suspend fun seriesDetail(
        @Path("id") seriesId: String,
    ): SeriesDetailDto

    @GET("series/{id}/episodes")
    suspend fun episodes(
        @Path("id") seriesId: String,
    ): List<EpisodeSummaryDto>

    @GET("feed")
    suspend fun feed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): FeedResponseDto

    /** Full-text search (v1.2): `q` is 2..100 chars. */
    @GET("search")
    suspend fun search(
        @Query("q") query: String,
        @Query("genre") genre: String? = null,
        @Query("page") page: Int? = null,
        @Query("pageSize") pageSize: Int? = null,
    ): PaginatedSeriesDto

    @GET("search/suggest")
    suspend fun suggest(
        @Query("q") query: String,
    ): SuggestResponseDto

    @POST("series/{id}/like")
    suspend fun like(
        @Path("id") seriesId: String,
    ): LikeResponseDto

    @DELETE("series/{id}/like")
    suspend fun unlike(
        @Path("id") seriesId: String,
    ): LikeResponseDto
}
