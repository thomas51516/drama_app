package com.drama.data.mapper

import com.drama.core.network.dto.FaqCategoryDto
import com.drama.core.network.dto.NotificationDto
import com.drama.core.network.dto.NotificationPreferencesDto
import com.drama.core.network.dto.TicketDto
import com.drama.core.network.dto.TicketMessageDto
import com.drama.domain.model.AppNotification
import com.drama.domain.model.ContactCategory
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.FaqEntry
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.model.SupportTicket
import com.drama.domain.model.TicketAuthor
import com.drama.domain.model.TicketMessage
import com.drama.domain.model.TicketStatus
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

fun FaqCategoryDto.toDomain(): FaqCategory =
    FaqCategory(
        key = key,
        title = title,
        entries = entries.map { FaqEntry(it.id, it.question, it.answer) },
    )

fun TicketDto.toDomain(): SupportTicket =
    SupportTicket(
        id = id,
        category = ContactCategory.from(category),
        subject = subject,
        status = TicketStatus.from(status),
        messages = messages.map { it.toDomain() },
        createdAtEpochMs = parseInstantMs(createdAt),
        updatedAtEpochMs = parseInstantMs(updatedAt),
    )

fun TicketMessageDto.toDomain(): TicketMessage =
    TicketMessage(
        from = if (from.equals("support", ignoreCase = true)) TicketAuthor.SUPPORT else TicketAuthor.USER,
        body = body,
        atEpochMs = parseInstantMs(at),
    )

fun NotificationDto.toDomain(): AppNotification =
    AppNotification(
        id = id,
        type = type,
        title = title,
        body = body,
        data = data.orEmpty().toStringMap(),
        sentAtEpochMs = parseInstantMs(sentAt),
        readAtEpochMs = parseInstantMs(readAt),
    )

fun NotificationPreferencesDto?.toDomain(): NotificationPreferences =
    this?.let { NotificationPreferences(it.newEpisodes, it.offers, it.checkinReminder) } ?: NotificationPreferences()

fun NotificationPreferences.toDto(): NotificationPreferencesDto =
    NotificationPreferencesDto(newEpisodes = newEpisodes, offers = offers, checkinReminder = checkinReminder)

/** Routing payloads are strings on the wire but a backend may send numbers/booleans: keep their text form. */
fun Map<String, JsonElement>.toStringMap(): Map<String, String> =
    mapNotNull { (key, value) ->
        when (value) {
            is JsonNull -> null
            is JsonPrimitive -> key to value.content
            else -> key to value.toString()
        }
    }.toMap()
