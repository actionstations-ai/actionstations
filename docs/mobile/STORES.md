# Player apps: releases and store listings

How the **Action Stations Player** apps (spec [0446](../specs/0446-mobile-player-apps.md), ADR-0073) reach players: files on every GitHub release, the App Store and Google Play.

## What each release carries

| File                                          | For                                         | Signed by                                                  |
| --------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `ActionStationsPlayer-<version>.apk`          | Android sideloading, device management      | the Android upload key                                     |
| `ActionStationsPlayer-<version>.aab`          | Google Play upload                          | the Android upload key (Play re-signs)                     |
| `ActionStationsPlayer-<version>-unsigned.ipa` | iOS sideloading with AltStore or Sideloadly | unsigned; the user's tool signs it with their own Apple ID |
| `*.sha256`                                    | checking a download                         |                                                            |

The release workflow builds the Android files and the unsigned IPA on free standard runners and uploads them to the draft release. The App Store build is archived and signed on the owner's Mac (`mobile/ios/scripts/archive.sh`), never in Actions.

iOS has no free way to install an app on another person's phone. The unsigned IPA suits organizations that already sideload; most iPhone users should use the App Store or the browser.

## One-time owner steps

### Android upload key and repository secrets

1. Create the upload key once and keep it outside the repository, with a password manager entry for the password:
   ```sh
   keytool -genkeypair -v -keystore ~/.actionstations/android-upload.jks \
     -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Add it to the repository secrets (Settings → Secrets and variables → Actions; secrets are free):
   ```sh
   base64 -i ~/.actionstations/android-upload.jks | gh secret set ANDROID_KEYSTORE_B64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   gh secret set ANDROID_KEY_ALIAS --body upload
   ```
   Without them the release job builds and tests but uploads nothing.

### Google Play (25 USD, once)

1. Create a developer account at play.google.com/console as an **organization** (needs a D-U-N-S number; a personal account must run a 14-day closed test with 12 testers before production).
2. Create the app **Action Stations Player**, package `ai.actionstations.player`, free, category **Business**.
3. Enroll in **Play App Signing** and upload the first `.aab` from a release; the key above becomes the upload key.
4. Fill in the listing from [Listing text](#listing-text), the **Data safety** form from [Privacy answers](#privacy-answers), the content rating questionnaire (no violence, no user-to-user content beyond the organization's own exercise: rating **Everyone**), target audience **18 and over**, and the government-apps declaration **No**.
5. Release to **Internal testing**, install from the Play link on a real phone, join a LAN session and the practice session, then promote to **Production**.

### App Store (99 USD a year)

1. Enroll in the Apple Developer Program as an **organization** (needs a D-U-N-S number and the legal entity's name on the listing).
2. In Certificates, Identifiers & Profiles create the App ID `ai.actionstations.player` (no capabilities beyond the defaults).
3. In App Store Connect create the app **Action Stations Player**, primary category **Business**, secondary **Productivity**, price free.
4. On the owner's Mac: `TEAM_ID=<team> mobile/ios/scripts/archive.sh` builds, signs and uploads to TestFlight.
5. Install from TestFlight, join a LAN session and the practice session, then submit for review with the [review notes](#review-notes).
6. App Privacy: **Data Not Collected**. Age rating: **4+** (answer _None_ to every content question). Export compliance: the app uses only the encryption built into iOS (HTTPS and WebCrypto) — choose the exemption for standard encryption.

## Listing text

**Name:** Action Stations Player
**Subtitle (iOS, 30):** Join tabletop exercises
**Short description (Play, 80):** Join an Action Stations tabletop exercise: scan the room's code and play.

**Description:**

> Action Stations Player is the companion app for players in an Action Stations tabletop exercise.
>
> Scan the code your facilitator shows and you are in: your role's injects arrive in your Inbox, the whole room's updates in the Feed, and you can message the SimCell, vote at decision points, add hot wash notes and answer the closing survey.
>
> • Works on the room's Wi-Fi with no internet, through the Action Stations relay, or through your organization's own server.
> • Trusts the facilitator's computer from the code itself, so there is no certificate warning on a local session.
> • Keeps the screen on while you play.
> • Try a demo: a short practice session runs inside the app, with no connection.
>
> No account, no ads, no tracking. Everything in an exercise is end-to-end encrypted between your device and the facilitator; the app stores nothing about the session after you leave.
>
> You need an exercise run with the Action Stations desktop app to join one. Players can also join in a web browser; the app is optional.

**Keywords (iOS, 100):** tabletop,exercise,TTX,HSEEP,emergency,preparedness,incident,drill,training,inject

**Screenshots:** phone and tablet, light and dark: the launcher, the practice session's Inbox with an inject open, the Feed, a vote, Messages. Take them from the practice session so no real exercise appears.

## Privacy answers

- Data collected: **none**. Data shared: **none**. The app has no analytics, crash reporting, advertising or account.
- What the app sends goes only to the session server named in the code the player scans, end-to-end encrypted, and is the player's own exercise input.
- Permissions: camera (scan the code, attach a photo), microphone (calls in the exercise), photos (attach a picture), local network (iOS: reach the facilitator's computer). Each is asked for only when first used.
- Privacy policy URL: `https://actionstations.ai/privacy/` (add a Player app section saying the above).

## Review notes

> To try the app without an exercise, tap **Try a demo** on the first screen. A practice session runs inside the app with no connection: choose a seat (any), and injects arrive in the Inbox over about a minute. A live exercise needs the Action Stations desktop app, which shows the QR code players scan; we can run a session for a reviewer on request.
