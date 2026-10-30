package com.drama.app.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.drama.core.common.network.NetworkStatusProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton

/** Metered-network signal for the data saver (M-17): `NET_CAPABILITY_NOT_METERED` absent = metered. */
@Singleton
class ConnectivityNetworkStatus
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : NetworkStatusProvider {
        private val manager: ConnectivityManager? = context.getSystemService(ConnectivityManager::class.java)

        override val isMetered: Flow<Boolean> =
            callbackFlow {
                trySend(currentlyMetered())
                val callback =
                    object : ConnectivityManager.NetworkCallback() {
                        override fun onCapabilitiesChanged(
                            network: Network,
                            capabilities: NetworkCapabilities,
                        ) {
                            trySend(!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))
                        }

                        override fun onLost(network: Network) {
                            trySend(currentlyMetered())
                        }
                    }
                runCatching { manager?.registerNetworkCallback(NetworkRequest.Builder().build(), callback) }
                awaitClose { runCatching { manager?.unregisterNetworkCallback(callback) } }
            }.distinctUntilChanged()

        private fun currentlyMetered(): Boolean {
            val cm = manager ?: return false
            val capabilities = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
            return !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        }
    }
