# Spec 0446: Phone and tablet apps for players (iOS and Android)

Issue: #620 (epic) · Milestone: 0.7.0 · Status: Draft · Depends on: #411 (player page) · Sub-issues: #616, #617, #618, #619 · Related: #407, #410, #380

## Summary

Players can join live play from a small **Action Stations Player** app on iPhone, iPad and Android instead of the phone's browser. The app scans the room's QR code, opens the session's player page full screen, trusts the facilitator's session certificate without a browser warning, and asks once for the camera, microphone and files the page needs. It is a thin native shell: the page itself still comes from the session's server, so the app never has to match the facilitator's version. Builds for sideloading are attached to every GitHub release; App Store and Google Play listings follow once the owner's developer accounts exist.

## Requirements

### User stories

- As a player, I want to scan the room code in an app and be in the exercise, so that I do not have to click through a certificate warning or lose screen space to the browser.
- As a player whose phone locks, I want the screen to stay on while I am in the exercise, so that I do not miss an inject.
- As a facilitator, I want players who prefer the browser to keep using it, so that the app is never a requirement.
- As an organization that cannot use app stores, I want an installable file on the release page, so that I can hand it out through our own device management.

### Functional requirements

- **FR-1 Join.** The launcher has two ways in: **Scan the code** (camera) and **Paste a link**. Both accept exactly the 0406 invite URL `<base>/s/<sessionId>#<fragment>[.<roleHint>][~<pin>]` with an `https` base, or an `http` base whose host is a loopback or private (RFC 1918, link-local, `.local`) address. Anything else is refused with the reason ("This is not an Action Stations session link."). The app checks the shape only; the page still validates the keys.
- **FR-2 Certificate pin.** The desktop app adds `~<pin>` to the fragment when the session server's certificate is not one the phone can verify: the LAN session certificate (ADR-0032) or a self-hosted server's pinned certificate (ADR-0051). `pin` is the base64url SHA-256 of the leaf certificate's DER encoding (43 characters). With a pin, the app accepts exactly that certificate for that host and nothing else. Without a pin, the platform's normal certificate validation applies (the relay); if it fails, the app shows the certificate's fingerprint in the `AA:BB:…` form the Facilitate page shows and asks the player to compare before continuing. A pin mismatch is a hard stop: "This is not the facilitator's computer. Scan the code on the room screen again."
- **FR-3 Player view.** The page opens full screen in the platform web view with a slim native bar: the session's host, and **Leave**. Leave and the Android back gesture ask "Leave the exercise? You can rejoin with the same code." Navigation to any other origin opens the system browser; the web view never leaves the session origin.
- **FR-4 Permissions.** The microphone (calls, #413 call recording), the camera and photo library (message attachments), and local network access (iOS) are requested by the OS only when the page first needs them, each with a usage string saying why. Denial leaves the page working without that feature.
- **FR-5 Keep awake.** The screen stays on while the player view is open; it follows the system again on the launcher.
- **FR-6 Reload and versions.** A **Reload** item in the bar's menu reloads the page (the page's FR-11 "Reload this page to update" works too). The launcher's About shows the app version and says the page comes from the session server.
- **FR-7 Theme and text size.** The launcher follows the system light/dark setting and Dynamic Type / font scale; the page already follows the system theme through `prefers-color-scheme`.
- **FR-8 Browser still works.** Nothing changes for browser players: the page strips `~<pin>` before parsing, and a QR scanned with the phone's camera app still opens the browser.

### Non-functional requirements

- **NFR-1 Cost:** building, testing and sideload releases cost nothing (free standard GitHub runners on the public repo, no artifacts, ADR-0023). Store listings cost the owner the Apple Developer Program (99 USD a year) and a Google Play developer account (25 USD once); nothing in the code depends on them. (CONTRIBUTING, Project rules 1.)
- **NFR-2 Privacy:** no analytics, crash reporting, ads or third-party SDKs that send data. The invite (which carries the keys) is held in memory only, never written to disk, logged or put in a recents list. The web view's `localStorage` keeps the page's own preferences as in a browser; `sessionStorage` dies with the web view. Store privacy labels: **Data not collected**. (Project rules 3.)
- **NFR-3 Accessibility:** WCAG 2.2 AA for the launcher (VoiceOver and TalkBack labels, 44 pt / 48 dp targets, Dynamic Type and font scale up to 200 % without clipping, contrast from the shared tokens' values). The page's own accessibility is unchanged.
- **NFR-4 Platforms:** iOS and iPadOS 16 or later (the page targets Safari 16); Android 10 (API 29) or later, target the current API level. Phones and tablets, portrait and landscape.
- **NFR-5 Size:** each app under 10 MB installed, the QR scanner included.

### Out of scope

- Push notifications and background delivery (the page reconnects and catches up when the app returns to the foreground, as in a browser).
- A bundled copy of the player page for live sessions, offline play without a server, or any facilitator features.
- Opening invite links from other apps through universal links / App Links (LAN addresses cannot host association files). Android's **Share → Action Stations Player** for a link is in; an iOS share extension is not.

## Design

### Repository layout

```
mobile/
  README.md                 build, run against the player harness, release
  android/                  Gradle project (Kotlin, Android Views; no Compose to keep it small)
    app/src/main/java/ai/actionstations/player/
      Invite.kt             FR-1 shape check and pin extraction (pure, unit tested)
      Pin.kt                SHA-256 of a certificate, pin and fingerprint formats (pure)
      OriginPolicy.kt       which URLs stay in the web view (pure)
      LauncherActivity.kt   scan / paste / about
      PlayerActivity.kt     WebView, TLS pin, permissions, keep awake, leave
    app/src/test/...        JUnit for the three pure files
  ios/                      Xcode project generated from project.yml (XcodeGen) and committed
    Player/Invite.swift, Pin.swift, OriginPolicy.swift   same contracts as Android
    Player/LauncherView.swift, ScannerView.swift, PlayerView.swift (WKWebView)
    PlayerTests/            XCTest for the pure files
  fixtures/invites.json     shared test vectors read by both test suites and by Vitest
```

The two apps share no code; they share **test vectors** (`mobile/fixtures/invites.json`: URLs, whether each is accepted, the extracted pin, the URL the web view loads). Vitest checks the same vectors against `src/shared/live/invite.ts` so the three parsers cannot drift.

### Invite pin (#616)

- `src/shared/live/invite.ts`: `buildInvite` takes an optional `pin` (32 bytes) and appends `~<base64url>`; `parseInviteFragment` splits on the last `~` first and returns `pin`. `~` is not in base64url or the role hint alphabet, so the split is unambiguous, and an old fragment parses as before.
- `src/main/live/invites.ts`: `InviteMaterial.pin` from the LAN certificate (`lan/cert.ts` exposes the DER hash) or the self-hosted connection's `fingerprintSha256` (hex pairs converted to bytes). The relay passes none.
- The page reads `location.hash` through `parseInvite` already; nothing else in the page changes.
- The player harness gains `PLAYER_TLS=1`: it serves HTTPS with a session certificate from `createSessionCertificate` and prints pinned links, so the apps can be tested end to end on a simulator or emulator.

### Shell behaviour

| Concern             | Android                                                                                                                                                           | iOS                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web view            | `WebView`, JavaScript and DOM storage on, file access off, mixed content never, `setSafeBrowsingEnabled(false)` (Safe Browsing would send URLs to Google)         | `WKWebView`, default data store, `limitsNavigationsToAppBoundDomains` off (LAN hosts vary)                                                                                                                        |
| TLS                 | `onReceivedSslError`: pin set and host matches and SHA-256 of `error.certificate.x509Certificate.encoded` equals pin → `proceed()`, else `cancel()` and show FR-2 | `webView(_:didReceive:completionHandler:)` for `NSURLAuthenticationMethodServerTrust`: same comparison on `SecTrustCopyCertificateChain[0]` → `.useCredential`, else default handling (system validation) or FR-2 |
| Cleartext           | `network_security_config.xml`: cleartext permitted; the app's own FR-1 check limits `http` to private hosts                                                       | `NSAllowsLocalNetworking` only                                                                                                                                                                                    |
| Microphone / camera | `onPermissionRequest` grants `AUDIO_CAPTURE` / `VIDEO_CAPTURE` after the runtime permission; `onShowFileChooser` opens the system picker                          | `WKUIDelegate` media capture permission for the session origin only; `<input type=file>` handled by WebKit                                                                                                        |
| Scanner             | ZXing (`zxing-android-embedded`, Apache-2.0), no Google Play services                                                                                             | AVFoundation `AVCaptureMetadataOutput` (`.qr`), no dependency                                                                                                                                                     |
| Keep awake          | `FLAG_KEEP_SCREEN_ON` on the player activity                                                                                                                      | `isIdleTimerDisabled` while the player view is shown                                                                                                                                                              |
| Leave               | toolbar action + `OnBackPressedCallback` → confirm → `finish()` and `WebView.destroy()`                                                                           | toolbar button → confirm → dismiss and release the web view                                                                                                                                                       |
| Share in            | `ACTION_SEND text/plain` intent filter on the launcher                                                                                                            | none                                                                                                                                                                                                              |

The WebSocket transport (and the SSE + POST fallback, ADR-0033) run inside the web view's own networking. When the pin has been accepted for a host, both platforms reuse that trust decision for the page's subresources and its connections; testing confirms the WebSocket path on each, and the page falls back to SSE + POST on its own if a socket cannot open.

### Identity and naming

- App name **Action Stations Player**; application id / bundle id `ai.actionstations.player` (the desktop app is `ai.actionstations.app`).
- Version: the apps carry the desktop release version (`package.json`) as their marketing version and a build number derived from it (major·10000 + minor·100 + patch) by `scripts/mobile-version.mjs`, so each release is higher without a counter to keep.
- Icon from `build/icon` artwork; launcher colors from `src/renderer/styles/tokens.css` values (light and dark).

### Releases (#619)

- `release.yml` gains two jobs on standard runners, both uploading to the tag's draft release like the installers (ADR-0023):
  - **Android** (`ubuntu-24.04`): `./gradlew test assembleRelease bundleRelease`; signs with the upload key from the repository secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Uploads `ActionStationsPlayer-<v>.apk` (sideload), `.aab` (Play) and `.sha256` files. Without the secrets the job builds and tests but uploads nothing.
  - **iOS** (`macos-15`): `xcodebuild test` on a simulator, then an unsigned `ActionStationsPlayer-<v>.ipa` for sideloading with AltStore or Sideloadly (they sign with the user's own Apple ID). A store build needs the owner's signing identity and is built and uploaded from the owner's Mac (`mobile/ios/scripts/archive.sh`), never from Actions.
- `docs/mobile/STORES.md`: listing text, screenshots list, privacy answers ("Data not collected"; Google Play Data safety: no data collected or shared), content rating, review notes, and the owner's step list for both stores.

### Store review

Apple's guideline 4.2 rejects apps that are only a website in a wrapper, and reviewers need to see the app work without a session of their own. Two things answer both:

- The native parts are real: scanner, certificate trust a browser cannot do, keep awake, permissions.
- **Try a demo** on the launcher opens a scripted practice session that runs inside the app: the player page and the harness controller (`src/player/harness/controller.ts` with `MemoryServer`) built as a separate `demo` bundle that talks over an in-page transport, with no network. It releases a few sample injects, a vote and a message on a timer, so a reviewer, and a player before their first exercise, can see what playing looks like. The demo bundle is built by `pnpm build:player-demo` and copied into both apps at build time; it is the only page an app ships.

## Security and privacy

- **The keys.** The fragment never reaches a server (browsers do not send it, and the shells load the URL as given). The apps hold the invite in memory and drop it on Leave; they log nothing about it (Android `Log` and iOS `os_log` calls are limited to error codes).
- **Certificate trust.** A pin read from the facilitator's screen is stronger than the browser's click-through. A pin applies to one host for one web view; a mismatch is never overridable. Without a pin, an untrusted certificate needs the player's explicit comparison with the fingerprint on the Facilitate page, the same check browser users are asked to make.
- **A pin only narrows untrusted certificates.** iOS checks the pin on every certificate for the session host. Android's WebView consults the app only when the system cannot verify a certificate, so there a certificate a public CA vouches for is accepted for that host even when the invite carries a pin. The LAN and self-signed cases the pin exists for always reach the app; a public CA issuing a certificate for a private IP address is not a realistic threat for a tabletop.
- **Origin confinement.** The web view stays on the session origin; other links open in the system browser. JavaScript bridges are not added: the page has no native API it can call, so a compromised page gains nothing over a browser.
- **No data leaves except to the session's server.** Safe Browsing is off on Android (it would send visited URLs to Google); no SDKs; no network call at launch.
- **Demo.** The demo bundle has no keys from a real session and makes no requests (its CSP is `connect-src 'none'`).

## Testing

- Vitest: invite build/parse with and without a pin, bad pins, old fragments; the shared vectors in `mobile/fixtures/invites.json`.
- JUnit (`./gradlew test`) and XCTest (`xcodebuild test`): invite shape, pin extraction and comparison, fingerprint formatting, origin policy, all against the shared vectors.
- End to end, by hand and scripted where the tools allow: `PLAYER_TLS=1 pnpm dev:player`, then the Android emulator (`adb reverse`) and the iOS simulator join the pinned link, take a seat, receive a released inject, and the wrong pin is refused. Screenshots in the pull request.
- `scripts/local-ci.sh` runs the mobile unit tests when `mobile/` changed and the toolchain is present (skipped with a note otherwise), so the merge gate stays usable on machines without Xcode or the Android SDK.

## Tasks

1. **#616** Invite pin in `src/shared/live/invite.ts` and `src/main/live/invites.ts`; harness HTTPS mode; shared vectors; Vitest.
2. **#617** Android app in `mobile/android` with JUnit tests and an emulator run against the harness.
3. **#618** iOS app in `mobile/ios` with XCTest and a simulator run against the harness.
4. **#619** Demo bundle (`build:player-demo`) and **Try a demo** in both apps; release jobs; `scripts/mobile-version.mjs`; `docs/mobile/STORES.md`; README and website download links.

## Open questions

- **Store accounts.** The owner chose both stores plus sideload builds on GitHub. Creating the Apple Developer Program membership (organization enrollment needs a D-U-N-S number) and the Google Play developer account, and adding the Android upload key to the repository secrets, are owner steps listed in `docs/mobile/STORES.md`.
- **iOS sideload.** iOS has no free way to install an app on someone else's phone: an unsigned IPA works only through AltStore or Sideloadly with the user's Apple ID (re-signed every seven days on a free account). Recommendation: ship it anyway for organizations that sideload, and point most iPhone users to the App Store or the browser.
