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
