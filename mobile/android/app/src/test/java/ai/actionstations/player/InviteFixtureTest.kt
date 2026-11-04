package ai.actionstations.player

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs every shared vector in mobile/fixtures/invites.json (the same file iOS and Vitest read). */
class InviteFixtureTest {
    private val vectors = JSONObject(File(System.getProperty("invites.fixture")!!).readText())
        .getJSONArray("vectors")

    private fun forEachVector(block: (name: String, v: JSONObject) -> Unit) {
        assertTrue("fixture has vectors", vectors.length() > 10)
        for (i in 0 until vectors.length()) {
            val v = vectors.getJSONObject(i)
            block(v.getString("name"), v)
        }
    }

    @Test
    fun appAcceptsExactlyTheLinksTheFixtureSays() = forEachVector { name, v ->
        assertEquals(name, v.getBoolean("appAccepts"), Invite.parse(v.getString("url")) != null)
    }

    @Test
    fun acceptedInvitesCarryTheFixturesHostAndPin() = forEachVector { name, v ->
        if (!v.getBoolean("appAccepts")) return@forEachVector
        val invite = Invite.parse(v.getString("url"))!!
        assertEquals(name, v.getString("host"), invite.host)
        if (v.has("pin")) {
            assertEquals(name, v.getString("pin"), Pin.fingerprint(invite.pin!!))
        } else {
            assertNull(name, invite.pin)
        }
    }

    @Test
    fun loadUrlDropsThePinAndStaysOnTheSessionOrigin() = forEachVector { name, v ->
        if (!v.getBoolean("appAccepts")) return@forEachVector
        val invite = Invite.parse(v.getString("url"))!!
        assertTrue(name, !invite.loadUrl.contains('~'))
        assertTrue(name, v.getString("url").startsWith(invite.loadUrl))
        assertTrue(name, OriginPolicy(invite).allows(invite.loadUrl))
    }

    @Test
    fun theInviteNeverPrintsItsKeys() {
        val invite = Invite.parse(vectors.getJSONObject(0).getString("url"))!!
        assertEquals("Invite(host=192.168.4.20)", invite.toString())
    }
}
