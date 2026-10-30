package com.drama.feature.notifications

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.AppNotification
import com.drama.domain.model.NotificationPage
import com.drama.domain.model.NotificationRouting
import com.drama.domain.model.NotificationTarget
import com.drama.domain.repository.NotificationsRepository
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
import com.drama.core.ui.R as CoreR

@OptIn(ExperimentalCoroutinesApi::class)
class NotificationsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = FakeNotificationsRepository()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = NotificationsViewModel(repository = repository, logger = NoOpLogger)

    @Test
    fun `first page loads at start and the unread count is derived`() =
        runTest(dispatcher) {
            repository.pages[1] = page(listOf(unread("n1"), read("n2"), unread("n3")), page = 1, hasMore = false)
            val viewModel = viewModel()
            assertTrue(viewModel.uiState.value.isLoading)
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertFalse(state.isLoading)
            assertEquals(listOf("n1", "n2", "n3"), state.items.map { it.id })
            assertEquals(2, state.unreadCount)
            assertFalse(state.hasMore)
            assertFalse(state.showEmpty)
            assertNull(state.error)
            assertEquals(listOf(1), repository.requestedPages)
        }

    @Test
    fun `load more appends without duplicates and stops when hasMore is false`() =
        runTest(dispatcher) {
            repository.pages[1] = page(listOf(unread("n1"), unread("n2")), page = 1, hasMore = true)
            // The server shifted by one between the two calls: n2 comes back again on page 2.
            repository.pages[2] = page(listOf(unread("n2"), unread("n3")), page = 2, hasMore = false)
            val viewModel = viewModel()
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.hasMore)

            viewModel.loadMore()
            assertTrue(viewModel.uiState.value.isLoadingMore)
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertEquals(listOf("n1", "n2", "n3"), state.items.map { it.id })
            assertFalse(state.isLoadingMore)
            assertFalse(state.hasMore)

            viewModel.loadMore()
            advanceUntilIdle()
            assertEquals(listOf(1, 2), repository.requestedPages)
        }

    @Test
    fun `click marks read optimistically, calls markRead and exposes the episode target`() =
        runTest(dispatcher) {
            val episode =
                unread("n1").copy(
                    type = NotificationRouting.TYPE_NEW_EPISODE,
                    data = mapOf("seriesId" to "s1", "episodeId" to "e7"),
                )
            repository.pages[1] = page(listOf(episode), page = 1, hasMore = false)
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onNotificationClicked(
                viewModel.uiState.value.items
                    .first(),
            )
            // Optimistic: read before the server answered.
            assertTrue(
                viewModel.uiState.value.items
                    .first()
                    .isRead,
            )
            assertEquals(0, viewModel.uiState.value.unreadCount)
            assertEquals(NotificationTarget.Episode("s1", "e7"), viewModel.pendingTarget.value)
            advanceUntilIdle()
            assertEquals(listOf("n1"), repository.markedRead)

            viewModel.onTargetConsumed()
            assertNull(viewModel.pendingTarget.value)
        }

    @Test
    fun `support reply routes to help and a failed markRead is not rolled back`() =
        runTest(dispatcher) {
            val reply = unread("n9").copy(type = NotificationRouting.TYPE_SUPPORT_REPLY, data = emptyMap())
            repository.pages[1] = page(listOf(reply), page = 1, hasMore = false)
            repository.markReadError = AppError.Server(503)
            val viewModel = viewModel()
            advanceUntilIdle()

            viewModel.onNotificationClicked(reply)
            advanceUntilIdle()
            assertEquals(NotificationTarget.Help, viewModel.pendingTarget.value)
            assertEquals(listOf("n9"), repository.markedRead)
            assertTrue(
                viewModel.uiState.value.items
                    .single()
                    .isRead,
            )

            // Already read: no second server call, target still emitted.
            viewModel.onTargetConsumed()
            viewModel.onNotificationClicked(
                viewModel.uiState.value.items
                    .single(),
            )
            advanceUntilIdle()
            assertEquals(1, repository.markedRead.size)
            assertEquals(NotificationTarget.Help, viewModel.pendingTarget.value)
        }

    @Test
    fun `an invalidation reloads the first page, the initial emission does not`() =
        runTest(dispatcher) {
            repository.pages[1] = page(listOf(unread("n1")), page = 1, hasMore = false)
            val viewModel = viewModel()
            advanceUntilIdle()
            assertEquals(listOf(1), repository.requestedPages)

            repository.pages[1] = page(listOf(unread("n0"), unread("n1")), page = 1, hasMore = false)
            repository.invalidate()
            advanceUntilIdle()
            assertEquals(listOf(1, 1), repository.requestedPages)
            assertEquals(
                listOf("n0", "n1"),
                viewModel.uiState.value.items
                    .map { it.id },
            )
            assertEquals(2, viewModel.uiState.value.unreadCount)
        }

    @Test
    fun `network error gives isOffline and retry recovers`() =
        runTest(dispatcher) {
            repository.failNextWith = AppError.Network()
            val viewModel = viewModel()
            advanceUntilIdle()
            val failed = viewModel.uiState.value
            assertTrue(failed.isOffline)
            assertEquals(UiText.Res(CoreR.string.error_network), failed.error)
            assertFalse(failed.isLoading)
            assertFalse(failed.showEmpty)

            repository.pages[1] = page(listOf(unread("n1")), page = 1, hasMore = false)
            viewModel.retry()
            assertTrue(viewModel.uiState.value.isLoading)
            assertNull(viewModel.uiState.value.error)
            advanceUntilIdle()
            val recovered = viewModel.uiState.value
            assertFalse(recovered.isOffline)
            assertNull(recovered.error)
            assertEquals(listOf("n1"), recovered.items.map { it.id })
        }

    @Test
    fun `404 gives an empty list with the coming soon hint and no error`() =
        runTest(dispatcher) {
            repository.failNextWith = AppError.NotFound("NOT_FOUND")
            val viewModel = viewModel()
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertNull(state.error)
            assertFalse(state.isOffline)
            assertTrue(state.items.isEmpty())
            assertTrue(state.showEmpty)
            assertTrue(state.isComingSoon)
            assertFalse(state.hasMore)
        }

    @Test
    fun `501 is also treated as not available yet`() =
        runTest(dispatcher) {
            repository.failNextWith = AppError.Server(501)
            val viewModel = viewModel()
            advanceUntilIdle()
            assertNull(viewModel.uiState.value.error)
            assertTrue(viewModel.uiState.value.isComingSoon)
            assertTrue(viewModel.uiState.value.showEmpty)
        }

    @Test
    fun `server error while refreshing keeps the current items`() =
        runTest(dispatcher) {
            repository.pages[1] = page(listOf(unread("n1")), page = 1, hasMore = false)
            val viewModel = viewModel()
            advanceUntilIdle()
            repository.failNextWith = AppError.Server(500)
            viewModel.refresh()
            assertTrue(viewModel.uiState.value.isRefreshing)
            advanceUntilIdle()
            val state = viewModel.uiState.value
            assertFalse(state.isRefreshing)
            assertNull(state.error)
            assertNotNull(state.items.singleOrNull { it.id == "n1" })
        }

    private fun page(
        items: List<AppNotification>,
        page: Int,
        hasMore: Boolean,
    ) = NotificationPage(items = items, total = items.size, page = page, hasMore = hasMore)

    private fun unread(id: String) =
        AppNotification(
            id = id,
            type = NotificationRouting.TYPE_OFFER,
            title = "Title $id",
            body = "Body $id",
            data = emptyMap(),
            sentAtEpochMs = 1_700_000_000_000L,
            readAtEpochMs = null,
        )

    private fun read(id: String) = unread(id).copy(readAtEpochMs = 1_700_000_100_000L)

    private class FakeNotificationsRepository : NotificationsRepository {
        val pages = mutableMapOf<Int, NotificationPage>()
        val requestedPages = mutableListOf<Int>()
        val markedRead = mutableListOf<String>()
        var failNextWith: AppError? = null
        var markReadError: AppError? = null
        private val invalidationFlow = MutableStateFlow(0L)
        override val invalidations: Flow<Long> = invalidationFlow

        override suspend fun getPage(
            page: Int,
            pageSize: Int,
        ): AppResult<NotificationPage> {
            requestedPages += page
            failNextWith?.let { error ->
                failNextWith = null
                return AppResult.Failure(error)
            }
            val result = pages[page] ?: NotificationPage(emptyList(), total = 0, page = page, hasMore = false)
            return AppResult.Success(result)
        }

        override suspend fun markRead(id: String): AppResult<Unit> {
            markedRead += id
            return markReadError?.let { AppResult.Failure(it) } ?: AppResult.Success(Unit)
        }

        override fun invalidate() {
            invalidationFlow.value = invalidationFlow.value + 1
        }
    }
}
