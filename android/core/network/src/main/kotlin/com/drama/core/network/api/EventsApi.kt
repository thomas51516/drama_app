package com.drama.core.network.api

import com.drama.core.network.dto.EventsRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/** Server-side analytics (S06-BE-03): `202` on success. */
interface EventsApi {
    @POST("events")
    suspend fun send(
        @Body body: EventsRequestDto,
    ): Response<Unit>
}
