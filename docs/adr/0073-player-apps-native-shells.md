# ADR-0073: Player apps are thin native shells around the served player page

Date: 2026-11-03 · Status: Accepted · Issue: #620 · Spec: [0446](../specs/0446-mobile-player-apps.md) · Related: ADR-0032 (LAN server), ADR-0033 (player page), ADR-0051 (connection choice)

## Context

Players join live play in the phone's browser (ADR-0033). On a LAN session the browser shows a certificate warning every time, Safari will not open a WebSocket to a certificate the user clicked through, and the browser's own bars take space on a small screen. The owner asked for simple iOS and Android apps, sold through both stores and also downloadable from GitHub releases.

Options considered: a cross-platform web shell (Capacitor) with a bundled copy of the page, or two small native shells loading the page from the session's server.

## Decision

- **Two native shells, no shared code:** Swift and SwiftUI with `WKWebView` in `mobile/ios`, Kotlin with Android Views and `WebView` in `mobile/android`. No third-party SDKs on iOS; one Apache-2.0 QR scanner on Android (no Google Play services).
- **The page comes from the session's server,** as in a browser. The app and the facilitator's version can never disagree, and every live feature keeps working without an app release. The shells add no JavaScript bridge.
- **The invite carries the certificate pin.** `~<base64url SHA-256 of the DER certificate>` follows the fragment when the server's certificate is not one a phone can verify (LAN session, self-signed own server). The page ignores it; the apps accept exactly that certificate for that host and refuse any other, with no override. Without a pin they use the platform's validation, and an untrusted certificate needs the player to compare fingerprints with the Facilitate page. The QR on the facilitator's screen is the trusted channel, as it already is for the keys.
- **Three parsers, one set of vectors.** `mobile/fixtures/invites.json` is read by Vitest, JUnit and XCTest, so the page and both apps agree on which links open and what pin they carry.
- **One bundled page: the practice session.** **Try a demo** opens `src/player/demo`, the player page plus the harness controller and the in-memory server in the same page (`connect-src 'none'`). Store reviewers can see the app work without a session, and players can try it before their first exercise. This is the one place the harness controller ships (ADR-0033 kept it out of the app); it holds no real keys and talks to nothing.
- **Releases:** standard GitHub runners build an Android APK and AAB signed with the upload key from repository secrets, and an unsigned iOS IPA for sideloading, and upload them to the draft release (ADR-0023). App Store builds are archived and signed on the owner's Mac and are never built by Actions.

## Consequences

- No push notifications or background delivery: a backgrounded app reconnects and catches up when it returns, as a browser tab does.
- A bundled player page is not used for live play. If a store reviewer ever requires offline content beyond the practice session, that would be a new decision.
- Each app is a few hundred lines per platform; changes to the live features land in `src/player` once and reach both apps and the browser together.
- The App Store listing needs the Apple Developer Program (99 USD a year) and the Play listing a Google Play developer account (25 USD once); both are owner steps in `docs/mobile/STORES.md`. Nothing in the build depends on them.
