package com.drama.core.common.network

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/** Whether the active network is metered (mobile data); implemented in :app over ConnectivityManager (M-17). */
interface NetworkStatusProvider {
    val isMetered: Flow<Boolean>
}

/** Fixed value for tests and the fake catalogue. */
class FixedNetworkStatus(
    metered: Boolean,
) : NetworkStatusProvider {
    val state = MutableStateFlow(metered)
    override val isMetered: Flow<Boolean> = state
}
