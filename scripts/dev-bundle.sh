#!/usr/bin/env bash
# macOS only. Builds .dev-app/Action Stations.app: a copy of the project's Electron.app renamed
# and re-iconed, so unpackaged runs show "Action Stations" (not "Electron") in the menu bar and
# Dock. Run the app with:
#   ".dev-app/Action Stations.app/Contents/MacOS/Electron" .
# Rebuilt only when the Electron version or build/icon.icns changes.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="Action Stations"
SRC="node_modules/electron/dist/Electron.app"
DEST=".dev-app/$NAME.app"
STAMP=".dev-app/.stamp"
want="$(node -p "require('electron/package.json').version")-$(shasum build/icon.icns | cut -c1-12)"

[[ -d "$SRC" ]] || { echo "Electron is not installed; run pnpm install" >&2; exit 1; }
if [[ -d "$DEST" && "$(cat "$STAMP" 2>/dev/null)" == "$want" ]]; then exit 0; fi

rm -rf "$DEST"
mkdir -p .dev-app
cp -R "$SRC" "$DEST"
plist="$DEST/Contents/Info.plist"
for key in CFBundleName CFBundleDisplayName; do
  /usr/libexec/PlistBuddy -c "Set :$key $NAME" "$plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$key string $NAME" "$plist"
done
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.mdcrowley.tabletopgen.dev" "$plist"
cp build/icon.icns "$DEST/Contents/Resources/electron.icns"
# Editing the bundle breaks Electron's signature; an ad-hoc one lets macOS launch it.
codesign --force --deep --sign - "$DEST" >/dev/null 2>&1
echo "$want" > "$STAMP"
echo "built $DEST"
