package com.drama.feature.rewards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.drama.core.common.analytics.AnalyticsEvent
import com.drama.core.common.analytics.AnalyticsTracker
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.ui.text.UiText
import com.drama.domain.model.CheckInStatus
import com.drama.domain.repository.RewardsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CheckInBannerUiState(
    val status: CheckInStatus? = null,
    val isClaiming: Boolean = false,
    /** Coins just credited, for the "+N" snackbar; cleared by the UI. */
    val claimedCoins: Int? = null,
    val message: UiText? = null,
) {
    /** The banner is drawn only when the server answered: no placeholder on a backend without the route. */
    val visible: Boolean get() = status != null
}

/** Small "Récompense du jour" banner of the home (M-40): today's reward, one-tap claim, link to the screen. */
@HiltViewModel
class CheckInBannerViewModel
    @Inject
    constructor(
        private val rewards: RewardsRepository,
        private val analytics: AnalyticsTracker,
        private val logger: Logger,
    ) : ViewModel() {
        private val uiStateFlow = MutableStateFlow(CheckInBannerUiState())
        val uiState: StateFlow<CheckInBannerUiState> = uiStateFlow.asStateFlow()

        init {
            refresh()
        }

        fun refresh() {
            viewModelScope.launch {
                when (val result = rewards.checkInStatus()) {
                    is AppResult.Success -> uiStateFlow.update { it.copy(status = result.value) }
                    is AppResult.Failure -> logger.w(TAG, "check-in status unavailable: ${result.error}")
                }
            }
        }

        fun onClaim() {
            val status = uiStateFlow.value.status ?: return
            if (status.claimedToday || uiStateFlow.value.isClaiming) return
            uiStateFlow.update { it.copy(isClaiming = true) }
            viewModelScope.launch {
                when (val result = rewards.claimCheckIn()) {
                    is AppResult.Success -> {
                        analytics.track(AnalyticsEvent.CheckIn(result.value.day, result.value.coins))
                        uiStateFlow.update {
                            it.copy(
                                isClaiming = false,
                                claimedCoins = result.value.coins,
                                status = status.copy(claimedToday = true, streakDay = result.value.day),
                            )
                        }
                        refresh()
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "check-in from banner failed: ${result.error}")
                        val already =
                            (result.error as? AppError.Http)?.serverCode == RewardsViewModel.CODE_ALREADY_CLAIMED
                        uiStateFlow.update {
                            it.copy(
                                isClaiming = false,
                                status = if (already) status.copy(claimedToday = true) else it.status,
                                message = if (already) null else UiText.Res(R.string.rewards_error_claim),
                            )
                        }
                    }
                }
            }
        }

        fun onFeedbackShown() = uiStateFlow.update { it.copy(claimedCoins = null, message = null) }

        private companion object {
            const val TAG = "CheckInBanner"
        }
    }
