import SwiftUI
import WebKit

/// Observable state shared between the web view delegate and the SwiftUI chrome.
final class PlayerModel: ObservableObject {
    @Published var pinMismatch = false
    @Published var unverified: UnverifiedCertificate?
    @Published var reloadToken = 0
    /// Leaf hashes the player chose to trust for this session after comparing fingerprints.
    var acceptedFingerprints = Set<Data>()
}

struct UnverifiedCertificate: Identifiable {
    let id = UUID()
    let host: String
    let fingerprint: String
    let decide: (Bool) -> Void
}

struct PlayerView: View {
    let target: PlayerTarget
    let onLeave: () -> Void
    @StateObject private var model = PlayerModel()
    @State private var confirmLeave = false

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ZStack {
                WebContainer(target: target, model: model)
                if model.pinMismatch { pinMismatchStop }
            }
        }
        .background(Color(.systemBackground).ignoresSafeArea())
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .alert("Leave the exercise?", isPresented: $confirmLeave) {
            Button("Leave", role: .destructive, action: onLeave)
            Button("Stay", role: .cancel) {}
        } message: {
            Text("You can rejoin with the same code.")
        }
        .alert(item: $model.unverified) { cert in
            Alert(
                title: Text("Compare the certificate"),
                message: Text("This computer's certificate is not one your phone can verify. Compare this fingerprint with the one on the facilitator's screen before continuing.\n\n\(cert.fingerprint)"),
                primaryButton: .default(Text("They match")) { cert.decide(true) },
                secondaryButton: .cancel(Text("Do not continue")) { cert.decide(false) })
        }
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            Text(target.displayHost)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.middle)
                .accessibilityLabel("Connected to \(target.displayHost)")
            Spacer()
            Button { model.reloadToken += 1 } label: {
                Image(systemName: "arrow.clockwise").frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Reload")
            Button("Leave") { confirmLeave = true }
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel("Leave the exercise")
        }
        .padding(.horizontal, 16)
        .background(Color(.secondarySystemBackground))
    }

    private var pinMismatchStop: some View {
        VStack(spacing: 16) {
            Image(systemName: "xmark.octagon.fill").font(.largeTitle).foregroundColor(.red)
            Text("This is not the facilitator's computer. Scan the code on the room screen again.")
                .font(.headline)
                .multilineTextAlignment(.center)
            Button("Back", action: onLeave).frame(minWidth: 44, minHeight: 44)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .accessibilityElement(children: .contain)
    }
}

struct WebContainer: UIViewRepresentable {
    let target: PlayerTarget
    @ObservedObject var model: PlayerModel

    func makeCoordinator() -> WebCoordinator { WebCoordinator(target: target, model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if target.isDemo { config.setURLSchemeHandler(DemoSchemeHandler(), forURLScheme: PlayerTarget.demoScheme) }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = false
        context.coordinator.loadedToken = model.reloadToken
        view.load(URLRequest(url: target.url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.loadedToken != model.reloadToken {
            context.coordinator.loadedToken = model.reloadToken
            model.pinMismatch = false
            view.load(URLRequest(url: target.url))
        }
    }

    /// Release the web view on leave.
    static func dismantleUIView(_ view: WKWebView, coordinator: WebCoordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
        view.uiDelegate = nil
        view.removeFromSuperview()
    }
}

final class WebCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    let target: PlayerTarget
    let policy: OriginPolicy
    let model: PlayerModel
    var loadedToken = 0

    init(target: PlayerTarget, model: PlayerModel) {
        self.target = target
        self.policy = target.policy
        self.model = model
    }

    // MARK: Certificate trust (FR-2)

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust, let trust = space.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        let leaf = Self.leafDER(trust)
        if let pin = target.pin {
            decidePinned(space.host, leaf, pin, trust, completionHandler)
        } else if SecTrustEvaluateWithError(trust, nil) {
            completionHandler(.performDefaultHandling, nil)
        } else {
            askPlayer(space.host, leaf, trust, completionHandler)
        }
    }

    private func decidePinned(_ host: String, _ leaf: Data?, _ pin: Data, _ trust: SecTrust,
                              _ done: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if host.lowercased() == target.host, let leaf, Pin.matches(certificateDER: leaf, pin: pin) {
            done(.useCredential, URLCredential(trust: trust))
            return
        }
        DispatchQueue.main.async { self.model.pinMismatch = true }
        done(.cancelAuthenticationChallenge, nil)
    }

    private func askPlayer(_ host: String, _ leaf: Data?, _ trust: SecTrust,
                           _ done: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard host.lowercased() == target.host, let leaf else {
            done(.cancelAuthenticationChallenge, nil)
            return
        }
        let hash = Pin.sha256(of: leaf)
        if model.acceptedFingerprints.contains(hash) {
            done(.useCredential, URLCredential(trust: trust))
            return
        }
        DispatchQueue.main.async {
            guard self.model.unverified == nil else { done(.cancelAuthenticationChallenge, nil); return }
            self.model.unverified = UnverifiedCertificate(host: host, fingerprint: Pin.fingerprint(hash)) { accepted in
                if accepted { self.model.acceptedFingerprints.insert(hash) }
                done(accepted ? .useCredential : .cancelAuthenticationChallenge,
                     accepted ? URLCredential(trust: trust) : nil)
            }
        }
    }

    static func leafDER(_ trust: SecTrust) -> Data? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let leaf = chain.first else { return nil }
        return SecCertificateCopyData(leaf) as Data
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        debugAutoSeat(webView)
        #endif
    }

    // MARK: Origin confinement (FR-3)

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if policy.stays(url) {
            decisionHandler(.allow)
        } else {
            if OriginPolicy.opensInSystemBrowser(url) { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if policy.stays(url) { webView.load(action.request) }
            else if OriginPolicy.opensInSystemBrowser(url) { UIApplication.shared.open(url) }
        }
        return nil
    }

    // MARK: Permissions (FR-4)

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let ours = policy.isSessionOrigin(scheme: origin.protocol, host: origin.host, port: origin.port)
        decisionHandler(ours ? .grant : .deny)
    }
}
