#!/usr/bin/env bash
# Unit tests of the player apps (spec 0446), for scripts/local-ci.sh. Runs only when mobile/
# changed against origin/main (or MOBILE=1), and each platform only when its toolchain is
# present, so the merge gate stays usable on machines without the Android SDK or Xcode.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${MOBILE:-0}" != "1" ]]; then
  base=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
  if [[ -n "$base" ]] && git diff --quiet "$base" -- mobile scripts/mobile-test.sh; then
    echo "mobile/ unchanged — skipping (MOBILE=1 to run anyway)"
    exit 0
  fi
fi

# A command with a time limit (macOS has no `timeout`): an Xcode that still needs its
# first-launch setup hangs instead of failing.
limit() { local s=$1; shift; perl -e 'alarm shift; exec @ARGV' "$s" "$@"; }

if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@21 ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ ! -x mobile/android/gradlew ]]; then
  echo "No Android project on this branch"
elif [[ -n "${JAVA_HOME:-}" && -d "$ANDROID_HOME/platforms" ]]; then
  echo "Android: unit tests and lint"
  (cd mobile/android && ./gradlew --quiet test lintDebug)
else
  echo "Android SDK or JDK not found — skipping Android (see mobile/README.md)"
fi

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
# Ask xcodebuild itself: simctl can list a simulator whose iOS platform Xcode lacks.
device=""
if [[ -d mobile/ios/ActionStationsPlayer.xcodeproj ]]; then
  device=$(limit 90 xcodebuild -showdestinations -project mobile/ios/ActionStationsPlayer.xcodeproj \
    -scheme Player 2>/dev/null | grep 'platform:iOS Simulator' | grep -v 'error:' \
    | sed -n 's/.*id:\([A-F0-9-]\{36\}\).*/\1/p' | head -1 || true)
fi
if [[ ! -d mobile/ios/ActionStationsPlayer.xcodeproj ]]; then
  echo "No iOS project on this branch"
elif [[ -n "$device" ]]; then
  echo "iOS: unit tests on a simulator"
  (cd mobile/ios && limit 900 xcodebuild test -quiet -project ActionStationsPlayer.xcodeproj \
    -scheme Player -destination "id=$device" CODE_SIGNING_ALLOWED=NO)
else
  echo "No usable iOS simulator (Xcode missing, first-launch setup not done, or its iOS platform not installed) — skipping iOS"
fi
