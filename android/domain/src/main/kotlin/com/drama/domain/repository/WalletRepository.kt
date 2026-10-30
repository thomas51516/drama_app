package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Wallet
import kotlinx.coroutines.flow.Flow

/** Coin balance and ledger (M-32). The server is the source of truth: the flow only mirrors its last answer. */
interface WalletRepository {
    /** Last wallet received (from `GET /wallet`, an unlock or a purchase); null before the first fetch. */
    val wallet: Flow<Wallet?>

    suspend fun refresh(): AppResult<Wallet>

    suspend fun transactions(
        page: Int,
        pageSize: Int = DEFAULT_PAGE_SIZE,
        type: LedgerType? = null,
    ): AppResult<LedgerPage>

    /** `PATCH /me { autoUnlock }` (M-21); the wallet flow reflects the new value on success. */
    suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit>

    companion object {
        const val DEFAULT_PAGE_SIZE = 20
    }
}
