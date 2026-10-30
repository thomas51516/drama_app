package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** `PATCH /me` body; absent fields are left untouched (`explicitNulls = false`). */
@Serializable
data class UpdateMeRequestDto(
    val displayName: String? = null,
    val language: String? = null,
    val country: String? = null,
    /** v1.3 (M-52/M-54): push preferences, all three sent together. */
    val notificationPreferences: NotificationPreferencesDto? = null,
)

/** `DELETE /me`: v1.2 answers `202 {scheduledFor}`, v1 answered `{status, purgeAt}`. */
@Serializable
data class DeleteMeResponseDto(
    val scheduledFor: String? = null,
    val purgeAt: String? = null,
    val status: String? = null,
) {
    val scheduledIso: String? get() = scheduledFor ?: purgeAt
}

/**
 * `GET /me/favorites`. v1.2 lists `SeriesSummary` items (`{items, total, page, pageSize}`); the v1 stub wrapped
 * each item as `{series, createdAt}`. Items are decoded lazily by the mapper to accept both.
 */
@Serializable
data class FavoritesResponseDto(
    val items: List<JsonElement> = emptyList(),
    val total: Int? = null,
    val page: Int? = null,
    val pageSize: Int? = null,
)

@Serializable
data class LikeResponseDto(
    val likes: Int = 0,
    val liked: Boolean = false,
)
