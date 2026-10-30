package com.drama.core.common.auth

/**
 * Sign-in configuration injected from the app's BuildConfig (M-51).
 * [googleWebClientId] is the OAuth "Web application" client id the backend verifies ID tokens against
 * (`GOOGLE_CLIENT_IDS`); empty = Google sign-in not configured, the option is shown disabled.
 */
data class AuthConfig(
    val googleWebClientId: String,
) {
    val isGoogleConfigured: Boolean get() = googleWebClientId.isNotBlank()
}
