package com.drama.core.database.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypts the session tokens at rest. Output is an opaque string stored in Preferences DataStore. */
interface TokenCipher {
    fun encrypt(plainText: String): String

    /** Null when the value cannot be decrypted (key rotated or invalidated): the session is then dropped. */
    fun decrypt(cipherText: String): String?
}

/** Tests and previews: identity. */
object PlainTokenCipher : TokenCipher {
    override fun encrypt(plainText: String): String = plainText

    override fun decrypt(cipherText: String): String = cipherText
}

/**
 * AES-256-GCM with a key generated inside the Android Keystore (hardware-backed where available).
 * Chosen over `androidx.security:security-crypto` (deprecated) and Tink (heavier dependency): ~60 lines,
 * no extra artifact. Format: `v1:` + base64(iv[12] || ciphertext || tag).
 * Trade-off: a Keystore key invalidated by the system (factory reset, some OS updates) makes the stored
 * tokens unreadable; the app then silently creates a new guest session.
 */
class AndroidKeystoreTokenCipher(
    private val alias: String = DEFAULT_ALIAS,
) : TokenCipher {
    override fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        val payload = cipher.iv + bytes
        return PREFIX + Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    override fun decrypt(cipherText: String): String? {
        if (!cipherText.startsWith(PREFIX)) return null
        return try {
            val payload = Base64.decode(cipherText.removePrefix(PREFIX), Base64.NO_WRAP)
            if (payload.size <= IV_LENGTH) return null
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(TAG_LENGTH_BITS, payload, 0, IV_LENGTH)
            cipher.init(Cipher.DECRYPT_MODE, key(), spec)
            String(cipher.doFinal(payload, IV_LENGTH, payload.size - IV_LENGTH), Charsets.UTF_8)
        } catch (_: GeneralSecurityException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    @Synchronized
    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec
                .Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_SIZE_BITS)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        const val DEFAULT_ALIAS = "drama_session_v1"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PREFIX = "v1:"
        private const val IV_LENGTH = 12
        private const val TAG_LENGTH_BITS = 128
        private const val KEY_SIZE_BITS = 256
    }
}
