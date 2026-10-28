# ADR-0023: GitHub Actions where it is free

Date: 2026-10-28 · Status: Accepted · Issue: #398 · Supersedes [ADR-0002](0002-local-ci-no-actions.md)

## Context

ADR-0002 ruled out GitHub Actions because the owner will not pay for hosted compute. Since then the repository moved to the `actionstations-ai` organization and is public, and releases need installers for three operating systems. Building them meant cross-builds on a Mac, a Windows VM and Docker containers for testing. GitHub-hosted standard runners cost nothing for public repositories, macOS and Windows included. Larger and GPU runners are billed even for public repositories, and artifacts and caches use the organization's storage allowance. The organization has $0 budgets that stop Actions, Git LFS, Packages and Codespaces usage rather than bill it.

## Decision

- GitHub Actions is allowed only where it is free: workflows in this public repository, every job on a standard GitHub-hosted runner, nothing stored on GitHub (no artifact uploads, no caches). Results go straight to where they belong (installers to the draft release).
- `scripts/check-workflows.mjs` enforces that in `pnpm ci:local` (it replaces the "no workflows" guard): standard runner labels only (matrix values expanded), no `actions/upload-artifact`, `actions/cache` or `cache:` inputs, top-level `permissions` required, no reusable workflows. Third-party actions are pinned to a commit.
- First workflow: `.github/workflows/release.yml` builds the macOS, Windows and Linux installers each on its own OS, runs `pnpm package:smoke` on each, and uploads the installers and `.sha256` files to the tag's draft release (never to a published one). `scripts/release.sh --publish` pushes the tag and creates the draft.
- `pnpm ci:local` and the Husky hooks stay the merge gate. No workflow runs on pull requests except the release build when packaging files change.
- No workflows in the private website repository: private repositories draw on the organization's included minutes.

## Consequences

- Every release is built and smoke-tested natively on all three platforms, without the Windows VM or Docker.
- The budgets mean an unexpected charge stops the service instead of billing; a stopped budget would fail a release build, not cost money.
- Contributors still run checks locally; Actions results are not required status checks.
