package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.AccountAuthApi
import com.drama.core.network.api.UserApi
import com.drama.core.network.auth.DeviceIdProvider
import com.drama.core.network.auth.SessionManager
import com.drama.core.network.call
import com.drama.core.network.dto.AuthResponseDto
import com.drama.core.network.dto.EmailAuthRequestDto
import com.drama.core.network.dto.GoogleAuthRequestDto
import com.drama.core.network.dto.LogoutRequestDto
import com.drama.core.network.dto.OtpRequestDto
import com.drama.core.network.dto.OtpVerifyRequestDto
import com.drama.core.network.dto.UpdateMeRequestDto
import com.drama.data.local.CatalogLocalDataSource
import com.drama.data.mapper.parseInstantMs
import com.drama.data.mapper.toDomain
import com.drama.data.mapper.toDto
import com.drama.domain.model.AccountDeletion
import com.drama.domain.model.NotificationPreferences
import com.drama.domain.model.OtpChallenge
import com.drama.domain.model.SignInResult
import com.drama.domain.model.UserProfile
import com.drama.domain.repository.AccountRepository
import com.drama.domain.repository.FavoritesRepository
import com.drama.domain.repository.PushRepository
import com.drama.domain.repository.SessionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sign-in, linking and profile (S05-A2-01, S05-A2-02). Every sign-in goes through the link client (guest
 * bearer attached) and, on success, [SessionManager.adopt] swaps the tokens in place: the local history and
 * progress stay, which is what "Compte rattaché, votre historique est conservé" promises.
 */
@Singleton
class DefaultAccountRepository
    @Inject
    constructor(
        private val authApi: AccountAuthApi,
        private val userApi: UserApi,
        private val sessionManager: SessionManager,
        private val sessionRepository: SessionRepository,
        private val favorites: FavoritesRepository,
        private val push: PushRepository,
        private val catalogLocal: CatalogLocalDataSource,
        private val deviceIdProvider: DeviceIdProvider,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : AccountRepository {
        private val profileFlow = MutableStateFlow<UserProfile?>(null)
        override val profile: Flow<UserProfile?> = profileFlow.asStateFlow()

        override suspend fun refreshProfile(): AppResult<UserProfile> =
            errorMapper
                .call { userApi.me() }
                .map { it.toDomain() }
                .also { result -> if (result is AppResult.Success) profileFlow.value = result.value }

        override suspend fun signInWithGoogle(idToken: String): AppResult<SignInResult> =
            signIn { authApi.google(GoogleAuthRequestDto(idToken = idToken, deviceId = deviceIdProvider.deviceId())) }

        override suspend fun requestOtp(phone: String): AppResult<OtpChallenge> =
            when (val result = errorMapper.call { authApi.otpRequest(OtpRequestDto(phone)) }) {
                is AppResult.Failure -> result
                is AppResult.Success -> {
                    val id = result.value.id
                    if (id.isNullOrBlank()) {
                        AppResult.Failure(AppError.Unknown(IllegalStateException("otp request without id")))
                    } else {
                        AppResult.Success(OtpChallenge(id, result.value.expiresIn, result.value.resendAfterS))
                    }
                }
            }

        /** Contract v1.2 names the field `requestId`; a server still on the v1 stub only accepts `challengeId`. */
        override suspend fun verifyOtp(
            requestId: String,
            code: String,
        ): AppResult<SignInResult> {
            val deviceId = deviceIdProvider.deviceId()
            val first =
                signIn {
                    authApi.otpVerify(
                        OtpVerifyRequestDto(code = code, deviceId = deviceId, requestId = requestId),
                    )
                }
            val validationError = (first as? AppResult.Failure)?.error as? AppError.Http
            if (validationError?.code != HTTP_BAD_REQUEST) return first
            return signIn {
                authApi.otpVerify(
                    OtpVerifyRequestDto(code = code, deviceId = deviceId, challengeId = requestId),
                )
            }
        }

        override suspend fun registerWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> =
            signIn { authApi.emailRegister(EmailAuthRequestDto(email.trim(), password, deviceIdProvider.deviceId())) }

        override suspend fun signInWithEmail(
            email: String,
            password: String,
        ): AppResult<SignInResult> =
            signIn { authApi.emailLogin(EmailAuthRequestDto(email.trim(), password, deviceIdProvider.deviceId())) }

        override suspend fun updateProfile(
            displayName: String?,
            language: String?,
            country: String?,
            notificationPreferences: NotificationPreferences?,
        ): AppResult<UserProfile> =
            errorMapper
                .call {
                    userApi.updateMe(
                        UpdateMeRequestDto(displayName?.trim(), language, country, notificationPreferences?.toDto()),
                    )
                }.map { it.toDomain() }
                .also { result ->
                    if (result is AppResult.Success) profileFlow.value = result.value
                    // Home rows and series are localised server-side: drop the cache so the next read uses the
                    // new Accept-Language (the per-app locale is applied by the caller).
                    if (language != null) catalogLocal.clear()
                }

        override suspend fun logout(): AppResult<Unit> {
            // While the leaving user's bearer is still valid: the device must stop receiving their pushes (M-54).
            push.unregister()
            sessionManager.currentRefreshToken()?.let { refreshToken ->
                try {
                    authApi.logout(LogoutRequestDto(refreshToken))
                } catch (e: CancellationException) {
                    throw e
                } catch (
                    @Suppress("TooGenericExceptionCaught") e: Exception,
                ) {
                    logger.w(TAG, "POST /auth/logout failed (ignored): ${errorMapper.map(e)}")
                }
            }
            return resetToGuest()
        }

        override suspend fun deleteAccount(): AppResult<AccountDeletion> =
            when (val result = errorMapper.call { userApi.deleteMe() }) {
                is AppResult.Failure -> result
                is AppResult.Success -> {
                    push.unregister()
                    val deletion = AccountDeletion(parseInstantMs(result.value.scheduledIso))
                    when (val reset = resetToGuest()) {
                        is AppResult.Failure -> reset
                        is AppResult.Success -> AppResult.Success(deletion)
                    }
                }
            }

        /** Wipes tokens, local progress/history/cache and favorites, then opens a fresh guest session. */
        private suspend fun resetToGuest(): AppResult<Unit> {
            sessionRepository.logout()
            favorites.clear()
            profileFlow.value = null
            return when (val guest = sessionRepository.ensureSession()) {
                is AppResult.Success -> AppResult.Success(Unit)
                is AppResult.Failure -> guest
            }
        }

        private suspend fun signIn(call: suspend () -> AuthResponseDto): AppResult<SignInResult> =
            when (val result = errorMapper.call(call)) {
                is AppResult.Failure -> result
                is AppResult.Success -> {
                    val dto = result.value
                    val adopted = sessionManager.adopt(dto)
                    if (adopted == null) {
                        AppResult.Failure(AppError.Unknown(IllegalStateException("sign-in answer without tokens")))
                    } else {
                        val user = dto.user.toDomain()
                        profileFlow.value = user
                        logger.i(TAG, "signed in user=${user.id} linked=${dto.linked} providers=${user.providers}")
                        AppResult.Success(SignInResult(user, dto.linked))
                    }
                }
            }

        private companion object {
            const val TAG = "Account"
            const val HTTP_BAD_REQUEST = 400
        }
    }
