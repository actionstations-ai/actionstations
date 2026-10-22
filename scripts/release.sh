#!/usr/bin/env bash
# Cut a release from a local build (no GitHub Actions, ADR-0002). See docs/RELEASING.md.
#
#   scripts/release.sh <patch|minor|major|X.Y.Z> [--publish] [--issue N] [--skip-ci]
#
# Default is a DRY RUN: every check runs and the host-platform installers are built with the
# new version, then the version bump is reverted and the `gh release create` command is
# printed instead of run. Nothing is committed, tagged, pushed or uploaded.
# --publish  bump the version (commit + tag vX.Y.Z), push main and the tag, and create a
#            DRAFT GitHub release with the installers and the CHANGELOG section as notes.
#            Review the draft on GitHub and publish it there.
# --issue N  issue number for the release commit message (default 50).
# --skip-ci  dry run only: skip `pnpm ci:local` (for iterating on this script).
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=0
SKIP_CI=0
ISSUE=50
BUMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish) PUBLISH=1 ;;
    --dry-run) PUBLISH=0 ;;
    --skip-ci) SKIP_CI=1 ;;
    --issue) ISSUE="${2:?--issue needs a number}"; shift ;;
    patch|minor|major) BUMP="$1" ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$1" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -n "$BUMP" ]] || { sed -n '4,14p' "$0"; exit 2; }
[[ $PUBLISH == 1 && $SKIP_CI == 1 ]] && { echo "✖ --skip-ci is for dry runs only" >&2; exit 2; }

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# semver bump of $1 by $2 (patch|minor|major|X.Y.Z)
next_version() {
  local cur="$1" bump="$2" major minor patch
  IFS=. read -r major minor patch <<<"${cur%%-*}"
  case "$bump" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *) echo "$bump" ;;
  esac
}

# The CHANGELOG section body for version $1 (without its heading).
changelog_section() {
  awk -v v="$1" '
    $0 ~ "^## \\[" v "\\]" { on = 1; next }
    on && /^## \[/ { exit }
    on { print }
  ' CHANGELOG.md
}

host_installers() {
  case "$(uname -s)" in
    Darwin) echo "--mac" ;;
    Linux) echo "--linux" ;;
    MINGW* | MSYS* | CYGWIN*) echo "--win" ;;
    *) fail "unsupported host $(uname -s)" ;;
  esac
}

CURRENT=$(node -p "require('./package.json').version")
VERSION=$(next_version "$CURRENT" "$BUMP")
TAG="v${VERSION}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "not a release version: $VERSION"
MODE=$([[ $PUBLISH == 1 ]] && echo "PUBLISH (draft release)" || echo "DRY RUN")
echo "Release ${CURRENT} → ${VERSION} (${TAG}) — ${MODE}"

step "preflight: branch, clean tree, up to date"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  [[ $PUBLISH == 1 ]] && fail "releases are cut from main (on $BRANCH)"
  echo "note: on $BRANCH, not main (allowed for a dry run)"
fi
if [[ -n "$(git status --porcelain)" ]]; then
  [[ $PUBLISH == 1 ]] && fail "working tree is not clean"
  echo "note: working tree has uncommitted changes (allowed for a dry run)"
fi
if [[ $PUBLISH == 1 ]]; then
  git fetch origin main --tags --quiet
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "main is not at origin/main"
  git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null && fail "tag ${TAG} already exists"
  gh auth status >/dev/null 2>&1 || fail "gh is not authenticated"
fi

step "preflight: CHANGELOG has a [${VERSION}] section"
NOTES_FILE=$(mktemp -t ttx-release-notes.XXXXXX)
changelog_section "$VERSION" >"$NOTES_FILE"
if [[ ! -s "$NOTES_FILE" ]] || ! grep -q '[^[:space:]]' "$NOTES_FILE"; then
  [[ $PUBLISH == 1 ]] && fail "CHANGELOG.md has no '## [${VERSION}] - YYYY-MM-DD' section"
  echo "note: no [${VERSION}] section yet; the dry run uses [Unreleased] as the notes"
  changelog_section "Unreleased" >"$NOTES_FILE"
fi
echo "release notes: $(grep -c '^- ' "$NOTES_FILE") entries"

if [[ $SKIP_CI == 1 ]]; then
  step "local CI skipped (--skip-ci)"
else
  step "local CI"
  pnpm ci:local
fi

step "version bump → ${VERSION}"
if [[ $PUBLISH == 1 ]]; then
  pnpm version "$VERSION" --message "chore(release): v%s (#${ISSUE})"
else
  cp package.json "${NOTES_FILE}.package.json"
  trap 'cp "${NOTES_FILE}.package.json" package.json; echo "restored package.json (${CURRENT})"' EXIT
  pnpm version "$VERSION" --no-git-tag-version >/dev/null
fi

step "build installers for this host"
BUILD_START=$(date +%s)
pnpm build:app
pnpm exec electron-builder "$(host_installers)" --publish never
echo "built in $(($(date +%s) - BUILD_START)) s"

ARTIFACTS=()
while IFS= read -r f; do ARTIFACTS+=("$f"); done < <(
  find "release/${VERSION}" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.AppImage' -o -name '*.blockmap' -o -name 'latest*.yml' \) | sort
)
[[ ${#ARTIFACTS[@]} -gt 0 ]] || fail "no installers in release/${VERSION}"
step "artifacts"
for f in "${ARTIFACTS[@]}"; do printf '  %8s  %s\n' "$(du -h "$f" | cut -f1)" "$f"; done

RELEASE_CMD=(gh release create "$TAG" --draft --verify-tag --title "Tabletop Generator ${VERSION}" --notes-file "$NOTES_FILE" "${ARTIFACTS[@]}")
if [[ $PUBLISH == 1 ]]; then
  step "push main and ${TAG}"
  git push origin main "$TAG"
  step "create draft release ${TAG}"
  "${RELEASE_CMD[@]}"
  echo "Draft created. Review it on GitHub, then publish it there."
else
  step "dry run — would run:"
  printf '  git push origin main %s\n  ' "$TAG"
  printf '%q ' "${RELEASE_CMD[@]}"
  printf '\n\nRelease notes preview (%s):\n' "$NOTES_FILE"
  sed 's/^/  | /' "$NOTES_FILE" | head -40
fi
