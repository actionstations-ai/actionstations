#!/usr/bin/env bash
# Local CI — the merge gate (ADR-0002). GitHub Actions only builds release installers, on free
# standard runners (ADR-0023).
# Usage: scripts/local-ci.sh [--quick]   (E2E=1 to include Playwright, BADGES=1 to refresh docs/badges/)
set -euo pipefail
cd "$(dirname "$0")/.."
QUICK="${1:-}"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }

step "guard: GitHub Actions stays free"; node scripts/check-workflows.mjs

step "install (frozen lockfile)";   pnpm install --frozen-lockfile
step "lint";                        pnpm lint
step "format:check";                pnpm format:check
step "doc links";                   node scripts/check-doc-links.mjs
step "typecheck";                   pnpm typecheck
UNIT_LOG="$(mktemp -t ttx-unit-log.XXXXXX)"
trap 'rm -f "$UNIT_LOG"' EXIT
step "unit tests";                  pnpm test 2>&1 | tee "$UNIT_LOG"
if [[ "$QUICK" != "--quick" ]]; then
  step "build check";               pnpm build:check
  step "template render tests";     pnpm test:templates
  # Always launch the built app once: catches ESM/CJS interop and startup crashes that
  # unit tests (Vitest interop) cannot see.
  step "launch smoke (built app)";  pnpm exec playwright test e2e/smoke.spec.ts
  # The player page (#411) runs in a phone browser against the in-process session server: no
  # Electron, a few seconds, and it is the only check of the page's reconnect and a11y paths.
  step "player page e2e";           pnpm exec playwright test e2e/live/
  if [[ "${E2E:-0}" == "1" ]]; then step "e2e (full)"; pnpm exec playwright test; fi
  # PDFs the translation e2e exports (e2e/translation.spec.ts), when a full e2e ran: PDF/UA-1.
  step "PDF accessibility (veraPDF, optional)"; node scripts/check-pdf-accessibility.mjs .tmp/pdf-a11y
  step "secrets scan (gitleaks)"
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks git --no-banner --redact .
  else
    echo "gitleaks not installed — skipping (install: brew install gitleaks)"
  fi
  step "audit (warn only)";         pnpm audit --prod || true
  # Opt-in (BADGES=1: `pnpm badges`, release.sh) so feature branches never touch docs/badges/.
  # Last, so badges only ever say "passing" after a full green run. Files change only when a
  # value does (counts, version, license, Electron); see scripts/make-badges.mjs.
  if [[ "${BADGES:-0}" == "1" ]]; then
    # BADGE_VERSION: the version release.sh is about to tag (#388).
    step "badges (docs/badges/)";     node scripts/make-badges.mjs --unit-log "$UNIT_LOG" ${BADGE_VERSION:+--version "$BADGE_VERSION"}
  fi
fi
printf '\n\033[1;32m✔ local CI passed\033[0m\n'
