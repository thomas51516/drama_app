package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.ContactRequest
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.SupportTicket

/** Help centre (M-53): FAQ in the viewer's language, contact form, own tickets. */
interface HelpRepository {
    suspend fun getFaq(language: String): AppResult<List<FaqCategory>>

    /** Returns the created ticket id. */
    suspend fun sendContact(request: ContactRequest): AppResult<String>

    suspend fun getTickets(): AppResult<List<SupportTicket>>
}
