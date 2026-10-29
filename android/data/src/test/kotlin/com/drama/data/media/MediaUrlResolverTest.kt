package com.drama.data.media

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MediaUrlResolverTest {
    private val debug = MediaUrlResolver("http://10.0.2.2:9000/drama-media", rewriteLoopback = true)
    private val release = MediaUrlResolver("https://cdn.drama.example", rewriteLoopback = false)

    @Test
    fun `loopback origins are rewritten to the media base in debug`() {
        assertEquals(
            "http://10.0.2.2:9000/drama-media/hls/samples/ep1/master.m3u8",
            debug.resolve("http://localhost:9000/drama-media/hls/samples/ep1/master.m3u8"),
        )
        assertEquals("http://10.0.2.2:9000/x.jpg", debug.resolve("http://127.0.0.1:9000/x.jpg"))
    }

    @Test
    fun `other hosts are untouched`() {
        assertEquals("https://placehold.co/1080x1920", debug.resolve("https://placehold.co/1080x1920"))
        assertNull(debug.resolve(null))
    }

    @Test
    fun `release never rewrites`() {
        assertEquals("http://localhost:9000/a.m3u8", release.resolve("http://localhost:9000/a.m3u8"))
    }
}
