# Contributing

Thanks for helping build Action Stations. This page covers the project rules, the workflow, the local CI, the tests and where the design documents are. The longer version of the workflow is [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md); how the code is wired (handlers, routes, adapters, templates) is in [`docs/09-CODE-CONVENTIONS.md`](docs/09-CODE-CONVENTIONS.md).

## Project rules

Every change follows these rules, and a pull request that breaks one is not merged. Code comments and documents refer to them by number, for example "CONTRIBUTING.md, Project rules 5".

1. **GitHub costs nothing.** GitHub Actions runs only where it is free: workflows in this public repository, on standard GitHub-hosted runners, storing no artifacts or caches (`scripts/check-workflows.mjs` enforces it). CI is `scripts/local-ci.sh` (`pnpm ci:local`) plus the Husky hooks; Actions only builds the release installers. If a new check is needed, add it to `local-ci.sh` ([ADR-0023](docs/adr/0023-free-github-actions.md)).
2. **GitHub Issues are the task tracker.** Every piece of work has an issue, created from a template in `.github/ISSUE_TEMPLATE/` with the labels and milestone described in [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md). Every commit message references its issue (`#NN`). When the work ships, close the issue with a comment that says what shipped.
3. **Local-first and private.** No telemetry, and no network calls except to providers the user configured or downloads the user started. API keys are encrypted by the OS keychain through Electron `safeStorage`; they never go into project files or logs.
4. **Providers only through adapters.** Every model and media call goes through the interfaces in `src/main/providers/`. No vendor SDK or direct vendor call outside an adapter; ESLint enforces the import rule.
5. **Templates for text, AI for scenes.** Tweets, posts, tickets, emails, logs and information boards such as FIDS render from HTML templates, so their text is exact and legible. Image and video generation is for photographic content. An inject whose critical text is AI-rendered pixels does not ship.
6. **The stack is fixed:** Electron, React, TypeScript, Vite and pnpm; `better-sqlite3` with `sqlite-vec`; Vitest and Playwright; ESLint and Prettier; `electron-builder`. Don't swap any of them for another framework ([ADR-0001](docs/adr/0001-stack.md)).
7. **`main` always builds and launches.** Work happens on `feat/<issue>-<slug>` or `fix/<issue>-<slug>` branches (see [The loop](#the-loop) for the others) and is squash-merged through a pull request after `pnpm ci:local` passes.

## Set up

Prerequisites are in the [README](README.md#prerequisites) (Git LFS, Node.js 22.12+, pnpm 10, native build tools). Images, PDFs, Office files, fonts and media are stored with Git LFS (`.gitattributes`); the Husky hooks run its commands, so a clone made before `git lfs install` needs `git lfs pull`. Then:

```bash
pnpm install          # also installs the git hooks (Husky) and rebuilds native modules for Electron
pnpm dev              # run the app with hot reload
pnpm test             # unit tests
```

For a guided tour of the app itself, see [Getting started](docs/guides/getting-started.md).

### Commands

```bash
pnpm install                  # install deps; builds native modules for Electron
pnpm dev                      # launch the app (electron-vite, HMR)
scripts/dev-bundle.sh         # macOS: .dev-app/Action Stations.app, a renamed Electron so the menu bar and Dock say Action Stations
pnpm test                     # Vitest unit tests (run under Electron-as-Node, mock providers)
pnpm lint && pnpm typecheck   # ESLint + tsc
pnpm ci:local                 # full local CI: scripts/local-ci.sh
pnpm badges                   # full local CI, then refresh the README badges in docs/badges/
pnpm stats                    # snapshot downloads, stars and forks into docs/stats/ (README chart)
pnpm e2e                      # Playwright end-to-end tests against the Electron app
pnpm bench -- --models ollama:<name>   # score local models on the example projects (docs/guides/model-benchmark.md)
pnpm bench:report             # merge docs/benchmarks/runs/ into docs/benchmarks/model-benchmarks.json
pnpm build                    # electron-builder installers (dmg / nsis / AppImage)
```

The live generation tests are listed under [Live tests](#live-tests). Releasing is described in [`docs/RELEASING.md`](docs/RELEASING.md).

### Repository layout

```
src/main/            Electron main: ipc/, providers/, ingest/, generate/, render/, export/, db/
src/renderer/        React app: routes/, components/, editors/, state/
src/shared/          Types, zod schemas, IPC contracts
templates/injects/   HTML/CSS templates per inject type
prompts/             Default prompt files (markdown with frontmatter)
comfy/workflows/     Default ComfyUI workflow JSON per media type
docs/                PRD, architecture, taxonomy, methodology, ADRs, guides
reference/           Sample plans per domain + the CSAAP scenario 1–8 gold-standard outputs
examples/            Example projects that ship with the app (Projects → Examples)
packs/               bundled.json (repo folders → bundled packs), domains/<id>.json profiles, documents/
scripts/             local-ci.sh, release, pack and example builders, dev helpers
e2e/                 Playwright tests
```

[`reference/`](reference/README.md) holds the sample plans a user would import and the eight hand-written CSAAP airport exercises the output is measured against; `reference/scenario-3/` is the primary benchmark. [`examples/`](examples/README.md) holds the example projects built from those plans, with the manifest format and the rules for adding one.

## License and contributor agreement

Action Stations is source-available under the [PolyForm Internal Use License 1.0.0](LICENSE.md), with commercial use reserved as described in [COMMERCIAL.md](COMMERCIAL.md). Contributions are accepted under the [Contributor License Agreement](CLA.md): tick the agreement box in the pull request template. You keep the copyright in your work; the agreement lets the licensor offer it under both the source-available and the commercial licenses.

## The loop

1. **Issue first.** Every change starts as a GitHub issue on `actionstations-ai/actionstations`, created from a template in `.github/ISSUE_TEMPLATE/` (feature, bug, new inject type). Apply `area:*`, `type:*` and priority labels and a milestone. If you find more work while you are at it, open an issue for it rather than leaving a placeholder comment in the code.
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

`scripts/local-ci.sh` (`pnpm ci:local`) is the CI, and it runs again on every `git push` through the Husky `pre-push` hook. The `pre-commit` hook runs lint-staged (ESLint `--fix` and Prettier on staged files).

| Step                  | Command                                       | What it checks                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard                 | `node scripts/check-workflows.mjs`            | Every GitHub Actions workflow runs on standard GitHub-hosted runners and stores no artifacts or caches, so Actions stays free (ADR-0023).                                                                       |
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
| Badges                | `node scripts/make-badges.mjs`                | Off by default. With `BADGES=1` (`pnpm badges`), the last step after everything else passed: rewrites the README badges in `docs/badges/` (see [Badges](#badges)).                                              |

`bash scripts/local-ci.sh --quick` stops after the unit tests (guard, install, lint, format, doc links, typecheck, tests), for fast iteration. Run the full version before you push.

`git push --no-verify` is acceptable only for work-in-progress pushes to feature branches, and the PR must say so.

### Badges

The README badges for the build itself are SVG files in `docs/badges/`, written offline by `scripts/make-badges.mjs` as the last step of a full local CI run with `BADGES=1` (`pnpm badges`), so they only ever say "passing" after a green run. The step is off by default: `pnpm ci:local` and the pre-push hook never touch `docs/badges/`, so feature branches do not conflict over them. The values come from the run itself and the repository: the unit-test count from the Vitest summary, the e2e count from `playwright test --list`, the version from `package.json` (during `pnpm release`, the version being released, #388), the Electron version from `package.json`, the license from `LICENSE.md` and `LICENSE-EDUCATION.md`, the platforms from `electron-builder.yml`.

The files are deterministic. `docs/badges/badges.json` holds the current values and the date on the "local CI" badge. A run that measures the same values keeps the old date and leaves the files untouched, so the tree stays clean. When a value changes (a test was added, the version moved) every changed badge is rewritten and the date becomes today's. Badges are refreshed in two places only: `pnpm badges` on an up-to-date `main`, committed in a small `chore(badges)` pull request, and `pnpm release`, which runs local CI with `BADGES=1` and on `--publish` commits the refreshed badges before `pnpm version`, so the tree is clean for the version bump.

The GitHub social preview image (`docs/social-preview.png`, 1280 × 640) is built from the logo and a guide screenshot with `pnpm exec electron scripts/make-social-preview.mjs`. GitHub only takes it through the web UI: **Settings → General → Social preview → Edit → Upload an image**.

If a new check is needed, add it to `scripts/local-ci.sh`. GitHub Actions is for the release build only, on free standard runners ([ADR-0023](docs/adr/0023-free-github-actions.md)).

### Repository stats

`pnpm stats` (`scripts/repo-stats.mjs`) reads stars, forks and every release's download counts with `gh api` (sign in with `gh auth login` first) and adds today's snapshot to `docs/stats/history.json`; a second run on the same day replaces it. Only installers count (`.dmg`, `.exe`, `.AppImage` and similar), not checksums, blockmaps or `latest-*.yml`. GitHub keeps no history and restarts an asset's count when the file is replaced, so the script keeps a per-file ledger: when a count drops, the earlier total is carried forward. It then redraws the README chart (`downloads-light.svg`, `downloads-dark.svg`) and the downloads badge. `pnpm release` runs it and, on `--publish`, commits the result in a `chore(stats)` commit; between releases, run it on an up-to-date `main` and commit it in a small `chore(stats)` pull request. `--offline` redraws from `history.json` without fetching. The stars and forks badges come live from shields.io, and the stars-over-time chart from star-history.com.

## Tests in more detail

- **Unit tests:** `pnpm test`, or one file with `pnpm test -- path/to/file.test.ts`; `pnpm test:watch` to re-run on change. Code that imports `electron` needs `vi.mock('electron', …)`. Renderer component tests start with `// @vitest-environment happy-dom`.
- **End-to-end:** `pnpm e2e` builds the app and runs Playwright against it. `e2e/helpers.ts` `launch()` gives each test an isolated data folder. Playwright empties `test-results/` at the start of every run; copy anything you want to keep elsewhere first.
- **Packs end to end:** `pnpm build:app && TTX_HEADLESS=1 pnpm exec playwright test e2e/packs.spec.ts` installs, uses, updates, refuses, uninstalls and exports packs against a local catalog on 127.0.0.1, and fails if the app sends any request to a non-loopback host (main-process traffic from `e2e/net-recorder.cjs`, Chromium's from `--log-net-log`).
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

- Keep [`README.md`](README.md) runnable and the guides in [`docs/guides/`](docs/guides/) accurate when behaviour changes. Guide screenshots live in `docs/guides/images/`; retake them from the built app when a screen changes with `pnpm build:app && GUIDE_SHOTS=1 pnpm exec playwright test e2e/guide-screenshots.spec.ts` (mock provider, 1440 × 900), then look at each changed image before committing it. The Packs screenshots in `docs/guides/images/packs/` come from `GUIDE_SHOTS=1 pnpm exec playwright test e2e/packs.spec.ts`.
- When a feature adds or renames a guide section, add or update its tip in [`src/shared/tips/tips.json`](src/shared/tips/tips.json) (id, one or two plain sentences, `guide` as `docs/guides/<file>.md#<anchor>`, `linkLabel`, and `since` for a feature newer than the last release). Never reuse an id. `pnpm test` fails when a tip links to a heading that does not exist, so renaming a heading means updating its tips.
- Any architectural choice (a new library, a storage format change, a new process boundary) gets an ADR in `docs/adr/NNNN-title.md`, copied from [`docs/adr/0000-template.md`](docs/adr/0000-template.md): context, decision, consequences, kept short. To reverse a decision, write a new ADR and mark the old one `Superseded by ADR-XXXX`.

## Design documents

| Doc                                                                  | Purpose                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| [`docs/01-PRD.md`](docs/01-PRD.md)                                   | Product requirements                                    |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md)                 | Processes, storage, providers, rendering, export        |
| [`docs/03-INJECT-TAXONOMY.md`](docs/03-INJECT-TAXONOMY.md)           | Supported inject types, fields and render targets       |
| [`docs/04-TABLETOP-METHODOLOGY.md`](docs/04-TABLETOP-METHODOLOGY.md) | HSEEP-style exercise structure the generator reproduces |
| [`docs/05-DATA-MODEL.md`](docs/05-DATA-MODEL.md)                     | Project / Scenario / Inject / Asset schema              |
| [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md)           | Issues, labels, milestones, branching, local CI         |
| [`docs/08-ROADMAP.md`](docs/08-ROADMAP.md)                           | Milestones M0 to M6 of the first release                |
| [`docs/09-CODE-CONVENTIONS.md`](docs/09-CODE-CONVENTIONS.md)         | How handlers, routes, adapters and templates are wired  |
| [`docs/packs-format.md`](docs/packs-format.md)                       | The `.aspack` format, `pack.json` and catalogs          |
| [`docs/RELEASING.md`](docs/RELEASING.md)                             | Building installers and cutting a release               |
| [`docs/research/domains/`](docs/research/domains/README.md)          | Research notes behind each domain profile and pack      |

### Architecture decision records

| ADR                                                           | Decision                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [0001](docs/adr/0001-stack.md)                                | Application stack: Electron, React, TypeScript, Vite, pnpm, SQLite + sqlite-vec                                        |
| [0002](docs/adr/0002-local-ci-no-actions.md)                  | Local CI only, no GitHub Actions (superseded by 0023)                                                                  |
| [0003](docs/adr/0003-project-folder-format.md)                | Project folder format                                                                                                  |
| [0004](docs/adr/0004-native-modules-and-tests.md)             | Native modules and the test runtime                                                                                    |
| [0005](docs/adr/0005-embeddings.md)                           | Embeddings                                                                                                             |
| [0006](docs/adr/0006-providers-over-fetch.md)                 | Provider adapters over fetch                                                                                           |
| [0007](docs/adr/0007-structured-output.md)                    | Structured output from LLMs                                                                                            |
| [0008](docs/adr/0008-template-rendering.md)                   | Template rendering to PNG and PDF                                                                                      |
| [0009](docs/adr/0009-audio-tts.md)                            | Audio and TTS (amended by 0010)                                                                                        |
| [0010](docs/adr/0010-local-tts-openai-speech.md)              | Local TTS through the OpenAI-compatible speech API                                                                     |
| [0011](docs/adr/0011-video-model-ltxv.md)                     | LTX-Video as the default local video model                                                                             |
| [0012](docs/adr/0012-inject-stages.md)                        | Inject stages: schema-guided text, deterministic media plan, keep-with-warning                                         |
| [0013](docs/adr/0013-app-protocol.md)                         | Serve the renderer from `app://bundle/`                                                                                |
| [0014](docs/adr/0014-domain-profiles.md)                      | Domain profiles: domain-neutral generation as data                                                                     |
| [0015](docs/adr/0015-repair-in-place.md)                      | Repair a finished scenario in place                                                                                    |
| [0016](docs/adr/0016-forward-compatible-files.md)             | Forward-compatible project files                                                                                       |
| [0017](docs/adr/0017-windowed-lists.md)                       | Memoized rows and windowed long lists (MSEL grid, inject deck)                                                         |
| [0018](docs/adr/0018-packs.md)                                | Packs: installable content bundles                                                                                     |
| [0019](docs/adr/0019-rename-action-stations.md)               | Rename to Action Stations; migrate old settings, projects and keys                                                     |
| [0020](docs/adr/0020-bundled-packs.md)                        | Built-in content ships as bundled packs                                                                                |
| [0021](docs/adr/0021-local-tools-setup.md)                    | Optional setup of local model tools, or cloud APIs only                                                                |
| [0023](docs/adr/0023-free-github-actions.md)                  | GitHub Actions where it is free (release installers)                                                                   |
| [0024](docs/adr/0024-opt-in-update-check.md)                  | Opt-in update check                                                                                                    |
| [0025](docs/adr/0025-core-capabilities-and-eegs.md)           | Core Capabilities and Exercise Evaluation Guides from the plans                                                        |
| [0026](docs/adr/0026-surveys-anonymous-by-construction.md)    | Surveys are anonymous by construction                                                                                  |
| [0027](docs/adr/0027-live-play-protocol.md)                   | Live play protocol: two session keys, frames to the controller sealed to it, signed controller frames, no server reads |
| [0028](docs/adr/0028-deterministic-grounding-first.md)        | Deterministic grounding first, model verification only with validated quotes                                           |
| [0030](docs/adr/0030-hseep-blocks-and-excel-msel.md)          | HSEEP documents as shared blocks; the MSEL workbook with exceljs                                                       |
| [0031](docs/adr/0031-outbound-gate-and-keyed-placeholders.md) | One outbound gate at provider resolution, with keyed deterministic placeholders                                        |
| [0039](docs/adr/0039-local-model-benchmark.md)                | Local model benchmark drives the built app with deterministic scoring                                                  |

New ADRs start from [`docs/adr/0000-template.md`](docs/adr/0000-template.md).

## Code conventions

These sit alongside the [project rules](#project-rules):

- No secrets in code, project folders or logs.
- Persisted JSON is defined by zod schemas in `src/shared/schemas/`.
- IPC goes through typed channels in `src/shared/ipc/`; no raw `ipcRenderer` in components.
- UI uses `src/renderer/src/components/ui.tsx` and the design tokens in `styles/tokens.css`; every action must work from the keyboard, and colour contrast must meet WCAG AA.
- Generated output is measured against the hand-written exercises in `reference/scenario-3/`. A change to prompts or generation that makes the MSEL read worse next to that one is not finished.
