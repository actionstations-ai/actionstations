import Foundation

/// What the player view loads: a live session invite, or the bundled practice session.
struct PlayerTarget: Identifiable {
    static let demoScheme = "asdemo"
    static let demo = PlayerTarget(url: URL(string: "asdemo://demo/index.html")!, host: "demo", pin: nil,
                                   isDemo: true, displayHost: "Practice session",
                                   policy: OriginPolicy(scheme: demoScheme, host: "demo", port: 443))

    let url: URL
    let host: String
    let pin: Data?
    let isDemo: Bool
    let displayHost: String
    let policy: OriginPolicy
    var id: URL { url }

    init(invite: Invite) {
        self.init(url: invite.url, host: invite.host, pin: invite.pin, isDemo: false,
                  displayHost: invite.host, policy: OriginPolicy(invite: invite))
    }

    private init(url: URL, host: String, pin: Data?, isDemo: Bool, displayHost: String, policy: OriginPolicy) {
        self.url = url
        self.host = host
        self.pin = pin
        self.isDemo = isDemo
        self.displayHost = displayHost
        self.policy = policy
    }
}
