package com.drama.core.network.auth

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/** Supplies the current access token. Replaced by the real session store in Sprint 2 (guest auth). */
fun interface TokenProvider {
    fun accessToken(): String?
}

object NoTokenProvider : TokenProvider {
    override fun accessToken(): String? = null
}

/** Adds `Authorization: Bearer <token>` when a token is available. Placeholder for S02 auth. */
class AuthInterceptor
    @Inject
    constructor(
        private val tokenProvider: TokenProvider,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val token = tokenProvider.accessToken()
            val request =
                if (token.isNullOrBlank()) {
                    chain.request()
                } else {
                    chain
                        .request()
                        .newBuilder()
                        .header("Authorization", "Bearer $token")
                        .build()
                }
            return chain.proceed(request)
        }
    }
