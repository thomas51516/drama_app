package com.drama.domain.model

/** `GET /rewards/checkin` (contract v1.5, M-40): the 7-day scale and where the viewer stands in it. */
data class CheckInStatus(
    /** Coins granted for day 1..7. */
    val scale: List<Int>,
    /** Consecutive days already claimed (0..7); the claim of today counts once done. */
    val streakDay: Int,
    val claimedToday: Boolean,
    val nextClaimAtEpochMs: Long?,
    /** True when a missed day resets the streak to day 1. */
    val resetOnMiss: Boolean,
) {
    val days: List<CheckInDay> get() = CheckInRules.days(this)

    /** Coins the next claim grants (today's when not claimed yet, else tomorrow's). */
    val nextCoins: Int get() = CheckInRules.nextCoins(this)

    companion object {
        const val WEEK_LENGTH = 7
    }
}

enum class CheckInDayState {
    CLAIMED,

    /** Today, still claimable. */
    TODAY,

    /** Today, already claimed (the strip highlights it with a check). */
    CLAIMED_TODAY,
    UPCOMING,
}

data class CheckInDay(
    /** 1-based day of the streak. */
    val day: Int,
    val coins: Int,
    val state: CheckInDayState,
)

/** `POST /rewards/checkin` answer. */
data class CheckInResult(
    val day: Int,
    val coins: Int,
    val wallet: Wallet?,
)

/** Pure decisions of the check-in strip, shared by the view model and its tests. */
object CheckInRules {
    /** Day whose reward the next claim grants: after a full week the streak starts again at day 1. */
    fun nextDay(status: CheckInStatus): Int = status.streakDay % CheckInStatus.WEEK_LENGTH + 1

    /** The day today's claim refers to: [CheckInStatus.streakDay] once claimed, the next day otherwise. */
    fun todayDay(status: CheckInStatus): Int =
        if (status.claimedToday) status.streakDay.coerceIn(1, CheckInStatus.WEEK_LENGTH) else nextDay(status)

    fun nextCoins(status: CheckInStatus): Int = coinsFor(status.scale, nextDay(status))

    fun days(status: CheckInStatus): List<CheckInDay> {
        val today = todayDay(status)
        return (1..CheckInStatus.WEEK_LENGTH).map { day ->
            val state =
                when {
                    day == today && status.claimedToday -> CheckInDayState.CLAIMED_TODAY
                    day == today -> CheckInDayState.TODAY
                    day < today -> CheckInDayState.CLAIMED
                    else -> CheckInDayState.UPCOMING
                }
            CheckInDay(day = day, coins = coinsFor(status.scale, day), state = state)
        }
    }

    private fun coinsFor(
        scale: List<Int>,
        day: Int,
    ): Int = scale.getOrNull(day - 1) ?: scale.lastOrNull() ?: 0
}

/** `RewardTask.status` (M-41); [UNKNOWN] keeps forward compatibility. */
enum class RewardTaskStatus {
    AVAILABLE,
    CLAIMABLE,
    CLAIMED,
    LOCKED,
    UNKNOWN,
    ;

    companion object {
        fun from(raw: String?): RewardTaskStatus =
            entries.firstOrNull { it.name.equals(raw, ignoreCase = true) } ?: UNKNOWN
    }
}

/** One rewarded task of `GET /rewards/tasks`; [title] and [description] are already localised by the server. */
data class RewardTask(
    val id: String,
    val key: String,
    val title: String,
    val description: String?,
    val coins: Int,
    val target: Int,
    val progress: Int,
    val status: RewardTaskStatus,
    val expiresAtEpochMs: Long?,
) {
    /** 0..1 completion for the progress bar. */
    val fraction: Float
        get() =
            when {
                target > 0 -> (progress.toFloat() / target).coerceIn(0f, 1f)
                status == RewardTaskStatus.CLAIMED -> 1f
                else -> 0f
            }
    val isClaimable: Boolean get() = status == RewardTaskStatus.CLAIMABLE
}

/** `POST /rewards/tasks/{id}/claim` answer. */
data class TaskClaimResult(
    val coins: Int,
    val wallet: Wallet?,
)
