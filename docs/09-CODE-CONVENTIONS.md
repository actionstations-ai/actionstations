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
- **IPC trust:** only the app's own renderer document may invoke channels (`registerIpc` checks `senderFrame.url`); hidden render/present windows get no bridge.
- **Files:** every path from JSON or IPC goes through `safeJoin(root, rel)` (rejects escapes *and* the root itself); use `safeJoinReal` when reading/serving files that could be symlinks; write with `writeJsonAtomic` / `writeFileAtomic`; read with `readJson(path, Schema)` (`lib/fs.ts`).
- **Settings:** `settings/store.ts` (`getSettings`, `updateSettings`) — userData/settings.json. Never put secrets there.
- **Jobs:** `jobs/manager.ts` — `jobs.start(kind, async (ctx) => …)`; use `ctx.progress`, `ctx.log`, `ctx.token` (streamed LLM text), `ctx.signal`. Events reach the renderer as `job:progress`, `job:token`, `job:done`.
- **Events:** `lib/events.ts` `emit('project:changed', …)` after writes so the renderer refreshes.
- **Providers:** interfaces in `providers/types.ts`. An adapter is a folder with `adapter.ts` exporting `adapter: AdapterModule`; `providers/registry.ts` discovers it. Use `jsonSpec(name, Schema)` and `extractJson(text)` from `providers/json.ts`. The `mock` adapter returns schema-valid fixtures (`providers/mock/fixtures.ts`); override per test with `setMockResponse`.
- **Provider resolution:** stages never construct providers; call `resolveTextProvider(task, projectPath)` / `resolveMediaProvider` / `resolveEmbeddingProvider` (`providers/resolve.ts`) — effective routing is project over global. Secrets come from `secrets/index.ts` (`getSecret`) and are never passed to the renderer.
- **Provider options** (`ProviderConfig.options`, never secrets): all — `timeoutMs`, `maxTokens`; anthropic — `anthropicVersion`, `effort`, `fallbacks`; openai-compatible — `jsonMode` (`json_schema`|`json_object`|`prompt`), `headers`, `inputUsdPerMTok`, `outputUsdPerMTok`, `embeddingDims`, TTS `ttsModel`, `voice`, `voices`, `speakerGapSec`; ollama — `numCtx`, `embeddingDims`.
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
