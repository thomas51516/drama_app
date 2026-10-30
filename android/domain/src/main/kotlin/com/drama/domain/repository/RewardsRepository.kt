package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.CheckInResult
import com.drama.domain.model.CheckInStatus
import com.drama.domain.model.RewardTask
import com.drama.domain.model.TaskClaimResult

/**
 * Daily check-in (M-40) and rewarded tasks (M-41) over the contract v1.5. Every claim carries a client
 * idempotency key; credits are bonus coins the server adds to the ledger, the wallet flow mirrors its answer.
 */
interface RewardsRepository {
    suspend fun checkInStatus(): AppResult<CheckInStatus>

    /** `POST /rewards/checkin`; `409 CHECKIN_ALREADY_CLAIMED` surfaces as `AppError.Http(409, ...)`. */
    suspend fun claimCheckIn(): AppResult<CheckInResult>

    suspend fun tasks(): AppResult<List<RewardTask>>

    /** `POST /rewards/tasks/{id}/claim`; `409 TASK_NOT_CLAIMABLE` surfaces as `AppError.Http(409, ...)`. */
    suspend fun claimTask(taskId: String): AppResult<TaskClaimResult>
}
