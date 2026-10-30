package com.drama.core.network.api

import com.drama.core.network.dto.GenresDto
import com.drama.core.network.dto.RankingsDto
import retrofit2.http.GET
import retrofit2.http.Query

/** Rankings (M-04) and localised genres (DEF-012), contract v1.5. */
interface RankingsApi {
    @GET("rankings")
    suspend fun rankings(
        @Query("period") period: String,
        @Query("genre") genre: String? = null,
    ): RankingsDto

    @GET("genres")
    suspend fun genres(
        @Query("lang") lang: String,
    ): GenresDto
}
