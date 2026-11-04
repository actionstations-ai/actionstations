#!/usr/bin/env bash
# Builds the Action Stations Player for iOS.
#   archive.sh store      Signed App Store archive and IPA (owner's Mac; needs APPLE_TEAM_ID).
#   archive.sh unsigned   Unsigned IPA for sideloading with AltStore or Sideloadly.
# Output goes to mobile/ios/build/. Never run from CI for the store build (spec 0446).
set -euo pipefail

mode="${1:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/build"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

[ -d "$here/Player/Demo" ] || { echo "Player/Demo is missing: run 'pnpm build:player-demo' first." >&2; exit 1; }
cd "$here"
xcodegen generate >/dev/null
rm -rf "$out" && mkdir -p "$out"

case "$mode" in
  store)
    : "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to your Apple Developer team id}"
    xcodebuild archive -project ActionStationsPlayer.xcodeproj -scheme Player \
      -destination 'generic/platform=iOS' -archivePath "$out/Player.xcarchive" \
      DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates
    cat >"$out/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>destination</key><string>export</string>
</dict></plist>
EOF
    xcodebuild -exportArchive -archivePath "$out/Player.xcarchive" \
      -exportOptionsPlist "$out/ExportOptions.plist" -exportPath "$out/export" -allowProvisioningUpdates
    echo "Upload $out/export/*.ipa with Transporter or: xcrun altool --upload-app"
    ;;
  unsigned)
    xcodebuild build -project ActionStationsPlayer.xcodeproj -scheme Player -sdk iphoneos \
      -configuration Release -derivedDataPath "$out/dd" \
      CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
    version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$out/dd/Build/Products/Release-iphoneos/Player.app/Info.plist")"
    mkdir -p "$out/Payload"
    cp -R "$out/dd/Build/Products/Release-iphoneos/Player.app" "$out/Payload/"
    (cd "$out" && zip -qry "ActionStationsPlayer-$version.ipa" Payload)
    shasum -a 256 "$out/ActionStationsPlayer-$version.ipa" >"$out/ActionStationsPlayer-$version.ipa.sha256"
    echo "Wrote $out/ActionStationsPlayer-$version.ipa"
    ;;
  *)
    echo "usage: archive.sh store|unsigned" >&2
    exit 2
    ;;
esac
