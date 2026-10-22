# 09 — Code conventions and extension points

How the codebase is wired so parallel workstreams never edit the same file.

## Contracts (`src/shared/`)
- `schemas/*.ts` — zod schemas for everything persisted or sent over IPC; TS types are `z.infer`.
- `schemas/generation.ts` — the JSON each generation stage asks a model for. Citations are keys (`"C3"`) into the retrieved chunks shown in that prompt; the pipeline resolves them.
- `taxonomy.ts` — purpose tags and inject types (render paths, paper, MVP flag, default delivery).
- `ipc/<domain>.ts` — invoke channels for one domain (`channel(reqSchema, resSchema)`); `ipc/index.ts` merges them and declares push events. A workstream may edit **only its own domain file**; anything else goes through an issue.
- `media-url.ts` — `ttx-media://` URLs for showing project files in the renderer.
- **Ids:** every id that can become a path segment uses `SafeId` (`schemas/common.ts`): `[A-Za-z0-9][A-Za-z0-9_-]*`, max 128.
- **Patches:** update requests use `patchOf(Schema)`, never `.partial()` — zod v4's `.partial()` keeps inner defaults and would reset fields the caller didn't send.
- **Stored paths** (`MediaAsset.path`, `Scenario.documents.*`) are project-root-relative POSIX paths, e.g. `scenarios/<id>/media/<injectId>/<assetId>.png`, so `mediaUrl(projectPath, asset.path)` works directly.
- `ipc/index.ts` merges domain maps with `mergeChannels`, which throws on duplicate channel names.

## Main process (`src/main/`)
- **IPC handlers:** one file per domain in `ipc/handlers/<domain>.ts`, `export default defineHandlers({...})`. Discovered by `import.meta.glob`; a channel may be handled by exactly one file. Requests are zod-validated before your handler runs; responses are validated in dev/test.
- **Errors:** throw `AppError(code, message)` (`lib/errors.ts`); it reaches the renderer as `IpcError` with the same code.
- **Project guard:** every handler taking a `projectPath` starts with `const root = await requireProject(projectPath)` (`project/guard.ts`) — the path must be a project the user opened and contain project.json.
- **Project store:** `project/store.ts` — `createProject`, `openProject`, `loadProject`, `updateProject(path, mutate)` (serialized per project; emits `project:changed`), `projectPaths(root)` for every well-known location.
- **IPC trust:** only the app's own renderer document may invoke channels (`registerIpc` checks `senderFrame.url`); hidden render windows get no bridge. The facilitator presentation window is a trusted app view: it loads the app's own `index.html#/present/…` with the same preload and sandbox as the main window.
- **Files:** every path from JSON or IPC goes through `safeJoin(root, rel)` (rejects escapes *and* the root itself); use `safeJoinReal` when reading/serving files that could be symlinks; write with `writeJsonAtomic` / `writeFileAtomic`; read with `readJson(path, Schema)` (`lib/fs.ts`).
- **Settings:** `settings/store.ts` (`getSettings`, `updateSettings`) — userData/settings.json. Never put secrets there.
- **Jobs:** `jobs/manager.ts` — `jobs.start(kind, async (ctx) => …)`; use `ctx.progress`, `ctx.log`, `ctx.token` (streamed LLM text), `ctx.signal`. Events reach the renderer as `job:progress`, `job:token`, `job:done`.
- **Events:** `lib/events.ts` `emit('project:changed', …)` after writes so the renderer refreshes.
- **Providers:** interfaces in `providers/types.ts`. An adapter is a folder with `adapter.ts` exporting `adapter: AdapterModule`; `providers/registry.ts` discovers it. Use `jsonSpec(name, Schema)` and `extractJson(text)` from `providers/json.ts`. The `mock` adapter returns schema-valid fixtures (`providers/mock/fixtures.ts`); override per test with `setMockResponse`.
- **Provider resolution:** stages never construct providers; call `resolveTextProvider(task, projectPath)` / `resolveMediaProvider` / `resolveEmbeddingProvider` (`providers/resolve.ts`) — effective routing is project over global. Secrets come from `secrets/index.ts` (`getSecret`) and are never passed to the renderer.
- **Provider options** (`ProviderConfig.options`, never secrets): all — `timeoutMs`, `maxTokens`; anthropic — `anthropicVersion`, `effort`, `fallbacks`; openai-compatible — `jsonMode` (`json_schema`|`json_object`|`prompt`), `headers`, `inputUsdPerMTok`, `outputUsdPerMTok`, `embeddingDims`, TTS `ttsModel`, `voice`, `voices`, `speakerGapSec`, `voiceClone` (`off` to voice every line independently; by default a speaker's later lines are cloned from their first clip through a VoxCPM model), `cloneModel` (the VoxCPM model to clone with; otherwise the first one the server lists); ollama — `numCtx`, `embeddingDims`.
- **Local embeddings** run in an Electron `utilityProcess` (`src/main/providers/embedding/`), batch 16; a crash there fails the request with `AppError('PROVIDER')` and a fresh process starts on the next call — the app never goes down with it. Model files are downloaded by the app itself (resumable, cancellable via the job).
- **Provider utilities:** `providers:pull-model` (Ollama pull as a `model-pull` job with progress) and `providers:test-speech` (speaks ≤ 200 chars through an audio-capable provider into a temp dir; returns a data: URL) — used by the Providers screen and the setup wizard. `providers:detect-local` also returns LM Studio's `loadedModels`.
- **Env flags:** `TTX_USER_DATA`, `TTX_RESOURCES` (paths), `TTX_HEADLESS` (don't show windows), `TTX_MOCK_PROVIDERS=1` (seed a mock provider and route every task to it when routing is empty).
- **Paths:** `lib/paths.ts` — `userDataPath()`, `resourcePath('templates', …)`. `TTX_USER_DATA` and `TTX_RESOURCES` override them in tests/e2e.

## Renderer (`src/renderer/src/`)
- **Routes:** a feature folder `routes/<feature>/index.ts` exports `routes: RouteDef[]` (path, lazy component, optional nav entry). Project-scoped routes use `/p/:projectKey/...` (`projectKey(path)` encodes the folder path).
- **Data:** `useIpcQuery(channel, req)` / `useIpcMutation(channel, { invalidates })` from `lib/query.ts`; `call()` / `subscribe()` from `lib/api.ts`. No `ipcRenderer`, Node modules or `@main/*` imports (ESLint enforces).
- **UI kit:** `components/ui.tsx` (Button, PageHeader, EmptyState, Field, TagChip, Badge, ProgressBar, Dialog), `components/toast.tsx`. Colors, spacing and type come from `styles/tokens.css` only — no raw hex values in components.
- Component tests opt into the DOM with a `// @vitest-environment happy-dom` first line.

## Tests
- `pnpm test` runs Vitest inside Electron's Node (ADR-0004). Tests live beside the code (`*.test.ts`) or in `tests/`.
- Provider adapters: recorded-fixture contract test always; live test only when `LIVE=1`.
- `pnpm e2e` builds and drives the real app with Playwright (`e2e/helpers.ts` `launch()` isolates userData).

## Inject templates (`templates/injects/<type>/`)
- Files: `meta.json` (type, label, version, width, height?, paper, variants[], background, imageSlots[]), `schema.json` (JSON Schema 2020-12 for `fields`, `additionalProperties: false`), `preview.json` (`{ fields, variant?, assets? }` — realistic sample data, must validate against the schema; golden tests use it), `template.html` (Handlebars body), `style.css`.
- Template context: `fields`, `brand` (project Brand: `city`, `region`, `primaryColor`, and aliases read by templates — `brand.aliases.org` (full organization name), `orgShort` (e.g. NCIA), `orgDomain` (email/web domain), `localTv` (station name), `airport` (site name on system screens such as CCTV, BHS and FIDS); a field value overrides an alias and templates fall back to generic text), `variant`, `assets.<slot>` (file:/data: URL of an AI image for composite slots).
- Escaping is ON (field values are untrusted model output). Helpers: `eq ne and or not gt inc default upper lower compact initials nl2br social join json times`. Never use triple-stash `{{{ }}}`.
- Rendering: sandboxed offscreen window, no network, no scripts in templates; fonts only from `templates/_shared/fonts.css` (Inter, Roboto, Roboto Condensed, JetBrains Mono, Source Serif 4, Courier Prime, Caveat). Paper types are US Letter, 816 × 1056 CSS px. PNG renders at 2× (deterministic: offscreen DPR = 1).
- Dev loop: `pnpm build:app && pnpm test:templates` writes `test-results/templates/<type>[--variant].png`. Reference example: `templates/injects/time_jump_card/`. The in-app **Templates** page (`/templates`) shows every template's preview, its fields and variants.
- **Goldens:** `templates/injects/<type>/__golden__/<variant>.png` (2×, from preview.json). `pnpm test:templates` renders each template × variant twice (the two renders may differ in at most 0.01 % of pixels, GPU anti-aliasing noise), then compares with pixelmatch (threshold 0.1, ≤ 0.1 % differing pixels); mismatches write `.tmp/golden-diff/<type>--<variant>.{actual,diff}.png`. A missing golden fails and writes `.tmp/golden-diff/<type>--<variant>.actual.png`: look at it, copy it to `__golden__/<variant>.png`, commit it with the template. `UPDATE_GOLDENS=1 pnpm test:templates` rewrites every golden, so review the diff of `templates/` afterwards. Walkthrough: `docs/guides/templates.md`. Goldens are macOS baselines; regenerate deliberately, never to make a red test green.
- Main-side API: `composeDocument`, `renderPng`, `renderPdf` (`src/main/render/`), `validateFields(type, fields)`.
- **Render pool:** `renderPng`/`renderPdf` run in a pool of warm offscreen windows (`render/pool.ts`, `render/window.ts`): 2 windows by default, keyed by zoom, emptied between jobs, recycled after 50 renders or a renderer crash; each render times out after 15 s (`INTERNAL` "Render timed out…" / "Render window crashed…"). Tune with `configureRenderPool()` or `TTX_RENDER_POOL_SIZE`, `TTX_RENDER_MAX_USES`, `TTX_RENDER_TIMEOUT_MS`.
- **Inject media:** `render:inject` / `renderInjectAssets(root, scenarioId, inject, { brand })` (`render/inject.ts`; the inject pipeline calls the latter and then `saveInject`). Fields are validated against the schema (`VALIDATION` lists the issues); output goes to `scenarios/<id>/media/<injectId>/<assetId>.png` (2×) plus `<assetId>.pdf` for paper templates, as MediaAssets with `role: 'rendered'` (or `'composite'` when an AI image filled a slot) and `provenance { provider: 'template', templateId, templateVersion, createdAt }`. A re-render replaces earlier `rendered`/`composite` assets and their files; `generated` and `source` assets stay. `render:inject` returns the inject's full asset list.
- **Image slot convention:** an AI image (`role: 'generated'`, `kind: 'image'`) fills the template slot named by its asset id prefix, `<slot>-<ULID>` (`slotAssetId('photo')` → `photo-01J…`). A template with exactly one `imageSlots` entry also accepts an unprefixed generated image (the latest one).

## Docs
- User and contributor guides live in `docs/guides/` (getting started, providers, prompts, templates, methodology), with screenshots from the built app in `docs/guides/images/`. Update the guide when you change the behaviour it describes.
- `node scripts/check-doc-links.mjs` (a `local-ci.sh` step) fails on relative Markdown links or images that point at missing files, and on `#anchors` into Markdown files that match no heading. External URLs are not checked.
