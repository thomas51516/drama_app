package com.drama.domain.model

/** `GET /search` answer (M-03): one page of series plus the server's spelling/completion suggestions. */
data class SearchResult(
    val query: String,
    val items: List<Series>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
    val suggestions: List<String>,
) {
    val hasMore: Boolean get() = page * pageSize < total
}
