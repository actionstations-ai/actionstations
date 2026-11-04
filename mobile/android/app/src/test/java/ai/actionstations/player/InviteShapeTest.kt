package ai.actionstations.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class InviteShapeTest {
    private val key = "A".repeat(220)
    private val id = "AbCdEfGhIjKlMnOpQrStUv"
    private val pin = "A".repeat(43)

    @Test
    fun surroundingWhitespaceFromPasteIsIgnored() {
        assertNotNull(Invite.parse("  https://h.example/s/$id#$key\n"))
    }

    @Test
    fun roleHintAndPinAreBothAllowed() {
        val invite = Invite.parse("https://10.0.0.1:8485/s/$id#$key.ops-director~$pin")!!
        assertEquals("https://10.0.0.1:8485/s/$id#$key.ops-director", invite.loadUrl)
    }

    @Test
    fun refusesCredentialsInTheAuthority() {
        assertNull(Invite.parse("https://user@h.example/s/$id#$key"))
    }

    @Test
    fun refusesKeyOfTheWrongLength() {
        assertNull(Invite.parse("https://h.example/s/$id#${key}A"))
        assertNull(Invite.parse("https://h.example/s/$id#${key.dropLast(1)}"))
    }

    @Test
    fun refusesPortOutOfRange() {
        assertNull(Invite.parse("https://h.example:99999/s/$id#$key"))
    }

    @Test
    fun ipv6LoopbackMayUseHttp() {
        val invite = Invite.parse("http://[::1]:8485/s/$id#$key")!!
        assertEquals("http://[::1]:8485", invite.origin)
    }
}
