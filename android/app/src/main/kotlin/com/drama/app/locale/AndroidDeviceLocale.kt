package com.drama.app.locale

import android.content.Context
import android.telephony.TelephonyManager
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.ConfigurationCompat
import androidx.core.os.LocaleListCompat
import com.drama.core.common.locale.AppLanguage
import com.drama.core.common.locale.AppLocaleController
import com.drama.core.common.locale.DeviceLocaleProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Locale for `Accept-Language` / `X-Country` and the default subtitle language: the per-app language chosen in
 * the settings (S05-A1-03) wins over the device locale. Country: SIM country first (what the user actually pays
 * and watches from), then the network country, then the locale's region. Values are read on each access so a
 * language change is picked up without restart.
 */
@Singleton
class AndroidDeviceLocale
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : DeviceLocaleProvider {
        private val locale: Locale
            get() =
                AppCompatDelegate.getApplicationLocales()[0]
                    ?: ConfigurationCompat.getLocales(context.resources.configuration)[0]
                    ?: Locale.getDefault()

        override val languageTag: String get() = locale.toLanguageTag()

        override val language: String get() = locale.language.lowercase().ifBlank { DEFAULT_LANGUAGE }

        override val country: String?
            get() {
                val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                val sim = telephony?.simCountryIso?.takeIf { it.length == COUNTRY_LENGTH }
                val network =
                    telephony
                        ?.takeIf { it.phoneType != TelephonyManager.PHONE_TYPE_CDMA }
                        ?.networkCountryIso
                        ?.takeIf { it.length == COUNTRY_LENGTH }
                return (sim ?: network ?: locale.country.takeIf { it.length == COUNTRY_LENGTH })?.uppercase()
            }

        private companion object {
            const val DEFAULT_LANGUAGE = "fr"
            const val COUNTRY_LENGTH = 2
        }
    }

/** Per-app locales through AppCompat: persisted by the library (`autoStoreLocales`), activities recreated. */
@Singleton
class AppCompatLocaleController
    @Inject
    constructor() : AppLocaleController {
        override val appLanguage: AppLanguage?
            get() = AppLanguage.fromTag(AppCompatDelegate.getApplicationLocales()[0]?.toLanguageTag())

        override fun setAppLanguage(language: AppLanguage) {
            if (appLanguage == language) return
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language.code))
        }
    }
