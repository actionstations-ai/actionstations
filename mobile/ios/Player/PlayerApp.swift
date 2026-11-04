import SwiftUI

@main
struct PlayerApp: App {
    /// The invite lives in memory only: never written to disk, logged or listed as a recent.
    @State private var target: PlayerTarget?

    var body: some Scene {
        WindowGroup {
            LauncherView(target: $target)
                .fullScreenCover(item: $target) { current in
                    PlayerView(target: current) { target = nil }
                }
                .onAppear(perform: openDebugLaunchURL)
        }
    }

    /// DEBUG only: `-openURL <invite>` joins without scanning, for simulator checks.
    private func openDebugLaunchURL() {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-openDemo") { target = .demo; return }
        guard let flag = args.firstIndex(of: "-openURL"), flag + 1 < args.count,
              case .success(let parsed) = Invite.parse(args[flag + 1]) else { return }
        target = PlayerTarget(invite: parsed)
        #endif
    }
}

