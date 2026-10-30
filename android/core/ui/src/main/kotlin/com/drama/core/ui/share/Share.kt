package com.drama.core.ui.share

import android.content.Context
import android.content.Intent

/** Opens the system share sheet with [text] (M-16). */
fun Context.shareText(
    text: String,
    chooserTitle: String = "Partager",
) {
    val send =
        Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
    startActivity(Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
