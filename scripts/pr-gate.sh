#!/usr/bin/env bash
# Orchestrator merge gate: check a PR *merged onto current main* before squashing it.
# Two PRs can each pass ci:local on their own branches and still break main together
# (e.g. one deletes a module the other imports). Usage: scripts/pr-gate.sh <pr-number>
set -euo pipefail
PR="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WT="$ROOT/.tmp/pr-gate-$PR"
git -C "$ROOT" fetch -q origin
BRANCH="$(gh pr view "$PR" --json headRefName --jq .headRefName)"
rm -rf "$WT"; git -C "$ROOT" worktree prune
git -C "$ROOT" worktree add -q --detach "$WT" origin/main
cleanup() { git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true; }
trap cleanup EXIT
cd "$WT"
git merge -q --no-edit "origin/$BRANCH" || { echo "✖ PR #$PR does not merge cleanly onto main"; exit 1; }
pnpm install --frozen-lockfile >/dev/null
pnpm typecheck
pnpm lint
pnpm test
pnpm build:app >/dev/null
pnpm exec playwright test e2e/smoke.spec.ts
echo "✔ PR #$PR is green merged onto main"
