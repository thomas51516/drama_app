package com.drama.data.repository

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.HelpApi
import com.drama.core.network.call
import com.drama.core.network.dto.ContactRequestDto
import com.drama.data.mapper.toDomain
import com.drama.domain.model.ContactRequest
import com.drama.domain.model.FaqCategory
import com.drama.domain.model.SupportTicket
import com.drama.domain.repository.HelpRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Help centre over the v1.3 contract (S06-A1-01). No cache: the FAQ is small and language-dependent. */
@Singleton
class DefaultHelpRepository
    @Inject
    constructor(
        private val api: HelpApi,
        private val errorMapper: ApiErrorMapper,
    ) : HelpRepository {
        override suspend fun getFaq(language: String): AppResult<List<FaqCategory>> =
            errorMapper
                .call { api.faq(language) }
                .map { response -> response.categories.map { it.toDomain() }.filter { it.entries.isNotEmpty() } }

        override suspend fun sendContact(request: ContactRequest): AppResult<String> =
            errorMapper
                .call {
                    api.contact(
                        ContactRequestDto(
                            category = request.category.wireName,
                            subject = request.subject.trim(),
                            message = request.message.trim(),
                            email = request.email?.trim()?.takeIf { it.isNotEmpty() },
                        ),
                    )
                }.map { it.ticketId }

        override suspend fun getTickets(): AppResult<List<SupportTicket>> =
            errorMapper
                .call { api.tickets() }
                .map { response ->
                    response.items.map { it.toDomain() }.sortedByDescending { it.updatedAtEpochMs ?: 0L }
                }
    }
