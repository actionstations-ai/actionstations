# Contributing

Thanks for helping build Tabletop Generator. This page covers the workflow, the local CI, and the live tests. The longer version of the workflow is [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md); how the code is wired (handlers, routes, adapters, templates) is in [`docs/09-CODE-CONVENTIONS.md`](docs/09-CODE-CONVENTIONS.md).

## Set up

Prerequisites are in the [README](README.md#prerequisites) (Node.js 22.12+, pnpm 10, native build tools). Then:

```bash
pnpm install          # also installs the git hooks (Husky) and rebuilds native modules for Electron
pnpm dev              # run the app with hot reload
pnpm test             # unit tests
```

For a guided tour of the app itself, see [Getting started](docs/guides/getting-started.md).

## The loop

1. **Issue first.** Every change starts as a GitHub issue on `mdcrowley/tabletop-gen`, created from a template in `.github/ISSUE_TEMPLATE/` (feature, bug, new inject type). Apply `area:*`, `type:*` and priority labels and a milestone. If you find more work while you are at it, open an issue for it rather than leaving a placeholder comment in the code.
2. **Branch** from an up-to-date `main`:
   - `feat/<issue>-<slug>` for features
   - `fix/<issue>-<slug>` for bugs
   - `chore/<issue>-<slug>` or `docs/<issue>-<slug>` for tooling and docs
   - `spike/<issue>-<slug>` for throwaway investigation
3. **Implement with tests.** Unit tests sit beside the code (`*.test.ts`) or in `tests/`. Provider adapters need a recorded-fixture contract test plus an opt-in `LIVE=1` test. New inject templates need a `preview.json` and a golden PNG ([template guide](docs/guides/templates.md)). UI changes need a look in the built app, in light and dark themes.
4. **Run local CI:** `pnpm ci:local`. It must pass.
5. **Open a PR** with `gh pr create`, filling [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md): `Closes #NN`, what and why, how you tested, the pasted `ci:local` output, and screenshots or rendered PNGs for UI and template changes.
6. **Squash-merge** after review (`gh pr merge --squash --delete-branch`), then close the issue with a comment summarizing what shipped.

`main` always builds and launches.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with the issue number:

```
feat(ingest): pptx parser (#23)
fix(render): block remote font requests (#30)
docs(adr): record embedding decision (#13)
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`. The scope is the area (`ingest`, `providers`, `generate`, `render`, `templates`, `editor`, ...).

## Local CI

There is no hosted CI. `scripts/local-ci.sh` (`pnpm ci:local`) is the CI, and it runs again on every `git push` through the Husky `pre-push` hook. The `pre-commit` hook runs lint-staged (ESLint `--fix` and Prettier on staged files).

| Step                  | Command                                       | What it checks                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard                 | (built in)                                    | Fails if `.github/workflows/` has any file. This project never uses GitHub Actions.                                                                                                                             |
| Install               | `pnpm install --frozen-lockfile`              | The lockfile matches `package.json`.                                                                                                                                                                            |
| Lint                  | `pnpm lint`                                   | ESLint with zero warnings allowed (including the renderer's import boundaries).                                                                                                                                 |
| Format                | `pnpm format:check`                           | Prettier formatting of code, Markdown, JSON and CSS. Fix with `pnpm format`.                                                                                                                                    |
| Doc links             | `node scripts/check-doc-links.mjs`            | Every relative link and image in the repository's Markdown points at an existing file, and `#anchors` into Markdown files match a heading. External URLs are not fetched.                                       |
| Typecheck             | `pnpm typecheck`                              | `tsc` for the main/preload/shared code and for the renderer.                                                                                                                                                    |
| Unit tests            | `pnpm test`                                   | Vitest, run inside Electron's Node so native modules match. Providers are mocked; no network.                                                                                                                   |
| Build check           | `pnpm build:check`                            | `electron-vite build` plus `electron-builder --dir` for this platform.                                                                                                                                          |
| Template render tests | `pnpm test:templates`                         | Renders every inject template × variant in the built app: compares with its golden PNG, checks two renders agree, and checks the render pool (see [goldens](docs/guides/templates.md#goldens-and-determinism)). |
| Launch smoke          | `pnpm exec playwright test e2e/smoke.spec.ts` | Starts the built app. Catches startup crashes and ESM/CommonJS interop problems that unit tests cannot see.                                                                                                     |
| Full e2e (opt-in)     | `E2E=1 pnpm ci:local`                         | Every Playwright spec in `e2e/` against the built app with the mock provider.                                                                                                                                   |
| Secrets scan          | `gitleaks git --redact .`                     | No secrets in the git history. Skipped with a notice if gitleaks is not installed (`brew install gitleaks`).                                                                                                    |
| Audit (warning only)  | `pnpm audit --prod`                           | Known vulnerabilities in production dependencies. Never fails the run.                                                                                                                                          |

`bash scripts/local-ci.sh --quick` stops after the unit tests (guard, install, lint, format, doc links, typecheck, tests), for fast iteration. Run the full version before you push.

`git push --no-verify` is acceptable only for work-in-progress pushes to feature branches, and the PR must say so.

If a new check is needed, add it to `scripts/local-ci.sh`. Never add files under `.github/workflows/`, Dependabot configuration, or anything else that runs on GitHub's compute ([ADR-0002](docs/adr/0002-local-ci-no-actions.md)).

## Tests in more detail

- **Unit tests:** `pnpm test`, or one file with `pnpm test -- path/to/file.test.ts`; `pnpm test:watch` to re-run on change. Code that imports `electron` needs `vi.mock('electron', …)`. Renderer component tests start with `// @vitest-environment happy-dom`.
- **End-to-end:** `pnpm e2e` builds the app and runs Playwright against it. `e2e/helpers.ts` `launch()` gives each test an isolated data folder. Playwright empties `test-results/` at the start of every run; copy anything you want to keep elsewhere first.
- **Screenshot tour:** `pnpm build:app && TOUR=1 pnpm exec playwright test e2e/tour.spec.ts` captures every screen in light and dark themes into `test-results/tour/`.
- **Offline app:** `TTX_MOCK_PROVIDERS=1 pnpm dev` routes every task to a built-in mock provider that returns schema-valid output.

### Live tests

Live tests call real local services. They are skipped unless `LIVE=1` is set, never call paid APIs, and print their measurements. Start the services first (see the [provider guides](docs/guides/providers/README.md)).

| Command                                                              | Needs                                                                                  | What it does                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `LIVE=1 pnpm test -- src/main/providers/text/live.test.ts`           | LM Studio (`qwen3-30b-a3b-2507` loaded), Ollama (`qwen2.5:3b`), mlx-audio on port 8765 | Text adapters: streaming, structured output, embeddings; speech through `/v1/audio/speech`.     |
| `LIVE=1 pnpm test -- src/main/providers/media/audio-fx/live.test.ts` | mlx-audio                                                                              | Every radio / phone / PA post-FX on real TTS output.                                            |
| `LIVE=1 pnpm test -- src/main/providers/media/comfyui/live.test.ts`  | ComfyUI with the SDXL and LTX-Video models                                             | The default image and video workflows. `LIVE_COMFY_VIDEO=0` skips the slower video test.        |
| `LIVE=1 pnpm test -- src/main/retrieve`                              | Network once (downloads the local embedding model, about 130 MB)                       | Retrieval quality and indexing speed with the local `bge-small` model.                          |
| `LIVE=1 pnpm test -- tests/live/pipeline.live.test.ts`               | LM Studio with the chat and embedding models                                           | Full scenario from the NCIA plans; writes `tests/fixtures/generate/sample-run/`. Takes minutes. |
| `LIVE=1 pnpm test -- tests/live/injects.live.test.ts`                | LM Studio, ComfyUI, mlx-audio                                                          | Scenario 3 inject deck and media; writes `tests/fixtures/injects/sample-run/`.                  |
| `LIVE=1 pnpm exec playwright test e2e/m2-exit.spec.ts`               | LM Studio; the built app (`pnpm build:app`)                                            | Ideas → full MSEL through the real app; outputs in `.tmp/m2-exit/`.                             |

Common overrides: `LIVE_LMSTUDIO_URL`, `LIVE_LMSTUDIO_MODEL`, `LIVE_OLLAMA_URL`, `LIVE_OLLAMA_MODEL`, `LIVE_TTS_URL`, `LIVE_TTS_MODELS`, `LIVE_COMFY_URL`, `LIVE_EMBED=hash|provider`, `LIVE_OUT`. Each live test file lists its own variables in its header comment.

Adapter contract tests run on every `pnpm test` against recorded fixtures under `tests/fixtures/providers/`, so CI never needs a live service.

## Documentation

- Keep [`README.md`](README.md) runnable and the guides in [`docs/guides/`](docs/guides/) accurate when behaviour changes. Guide screenshots live in `docs/guides/images/`; retake them from the built app when a screen changes with `pnpm build:app && GUIDE_SHOTS=1 pnpm exec playwright test e2e/guide-screenshots.spec.ts` (mock provider, 1440 × 900), then look at each changed image before committing it.
- Any architectural choice (a new library, a storage format change, a new process boundary) gets an ADR in `docs/adr/NNNN-title.md`, copied from [`docs/adr/0000-template.md`](docs/adr/0000-template.md): context, decision, consequences, kept short. To reverse a decision, write a new ADR and mark the old one `Superseded by ADR-XXXX`.

## Ground rules

- Model and media calls go only through `src/main/providers/*` adapters; no vendor SDKs elsewhere.
- No secrets in code, project folders or logs; API keys go through Electron `safeStorage`.
- No telemetry and no network calls except to providers the user configured.
- Text-bearing injects render from HTML templates, never from AI-generated pixels.
- Persisted JSON is defined by zod schemas in `src/shared/schemas/`.
- IPC goes through typed channels in `src/shared/ipc/`; no raw `ipcRenderer` in components.
- UI uses `src/renderer/src/components/ui.tsx` and the design tokens in `styles/tokens.css`; every action must work from the keyboard, and colour contrast must meet WCAG AA.
