package com.drama.core.network.retry

import com.drama.core.common.logging.NoOpLogger
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

class RetryInterceptorTest {
    private val server = MockWebServer()
    private val delays = mutableListOf<Long>()
    private lateinit var client: OkHttpClient

    @Before
    fun setUp() {
        server.start()
        client =
            OkHttpClient
                .Builder()
                .retryOnConnectionFailure(false)
                .addInterceptor(
                    RetryInterceptor(NoOpLogger, maxRetries = 2, baseDelayMs = 100, sleep = { delays += it }),
                ).build()
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun disconnect() = MockResponse.Builder().onRequestStart(SocketEffect.CloseSocket()).build()

    @Test
    fun `GET is retried with exponential backoff after connection failures`() {
        server.enqueue(disconnect())
        server.enqueue(disconnect())
        server.enqueue(MockResponse(code = 200, body = "ok"))

        val response = client.newCall(Request.Builder().url(server.url("/home")).build()).execute()

        assertEquals(200, response.code)
        assertEquals(3, server.requestCount)
        assertEquals(listOf(100L, 200L), delays)
    }

    @Test
    fun `GET gives up after the maximum number of retries`() {
        repeat(3) { server.enqueue(disconnect()) }

        var failed = false
        try {
            client.newCall(Request.Builder().url(server.url("/home")).build()).execute()
        } catch (_: IOException) {
            failed = true
        }
        assertTrue(failed)
        assertEquals(3, server.requestCount)
    }

    @Test
    fun `POST is never retried`() {
        server.enqueue(disconnect())
        server.enqueue(MockResponse(code = 200, body = "ok"))

        var failed = false
        try {
            client
                .newCall(
                    Request
                        .Builder()
                        .url(server.url("/progress"))
                        .post("{}".toRequestBody())
                        .build(),
                ).execute()
        } catch (_: IOException) {
            failed = true
        }
        assertTrue(failed)
        assertEquals(1, server.requestCount)
        assertTrue(delays.isEmpty())
    }
}
