package com.drama.domain.model

/** Push preferences of the account (M-52/M-54, `PATCH /me notificationPreferences`); default all on. */
data class NotificationPreferences(
    val newEpisodes: Boolean = true,
    val offers: Boolean = true,
    val checkinReminder: Boolean = true,
)

/** One entry of the in-app history (`GET /me/notifications`). */
data class AppNotification(
    val id: String,
    val type: String,
    val title: String,
    val body: String,
    val data: Map<String, String>,
    val sentAtEpochMs: Long?,
    val readAtEpochMs: Long?,
) {
    val isRead: Boolean get() = readAtEpochMs != null
    val target: NotificationTarget get() = NotificationRouting.target(type, data)
}

data class NotificationPage(
    val items: List<AppNotification>,
    val total: Int,
    val page: Int,
    val hasMore: Boolean,
)

/** A push message as received by the device (FCM `data` payload), before it is shown. */
data class PushMessage(
    val id: String?,
    val type: String,
    val title: String,
    val body: String,
    val data: Map<String, String>,
) {
    val target: NotificationTarget get() = NotificationRouting.target(type, data)
    val channel: NotificationChannelKind get() = NotificationRouting.channel(type)
}

/** Where a notification tap lands. */
sealed interface NotificationTarget {
    data class Series(
        val seriesId: String,
    ) : NotificationTarget

    data class Episode(
        val seriesId: String,
        val episodeId: String,
    ) : NotificationTarget

    data object Notifications : NotificationTarget

    data object Help : NotificationTarget

    data object Home : NotificationTarget
}

/** Android notification channels (M-54): new episodes, offers, reminders, plus support replies. */
enum class NotificationChannelKind(
    val id: String,
) {
    NEW_EPISODES("new_episodes"),
    OFFERS("offers"),
    REMINDERS("reminders"),
    SUPPORT("support"),
}

/**
 * Single rule for push routing (S06-A1-02), shared by the status-bar notification (`PendingIntent` deep link),
 * the in-app list and the foreground snackbar. Pure Kotlin, unit-tested.
 */
object NotificationRouting {
    const val TYPE_NEW_EPISODE = "new_episode"
    const val TYPE_OFFER = "offer"
    const val TYPE_CAMPAIGN = "campaign"
    const val TYPE_CHECKIN_REMINDER = "checkin_reminder"
    const val TYPE_SUPPORT_REPLY = "support_reply"

    const val KEY_SERIES_ID = "seriesId"
    const val KEY_EPISODE_ID = "episodeId"
    const val KEY_DEEP_LINK = "deepLink"
    const val KEY_TYPE = "type"
    const val KEY_NOTIFICATION_ID = "notificationId"
    const val KEY_TITLE = "title"
    const val KEY_BODY = "body"

    const val SCHEME = "drama"

    /** Explicit `deepLink` first, then `seriesId` / `episodeId`, then a default per type. */
    fun target(
        type: String?,
        data: Map<String, String>,
    ): NotificationTarget {
        data[KEY_DEEP_LINK]?.let { link -> fromDeepLink(link)?.let { return it } }
        val seriesId = data[KEY_SERIES_ID]?.takeIf { it.isNotBlank() }
        val episodeId = data[KEY_EPISODE_ID]?.takeIf { it.isNotBlank() }
        return when {
            seriesId != null && episodeId != null -> NotificationTarget.Episode(seriesId, episodeId)
            seriesId != null -> NotificationTarget.Series(seriesId)
            type == TYPE_SUPPORT_REPLY -> NotificationTarget.Help
            type == TYPE_OFFER || type == TYPE_CAMPAIGN || type == TYPE_CHECKIN_REMINDER ->
                NotificationTarget.Notifications
            else -> NotificationTarget.Home
        }
    }

    fun channel(type: String?): NotificationChannelKind =
        when (type) {
            TYPE_NEW_EPISODE -> NotificationChannelKind.NEW_EPISODES
            TYPE_OFFER, TYPE_CAMPAIGN -> NotificationChannelKind.OFFERS
            TYPE_CHECKIN_REMINDER -> NotificationChannelKind.REMINDERS
            TYPE_SUPPORT_REPLY -> NotificationChannelKind.SUPPORT
            else -> NotificationChannelKind.OFFERS
        }

    /** `drama://...` URI the navigation graph understands for [target]. */
    fun deepLink(target: NotificationTarget): String =
        when (target) {
            is NotificationTarget.Series -> "$SCHEME://series/${target.seriesId}"
            is NotificationTarget.Episode -> "$SCHEME://player/${target.seriesId}/${target.episodeId}"
            NotificationTarget.Notifications -> "$SCHEME://notifications"
            NotificationTarget.Help -> "$SCHEME://help"
            NotificationTarget.Home -> "$SCHEME://home"
        }

    /** Parses `drama://series/{id}`, `drama://player/{seriesId}/{episodeId}`, `drama://notifications`, `drama://help`. */
    fun fromDeepLink(uri: String): NotificationTarget? {
        val trimmed = uri.trim()
        val prefix = "$SCHEME://"
        if (!trimmed.startsWith(prefix, ignoreCase = true)) return null
        val parts =
            trimmed
                .substring(prefix.length)
                .substringBefore('?')
                .split('/')
                .filter { it.isNotBlank() }
        return when (parts.firstOrNull()?.lowercase()) {
            "series" -> parts.getOrNull(1)?.let { NotificationTarget.Series(it) }
            "player" ->
                parts.getOrNull(1)?.let { seriesId ->
                    parts.getOrNull(2)?.let { episodeId -> NotificationTarget.Episode(seriesId, episodeId) }
                        ?: NotificationTarget.Series(seriesId)
                }
            "notifications" -> NotificationTarget.Notifications
            "help" -> NotificationTarget.Help
            "home" -> NotificationTarget.Home
            else -> null
        }
    }

    /** Builds a [PushMessage] from a raw FCM data payload; null when nothing displayable was sent. */
    fun parsePayload(data: Map<String, String>): PushMessage? {
        val title = data[KEY_TITLE]?.takeIf { it.isNotBlank() } ?: return null
        return PushMessage(
            id = data[KEY_NOTIFICATION_ID]?.takeIf { it.isNotBlank() },
            type = data[KEY_TYPE]?.takeIf { it.isNotBlank() } ?: TYPE_OFFER,
            title = title,
            body = data[KEY_BODY].orEmpty(),
            data = data,
        )
    }
}
