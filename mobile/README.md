# Action Stations Player (mobile)

Thin native shells that open a live session's player page full screen (spec 0446). The page comes from the
session server; the apps add the QR scanner, certificate pinning, permissions and keep-awake.

`fixtures/invites.json` holds shared test vectors that the Android and iOS tests and Vitest all read.

## Android (`mobile/android`)

Kotlin, Android Views, minSdk 29, target 36, application id `ai.actionstations.player`.

Prerequisites: JDK 17 or newer (21 works), Android SDK with platform 36 and build-tools 36.0.0
(`ANDROID_HOME` set, or `sdk.dir` in `mobile/android/local.properties`, which is git-ignored).

```
cd mobile/android
./gradlew test assembleDebug        # unit tests (shared vectors included) and a debug APK
./gradlew assembleRelease           # unsigned unless the signing variables below are set
```

Release signing reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` from
the environment; without them the release APK is unsigned. Version overrides: `-PappVersionName=0.7.0 -PappVersionCode=7`.

### Try a demo

The launcher's **Try a demo** opens the practice session from `app/src/main/assets/demo/` (git-ignored; copy the
output of the player demo build there before `assembleDebug`). It is served by `WebViewAssetLoader` at
`https://appassets.androidplatform.net/assets/demo/index.html` and makes no network requests.

### Run against the player harness

```
PLAYER_TLS=1 pnpm dev:player                  # in the repo root; prints pinned players/staff links
adb reverse tcp:8485 tcp:8485                 # emulator reaches the host's harness as 127.0.0.1
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT "'<players link>'" -n ai.actionstations.player/.LauncherActivity
curl -k -X POST https://127.0.0.1:8485/__harness/release \
  -d '{"title":"FIDS boards dark","body":"All boards in Terminal B show no data.","targets":["all"],"exerciseTime":"0:45"}'
```

Changing the `~<pin>` suffix of the link to anything else must end on "This is not the facilitator's computer."

## iOS (`ios/`)

SwiftUI, iOS and iPadOS 16 or later, bundle id `ai.actionstations.player`, no third-party dependencies. The Xcode project is generated from `ios/project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) and the result is committed.

```
cd mobile/ios
(cd ../.. && pnpm build:player-demo)   # the Try a demo page, copied to Player/Demo (git-ignored)
xcodegen generate
xcodebuild test -project ActionStationsPlayer.xcodeproj -scheme Player \
  -destination 'platform=iOS Simulator,name=iPhone 17'
```

- `Player/Invite.swift`, `Pin.swift`, `OriginPolicy.swift` are pure and covered by `PlayerTests`, which load `fixtures/invites.json` from the test bundle.
- Run against the harness: `PLAYER_TLS=1 pnpm dev:player` prints a pinned link. In a Debug build, launch with `-openURL '<link>'` (and optionally `-seat 'Public Information Officer'`) to join without scanning, or `-openDemo` for the practice session. These flags do not exist in Release builds.
- Sideload IPA (unsigned, for AltStore or Sideloadly): `ios/scripts/archive.sh unsigned`.
- App Store build, from the owner's Mac: `APPLE_TEAM_ID=<team> ios/scripts/archive.sh store`, then upload the IPA with Transporter.
- The app keeps the invite in memory only and logs nothing about it. `PrivacyInfo.xcprivacy` declares no data collected.

Unit tests of both apps run in `pnpm ci:local` when `mobile/` changed and the toolchain is present (`scripts/mobile-test.sh`; `MOBILE=1` forces them). Releases and store listings: [docs/mobile/STORES.md](../docs/mobile/STORES.md).
