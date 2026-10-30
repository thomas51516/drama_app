package com.drama.core.common.locale

/**
 * Languages the app ships (S05-A2-03): French is the source language, the others are full translations.
 * [code] is the ISO 639-1 value sent to the backend (`PATCH /me language`, `Accept-Language`).
 */
enum class AppLanguage(
    val code: String,
    /** Name in the language itself, shown in the selector whatever the current locale. */
    val nativeName: String,
) {
    FRENCH("fr", "Français"),
    ENGLISH("en", "English"),
    SPANISH("es", "Español"),
    PORTUGUESE("pt", "Português"),
    ;

    companion object {
        val DEFAULT: AppLanguage = FRENCH

        /** Exact code or BCP 47 tag (`pt-BR`, `es_419`, `EN`); null when the language is not supported. */
        fun fromTag(tag: String?): AppLanguage? {
            val language =
                tag
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
                    ?.split('-', '_')
                    ?.first()
                    ?.lowercase() ?: return null
            return entries.firstOrNull { it.code == language }
        }

        /** Supported language for [tag], French otherwise (what the backend and the UI fall back to). */
        fun fromTagOrDefault(tag: String?): AppLanguage = fromTag(tag) ?: DEFAULT
    }
}

/**
 * Applies the viewer's language choice to the whole app (per-app locales). Implemented in :app over
 * `AppCompatDelegate.setApplicationLocales`; the choice is persisted by AppCompat itself.
 */
interface AppLocaleController {
    /** Language forced for the app, null when it follows the system. */
    val appLanguage: AppLanguage?

    /** Must be called from the main thread: running activities are recreated. */
    fun setAppLanguage(language: AppLanguage)
}
