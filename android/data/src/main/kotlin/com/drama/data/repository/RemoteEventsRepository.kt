package com.drama.data.repository

import com.drama.core.common.coroutines.DispatcherProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.EventsApi
import com.drama.core.network.call
import com.drama.core.network.dto.EventDto
import com.drama.core.network.dto.EventsRequestDto
import com.drama.domain.repository.EventsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** `POST /events`, one call per event (the app emits very few server-side events for now). */
@Singleton
class RemoteEventsRepository
    @Inject
    constructor(
        private val api: EventsApi,
        private val errorMapper: ApiErrorMapper,
        private val clock: Clock,
        private val logger: Logger,
        dispatchers: DispatcherProvider,
    ) : EventsRepository {
        private val scope = CoroutineScope(SupervisorJob() + dispatchers.io)

        override fun track(
            name: String,
            params: Map<String, Any?>,
        ) {
            val event =
                EventDto(
                    name = name,
                    params = params.mapNotNull { (k, v) -> v?.let { k to it.toJson() } }.toMap(),
                    at = Instant.ofEpochMilli(clock.nowEpochMs()).toString(),
                )
            scope.launch {
                when (val result = errorMapper.call { api.send(EventsRequestDto(listOf(event))) }) {
                    is AppResult.Success -> logger.i(TAG, "event sent $name ${event.params}")
                    is AppResult.Failure -> logger.w(TAG, "event $name not sent: ${result.error}")
                }
            }
        }

        private fun Any.toJson(): JsonPrimitive =
            when (this) {
                is Boolean -> JsonPrimitive(this)
                is Number -> JsonPrimitive(this)
                else -> JsonPrimitive(toString())
            }

        private companion object {
            const val TAG = "Events"
        }
    }
