# ADR-0002: Local CI only, no GitHub Actions

Date: 2026-10-21 · Status: Accepted · Issue: #8

## Context

The owner does not want to pay for GitHub-hosted compute, and the app's real tests need native modules and Electron, which are awkward on hosted runners anyway. Checks still have to run on every change and be visible to reviewers.

## Decision

- `scripts/local-ci.sh` (exposed as `pnpm ci:local`) is the only CI: frozen install, `lint`, `format:check`, `typecheck`, `test`, `test:templates`, `build:check`, optional `E2E=1` Playwright run, and `pnpm audit` as warn-only.
- A guard step in `local-ci.sh` fails the run if `.github/workflows/` exists.
- `gitleaks` runs on pre-push.
- Husky hooks: `pre-commit` runs `lint-staged` (eslint --fix, prettier); `pre-push` runs `scripts/local-ci.sh`. `--no-verify` is allowed only for WIP pushes to feature branches and must be noted in the PR.
- PRs paste `ci:local` output into `.github/PULL_REQUEST_TEMPLATE.md`. Branch protection on `main` requires a PR but has no required status checks.
- No Dependabot.

## Consequences

- Zero hosted-compute cost; checks run on the same machine and OS as development.
- Evidence of a green run is the pasted output, so reviewers have to read it; there is no server-side enforcement.
- Cross-platform coverage depends on who runs CI; Windows and Linux are checked when someone runs `ci:local` there.
- Any new check is added to `local-ci.sh`, never to a workflow file.
