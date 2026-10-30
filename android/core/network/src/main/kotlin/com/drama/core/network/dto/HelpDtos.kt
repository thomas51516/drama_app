package com.drama.core.network.dto

import kotlinx.serialization.Serializable

/** `GET /help/faq?lang` (contract v1.3): published entries, in the requested language with French fallback. */
@Serializable
data class FaqResponseDto(
    val categories: List<FaqCategoryDto> = emptyList(),
)

@Serializable
data class FaqCategoryDto(
    val key: String,
    val title: String,
    val entries: List<FaqEntryDto> = emptyList(),
)

@Serializable
data class FaqEntryDto(
    val id: String,
    val question: String,
    val answer: String,
)

/** `POST /help/contact` body; [email] only when the viewer wants a copy / has no e-mail on the account. */
@Serializable
data class ContactRequestDto(
    val category: String,
    val subject: String,
    val message: String,
    val email: String? = null,
)

@Serializable
data class ContactResponseDto(
    val ticketId: String,
)

/** `GET /help/tickets`: the viewer's own tickets, either a bare list or `{items}`. */
@Serializable
data class TicketsResponseDto(
    val items: List<TicketDto> = emptyList(),
    val total: Int? = null,
)

@Serializable
data class TicketDto(
    val id: String,
    val category: String? = null,
    val subject: String,
    /** `OPEN | ANSWERED | CLOSED`. */
    val status: String,
    val messages: List<TicketMessageDto> = emptyList(),
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class TicketMessageDto(
    /** `user | support`. */
    val from: String,
    val body: String,
    val at: String? = null,
)
