package com.drama.core.network.api

import kotlinx.serialization.Serializable
import retrofit2.http.GET

/** Retrofit contract for the DRAMA backend. Endpoints follow docs/api OpenAPI v0.1 (S01-BE-03). */
interface DramaApi {
    @GET("health")
    suspend fun health(): HealthDto
}

@Serializable
data class HealthDto(
    val status: String,
)
