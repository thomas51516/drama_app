package com.drama.core.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Provisional dark palette (S03-UX-01 pending): near-black canvas, white text, emerald accent
 * aligned with the back-office's PrimeVue Aura theme (#10b981) so the brand reads consistently
 * across the app and the admin tools. Keep every colour behind these tokens so the designer's
 * system can replace them in one place.
 */
object DramaColors {
    val Emerald = Color(0xFF10B981)
    val EmeraldDark = Color(0xFF047857)
    val EmeraldSoft = Color(0x3310B981)
    val Gold = Color(0xFFF2B33D)
    val Ink = Color(0xFF09090C)
    val Surface = Color(0xFF131318)
    val SurfaceHigh = Color(0xFF1C1C24)
    val SurfaceHigher = Color(0xFF26262F)
    val Outline = Color(0xFF2E2E38)
    val OnInk = Color(0xFFF7F7FA)
    val Muted = Color(0xFF9A9AA8)
    val Success = Color(0xFF3DD68C)
    val Error = Color(0xFFFF6B6B)
    val Scrim = Color(0xCC000000)
}
