# 02 — Architecture

## Overview

```
┌──────────────────────────── Electron ────────────────────────────┐
│  Renderer (React + Vite)              Main (Node)                 │
│  ┌──────────────┐  typed IPC   ┌──────────────────────────────┐  │
│  │ routes/      │◄────────────►│ ipc/      (zod-validated)    │  │
│  │ editors/     │              │ db/       sqlite + sqlite-vec│  │
│  │ components/  │              │ ingest/   parse→chunk→embed  │  │
│  │ state/       │              │ retrieve/ hybrid search      │  │
│  └──────────────┘              │ generate/ pipeline + stages  │  │
│                                │ providers/ text|embed|media  │  │
│  Hidden render window          │ render/   html→png/pdf       │  │
│  (templates → PNG/PDF) ◄───────│ export/   pdf, zip, json, md │  │
│                                │ secrets/  safeStorage        │  │
│                                └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
          │                    │                      │
   LM Studio / Ollama      Anthropic API          ComfyUI (local)
   (OpenAI-compatible)                            HTTP + WebSocket
```

## Process boundaries

- **Main process** owns: filesystem, SQLite, all network calls, parsing, generation pipeline, media rendering, export. Nothing secret or heavy runs in the renderer.
- **Renderer** is a pure UI over IPC. Uses TanStack Query for IPC calls, Zustand for local UI state. No Node integration; `contextIsolation: true`; preload exposes a typed `window.api` generated from `src/shared/ipc.ts`.
- **Hidden render window** (`render/`): loads inject templates (HTML/CSS + JSON data) and captures PNG via `webContents.capturePage` or PDF via `printToPDF`. Pooled; one window per render job queue. Render windows get no IPC bridge.
- **Presentation window** (`facilitator/present.ts`, facilitator mode): shows one inject's media full-screen on a second display. It loads the app's own `index.html#/present/…` with the same preload and sandbox as the main window, so it is a trusted app view (`registerIpc` accepts it) with no extra privileges.
- **One generation job per scenario.** While a generation job runs for a scenario, `scenarios:save` and `scenarios:doc-save` for it return `CONFLICT` ("Generation is running for this scenario"); editors keep the user's edits and retry after `job:done`.
- **Worker threads** for ingestion (pdf parsing, OCR, embedding) so the UI never stalls.

## Live play protocol (`src/shared/live/`, ADR-0027)

One versioned message protocol carries a live exercise between the facilitator's app and participants' devices over any of three servers (the laptop on the room's Wi-Fi, the relay, an organization's own server). Every payload is AES-256-GCM ciphertext with the envelope header as AAD under one of two session keys: the **players key** every device holds and the **staff key** only controllers, evaluators and SimCell devices hold (expected actions, evaluator material, controller notes); everything a device sends to the controller is sealed to the controller alone with a per-message ECDH key. Controller frames are ECDSA P-256 signed; the public keys and the session key travel only in the invite link's `#fragment`. A device proves a staff seat with a key-derived proof and owns its client id through a resume token. Servers import the schemas and limits only and never hold a key. `LiveClient` is the state machine both the app and the player page run over a four-method `Transport`; `MemoryServer` implements the server contract in process for tests. Crypto runs on WebCrypto, with a lazily loaded `@noble/*` fallback for the player page in a non-secure context. Spec: `docs/specs/0406-live-protocol.md`.

## Storage

Project folder layout (portable, git-friendly):

```
MyAirport.asproj/
  project.json                 # metadata, settings, provider routing
  documents/<docId>/original.pdf, text.md, meta.json
  scenarios/<scenarioId>/
    scenario.json              # overview, objectives, roles, phases, msel (inject refs)
    idea.json                  # the idea the scenario was developed from, if any
    facilitator.json           # facilitator mode: exercise clock, delivered injects, hot wash notes
    evaluation.json            # evaluators' observations against the EEG criteria (#421)
    injects/<injectId>.json
    documents/{handbook,briefing,rubric,hotwash}.md
    media/<injectId>/<assetId>.{png,mp4,wav}
    history/                   # versioned snapshots (jsonl)
  prompts/                     # per-project prompt overrides
  index.sqlite                 # rebuildable: chunks, embeddings, fts5 (gitignored)
```

Copies of pack items a project uses (ADR-0018) sit in the project's own layers: `templates/injects/<type>/`, `comfy/workflows/`, `documents/<docId>/`, the domain profile snapshot in `project.json`, and the record of each copy (pack, version, file sha256) in `packs.json`.

App data folder (Electron `userData`; `TTX_USER_DATA` points tests elsewhere):

```
userData/
  settings.json                # app settings, including packs.catalogs (catalog URLs, empty by default)
  secrets.json                 # API keys, safeStorage ciphertext only
  prompts/                     # global prompt overrides
  templates/injects/<type>/    # user inject templates
  comfy/workflows/             # user ComfyUI workflows and bindings
  comfy/overrides/             # edited bindings; packs/<packId>/ for pack workflows (pack files stay read-only)
  packs/
    registry.json              # installed packs: id, version, enabled, source, archive and content sha256;
                               # bundledDisabled: the packs included with the app that the user turned off
    <id>/<version>/            # one installed pack, verified files, read-only
    catalogs/<sha256 of URL>.json   # last good copy of each catalog index.json
    .staging/                  # downloads and extractions in progress; emptied at startup
  setup/downloads/             # local tool installers (ADR-0021): deleted after a macOS install or a
                               # refused check; a Windows installer stays until the next attempt
  setup/logs/ollama.log        # output of the `ollama serve` the app started on Linux (#338)
```

On Linux the app unpacks Ollama per user, outside userData: `$XDG_DATA_HOME/actionstations/tools/ollama`
(default `~/.local/share/…`), with `bin/ollama` and `lib/ollama/` (ADR-0021, #338).

### Bundled packs (ADR-0020)

The app's own content ships as packs: `ai.actionstations.core` (the cross-domain inject templates, every prompt, the default ComfyUI workflows, the `generic` domain) and one `ai.actionstations.<domain>` pack per domain (its profile, the templates whose taxonomy tags limit them to that domain, its example and, later, public-domain documents). The sources stay where they are; `packs/bundled.json` maps them to packs:

```
packs/
  bundled.json                 # which templates, prompts, workflows, domains, examples, documents go where
  domains/<id>.json            # the domain profiles, as data
  documents/<pack>/<slug>/     # public-domain reference documents (US government works, CC0)
```

`scripts/build-bundled-packs.mjs` (part of `pnpm build` / `build:check`) assembles each pack into `out/bundled-packs/<id>/` with a full `pack.json`, validates it with the app's own reader, and fails on an item mapped to no pack or to two; electron-builder ships the folder as `app-resources/packs/` (beside `app-resources/templates/_shared` and `templates/export`, which are not pack items). At startup `src/main/packs/state.ts` loads them before the installed packs: packaged builds read and quick-check `app-resources/packs/`, unpackaged runs read the repo folders in place (`src/main/packs/bundled.ts`, "source mode"), and `TTX_BUNDLED_PACKS` points tests at a built folder. They are never copied to `userData`. Layer precedence is project > user > installed packs > bundled packs; an installed pack may replace a bundled template, prompt or workflow but never take a bundled domain id or a bundled pack id. A disabled bundled pack leaves the pickers and galleries, while projects that use its domain, templates or examples keep resolving them.

SQLite (`better-sqlite3`) tables: `documents`, `chunks(doc_id, heading_path, page, text)`, `chunks_fts` (FTS5), `chunk_vec` (sqlite-vec), `jobs`, `provider_calls` (token/cost log). Everything in SQLite is derivable from the folder; `Rebuild index` is a menu item.

## Ingestion

1. Detect type → parser: `pdf-parse`/`pdfjs-dist` with layout heuristics (fallback: Tesseract via `tesseract.js` for scanned pages); `mammoth` for DOCX; `officeparser`/custom zip+xml for PPTX; `xlsx` for sheets; remark for MD.
2. Heading detection → `heading_path` (e.g. `TIRP › Section 13 › 13.6 FIDS/BHS System Failure`). Numbered section regexes plus font-size cues from pdfjs.
3. Chunk by section, ~600 tokens with 80 overlap, keep page numbers.
4. Embed locally (`@xenova/transformers`, `bge-small-en-v1.5` or `nomic-embed-text` ONNX) or via provider.
5. Store; emit progress over IPC.

## Retrieval

Hybrid: FTS5 BM25 + vector cosine → reciprocal rank fusion → optional LLM rerank for top-20 → top-k with citations `{docTitle, headingPath, page, text}`. Retrieval queries are generated per stage (e.g., for `msel_phase` we query "manual procedures when <system> fails", "notification requirements", "who has authority to <action>").

## Generation pipeline

`generate/pipeline.ts` is a directed graph of stages with persisted checkpoints:

```
ideate ─┐
        ├─► scenario_overview ─► objectives_roles ─► phase_plan ─► msel_phase×N ─► inject_text×M ─► inject_media_brief×M ─► media_render×M
        │                                                                                     └─► controller_handbook ─► rubric ─► eeg ─► player_briefing ─► hotwash ─► critique
```

Each stage: `{ id, inputs, promptRef, providerTask, outputSchema (zod), retrievalPlan }`. Stages produce JSON validated against schema; on validation failure, one automatic repair attempt with the error fed back, then surface to user. Any stage can be re-run; downstream stages are marked stale, not auto-rerun.

Structured output strategy: prefer native JSON mode / tool-use when the provider supports it; otherwise instruct + extract fenced JSON + zod parse. Keep prompts in `prompts/*.md` with frontmatter so they're editable.

## Providers

```ts
interface TextProvider {
  id: string; kind: 'anthropic' | 'openai-compatible' | 'ollama';
  listModels(): Promise<ModelInfo[]>;
  chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse>; // supports json schema hint
  health(): Promise<Health>;
}
interface EmbeddingProvider { embed(texts: string[]): Promise<Float32Array[]>; dims: number }
interface MediaProvider {
  id: string; kind: 'comfyui' | 'template' | 'remote-stub';
  capabilities(): Set<'image' | 'video' | 'audio'>;
  generate(job: MediaJob, onProgress?): Promise<MediaAsset[]>;
}
```

- **Anthropic adapter:** Messages API, streaming, tool-use for JSON, prompt caching for the big doctrine context where supported.
- **OpenAI-compatible adapter:** covers LM Studio (`http://localhost:1234/v1`), Ollama (`/v1`), vLLM, OpenRouter, OpenAI. Handles `response_format` when advertised, else fallback.
- **Ollama native adapter:** for model listing/pull and embeddings.
- **ComfyUI adapter:** `POST /prompt`, `GET /history/{id}`, `ws://…/ws` progress, `GET /view` for outputs. Workflow JSON (API format) with `{{bindings}}` — a mapping from inject fields to node inputs (`["6", "inputs", "text"]`). Ship default workflows under `comfy/workflows/` (the core bundled pack's `workflows/` in a release) and a binding editor UI. Support image, image-to-video, and TTS nodes (document which custom nodes are expected; detect missing nodes via `/object_info`).
- **Template renderer:** `templates/injects/<type>/{template.html, style.css, schema.json, preview.json}` (shipped inside the bundled packs, ADR-0020). Handlebars-style data binding. Renders at 2× for crisp PNG; PDF for paper injects.

Routing: `project.json → providerRouting: { ideate: 'anthropic:claude-…', draft: 'lmstudio:…', critique: …, embed: 'local', image: 'comfy', video: 'comfy', audio: 'comfy' }`.

Secrets: `safeStorage.encryptString` → app `userData/secrets.json`; never in project folder.

**Outbound gate (#433, ADR-0031).** `resolve.ts` is the only place callers get providers. A provider for which `isRemoteProvider(config)` is true (`src/shared/provider-network.ts`: kind `anthropic`, or a non-loopback host unless `options.network: 'local'`) is wrapped by `providers/outbound/gate.ts`; local providers are returned unwrapped. For `chat`, the gate redacts system, context and messages (`outbound/detect/*`, `outbound/redact.ts`: keyed HMAC placeholders, mapping in memory only), builds an `OutboundManifest`, asks under the review policy (`outbound/approvals.ts`, IPC `privacy:*`, event `outbound:approval-needed`, `Job.awaiting`), checks the approved SHA-256 against the exact body, calls the adapter, restores placeholders in `text` and `json`, and appends to `<project>/cloud-sends.jsonl`. Embedding and media requests are previewed and approved without redaction. The job and project come from `ChatRequest.outbound` (filled by `runStage`) or the job's `AsyncLocalStorage` scope (`jobs/scope.ts`). An ESLint rule keeps registry and adapter construction inside `src/main/providers/`.

## Export

- PDF via the hidden window `printToPDF` on export-specific HTML templates (`templates/export/*`), so PDFs match in-app previews. Fonts bundled.
- MSEL landscape; Inject Deck one inject per page with media scaled to fit; Handbook/Briefing portrait with running headers; blank ICS-201 pages appended to Briefing.
- ZIP via `archiver`; `scenario.json` and `scenario.md` always included.
- DOCX (optional) via `docx` npm.

## Jobs & progress

`jobs` table + in-memory queue (p-queue). IPC events `job:progress`, `job:done`, `job:error`. Long runs survive renderer reloads; on app restart, incomplete jobs are shown as resumable.

## Testing

- Vitest unit tests for parsers, chunker, retrieval fusion, schema validation, provider adapters (recorded fixtures via `msw`/nock).
- Golden tests: render each inject template with `preview.json` → PNG snapshot compare (threshold).
- Playwright Electron e2e: create project → import `reference/ncia/*.md` → generate ideas with a mock provider → pick → generate → export ZIP → assert files.
- Mock providers (`providers/mock/*`) return canned, schema-valid outputs so the whole pipeline is testable offline and in `local-ci.sh`.

## Security

- `contextIsolation`, no `remote`, CSP on renderer, sandboxed hidden render window with no network (templates are local).
- The app makes two kinds of network call on its own, both only after the user turns them on: pack catalogs the user added (ADR-0018), and the update check (ADR-0024), one GET to `api.github.com/repos/actionstations-ai/actionstations/releases/latest` at most once a day with the setting on, or on **Check now**. It sends only the fixed URL and a `User-Agent: ActionStations/<version>`, follows no redirects, reads at most 1 MB and never downloads an installer.
- Cloud requests pass the outbound gate (see Providers): preview, approval bound to the request hash, optional redaction with placeholders whose mapping never leaves main-process memory, and a content-free send log.
- Validate every IPC payload with zod. Path-join guards so a malicious `scenario.json` can't escape the project folder.
- Treat parsed document text as data, never as prompt instructions (wrap retrieved chunks in delimiters and say so in system prompts).
