package com.drama.feature.rewards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.CheckInDay
import com.drama.domain.model.CheckInStatus
import com.drama.domain.model.RewardTask
import com.drama.domain.model.RewardTaskStatus
import com.drama.domain.repository.RewardsRepository
import com.drama.domain.repository.WalletRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.drama.core.ui.R as CoreR

data class RewardsUiState(
    val isLoading: Boolean = true,
    val checkIn: CheckInStatus? = null,
    val tasks: List<RewardTask> = emptyList(),
    val isClaimingCheckIn: Boolean = false,
    /** Task id whose claim is in flight. */
    val claimingTaskId: String? = null,
    /** Day just claimed, for the one-shot strip animation; cleared by the UI. */
    val justClaimedDay: Int? = null,
    val balance: Int? = null,
    /** Check-in and tasks routes missing on the server (404/501): the screen says "bientôt". */
    val unavailable: Boolean = false,
    val error: UiText? = null,
    val message: UiText? = null,
) {
    val days: List<CheckInDay> get() = checkIn?.days.orEmpty()
    val canClaimCheckIn: Boolean get() = checkIn?.claimedToday == false && !isClaimingCheckIn
    val claimableTasks: Int get() = tasks.count { it.status == RewardTaskStatus.CLAIMABLE }
}

/** "Récompenses" (S08-A1-02, M-40 / M-41): 7-day check-in strip and rewarded tasks; the server credits. */
@HiltViewModel
class RewardsViewModel
    @Inject
    constructor(
        private val rewards: RewardsRepository,
        private val wallet: WalletRepository,
        private val analytics: AnalyticsTracker,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(RewardsUiState())
        val uiState: StateFlow<RewardsUiState> = uiStateFlow.asStateFlow()

        init {
            viewModelScope.launch {
                wallet.wallet.collect { w -> uiStateFlow.update { it.copy(balance = w?.total ?: it.balance) } }
            }
            viewModelScope.launch { wallet.refresh() }
            load()
        }

        fun refresh() = load()

        /** "Réclamer" of the check-in strip. */
        fun onClaimCheckIn() {
            val status = uiStateFlow.value.checkIn ?: return
            if (status.claimedToday || uiStateFlow.value.isClaimingCheckIn) return
            uiStateFlow.update { it.copy(isClaimingCheckIn = true, message = null) }
            viewModelScope.launch {
                when (val result = rewards.claimCheckIn()) {
                    is AppResult.Success -> {
                        val claim = result.value
                        analytics.track(AnalyticsEvent.CheckIn(claim.day, claim.coins))
                        uiStateFlow.update {
                            it.copy(
                                isClaimingCheckIn = false,
                                justClaimedDay = claim.day,
                                checkIn =
                                    status.copy(
                                        claimedToday = true,
                                        streakDay = claim.day.coerceIn(1, CheckInStatus.WEEK_LENGTH),
                                    ),
                                message = UiText.Plural(R.plurals.rewards_msg_claimed, claim.coins),
                            )
                        }
                        // The server's own view (next claim time, exact streak) replaces the optimistic copy.
                        refreshCheckIn()
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "check-in failed: ${result.error}")
                        val alreadyClaimed = (result.error as? AppError.Http)?.serverCode == CODE_ALREADY_CLAIMED
                        uiStateFlow.update {
                            it.copy(
                                isClaimingCheckIn = false,
                                checkIn = if (alreadyClaimed) status.copy(claimedToday = true) else it.checkIn,
                                message =
                                    if (alreadyClaimed) {
                                        UiText.Res(R.string.rewards_msg_already_claimed)
                                    } else {
                                        result.error.toMessage()
                                    },
                            )
                        }
                        if (alreadyClaimed) refreshCheckIn()
                    }
                }
            }
        }

        /** "Réclamer" of a task (M-41). */
        fun onClaimTask(task: RewardTask) {
            if (!task.isClaimable || uiStateFlow.value.claimingTaskId != null) return
            uiStateFlow.update { it.copy(claimingTaskId = task.id, message = null) }
            viewModelScope.launch {
                when (val result = rewards.claimTask(task.id)) {
                    is AppResult.Success -> {
                        analytics.track(AnalyticsEvent.TaskClaim(task.key, result.value.coins))
                        uiStateFlow.update {
                            it.copy(
                                claimingTaskId = null,
                                tasks =
                                    it.tasks.map { t ->
                                        if (t.id == task.id) t.copy(status = RewardTaskStatus.CLAIMED) else t
                                    },
                                message = UiText.Plural(R.plurals.rewards_msg_claimed, result.value.coins),
                            )
                        }
                        refreshTasks()
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "task claim failed id=${task.id}: ${result.error}")
                        val notClaimable = (result.error as? AppError.Http)?.code == HTTP_CONFLICT
                        uiStateFlow.update {
                            it.copy(
                                claimingTaskId = null,
                                message =
                                    if (notClaimable) {
                                        UiText.Res(R.string.rewards_msg_task_not_claimable)
                                    } else {
                                        result.error.toMessage()
                                    },
                            )
                        }
                        if (notClaimable) refreshTasks()
                    }
                }
            }
        }

        fun onClaimAnimationShown() = uiStateFlow.update { it.copy(justClaimedDay = null) }

        fun onMessageShown() = uiStateFlow.update { it.copy(message = null) }

        private fun load() {
            uiStateFlow.update { it.copy(isLoading = it.checkIn == null, error = null, unavailable = false) }
            viewModelScope.launch {
                val status = rewards.checkInStatus()
                val tasks = rewards.tasks()
                uiStateFlow.update { state ->
                    when (status) {
                        is AppResult.Success ->
                            state.copy(
                                isLoading = false,
                                checkIn = status.value,
                                tasks = (tasks as? AppResult.Success)?.value ?: state.tasks,
                            )
                        is AppResult.Failure -> {
                            logger.w(TAG, "GET /rewards/checkin failed: ${status.error}")
                            state.copy(
                                isLoading = false,
                                unavailable = status.error.isNotImplemented(),
                                error = if (state.checkIn == null) status.error.toMessage() else state.error,
                                message = if (state.checkIn != null) status.error.toMessage() else state.message,
                                tasks = (tasks as? AppResult.Success)?.value ?: state.tasks,
                            )
                        }
                    }
                }
            }
        }

        private fun refreshCheckIn() {
            viewModelScope.launch {
                val status = rewards.checkInStatus()
                if (status is AppResult.Success) uiStateFlow.update { it.copy(checkIn = status.value) }
            }
        }

        private fun refreshTasks() {
            viewModelScope.launch {
                val tasks = rewards.tasks()
                if (tasks is AppResult.Success) uiStateFlow.update { it.copy(tasks = tasks.value) }
            }
        }

        private fun AppError.isNotImplemented(): Boolean =
            this is AppError.NotFound || (this as? AppError.Http)?.code == HTTP_NOT_IMPLEMENTED

        private fun AppError.toMessage(): UiText =
            when (this) {
                is AppError.Network -> UiText.Res(CoreR.string.error_network_short)
                is AppError.Server -> UiText.of(CoreR.string.error_server_short, code)
                is AppError.Unauthenticated -> UiText.Res(CoreR.string.error_session_expired)
                is AppError.NotFound -> UiText.Res(CoreR.string.state_coming_soon)
                is AppError.Http ->
                    if (code == HTTP_NOT_IMPLEMENTED) {
                        UiText.Res(CoreR.string.state_coming_soon)
                    } else {
                        UiText.Res(R.string.rewards_error_load)
                    }
                else -> UiText.Res(R.string.rewards_error_load)
            }

        companion object {
            private const val TAG = "Rewards"
            const val CODE_ALREADY_CLAIMED = "CHECKIN_ALREADY_CLAIMED"
            private const val HTTP_CONFLICT = 409
            private const val HTTP_NOT_IMPLEMENTED = 501
        }
    }
