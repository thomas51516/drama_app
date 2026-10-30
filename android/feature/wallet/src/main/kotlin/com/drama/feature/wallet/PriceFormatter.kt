package com.drama.feature.wallet

import com.drama.domain.model.Price
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Formats a `/shop` price in the viewer's locale with the currency's own fraction digits (XOF has none, EUR two).
 * Pure JVM so the shop view model test can check it; unknown currency codes fall back to `amount CODE`.
 */
object PriceFormatter {
    fun format(
        price: Price,
        locale: Locale,
    ): String {
        val currency =
            try {
                Currency.getInstance(price.currency)
            } catch (_: IllegalArgumentException) {
                null
            }
        val digits = currency?.defaultFractionDigits?.coerceAtLeast(0) ?: DEFAULT_FRACTION_DIGITS
        val amount = BigDecimal.valueOf(price.amountMinor).movePointLeft(digits)
        if (currency == null) return "${amount.toPlainString()} ${price.currency}"
        val format =
            NumberFormat.getCurrencyInstance(locale).apply {
                this.currency = currency
                minimumFractionDigits = digits
                maximumFractionDigits = digits
            }
        return format.format(amount)
    }

    /** Major-unit amount for analytics (`purchase.amount`). */
    fun majorAmount(price: Price): Double {
        val digits =
            try {
                Currency.getInstance(price.currency).defaultFractionDigits.coerceAtLeast(0)
            } catch (_: IllegalArgumentException) {
                DEFAULT_FRACTION_DIGITS
            }
        return BigDecimal.valueOf(price.amountMinor).movePointLeft(digits).toDouble()
    }

    /** Store price (micros of the major unit) to a [Price] in the currency's minor unit. */
    fun fromMicros(
        currency: String,
        priceMicros: Long,
    ): Price {
        val digits =
            try {
                Currency.getInstance(currency).defaultFractionDigits.coerceAtLeast(0)
            } catch (_: IllegalArgumentException) {
                DEFAULT_FRACTION_DIGITS
            }
        val divisor = BigDecimal.TEN.pow(MICRO_DIGITS - digits)
        return Price(currency.uppercase(), BigDecimal.valueOf(priceMicros).divide(divisor).toLong())
    }

    private const val DEFAULT_FRACTION_DIGITS = 2
    private const val MICRO_DIGITS = 6
}
