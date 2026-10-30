package com.drama.core.network.locale

import com.drama.core.common.locale.DeviceLocaleProvider
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** DEF-007: `Accept-Language` follows the app language at the time of each request, not at client creation. */
class LocaleHeadersInterceptorTest {
    private val server = MockWebServer()
    private val locale = MutableLocale(language = "fr", country = "CI")
    private lateinit var client: OkHttpClient

    @Before
    fun setUp() {
        server.start()
        client = OkHttpClient.Builder().addInterceptor(LocaleHeadersInterceptor(locale)).build()
    }

    @After
    fun tearDown() = server.close()

    private fun request(): Pair<String?, String?> {
        server.enqueue(MockResponse(code = 200))
        client.newCall(Request.Builder().url(server.url("/home")).build()).execute().close()
        val recorded = server.takeRequest()
        return recorded.headers["Accept-Language"] to recorded.headers["X-Country"]
    }

    @Test
    fun `header follows an in-app language change between two requests`() {
        assertEquals("fr-CI, fr;q=0.9" to "CI", request())

        locale.language = "en"
        assertEquals("en-CI, en;q=0.9" to "CI", request())

        locale.language = "pt"
        locale.country = null
        assertEquals("pt" to null, request())
    }

    @Test
    fun `an explicit header set by the caller is kept`() {
        server.enqueue(MockResponse(code = 200))
        client
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/help/faq"))
                    .header("Accept-Language", "es")
                    .build(),
            ).execute()
            .close()
        val recorded = server.takeRequest()
        assertEquals("es", recorded.headers["Accept-Language"])
        assertNull(recorded.headers["Accept-Language"]?.takeIf { it.contains("fr") })
    }

    private class MutableLocale(
        override var language: String,
        override var country: String?,
    ) : DeviceLocaleProvider {
        override val languageTag: String get() = country?.let { "$language-$it" } ?: language
    }
}
