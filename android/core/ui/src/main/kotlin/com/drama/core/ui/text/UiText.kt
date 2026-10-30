package com.drama.core.ui.text

import android.content.Context
import androidx.annotation.PluralsRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * Text produced by a view model without touching Android resources (S05-A2-03): a resource id with its
 * arguments, a plural, or a raw string coming from the server. Resolved in the composable with [asString].
 */
sealed interface UiText {
    data class Res(
        @param:StringRes val id: Int,
        val args: List<Any> = emptyList(),
    ) : UiText

    data class Plural(
        @param:PluralsRes val id: Int,
        val quantity: Int,
        val args: List<Any> = listOf(quantity),
    ) : UiText

    data class Raw(
        val value: String,
    ) : UiText

    fun asString(context: Context): String =
        when (this) {
            is Res -> if (args.isEmpty()) context.getString(id) else context.getString(id, *args.toTypedArray())
            is Plural -> context.resources.getQuantityString(id, quantity, *args.toTypedArray())
            is Raw -> value
        }

    companion object {
        fun of(
            @StringRes id: Int,
            vararg args: Any,
        ): UiText = Res(id, args.toList())
    }
}

@Composable
fun UiText.asString(): String = asString(LocalContext.current)
