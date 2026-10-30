package com.drama.core.network.api

import com.drama.core.network.dto.ContactRequestDto
import com.drama.core.network.dto.ContactResponseDto
import com.drama.core.network.dto.FaqResponseDto
import com.drama.core.network.dto.TicketsResponseDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** Help centre (M-53, contract v1.3). */
interface HelpApi {
    @GET("help/faq")
    suspend fun faq(
        @Query("lang") lang: String,
    ): FaqResponseDto

    /** 201 `{ticketId}`; 5 per day per user. */
    @POST("help/contact")
    suspend fun contact(
        @Body body: ContactRequestDto,
    ): ContactResponseDto

    @GET("help/tickets")
    suspend fun tickets(): TicketsResponseDto
}
