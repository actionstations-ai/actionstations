# 06 — GitHub Workflow (no Actions)

Repo: `https://github.com/mdcrowley/actionstations` · public · default branch `main`.

## Why no Actions

The owner does not want to pay for GitHub-hosted compute. **Nothing under `.github/workflows/` — ever.** All checks run on the developer machine (or Claude Code's machine) via `scripts/local-ci.sh`, wired as a Husky `pre-push` hook. Branch protection on `main` is set to *require a PR* but **not** required status checks (there are none). Reviewers (human or Claude) confirm `ci:local` output is pasted in the PR description.

## Issues are the task tracker

- Everything is an issue before it is a branch. Use the templates in `.github/ISSUE_TEMPLATE/`.
- One issue = one PR where practical. Epics are issues labeled `epic` with a task list of child issue links.
- Commit messages reference issues: `feat(ingest): pptx parser (#23)`. Closing keywords (`Closes #23`) in the PR body.
- When Claude Code discovers work, it creates an issue immediately (`gh issue create --title … --body … --label …`), even if it does it right away.
- Decisions that change scope are recorded as a comment on the issue *and* as an ADR if architectural.

### Labels

| Label | Use |
|---|---|
| `area:scaffold` `area:ipc` `area:ingest` `area:retrieval` `area:providers` `area:comfy` `area:templates` `area:generate` `area:editor` `area:export` `area:facilitator` `area:tests` `area:docs` `area:packs` | component |
| `type:feature` `type:bug` `type:chore` `type:refactor` `type:spike` | kind |
| `inject-type` | new inject template request (has its own issue form) |
| `epic` | parent tracking issue |
| `good-first-issue` | small, well-specified |
| `blocked` `needs-decision` | waiting on something / on the owner |
| `P0` `P1` `P2` | priority |

### Milestones

`M0 Scaffold` → `M1 Projects & Ingestion` → `M2 Providers & Generation` → `M3 Injects & Media` → `M4 Editing` → `M5 Export & Facilitator` → `M6 Polish & Release 0.1`. See `08-ROADMAP.md`. `scripts/bootstrap-github.sh` creates labels, milestones and the seed backlog.

## Branching & merging

- `main`: always builds, always launches. Tagged `v0.x.y` at milestone ends.
- `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>`, `spike/<issue>-<slug>`.
- Rebase on `main` before PR; squash-merge (`gh pr merge --squash --delete-branch`).
- PR template requires: linked issue, what/why, how tested, `ci:local` output, screenshots for UI.
- Parallel subagents each own a branch and a non-overlapping set of paths; the orchestrator merges in dependency order (see `07-AGENT-ORCHESTRATION.md`).

## Local CI

`scripts/local-ci.sh` (also `pnpm ci:local`):

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint) and `pnpm format:check` (Prettier)
3. `pnpm typecheck` (tsc -b)
4. `pnpm test` (Vitest, with mock providers)
5. `pnpm test:templates` (golden PNG snapshot tests for inject templates)
6. `pnpm build:check` (vite build + electron-builder `--dir` for the host platform)
7. Optional `E2E=1` → `pnpm e2e` (Playwright Electron)

Husky: `pre-commit` → lint-staged (eslint --fix, prettier); `pre-push` → `scripts/local-ci.sh`. `--no-verify` is allowed only for WIP pushes to feature branches and must be noted in the PR.

## Releases

`pnpm build` locally → `gh release create v0.x.y dist/*.{exe,dmg,AppImage} --notes-file CHANGELOG.md`. CHANGELOG via `git-cliff` or hand-maintained Keep-a-Changelog. No release automation.

## Dependency hygiene

No Dependabot (would create PRs but it's free — still, it's noisy; skip for now). `pnpm outdated` / `pnpm audit` run inside `local-ci.sh` as warnings, not failures.
