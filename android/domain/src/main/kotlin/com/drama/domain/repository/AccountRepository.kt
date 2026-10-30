package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.AccountDeletion
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.SignInResult
import com.drama.domain.model.UserProfile
import kotlinx.coroutines.flow.Flow

/**
 * Sign-in (M-51), guest linking (M-50) and profile (M-52) over the public contract v1.2.
 * Every sign-in call carries the current guest bearer so the server converts or merges the guest account;
 * on success the returned tokens replace the session and local history/progress are kept.
 */
interface AccountRepository {
    /** Last profile fetched (or received with a sign-in); null for a guest or before the first fetch. */
    val profile: Flow<UserProfile?>

    suspend fun refreshProfile(): AppResult<UserProfile>

    suspend fun signInWithGoogle(idToken: String): AppResult<SignInResult>

    /** [phone] in E.164. */
    suspend fun requestOtp(phone: String): AppResult<OtpChallenge>

    suspend fun verifyOtp(
        requestId: String,
        code: String,
    ): AppResult<SignInResult>

    suspend fun registerWithEmail(
        email: String,
        password: String,
    ): AppResult<SignInResult>

    suspend fun signInWithEmail(
        email: String,
        password: String,
    ): AppResult<SignInResult>

    /** `PATCH /me`; absent fields are left untouched. Works for guests too (language, notifications). */
    suspend fun updateProfile(
        displayName: String? = null,
        language: String? = null,
        country: String? = null,
        notificationPreferences: NotificationPreferences? = null,
    ): AppResult<UserProfile>

    /** `POST /auth/logout` (best effort), wipes the local account data and opens a new guest session. */
    suspend fun logout(): AppResult<Unit>

    /** `DELETE /me` (30-day deferred deletion), then a new guest session. */
    suspend fun deleteAccount(): AppResult<AccountDeletion>
}
