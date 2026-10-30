package com.drama.core.ui.window

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView

/**
 * Capture protection (M-18): sets `FLAG_SECURE` on the window while [secure] is true, so screenshots and screen
 * recordings of a paid episode come out black. Cleared when the composable leaves or [secure] turns false.
 */
@Composable
fun SecureWindow(secure: Boolean) {
    val view = LocalView.current
    DisposableEffect(view, secure) {
        val window = view.context.findActivity()?.window
        if (secure) {
            window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
