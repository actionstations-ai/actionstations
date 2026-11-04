package ai.actionstations.player

import java.security.MessageDigest
import java.util.Base64

/** Certificate pin helpers (spec 0446 FR-2). A pin is the base64url SHA-256 of a certificate's DER bytes. */
object Pin {
    const val LENGTH = 32

    fun sha256(der: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(der)

    /** Decodes a 43-character base64url pin to its 32 bytes, or null when malformed. */
    fun decode(text: String): ByteArray? {
        if (text.length != 43) return null
        val bytes = try {
            Base64.getUrlDecoder().decode(text)
        } catch (_: IllegalArgumentException) {
            return null
        }
        return if (bytes.size == LENGTH) bytes else null
    }

    /** True when the certificate's DER encoding hashes to [pin] (constant-time comparison). */
    fun matches(der: ByteArray, pin: ByteArray): Boolean = MessageDigest.isEqual(sha256(der), pin)

    /** `AA:BB:…` uppercase hex, the form the Facilitate page shows. */
    fun fingerprint(bytes: ByteArray): String = bytes.joinToString(":") { "%02X".format(it.toInt() and 0xff) }

    fun fingerprintOf(der: ByteArray): String = fingerprint(sha256(der))
}
