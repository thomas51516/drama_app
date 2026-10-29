package com.drama.core.network.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject

/**
 * OkHttp authenticator: on 401, rotates the tokens through [SessionManager.recoverFrom401] (single-flight)
 * and retries the request once with the new bearer. Gives up after one retry so a server that keeps
 * answering 401 cannot loop.
 */
class TokenAuthenticator
    @Inject
    constructor(
        private val sessionManager: SessionManager,
    ) : Authenticator {
        override fun authenticate(
            route: Route?,
            response: Response,
        ): Request? {
            if (response.priorAttempts() >= MAX_RETRIES) return null
            val failedToken =
                response.request
                    .header(AuthInterceptor.HEADER)
                    ?.removePrefix(AuthInterceptor.SCHEME)
                    ?.trim()
            val fresh = runBlocking { sessionManager.recoverFrom401(failedToken) } ?: return null
            if (fresh == failedToken) return null
            return response.request
                .newBuilder()
                .header(AuthInterceptor.HEADER, "${AuthInterceptor.SCHEME} $fresh")
                .build()
        }

        private fun Response.priorAttempts(): Int {
            var count = 0
            var prior = priorResponse
            while (prior != null) {
                count++
                prior = prior.priorResponse
            }
            return count
        }

        companion object {
            private const val MAX_RETRIES = 1
        }
    }
