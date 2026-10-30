package com.drama.domain.model

/** Help centre (M-53). */
data class FaqCategory(
    val key: String,
    val title: String,
    val entries: List<FaqEntry>,
)

data class FaqEntry(
    val id: String,
    val question: String,
    val answer: String,
)

/** Categories of the contact form; [wireName] is what `POST /help/contact` receives. */
enum class ContactCategory(
    val wireName: String,
) {
    ACCOUNT("account"),
    COINS("coins"),
    VIP("vip"),
    PAYMENT("payment"),
    PLAYBACK("playback"),
    CONTENT("content"),
    OTHER("other"),
    ;

    companion object {
        fun from(raw: String?): ContactCategory =
            entries.firstOrNull { it.wireName.equals(raw, ignoreCase = true) } ?: OTHER
    }
}

data class ContactRequest(
    val category: ContactCategory,
    val subject: String,
    val message: String,
    val email: String? = null,
)

enum class TicketStatus {
    OPEN,
    ANSWERED,
    CLOSED,
    ;

    companion object {
        fun from(raw: String?): TicketStatus = entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: OPEN
    }
}

enum class TicketAuthor {
    USER,
    SUPPORT,
}

data class TicketMessage(
    val from: TicketAuthor,
    val body: String,
    val atEpochMs: Long?,
)

data class SupportTicket(
    val id: String,
    val category: ContactCategory,
    val subject: String,
    val status: TicketStatus,
    val messages: List<TicketMessage>,
    val createdAtEpochMs: Long?,
    val updatedAtEpochMs: Long?,
)
