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
device=$(limit 60 xcrun simctl list devices available -j 2>/dev/null | node -e "
  let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s).devices;
  const p=Object.entries(d).filter(([r])=>r.includes('iOS')).flatMap(([,l])=>l).find(x=>/^iPhone/.test(x.name));
  if(p)console.log(p.udid)}catch{}})" || true)
if [[ ! -d mobile/ios/ActionStationsPlayer.xcodeproj ]]; then
  echo "No iOS project on this branch"
elif [[ -n "$device" ]]; then
  echo "iOS: unit tests on a simulator"
  (cd mobile/ios && limit 900 xcodebuild test -quiet -project ActionStationsPlayer.xcodeproj \
    -scheme Player -destination "id=$device" CODE_SIGNING_ALLOWED=NO)
else
  echo "No iOS simulator available (Xcode missing or its first-launch setup not done) — skipping iOS"
fi
