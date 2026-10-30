package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** `POST /events` (S06-BE-03): at most 50 events per call, names from spec §13. */
@Serializable
data class EventsRequestDto(
    val events: List<EventDto>,
)

@Serializable
data class EventDto(
    val name: String,
    val params: Map<String, JsonElement> = emptyMap(),
    /** ISO-8601 instant. */
    val at: String,
)
