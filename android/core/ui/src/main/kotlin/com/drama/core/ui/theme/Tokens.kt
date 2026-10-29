package com.drama.core.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Spacing and sizing tokens. Prefer these over magic numbers in composables. */
object DramaSpacing {
    val xxs: Dp = 2.dp
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 16.dp
    val lg: Dp = 24.dp
    val xl: Dp = 32.dp
}

object DramaSizes {
    val touchTarget: Dp = 48.dp
    val posterCornerRadius: Dp = 12.dp

    /** Width of a 2:3 poster card in a horizontal row. */
    val posterCardWidth: Dp = 118.dp
    val posterCardHeight: Dp = 177.dp
    val bannerCornerRadius: Dp = 16.dp
}
