package com.drama.data.wallet

import com.drama.domain.model.Wallet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * In-memory mirror of the last `Wallet` the server sent. Shared by the wallet, unlock, shop and playback
 * repositories so every answer carrying a wallet updates the single flow the UI observes. Never computed locally.
 */
@Singleton
class WalletStore
    @Inject
    constructor() {
        private val walletFlow = MutableStateFlow<Wallet?>(null)
        val wallet: StateFlow<Wallet?> = walletFlow.asStateFlow()

        fun publish(wallet: Wallet) {
            walletFlow.value = wallet
        }

        fun clear() {
            walletFlow.value = null
        }
    }
