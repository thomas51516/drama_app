package com.drama.core.network.locale

import com.drama.core.common.locale.DeviceLocaleProvider
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

/**
 * Adds `Accept-Language` (device locale, e.g. `fr-FR, fr;q=0.9`) and `X-Country` (SIM country, then the
 * locale country) to every API call so `GET /home` returns the rows of the viewer's country titled in
 * their language (addendum v1.1). Headers already set by the caller win.
 */
class LocaleHeadersInterceptor
    @Inject
    constructor(
        private val locale: DeviceLocaleProvider,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val original = chain.request()
            val builder = original.newBuilder()
            if (original.header(HEADER_ACCEPT_LANGUAGE) == null) {
                builder.header(HEADER_ACCEPT_LANGUAGE, acceptLanguage(locale.languageTag, locale.language))
            }
            val country = locale.country
            if (original.header(HEADER_COUNTRY) == null && !country.isNullOrBlank()) {
                builder.header(HEADER_COUNTRY, country)
            }
            return chain.proceed(builder.build())
        }

        companion object {
            const val HEADER_ACCEPT_LANGUAGE = "Accept-Language"
            const val HEADER_COUNTRY = "X-Country"

            fun acceptLanguage(
                languageTag: String,
                language: String,
            ): String =
                if (languageTag.equals(language, ignoreCase = true)) language else "$languageTag, $language;q=0.9"
        }
    }
