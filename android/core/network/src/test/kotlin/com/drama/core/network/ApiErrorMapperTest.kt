package com.drama.core.network

import com.drama.core.common.result.AppError
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException

class ApiErrorMapperTest {
    private val mapper = ApiErrorMapper(Json { ignoreUnknownKeys = true })

    private fun error(
        status: Int,
        code: String,
        message: String,
    ) = """{"statusCode":$status,"code":"$code","message":"$message","path":"/x","timestamp":"t"}"""

    private fun httpException(
        code: Int,
        body: String,
    ): HttpException = HttpException(Response.error<Any>(code, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `403 EPISODE_LOCKED maps to Locked with coin cost from details`() {
        val body =
            """{"statusCode":403,"code":"EPISODE_LOCKED","message":"This episode must be unlocked first",
               "details":{"episodeId":"ep3","seriesId":"s1","coinCost":10,"freeEpisodeCount":2},
               "path":"/episodes/ep3/play","timestamp":"2026-10-28T19:23:41.361Z","requestId":"r1"}"""
        assertEquals(AppError.Locked("ep3", "s1", 10), mapper.map(httpException(403, body)))
    }

    @Test
    fun `401 maps to Unauthenticated with the server code`() {
        val body = error(401, "INVALID_TOKEN", "Invalid or expired access token")
        assertEquals(AppError.Unauthenticated("INVALID_TOKEN"), mapper.map(httpException(401, body)))
    }

    @Test
    fun `404 maps to NotFound with the server code`() {
        val body = error(404, "SERIES_NOT_FOUND", "Series not found")
        assertEquals(AppError.NotFound("SERIES_NOT_FOUND"), mapper.map(httpException(404, body)))
    }

    @Test
    fun `5xx maps to Server`() {
        val body = error(500, "INTERNAL_ERROR", "Internal server error")
        assertEquals(
            AppError.Server(500, "INTERNAL_ERROR", "Internal server error"),
            mapper.map(httpException(500, body)),
        )
        assertEquals(AppError.Server(503, null, null), mapper.map(httpException(503, "<html>bad gateway</html>")))
    }

    @Test
    fun `other 4xx maps to Http`() {
        val body = error(400, "VALIDATION_ERROR", "Validation failed")
        assertEquals(
            AppError.Http(400, "VALIDATION_ERROR", "Validation failed"),
            mapper.map(httpException(400, body)),
        )
    }

    @Test
    fun `IO failures map to Network`() {
        assertTrue(mapper.map(SocketTimeoutException("timeout")) is AppError.Network)
        assertTrue(mapper.map(IOException("reset")) is AppError.Network)
    }

    @Test
    fun `unparseable bodies still map by status`() {
        assertEquals(AppError.Unauthenticated(null), mapper.map(httpException(401, "")))
        assertTrue(mapper.map(httpException(403, "not json")) is AppError.Http)
    }
}
