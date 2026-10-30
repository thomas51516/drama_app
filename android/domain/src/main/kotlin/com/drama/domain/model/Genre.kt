package com.drama.domain.model

/** `GET /genres?lang` (DEF-012): a catalogue genre key with its label in the requested language. */
data class Genre(
    val key: String,
    val label: String,
)

/** Localised genre labels keyed by server genre key; unknown keys fall back to the capitalised key. */
class GenreLabels(
    private val labels: Map<String, String>,
) {
    val isEmpty: Boolean get() = labels.isEmpty()

    /** Keys in the server order. */
    val keys: List<String> get() = labels.keys.toList()

    fun label(key: String): String = labels[key] ?: labels[key.lowercase()] ?: fallback(key)

    fun labels(keys: List<String>): List<String> = keys.map(::label)

    companion object {
        val EMPTY = GenreLabels(emptyMap())

        fun fallback(key: String): String = key.replaceFirstChar(Char::titlecase)

        fun of(genres: List<Genre>): GenreLabels =
            GenreLabels(linkedMapOf<String, String>().apply { genres.forEach { put(it.key, it.label) } })
    }
}
