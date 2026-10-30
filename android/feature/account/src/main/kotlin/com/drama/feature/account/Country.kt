package com.drama.feature.account

import java.util.Locale

/** Dial-code picker entries for the phone sign-in (M-51). West/Central Africa first, then common diaspora. */
data class Country(
    val iso: String,
    val name: String,
    val dialCode: String,
    /** True where the leading `0` belongs to the number itself (Côte d'Ivoire since the 2021 ten-digit plan). */
    val keepsLeadingZero: Boolean = false,
) {
    val flag: String
        get() =
            iso.uppercase().map { Character.toChars(FLAG_BASE + (it.code - 'A'.code)) }.joinToString("") { String(it) }

    /** Country name in the current app language (java.util.Locale data), so the picker follows the UI language. */
    val label: String
        get() {
            val localized =
                Locale
                    .Builder()
                    .setRegion(iso)
                    .build()
                    .getDisplayCountry(Locale.getDefault())
                    .ifBlank { name }
            return "$flag $localized (+$dialCode)"
        }

    companion object {
        private const val FLAG_BASE = 0x1F1E6

        val ALL: List<Country> =
            listOf(
                Country("TG", "Togo", "228"),
                Country("CI", "Côte d'Ivoire", "225", keepsLeadingZero = true),
                Country("SN", "Sénégal", "221"),
                Country("BJ", "Bénin", "229"),
                Country("BF", "Burkina Faso", "226"),
                Country("ML", "Mali", "223"),
                Country("NE", "Niger", "227"),
                Country("GH", "Ghana", "233"),
                Country("NG", "Nigeria", "234"),
                Country("CM", "Cameroun", "237"),
                Country("GA", "Gabon", "241"),
                Country("CG", "Congo", "242"),
                Country("CD", "RD Congo", "243"),
                Country("GN", "Guinée", "224"),
                Country("MR", "Mauritanie", "222"),
                Country("MA", "Maroc", "212"),
                Country("DZ", "Algérie", "213"),
                Country("TN", "Tunisie", "216"),
                Country("FR", "France", "33"),
                Country("BE", "Belgique", "32"),
                Country("CH", "Suisse", "41"),
                Country("CA", "Canada", "1"),
                Country("US", "États-Unis", "1"),
                Country("GB", "Royaume-Uni", "44"),
                Country("DE", "Allemagne", "49"),
                Country("ES", "Espagne", "34"),
                Country("PT", "Portugal", "351"),
                Country("BR", "Brésil", "55"),
            )

        val DEFAULT: Country = ALL.first()

        fun forIso(iso: String?): Country = ALL.firstOrNull { it.iso.equals(iso, ignoreCase = true) } ?: DEFAULT

        /**
         * E.164 from a national number typed by the user: spaces, dots and dashes are dropped, a leading `0`
         * (trunk prefix) is removed unless the country keeps it, a number already starting with `+` is kept as
         * typed. Null when invalid.
         */
        fun toE164(
            country: Country,
            national: String,
        ): String? {
            val digits = national.filter { it.isDigit() || it == '+' }
            val candidate =
                when {
                    digits.startsWith("+") -> digits
                    country.keepsLeadingZero -> "+${country.dialCode}$digits"
                    else -> "+${country.dialCode}${digits.removePrefix("0")}"
                }
            return candidate.takeIf { E164.matches(it) }
        }

        private val E164 = Regex("^\\+[1-9]\\d{6,14}$")
    }
}
