package com.drama.domain.repository

/** Server-side analytics (`POST /events`, S06-BE-03). Fire-and-forget, failures are logged and dropped. */
interface EventsRepository {
    fun track(
        name: String,
        params: Map<String, Any?> = emptyMap(),
    )
}
