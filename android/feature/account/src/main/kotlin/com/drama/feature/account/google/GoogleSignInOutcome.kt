package com.drama.feature.account.google

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/** Outcome of the Credential Manager sheet. */
sealed interface GoogleSignInOutcome {
    data class Token(
        val idToken: String,
    ) : GoogleSignInOutcome

    data object Cancelled : GoogleSignInOutcome

    data class Failed(
        val message: String,
    ) : GoogleSignInOutcome
}

/**
 * Google sign-in through Credential Manager (M-51): shows every Google account on the device (no filtering on
 * previously authorised ones) and returns the ID token the backend verifies against `GOOGLE_CLIENT_IDS`.
 * [context] must be an Activity context (the sheet is attached to it).
 */
suspend fun requestGoogleIdToken(
    context: Context,
    webClientId: String,
): GoogleSignInOutcome {
    val option =
        GetGoogleIdOption
            .Builder()
            .setServerClientId(webClientId)
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val startedAt = System.currentTimeMillis()
    return try {
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            GoogleSignInOutcome.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            GoogleSignInOutcome.Failed("Réponse Google inattendue")
        }
    } catch (_: GetCredentialCancellationException) {
        // Play services answers "cancelled" (not NoCredential) when the device has no Google account: nothing was
        // shown, so a cancellation that comes back at once cannot be the viewer's and deserves a message.
        if (System.currentTimeMillis() - startedAt < INSTANT_CANCEL_MS) {
            GoogleSignInOutcome.Failed(NO_ACCOUNT_MESSAGE)
        } else {
            GoogleSignInOutcome.Cancelled
        }
    } catch (_: NoCredentialException) {
        GoogleSignInOutcome.Failed(NO_ACCOUNT_MESSAGE)
    } catch (e: GetCredentialException) {
        GoogleSignInOutcome.Failed("Connexion Google impossible (${e.type.substringAfterLast('.')})")
    } catch (_: GoogleIdTokenParsingException) {
        GoogleSignInOutcome.Failed("Jeton Google illisible")
    }
}

/** A dismissal faster than this never went through the viewer's hands. */
private const val INSTANT_CANCEL_MS = 1_500L
private const val NO_ACCOUNT_MESSAGE = "Aucun compte Google sur cet appareil"
