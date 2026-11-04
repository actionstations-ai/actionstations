package ai.actionstations.player

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OriginPolicyTest {
    private val key = "A".repeat(220)
    private fun invite(base: String) = Invite.parse("$base/s/AbCdEfGhIjKlMnOpQrStUv#$key")!!

    @Test
    fun staysOnTheSessionOrigin() {
        val policy = OriginPolicy(invite("https://192.168.4.20:8485"))
        assertTrue(policy.allows("https://192.168.4.20:8485/s/x"))
        assertTrue(policy.allows("https://192.168.4.20:8485/assets/app.js"))
    }

    @Test
    fun otherHostPortOrSchemeLeavesTheWebView() {
        val policy = OriginPolicy(invite("https://192.168.4.20:8485"))
        assertFalse(policy.allows("https://192.168.4.21:8485/"))
        assertFalse(policy.allows("https://192.168.4.20:9000/"))
        assertFalse(policy.allows("http://192.168.4.20:8485/"))
        assertFalse(policy.allows("https://example.org/"))
        assertFalse(policy.allows("not a url"))
    }

    @Test
    fun defaultPortsAreImplied() {
        val policy = OriginPolicy(invite("https://relay.actionstations.ai"))
        assertTrue(policy.allows("https://relay.actionstations.ai:443/x"))
        assertFalse(policy.allows("https://relay.actionstations.ai.evil.test/x"))
    }

    @Test
    fun onlyHttpLinksGoToTheSystemBrowser() {
        val policy = OriginPolicy(invite("https://relay.actionstations.ai"))
        assertTrue(policy.canOpenExternally("https://example.org"))
        assertFalse(policy.canOpenExternally("intent://scan"))
        assertFalse(policy.canOpenExternally("file:///etc/hosts"))
        assertFalse(policy.canOpenExternally("javascript:alert(1)"))
    }

    @Test
    fun privateHostClassification() {
        listOf("127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.9", "169.254.1.1", "::1", "fe80::1", "fd12::1", "pc.local", "localhost")
            .forEach { assertTrue(it, HostClass.isLocalOrPrivate(it)) }
        listOf("172.32.0.1", "172.15.0.1", "8.8.8.8", "192.169.0.1", "example.org", "2001:db8::1", "1.2.3")
            .forEach { assertFalse(it, HostClass.isLocalOrPrivate(it)) }
    }
}
