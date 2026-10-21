# Contributing

Thanks for helping build Tabletop Generator. The full workflow is in [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md); this is the short version.

## The loop

1. **Issue first.** Every change starts as a GitHub issue on `mdcrowley/tabletop-gen`, created from a template in `.github/ISSUE_TEMPLATE/` (feature, bug, inject type). Apply `area:*`, `type:*` and priority labels and a milestone.
2. **Branch** from an up-to-date `main`:
   - `feat/<issue>-<slug>` for features
   - `fix/<issue>-<slug>` for bugs
   - `chore/<issue>-<slug>` for tooling and docs
   - `spike/<issue>-<slug>` for throwaway investigation
3. **Implement with tests.** Unit tests in Vitest; provider adapters need a recorded-fixture contract test plus an opt-in `LIVE=1` test; new inject templates need a `preview.json` and a golden PNG.
4. **Run local CI:** `pnpm ci:local` (add `E2E=1` for Playwright). It must pass.
5. **Open a PR** with `gh pr create`, filling `.github/PULL_REQUEST_TEMPLATE.md`: linked issue (`Closes #NN`), what/why, how tested, the pasted `ci:local` output, and screenshots or rendered PNGs for UI and template changes.
6. **Squash-merge** after review (`gh pr merge --squash --delete-branch`), then close the issue with a comment summarizing what shipped.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with the issue number:

```
feat(ingest): pptx parser (#23)
fix(render): block remote font requests (#30)
docs(adr): record embedding decision (#13)
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`. Scope is the area (`ingest`, `providers`, `render`, `editor`, ...).

## Local CI, not GitHub Actions

There is no hosted CI. Do not add files under `.github/workflows/`, Dependabot config, or anything that uses GitHub compute; `scripts/local-ci.sh` fails if a workflows directory exists. If a new check is needed, add it to `scripts/local-ci.sh`. Husky runs lint-staged on commit and local CI plus gitleaks on push. `--no-verify` is acceptable only for WIP pushes to feature branches and must be noted in the PR.

## Architecture decisions

Any architectural choice (a new library, a storage format change, a new process boundary) gets an ADR in `docs/adr/NNNN-title.md`, copied from [`docs/adr/0000-template.md`](docs/adr/0000-template.md): context, decision, consequences, kept short. To reverse a decision, write a new ADR and mark the old one `Superseded by ADR-XXXX`.

## Ground rules

- Model and media calls go only through `src/main/providers/*` adapters; no vendor SDKs elsewhere.
- No secrets in code, project folders or logs; keys go through Electron `safeStorage`.
- Text-bearing injects render from HTML templates, never from AI-generated pixels.
- Persisted JSON is defined by zod schemas in `src/shared/schemas/`.
- IPC goes through typed channels in `src/shared/ipc.ts`; no raw `ipcRenderer` in components.
