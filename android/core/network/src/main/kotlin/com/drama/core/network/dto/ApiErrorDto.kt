package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Error envelope returned by every endpoint (OpenAPI `ApiErrorDto`). [code] is the stable client-facing code. */
@Serializable
data class ApiErrorDto(
    val statusCode: Int,
    val code: String,
    val message: String? = null,
    val details: JsonObject? = null,
    val path: String? = null,
    val timestamp: String? = null,
    val requestId: String? = null,
)
