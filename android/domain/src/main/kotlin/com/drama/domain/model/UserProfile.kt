package com.drama.domain.model

/** Identity providers linked to an account (M-51). */
enum class AuthProvider(
    val wireName: String,
) {
    GOOGLE("google"),
    PHONE("phone"),
    EMAIL("email"),
    ;

    companion object {
        fun from(raw: String): AuthProvider? = entries.firstOrNull { it.wireName.equals(raw, ignoreCase = true) }
    }
}

/** `UserDto` of the public contract v1.2 (`GET /me`, `AuthSession.user`). */
data class UserProfile(
    val id: String,
    val isGuest: Boolean,
    val displayName: String?,
    val email: String?,
    val phone: String?,
    val country: String?,
    val language: String?,
    val isVip: Boolean,
    val vipExpiresAtEpochMs: Long?,
    val providers: List<AuthProvider>,
    val createdAtEpochMs: Long?,
    /** Set when the account is in its 30-day deletion window. */
    val deletionScheduledAtEpochMs: Long? = null,
) {
    /** What the profile card shows as a name: display name, else e-mail, else phone, else a generic label. */
    val label: String get() = displayName?.takeIf { it.isNotBlank() } ?: email ?: phone ?: "Mon compte"
}

/** Outcome of a successful sign-in; [linked] is true when the guest account was converted or merged (M-50). */
data class SignInResult(
    val user: UserProfile,
    val linked: Boolean,
)

/** `POST /auth/otp/request` answer: the challenge to verify, its lifetime and the resend cool-down. */
data class OtpChallenge(
    val requestId: String,
    val expiresInSeconds: Int,
    val resendAfterSeconds: Int,
)

/** `DELETE /me`: the account is disabled now and purged at [scheduledForEpochMs]. */
data class AccountDeletion(
    val scheduledForEpochMs: Long?,
)

/** "J'aime" state of a series (M-16). */
data class LikeState(
    val likes: Int,
    val liked: Boolean,
)
