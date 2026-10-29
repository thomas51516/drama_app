package com.drama.core.network.retry

import com.drama.core.common.logging.Logger
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.io.InterruptedIOException

/**
 * Retries idempotent GET requests that fail with an [IOException] (connection reset, timeout, DNS)
 * with exponential backoff: 500 ms, 1 s. Writes are never retried: idempotency keys arrive with purchases.
 */
class RetryInterceptor(
    private val logger: Logger,
    private val maxRetries: Int = DEFAULT_MAX_RETRIES,
    private val baseDelayMs: Long = DEFAULT_BASE_DELAY_MS,
    private val sleep: (Long) -> Unit = Thread::sleep,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.method != "GET") return chain.proceed(request)

        var attempt = 0
        while (true) {
            try {
                return chain.proceed(request)
            } catch (e: IOException) {
                val cancelled = chain.call().isCanceled() || e is InterruptedIOException && e.message == "canceled"
                if (cancelled || attempt >= maxRetries) throw e
                val delay = baseDelayMs shl attempt
                attempt++
                logger.w(
                    TAG,
                    "GET ${request.url.encodedPath} failed (${e.javaClass.simpleName}), retry $attempt in ${delay}ms",
                )
                sleep(delay)
            }
        }
    }

    companion object {
        private const val TAG = "Network"
        const val DEFAULT_MAX_RETRIES = 2
        const val DEFAULT_BASE_DELAY_MS = 500L
    }
}
