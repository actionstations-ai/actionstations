#!/usr/bin/env bash
# Local CI — the only CI this project has. No GitHub Actions.
# Usage: scripts/local-ci.sh [--quick]   (E2E=1 to include Playwright)
set -euo pipefail
cd "$(dirname "$0")/.."
QUICK="${1:-}"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }

step "install (frozen lockfile)";   pnpm install --frozen-lockfile
step "lint";                        pnpm lint
step "format:check";                pnpm format:check
step "typecheck";                   pnpm typecheck
step "unit tests";                  pnpm test -- --run
if [[ "$QUICK" != "--quick" ]]; then
  step "template golden tests";     pnpm test:templates -- --run || { echo "template snapshots failed"; exit 1; }
  step "build check";               pnpm build:check
  if [[ "${E2E:-0}" == "1" ]]; then step "e2e"; pnpm e2e; fi
  step "audit (warn only)";         pnpm audit --prod || true
fi
printf '\n\033[1;32m✔ local CI passed\033[0m\n'
