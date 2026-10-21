#!/usr/bin/env bash
# Local CI — the only CI this project has. No GitHub Actions (ADR-0002).
# Usage: scripts/local-ci.sh [--quick]   (E2E=1 to include Playwright)
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
step "typecheck";                   pnpm typecheck
step "unit tests";                  pnpm test
if [[ "$QUICK" != "--quick" ]]; then
  step "template golden tests";     pnpm test:templates
  step "build check";               pnpm build:check
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
fi
printf '\n\033[1;32m✔ local CI passed\033[0m\n'
