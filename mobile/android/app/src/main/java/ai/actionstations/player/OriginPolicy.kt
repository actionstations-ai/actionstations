package ai.actionstations.player

import java.net.URI

object Origin {
    fun of(scheme: String, host: String, port: Int): String {
        val shownHost = if (host.contains(':')) "[$host]" else host
        return "${scheme.lowercase()}://$shownHost:$port"
    }
}

/** Which URLs may stay in the web view (spec 0446 FR-3): only the session origin. */
class OriginPolicy(private val invite: Invite) {
    fun allows(url: String): Boolean {
        val uri = try { URI(url) } catch (_: Exception) { return false }
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.removePrefix("[")?.removeSuffix("]")?.lowercase() ?: return false
        val port = if (uri.port != -1) uri.port else if (scheme == "https") 443 else 80
        return Origin.of(scheme, host, port) == invite.origin
    }

    fun sameHost(host: String?): Boolean = host != null && host.equals(invite.host, ignoreCase = true)

    /** Only http(s) links may be handed to the system browser. */
    fun canOpenExternally(url: String): Boolean {
        val scheme = try { URI(url).scheme?.lowercase() } catch (_: Exception) { null }
        return scheme == "http" || scheme == "https"
    }
}
