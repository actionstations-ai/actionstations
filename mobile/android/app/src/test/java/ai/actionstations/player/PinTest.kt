package ai.actionstations.player

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PinTest {
    private val der = "certificate bytes".toByteArray()

    @Test
    fun matchesTheSha256OfTheDerBytes() {
        assertTrue(Pin.matches(der, Pin.sha256(der)))
    }

    @Test
    fun aDifferentCertificateDoesNotMatch() {
        assertFalse(Pin.matches("other".toByteArray(), Pin.sha256(der)))
    }

    @Test
    fun fingerprintIsUppercaseColonSeparatedHex() {
        assertEquals("00:0F:A0:FF", Pin.fingerprint(byteArrayOf(0x00, 0x0f, 0xa0.toByte(), 0xff.toByte())))
    }

    @Test
    fun sha256OfEmptyInputIsTheKnownDigest() {
        assertEquals(
            "E3:B0:C4:42:98:FC:1C:14:9A:FB:F4:C8:99:6F:B9:24:27:AE:41:E4:64:9B:93:4C:A4:95:99:1B:78:52:B8:55",
            Pin.fingerprintOf(ByteArray(0)),
        )
    }

    @Test
    fun decodeRoundTripsAndRejectsBadInput() {
        val encoded = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(Pin.sha256(der))
        assertArrayEquals(Pin.sha256(der), Pin.decode(encoded))
        assertNull(Pin.decode("short"))
        assertNull(Pin.decode("!".repeat(43)))
    }
}
