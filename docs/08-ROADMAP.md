# 08 — Roadmap

Each milestone ends with a tagged, launchable build and a short demo note in the milestone's tracking issue.

## M0 — Scaffold (target: day 1–2)
- electron-vite + React + TS + pnpm; ESLint/Prettier; Vitest; Playwright Electron; Husky + lint-staged; `scripts/local-ci.sh`; electron-builder config for win/mac/linux.
- `src/shared/` contracts: zod schemas from `05-DATA-MODEL.md`, IPC map, provider interfaces, inject envelope + first `schema.json` files.
- README with run instructions; ADR-0001 (stack), ADR-0002 (no Actions / local CI), ADR-0003 (project folder format).
- `bootstrap-github.sh` run; backlog visible.
**Exit:** `pnpm dev` opens a window with an empty "Projects" screen; `pnpm ci:local` green.

## M1 — Projects & Ingestion
- Create/open project folders; recent list; settings page.
- Import PDF/DOCX/PPTX/MD/TXT/PNG; parsing in a worker; heading-aware chunks; local embeddings; FTS5 + sqlite-vec; hybrid search with citations; "Rebuild index".
- Documents screen with status, headings preview, tags; a debug "Search" panel showing retrieved chunks.
**Exit:** import `reference/ncia/*.md` and the ICS forms; search "FIDS failure" returns TIRP 13.6 and AEP Appendix 6 with correct heading paths.

## M2 — Providers & Generation (text)
- Anthropic, OpenAI-compatible (LM Studio/Ollama), Ollama native adapters; secrets in safeStorage; provider settings UI with health check and model list; routing table.
- Prompt library with defaults for all stages; overrides; diff/reset.
- Pipeline: ideate → overview → objectives/roles → phases → MSEL (4 phases) → handbook → rubric → briefing → hotwash → critique. Checkpoints, re-run a stage, stale marking. Mock provider for tests.
- Scenario screen: streaming log, generated documents as read-only markdown, MSEL as read-only table.
**Exit:** With LM Studio *or* Claude configured, "Give me ideas" returns grounded concepts; choosing one yields a full MSEL with ≥ 20 rows, correct purpose-tag mix, and real citations.

## M3 — Injects & Media
- Hidden-window template renderer with pooling; golden tests.
- Templates batch 1 (14 types — see taxonomy "Minimum viable set").
- ComfyUI adapter: connection settings, workflow import, binding UI, node detection, default workflows (image, image→video, TTS); job queue with progress.
- Inject stages: expand MSEL rows to injects, media briefs, render; provenance recorded.
**Exit:** Regenerate Scenario 3's deck from its MSEL: every inject in `reference/scenario-3/master-inject-deck.md` renders as a PNG/PDF; one AI scene photo and one TTS radio call produced via ComfyUI.

## M4 — Editing
- MSEL grid editor (inline edit, drag retime, bulk shift, insert control cards, lints as warnings).
- Inject editor (schema-driven form, live preview, regenerate text/media, versions, lock).
- Markdown/rich-text editors for handbook, briefing, rubric, hotwash with "regenerate section".
**Exit:** Edit five injects and three MSEL times; changes persist in the project folder and show in previews.

## M5 — Export & Facilitator Mode
- Export templates; PDFs for MSEL, Inject Deck, Handbook, Briefing (+ blank ICS-201 pages), full Exercise Plan; media files; distribution ZIP (facilitator/ players/); scenario.json/.md; optional DOCX.
- Facilitator mode: timeline, exercise clock, deliver → full-screen media on second display, notes.
- E2E suite covering the whole flow with the mock provider.
**Exit:** Distribution ZIP opens cleanly; PDFs are visually comparable to `reference/scenario-3/` structure.

## M6 — Polish & Release 0.1
- Onboarding wizard (detect LM Studio/Ollama/ComfyUI on localhost; test buttons).
- Error UX, empty states, a11y pass, performance pass on ingestion.
- Installers for win/mac/linux via `pnpm build`; `gh release create v0.1.0`.
- User guide, provider setup guides, template authoring guide, CONTRIBUTING.

## Later (backlog, not scheduled)
- Remote image/video/voice providers; template marketplace import/export; ICS-203 pre-fill; multi-scenario "course" bundles; translation; per-role player apps for live delivery; evaluation capture tied to rubric.
