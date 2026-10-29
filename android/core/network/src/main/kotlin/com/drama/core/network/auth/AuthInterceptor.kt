package com.drama.core.network.auth

import com.drama.core.common.result.AppResult
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Adds `Authorization: Bearer <token>`, creating the guest session first when none exists.
 * When the bootstrap fails (offline, rate limited) the request goes out without a bearer: public
 * endpoints still work and protected ones return 401, mapped to `AppError.Unauthenticated`.
 */
class AuthInterceptor
    @Inject
    constructor(
        private val sessionManager: SessionManager,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val token =
                runBlocking {
                    when (val session = sessionManager.ensureSession()) {
                        is AppResult.Success -> session.value.tokens.accessToken
                        is AppResult.Failure -> sessionManager.currentAccessToken()
                    }
                }
            val request =
                if (token.isNullOrBlank()) {
                    chain.request()
                } else {
                    chain
                        .request()
                        .newBuilder()
                        .header(HEADER, "$SCHEME $token")
                        .build()
                }
            return chain.proceed(request)
        }

        companion object {
            const val HEADER = "Authorization"
            const val SCHEME = "Bearer"
        }
    }
