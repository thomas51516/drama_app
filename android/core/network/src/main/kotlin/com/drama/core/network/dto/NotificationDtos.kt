package com.drama.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** `PUT /me/devices/push` (M-54): upsert by token for the current user. */
@Serializable
data class PushDeviceRequestDto(
    val token: String,
    val platform: String = "android",
    val locale: String,
    val appVersion: String,
)

/** `GET /me/notifications?page&pageSize`: in-app history. */
@Serializable
data class NotificationsResponseDto(
    val items: List<NotificationDto> = emptyList(),
    val total: Int? = null,
    val page: Int? = null,
    val pageSize: Int? = null,
    val nextCursor: String? = null,
)

@Serializable
data class NotificationDto(
    val id: String,
    /** `new_episode | offer | checkin_reminder | support_reply | campaign`. */
    val type: String,
    val title: String,
    val body: String = "",
    /** Free-form routing payload (`seriesId`, `episodeId`, `deepLink`, ...). Values may be non-strings. */
    val data: Map<String, JsonElement>? = null,
    val sentAt: String? = null,
    val readAt: String? = null,
)

/** `notificationPreferences` of `UserDto` / `PATCH /me` (default all true). */
@Serializable
data class NotificationPreferencesDto(
    val newEpisodes: Boolean = true,
    val offers: Boolean = true,
    val checkinReminder: Boolean = true,
)
