import SwiftUI

struct LauncherView: View {
    @Binding var target: PlayerTarget?
    @State private var showScanner = false
    @State private var showPaste = false
    @State private var pasted = ""
    @State private var problem: String?

    private var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }

    var body: some View {
        NavigationView {
            List {
                Section {
                    Button { showScanner = true } label: {
                        Label("Scan the code", systemImage: "qrcode.viewfinder")
                    }
                    .accessibilityHint("Opens the camera to scan the QR code on the room screen")
                    Button { showPaste = true } label: {
                        Label("Paste a link", systemImage: "link")
                    }
                    .accessibilityHint("Type or paste the session link the facilitator gave you")
                    Button { target = .demo } label: {
                        Label("Try a demo", systemImage: "play.circle")
                    }
                    .accessibilityHint("Opens a practice session that runs inside the app, with no network")
                } header: {
                    Text("Join an exercise")
                }
                if let problem {
                    Section { Text(problem).foregroundColor(.red).accessibilityLabel("Problem: \(problem)") }
                }
                Section {
                    NavigationLink("About") { AboutView(version: version) }
                }
            }
            .buttonStyle(.plain)
            .labelStyle(TouchLabelStyle())
            .navigationTitle("Action Stations Player")
        }
        .navigationViewStyle(.stack)
        .sheet(isPresented: $showScanner) { scanner }
        .sheet(isPresented: $showPaste) { pasteSheet }
    }

    private var scanner: some View {
        NavigationView {
            ScannerView(onCode: join, onFailure: { _ in })
                .ignoresSafeArea()
                .navigationTitle("Scan the code")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showScanner = false } } }
        }
    }

    private var pasteSheet: some View {
        NavigationView {
            Form {
                TextField("https://…/s/…", text: $pasted)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .frame(minHeight: 44)
                    .accessibilityLabel("Session link")
                Button("Paste from clipboard") { pasted = UIPasteboard.general.string ?? pasted }
                    .frame(minHeight: 44)
                Button("Join") { join(pasted) }
                    .frame(minHeight: 44)
                    .disabled(pasted.trimmingCharacters(in: .whitespaces).isEmpty)
                if let problem { Text(problem).foregroundColor(.red) }
            }
            .navigationTitle("Paste a link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showPaste = false } } }
        }
    }

    /// Returns true when the text was a session link and the player view is opening.
    @discardableResult
    private func join(_ text: String) -> Bool {
        switch Invite.parse(text) {
        case .success(let parsed):
            problem = nil
            pasted = ""
            showScanner = false
            showPaste = false
            // Let the sheet finish dismissing before the full-screen cover appears.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { target = PlayerTarget(invite: parsed) }
            return true
        case .failure(let error):
            problem = error.message
            return false
        }
    }
}

private struct TouchLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack { configuration.icon; configuration.title }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
    }
}

struct AboutView: View {
    let version: String

    var body: some View {
        List {
            Section {
                LabeledContent("Version", value: version)
            }
            Section {
                Text("The exercise page comes from the session's server, so this app never has to match the facilitator's version. The app collects no data and keeps no record of the links you open.")
            }
        }
        .navigationTitle("About")
    }
}
