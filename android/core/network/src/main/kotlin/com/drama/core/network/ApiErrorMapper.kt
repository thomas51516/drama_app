package com.drama.core.network

import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.network.dto.ApiErrorDto
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** Turns Retrofit/OkHttp failures and `ApiErrorDto` bodies into typed [AppError]s. */
@Singleton
class ApiErrorMapper
    @Inject
    constructor(
        private val json: Json,
    ) {
        fun map(throwable: Throwable): AppError =
            when (throwable) {
                is HttpException -> map(throwable.code(), throwable.response()?.errorBody()?.string())
                is IOException -> AppError.Network(throwable)
                is SerializationException -> AppError.Unknown(throwable)
                else -> AppError.Unknown(throwable)
            }

        fun map(
            statusCode: Int,
            body: String?,
        ): AppError {
            val dto = parse(body)
            val code = dto?.code
            val message = dto?.message
            val details = dto?.details
            return when {
                statusCode == HTTP_UNAUTHORIZED -> AppError.Unauthenticated(code)
                statusCode == HTTP_FORBIDDEN && code == CODE_EPISODE_LOCKED ->
                    AppError.Locked(
                        episodeId = details?.get("episodeId")?.stringOrNull(),
                        seriesId = details?.get("seriesId")?.stringOrNull(),
                        coinCost = details?.get("coinCost")?.intOrNullSafe(),
                        balance = details?.get("balance")?.intOrNullSafe(),
                        canAutoUnlock = details?.get("canAutoUnlock")?.booleanOrNullSafe(),
                    )
                statusCode == HTTP_PAYMENT_REQUIRED || code == CODE_INSUFFICIENT_COINS ->
                    AppError.InsufficientCoins(
                        cost = (details?.get("cost") ?: details?.get("coinCost"))?.intOrNullSafe(),
                        balance = details?.get("balance")?.intOrNullSafe(),
                    )
                statusCode == HTTP_NOT_FOUND -> AppError.NotFound(code ?: dto?.path ?: "resource")
                statusCode >= HTTP_SERVER_ERROR -> AppError.Server(statusCode, code, message)
                else -> AppError.Http(statusCode, code, message)
            }
        }

        fun parse(body: String?): ApiErrorDto? {
            if (body.isNullOrBlank()) return null
            return try {
                json.decodeFromString(ApiErrorDto.serializer(), body)
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            }
        }

        private fun kotlinx.serialization.json.JsonElement.stringOrNull(): String? =
            try {
                jsonPrimitive.takeIf { it.isString }?.content
            } catch (_: IllegalArgumentException) {
                null
            }

        private fun kotlinx.serialization.json.JsonElement.intOrNullSafe(): Int? =
            try {
                jsonPrimitive.intOrNull
            } catch (_: IllegalArgumentException) {
                null
            }

        private fun kotlinx.serialization.json.JsonElement.booleanOrNullSafe(): Boolean? =
            try {
                jsonPrimitive.booleanOrNull
            } catch (_: IllegalArgumentException) {
                null
            }

        companion object {
            const val CODE_EPISODE_LOCKED = "EPISODE_LOCKED"
            const val CODE_INSUFFICIENT_COINS = "INSUFFICIENT_COINS"
            private const val HTTP_UNAUTHORIZED = 401
            private const val HTTP_PAYMENT_REQUIRED = 402
            private const val HTTP_FORBIDDEN = 403
            private const val HTTP_NOT_FOUND = 404
            private const val HTTP_SERVER_ERROR = 500
        }
    }

/** Runs a Retrofit call and maps any failure to an [AppResult.Failure]. */
suspend inline fun <T> ApiErrorMapper.call(crossinline block: suspend () -> T): AppResult<T> =
    try {
        AppResult.Success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (
        @Suppress("TooGenericExceptionCaught") e: Exception,
    ) {
        AppResult.Failure(map(e))
    }

/**
 * Runs a Retrofit call returning a [retrofit2.Response] (204-style endpoints) and maps a non-2xx status to the
 * same typed errors as [call]; a successful answer becomes [AppResult.Success] of [Unit].
 */
suspend inline fun ApiErrorMapper.callUnit(crossinline block: suspend () -> retrofit2.Response<*>): AppResult<Unit> =
    try {
        val response = block()
        if (response.isSuccessful) {
            AppResult.Success(Unit)
        } else {
            AppResult.Failure(map(response.code(), response.errorBody()?.string()))
        }
    } catch (e: CancellationException) {
        throw e
    } catch (
        @Suppress("TooGenericExceptionCaught") e: Exception,
    ) {
        AppResult.Failure(map(e))
    }
