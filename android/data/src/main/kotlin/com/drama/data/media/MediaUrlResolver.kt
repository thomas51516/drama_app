package com.drama.data.media

import com.drama.core.network.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dev-only fix-up of media URLs. The local backend builds manifest/thumbnail URLs from its `CDN_BASE_URL`
 * (`http://localhost:9000/drama-media` by default), which is unreachable from a device. In debug builds a
 * loopback host is replaced by the origin of `BuildConfig.MEDIA_BASE_URL` (`10.0.2.2` for the emulator or
 * the PC's LAN IP via `-PdramaMediaBaseUrl`). Release builds never rewrite anything.
 */
@Singleton
class MediaUrlResolver(
    private val mediaBaseUrl: String,
    private val rewriteLoopback: Boolean,
) {
    @Inject
    constructor() : this(BuildConfig.MEDIA_BASE_URL, BuildConfig.DEBUG)

    fun resolve(url: String?): String? {
        if (url.isNullOrBlank() || !rewriteLoopback) return url
        val parsed = url.toHttpUrlOrNull() ?: return url
        if (parsed.host !in LOOPBACK_HOSTS) return url
        val base = mediaBaseUrl.toHttpUrlOrNull() ?: return url
        return parsed
            .newBuilder()
            .scheme(base.scheme)
            .host(base.host)
            .port(base.port)
            .build()
            .toString()
    }

    private companion object {
        val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]")
    }
}
