package ai.actionstations.player

/**
 * A session invite accepted by the shape check of spec 0446 FR-1:
 * `<base>/s/<sessionId>#<fragment>[.<roleHint>][~<pin>]`.
 * The app checks the shape only; the page still validates the keys.
 * The invite carries the session keys, so it is held in memory and never logged.
 */
class Invite private constructor(
    /** The URL the web view loads: the invite without the `~<pin>` suffix. */
    val loadUrl: String,
    val scheme: String,
    val host: String,
    val port: Int,
    /** SHA-256 of the facilitator's certificate (32 bytes), or null when the invite has no pin. */
    val pin: ByteArray?,
) {
    /** `scheme://host:port`, the one origin the web view may show. */
    val origin: String
        get() = Origin.of(scheme, host, port)

    override fun toString(): String = "Invite(host=$host)"

    companion object {
        private const val B64 = "[A-Za-z0-9_-]"
        private val URL_SHAPE = Regex("^(https?)://([^/?#@\\s]+)((?:/[^?#\\s]*)?)#(\\S*)$", RegexOption.IGNORE_CASE)
        private val SESSION_PATH = Regex("^(.*)/s/$B64{22}$")
        private val FRAGMENT = Regex("^($B64{220})(?:\\.([A-Za-z0-9][A-Za-z0-9_-]{0,127}))?(?:~($B64{43}))?$")
        private val HOST_PORT = Regex("^(\\[[0-9A-Fa-f:.]+]|[^:\\[\\]]+)(?::(\\d{1,5}))?$")

        /** Returns the invite, or null when [text] is not an acceptable session link. */
        fun parse(text: String): Invite? {
            val trimmed = text.trim()
            val url = URL_SHAPE.matchEntire(trimmed) ?: return null
            val scheme = url.groupValues[1].lowercase()
            val hostPort = HOST_PORT.matchEntire(url.groupValues[2]) ?: return null
            val host = hostPort.groupValues[1].removePrefix("[").removeSuffix("]").lowercase()
            val port = hostPort.groupValues[2].ifEmpty { null }?.toInt() ?: defaultPort(scheme)
            if (port !in 1..65535) return null
            if (scheme == "http" && !HostClass.isLocalOrPrivate(host)) return null
            if (!SESSION_PATH.matches(url.groupValues[3])) return null
            val fragment = FRAGMENT.matchEntire(url.groupValues[4]) ?: return null
            val pinText = fragment.groupValues[3]
            val pin = if (pinText.isEmpty()) null else Pin.decode(pinText) ?: return null
            val loadUrl = if (pinText.isEmpty()) trimmed else trimmed.substringBeforeLast('~')
            return Invite(loadUrl, scheme, host, port, pin)
        }

        private fun defaultPort(scheme: String) = if (scheme == "https") 443 else 80
    }
}

/** Which hosts may be reached over plain http: loopback, private (RFC 1918), link-local, `.local`. */
object HostClass {
    fun isLocalOrPrivate(host: String): Boolean {
        val h = host.lowercase()
        if (h == "localhost" || h.endsWith(".local")) return true
        return if (h.contains(':')) isPrivateV6(h) else isPrivateV4(h)
    }

    private fun isPrivateV4(host: String): Boolean {
        val parts = host.split('.')
        if (parts.size != 4) return false
        val n = parts.map { p ->
            if (p.isNotEmpty() && p.length <= 3 && p.all { it in '0'..'9' }) p.toInt() else return false
        }
        if (n.any { it > 255 }) return false
        return n[0] == 127 || n[0] == 10 ||
            (n[0] == 172 && n[1] in 16..31) ||
            (n[0] == 192 && n[1] == 168) ||
            (n[0] == 169 && n[1] == 254)
    }

    private fun isPrivateV6(host: String): Boolean {
        if (host == "::1") return true
        val first = host.substringBefore(':')
        val word = first.toIntOrNull(16) ?: return false
        return (word and 0xffc0) == 0xfe80 || (word and 0xfe00) == 0xfc00
    }
}
