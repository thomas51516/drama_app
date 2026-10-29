package com.drama.core.common.locale

/**
 * Language and country of the device, used for `Accept-Language` / `X-Country` and the default subtitle
 * language. Implemented in :app over the Android locale and SIM; tests pass fixed values.
 */
interface DeviceLocaleProvider {
    /** BCP 47 tag, e.g. `fr-FR`. */
    val languageTag: String

    /** ISO 639-1 language, lowercase, e.g. `fr`. */
    val language: String

    /** ISO 3166-1 alpha-2 country, uppercase (SIM first, then locale); null when unknown. */
    val country: String?
}

class FixedDeviceLocale(
    override val language: String,
    override val country: String? = null,
) : DeviceLocaleProvider {
    override val languageTag: String get() = country?.let { "$language-$it" } ?: language
}
