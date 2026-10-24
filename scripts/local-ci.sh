#!/usr/bin/env bash
# Local CI — the only CI this project has. No GitHub Actions (ADR-0002).
# Usage: scripts/local-ci.sh [--quick]   (E2E=1 to include Playwright, BADGES=1 to refresh docs/badges/)
set -euo pipefail
cd "$(dirname "$0")/.."
QUICK="${1:-}"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }

step "guard: no GitHub Actions workflows"
if [[ -d .github/workflows ]] && [[ -n "$(ls -A .github/workflows 2>/dev/null)" ]]; then
  echo "✖ .github/workflows/ must not exist (CLAUDE.md hard rule 1)"; exit 1
fi

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
  if [[ "${E2E:-0}" == "1" ]]; then step "e2e (full)"; pnpm exec playwright test; fi
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
    step "badges (docs/badges/)";     node scripts/make-badges.mjs --unit-log "$UNIT_LOG"
  fi
fi
printf '\n\033[1;32m✔ local CI passed\033[0m\n'
