import Foundation

/// Why a link was refused (spec 0446 FR-1).
enum InviteError: Error, Equatable {
    case notASessionLink

    var message: String { "This is not an Action Stations session link." }
}

/// A parsed 0406 invite URL: `<base>/s/<sessionId>#<fragment>[.<roleHint>][~<pin>]`.
/// Checks the shape only; the page validates the keys. Held in memory, never persisted.
struct Invite: Equatable {
    let url: URL
    let host: String
    let port: Int?
    let scheme: String
    let pin: Data?
    let roleHint: String?

    private static let base64url = "A-Za-z0-9_-"
    private static let sessionPath = try! NSRegularExpression(pattern: "/s/[\(base64url)]{22}$")
    private static let fragmentShape = try! NSRegularExpression(
        pattern: "^[\(base64url)]{220}(\\.[\(base64url)]+)?(~[\(base64url)]{43})?$")

    static func parse(_ text: String) -> Result<Invite, InviteError> {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: trimmed),
              let scheme = parts.scheme?.lowercased(),
              let host = parts.host?.lowercased(), !host.isEmpty,
              let fragment = parts.fragment,
              let url = parts.url,
              isAcceptedBase(scheme: scheme, host: host),
              matches(sessionPath, parts.percentEncodedPath),
              matches(fragmentShape, fragment)
        else { return .failure(.notASessionLink) }

        let (main, pinText) = splitPin(fragment)
        let hint = main.split(separator: ".", maxSplits: 1).dropFirst().first.map(String.init)
        let pin = pinText.flatMap { Pin.decode($0) }
        if pinText != nil && pin == nil { return .failure(.notASessionLink) }
        return .success(Invite(url: url, host: host, port: parts.port, scheme: scheme, pin: pin, roleHint: hint))
    }

    /// `https` anywhere, or `http` only on loopback, private, link-local or `.local` hosts.
    static func isAcceptedBase(scheme: String, host: String) -> Bool {
        if scheme == "https" { return true }
        return scheme == "http" && isPrivateHost(host)
    }

    static func isPrivateHost(_ rawHost: String) -> Bool {
        let host = rawHost.trimmingCharacters(in: CharacterSet(charactersIn: "[]")).lowercased()
        if host == "localhost" || host.hasSuffix(".local") || host == "::1" { return true }
        if host.hasPrefix("fe80:") { return true }
        let octets = host.split(separator: ".", omittingEmptySubsequences: false).compactMap { Int($0) }
        guard octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }),
              host.split(separator: ".").count == 4 else { return false }
        switch (octets[0], octets[1]) {
        case (127, _), (10, _), (192, 168), (169, 254): return true
        case (172, 16...31): return true
        default: return false
        }
    }

    private static func splitPin(_ fragment: String) -> (String, String?) {
        guard let tilde = fragment.lastIndex(of: "~") else { return (fragment, nil) }
        return (String(fragment[..<tilde]), String(fragment[fragment.index(after: tilde)...]))
    }

    private static func matches(_ regex: NSRegularExpression, _ text: String) -> Bool {
        regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }
}
