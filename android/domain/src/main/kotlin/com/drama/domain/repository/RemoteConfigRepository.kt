package com.drama.domain.repository

import com.drama.domain.model.RemoteFlags
import kotlinx.coroutines.flow.Flow

/** Remote Config (M-34): defaults first, remote values once fetched. Implemented in :app over Firebase. */
interface RemoteConfigRepository {
    val flags: Flow<RemoteFlags>

    /** Fetch-and-activate; failures keep the current values. */
    suspend fun refresh()
}
