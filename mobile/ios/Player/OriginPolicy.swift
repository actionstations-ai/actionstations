import Foundation

/// Which URLs may load inside the web view: the session origin only (spec 0446 FR-3).
struct OriginPolicy: Equatable {
    let scheme: String
    let host: String
    let port: Int

    init(scheme: String, host: String, port: Int) {
        self.scheme = scheme
        self.host = host
        self.port = port
    }

    init(invite: Invite) {
        scheme = invite.scheme
        host = invite.host
        port = invite.port ?? OriginPolicy.defaultPort(invite.scheme)
    }

    func stays(_ url: URL) -> Bool {
        if url.absoluteString == "about:blank" { return true }
        guard let urlScheme = url.scheme?.lowercased(), let urlHost = url.host?.lowercased() else { return false }
        return urlScheme == scheme && urlHost == host
            && (url.port ?? OriginPolicy.defaultPort(urlScheme)) == port
    }

    /// Used for media capture, where WebKit hands over protocol, host and port.
    func isSessionOrigin(scheme originScheme: String, host originHost: String, port originPort: Int) -> Bool {
        originScheme.lowercased() == scheme && originHost.lowercased() == host
            && (originPort == 0 ? OriginPolicy.defaultPort(originScheme.lowercased()) : originPort) == port
    }

    /// Only web links go to the system browser; anything else is dropped.
    static func opensInSystemBrowser(_ url: URL) -> Bool {
        ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    }

    static func defaultPort(_ scheme: String) -> Int { scheme == "http" ? 80 : 443 }
}
