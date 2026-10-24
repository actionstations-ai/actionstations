# 06 — Contributor workflow

How work moves from an issue to `main` on `https://github.com/mdcrowley/actionstations` (default branch `main`). [CONTRIBUTING.md](../CONTRIBUTING.md) has the short version and the [project rules](../CONTRIBUTING.md#project-rules) every change follows; this page has the detail.

## No GitHub Actions

Nothing goes under `.github/workflows/`, and the project uses no Dependabot or other GitHub-hosted compute ([ADR-0002](adr/0002-local-ci-no-actions.md)). Every check runs on the contributor's machine through `scripts/local-ci.sh` (`pnpm ci:local`), which the Husky `pre-push` hook also runs. Branch protection on `main` requires a pull request but no status checks, because there are none on GitHub. Reviewers look for the pasted `ci:local` output in the PR description.

## Issues are the task tracker

- Every change starts as an issue, created from a template in `.github/ISSUE_TEMPLATE/` (feature, bug, new inject type).
- One issue maps to one pull request where practical. An epic is an issue labelled `epic` with a task list of its child issues.
- Commit messages reference the issue (`feat(ingest): pptx parser (#23)`), and the PR body closes it (`Closes #23`).
- If you find more work while you are on an issue, open a new issue for it rather than leaving a placeholder comment in the code.
- A decision that changes scope is recorded as a comment on the issue, and as an ADR in `docs/adr/` if it is architectural.
- When the PR is merged, close the issue with a comment that says what shipped.

### Labels

| Label | Use |
|---|---|
| `area:scaffold` `area:ipc` `area:ingest` `area:retrieval` `area:providers` `area:comfy` `area:templates` `area:generate` `area:editor` `area:export` `area:facilitator` `area:tests` `area:docs` `area:packs` | Component |
| `type:feature` `type:bug` `type:chore` `type:refactor` `type:spike` | Kind of work |
| `inject-type` | Request for a new inject template (it has its own issue form) |
| `epic` | Parent tracking issue |
| `good-first-issue` | Small and well specified |
| `blocked` `needs-decision` | Waiting on something else, or on a decision from the maintainer |
| `P0` `P1` `P2` | Priority |

### Milestones

The first release was built through milestones `M0 Scaffold` to `M6 Polish & Release 0.1` (see [08-ROADMAP.md](08-ROADMAP.md)); those are closed. Later work is grouped by release (`0.2.0 Review fixes`, `0.3.0 Packs`, `0.4.0 Domain packs`) plus `Backlog` for anything not yet scheduled. `scripts/bootstrap-github.sh` creates the labels, the original milestones and the seed backlog on a fresh repository.

## Branching and merging

- `main` always builds and always launches. Releases are tagged `vX.Y.Z`.
- Branch names: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>`, `docs/<issue>-<slug>`, `spike/<issue>-<slug>`.
- Rebase on `main` before opening the PR, then squash-merge (`gh pr merge --squash --delete-branch`).
- The PR template asks for the linked issue, what and why, how you tested it, the `ci:local` output, and screenshots for UI or template changes.
- Two PRs can each pass on their own branch and still break `main` together, for example when one deletes a module the other imports. Before squashing, `scripts/pr-gate.sh <pr-number>` merges the PR onto the current `main` in a temporary checkout and runs typecheck, lint, unit tests, the app build and the launch smoke test there.

## Local CI

`scripts/local-ci.sh` (`pnpm ci:local`) is the only CI. The full list of steps, with what each one checks, is in [CONTRIBUTING.md](../CONTRIBUTING.md#local-ci). In short: frozen install, lint, format check, Markdown link check, typecheck, unit tests with mock providers, build check, template golden tests, a launch smoke test of the built app and a gitleaks scan. `E2E=1` adds the full Playwright suite.

Husky runs lint-staged (ESLint `--fix` and Prettier) on `pre-commit` and `scripts/local-ci.sh` on `pre-push`. `git push --no-verify` is allowed only for work-in-progress pushes to feature branches, and the PR must say so.

## Releases

Installers are built on a developer machine and attached to a draft GitHub release with `gh`; there is no release automation. The steps are in [RELEASING.md](RELEASING.md). The CHANGELOG is maintained by hand in Keep a Changelog format.

## Dependency hygiene

There is no Dependabot. `pnpm audit --prod` runs inside `local-ci.sh` as a warning that never fails the run; `pnpm outdated` is run by hand when updating dependencies.
