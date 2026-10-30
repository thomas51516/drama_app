package com.drama.core.network.api

import com.drama.core.network.dto.AuthUserDto
import com.drama.core.network.dto.DeleteMeResponseDto
import com.drama.core.network.dto.FavoritesResponseDto
import com.drama.core.network.dto.UpdateMeRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** `/me*` endpoints (contract v1.2): profile, deletion and "Ma liste". */
interface UserApi {
    @GET("me")
    suspend fun me(): AuthUserDto

    @PATCH("me")
    suspend fun updateMe(
        @Body body: UpdateMeRequestDto,
    ): AuthUserDto

    @DELETE("me")
    suspend fun deleteMe(): DeleteMeResponseDto

    @GET("me/favorites")
    suspend fun favorites(
        @Query("page") page: Int? = null,
        @Query("pageSize") pageSize: Int? = null,
    ): FavoritesResponseDto

    /** v1.2: idempotent PUT, 204. */
    @PUT("me/favorites/{seriesId}")
    suspend fun addFavorite(
        @Path("seriesId") seriesId: String,
    ): Response<Unit>

    /** v1 stub shape, used as a fallback when PUT is not routed (404/405). */
    @POST("me/favorites/{seriesId}")
    suspend fun addFavoriteLegacy(
        @Path("seriesId") seriesId: String,
    ): Response<Unit>

    @DELETE("me/favorites/{seriesId}")
    suspend fun removeFavorite(
        @Path("seriesId") seriesId: String,
    ): Response<Unit>
}
