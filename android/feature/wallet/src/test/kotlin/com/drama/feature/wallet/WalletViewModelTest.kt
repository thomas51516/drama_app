package com.drama.feature.wallet

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.time.Clock
import com.drama.domain.model.BonusExpiry
import com.drama.domain.model.LedgerBucket
import com.drama.domain.model.LedgerEntry
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Wallet
import com.drama.domain.repository.WalletRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WalletViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = FakeWalletRepository()
    private val now = 1_000_000L

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = WalletViewModel(repository, Clock { now }, NoOpLogger)

    @Test
    fun `loads the wallet, flags bonus expiring within seven days and the first page of history`() =
        runTest(dispatcher) {
            repository.walletValue =
                Wallet(
                    purchased = 100,
                    bonus = 30,
                    total = 130,
                    autoUnlock = false,
                    bonusExpiring =
                        listOf(
                            BonusExpiry(10, now + 2 * DAY_MS),
                            BonusExpiry(5, now + 6 * DAY_MS),
                            BonusExpiry(15, now + 30 * DAY_MS),
                        ),
                )
            repository.pages = (1..45).map { entry(it) }
            val vm = viewModel()
            advanceUntilIdle()

            val state = vm.uiState.value
            assertFalse(state.isLoading)
            assertEquals(130, state.wallet?.total)
            assertEquals(BonusExpiry(15, now + 2 * DAY_MS), state.bonusExpiringSoon)
            assertEquals(20, state.entries.size)
            assertTrue(state.hasMore)
            assertEquals(listOf(1 to 20), repository.pageRequests)
        }

    @Test
    fun `load more appends the next page until the server has no more`() =
        runTest(dispatcher) {
            repository.pages = (1..45).map { entry(it) }
            val vm = viewModel()
            advanceUntilIdle()

            vm.loadMore()
            advanceUntilIdle()
            assertEquals(40, vm.uiState.value.entries.size)
            assertTrue(vm.uiState.value.hasMore)

            vm.loadMore()
            advanceUntilIdle()
            assertEquals(45, vm.uiState.value.entries.size)
            assertFalse(vm.uiState.value.hasMore)
            assertEquals(listOf(1 to 20, 2 to 20, 3 to 20), repository.pageRequests)

            vm.loadMore() // nothing more: no request
            advanceUntilIdle()
            assertEquals(3, repository.pageRequests.size)
        }

    @Test
    fun `wallet failure shows the error screen, history failure only a notice`() =
        runTest(dispatcher) {
            repository.refreshFailure = AppError.Network()
            val vm = viewModel()
            advanceUntilIdle()
            assertTrue(vm.uiState.value.showError)
            assertNull(vm.uiState.value.wallet)

            repository.refreshFailure = null
            repository.pageFailure = AppError.Server(503)
            vm.refresh()
            advanceUntilIdle()
            assertFalse(vm.uiState.value.showError)
            assertNotNull(vm.uiState.value.wallet)
            assertNotNull(vm.uiState.value.message)
        }

    @Test
    fun `auto-unlock switch is optimistic and rolled back on failure`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()
            vm.onAutoUnlockChanged(true)
            advanceUntilIdle()
            assertEquals(
                true,
                vm.uiState.value.wallet
                    ?.autoUnlock,
            )

            repository.autoUnlockFailure = AppError.Network()
            vm.onAutoUnlockChanged(false)
            advanceUntilIdle()
            assertEquals(
                true,
                vm.uiState.value.wallet
                    ?.autoUnlock,
            )
            assertNotNull(vm.uiState.value.message)
        }

    private fun entry(i: Int) =
        LedgerEntry(
            id = "l$i",
            amount = if (i % 2 == 0) 10 else -5,
            bucket = LedgerBucket.PURCHASED,
            type = if (i % 2 == 0) LedgerType.PURCHASE else LedgerType.UNLOCK,
            reference = null,
            description = null,
            expiresAtEpochMs = null,
            createdAtEpochMs = now - i,
        )

    private class FakeWalletRepository : WalletRepository {
        val state = MutableStateFlow<Wallet?>(null)
        var walletValue = Wallet(purchased = 10, bonus = 0, total = 10, autoUnlock = false)
        var refreshFailure: AppError? = null
        var pageFailure: AppError? = null
        var autoUnlockFailure: AppError? = null
        var pages: List<LedgerEntry> = emptyList()
        val pageRequests = mutableListOf<Pair<Int, Int>>()
        override val wallet: Flow<Wallet?> = state

        override suspend fun refresh(): AppResult<Wallet> {
            refreshFailure?.let { return AppResult.Failure(it) }
            state.value = walletValue
            return AppResult.Success(walletValue)
        }

        override suspend fun transactions(
            page: Int,
            pageSize: Int,
            type: LedgerType?,
        ): AppResult<LedgerPage> {
            pageRequests += page to pageSize
            pageFailure?.let { return AppResult.Failure(it) }
            val items = pages.drop((page - 1) * pageSize).take(pageSize)
            return AppResult.Success(LedgerPage(items, pages.size, page, pageSize))
        }

        override suspend fun setAutoUnlock(enabled: Boolean): AppResult<Unit> {
            autoUnlockFailure?.let { return AppResult.Failure(it) }
            state.value = (state.value ?: walletValue).copy(autoUnlock = enabled)
            return AppResult.Success(Unit)
        }
    }

    private companion object {
        const val DAY_MS = 24L * 60 * 60 * 1_000
    }
}
