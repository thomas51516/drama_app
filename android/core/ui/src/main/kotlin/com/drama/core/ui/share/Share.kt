package com.drama.core.ui.share

import android.content.Context
import android.content.Intent
import com.drama.core.ui.R

/** Opens the system share sheet with [text] (M-16). */
fun Context.shareText(
    text: String,
    chooserTitle: String = getString(R.string.action_share),
) {
    val send =
        Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
    startActivity(Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
