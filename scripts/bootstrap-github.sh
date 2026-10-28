#!/usr/bin/env bash
# One-shot setup of labels, milestones and the seed backlog on actionstations-ai/actionstations.
# Requires: gh (authenticated), jq. Safe to re-run: existing labels/milestones are updated, issues are only created if a same-title open issue does not exist.
set -euo pipefail
REPO="${REPO:-actionstations-ai/actionstations}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

say "Labels"
label() { gh label create "$1" --color "$2" --description "$3" --repo "$REPO" --force >/dev/null; }
for a in scaffold ipc ingest retrieval providers comfy templates generate editor export facilitator tests docs; do
  label "area:$a" 0E8A16 "Component: $a"
done
label "type:feature"  1D76DB "New capability"
label "type:bug"      D73A4A "Defect"
label "type:chore"    BFD4F2 "Tooling / maintenance"
label "type:refactor" C5DEF5 "No behavior change"
label "type:spike"    FBCA04 "Time-boxed investigation"
label "inject-type"   5319E7 "New inject template request"
label "epic"          3E4B9E "Tracking issue with child tasks"
label "good-first-issue" 7057FF "Small and well specified"
label "blocked"       B60205 "Waiting on something"
label "needs-decision" E99695 "Needs owner input"
label "P0" B60205 "Now"; label "P1" D93F0B "Next"; label "P2" FBCA04 "Later"

say "Milestones"
ms() {
  local title="$1" desc="$2"
  if ! gh api "repos/$REPO/milestones?state=all" --paginate | jq -e --arg t "$title" '.[] | select(.title==$t)' >/dev/null; then
    gh api "repos/$REPO/milestones" -f title="$title" -f description="$desc" >/dev/null
  fi
}
ms "M0 Scaffold" "Electron+React+TS scaffold, local CI, shared contracts, docs"
ms "M1 Projects & Ingestion" "Project folders, document parsing, chunking, local embeddings, hybrid retrieval"
ms "M2 Providers & Generation" "Text providers, secrets, prompt library, generation pipeline through MSEL/handbook/briefing"
ms "M3 Injects & Media" "Template renderer, inject templates batch 1, ComfyUI adapter, inject stages"
ms "M4 Editing" "MSEL grid, inject editor, document editors"
ms "M5 Export & Facilitator" "PDF/ZIP/JSON export, facilitator mode, e2e"
ms "M6 Polish & Release 0.1" "Onboarding, a11y, installers, docs"

say "Issues"
issue() {
  local title="$1" milestone="$2" labels="$3" body="$4"
  if gh issue list --repo "$REPO" --state open --search "in:title \"$title\"" --json title | jq -e --arg t "$title" '.[] | select(.title==$t)' >/dev/null; then
    echo "  exists: $title"; return
  fi
  gh issue create --repo "$REPO" --title "$title" --milestone "$milestone" --label "$labels" --body "$body" >/dev/null
  echo "  created: $title"
}

# ---- M0
issue "Epic: M0 Scaffold" "M0 Scaffold" "epic,P0" "Tracking issue for M0. See docs/08-ROADMAP.md.
- [ ] Scaffold electron-vite + React + TS + pnpm
- [ ] Lint/format/typecheck/test tooling
- [ ] scripts/local-ci.sh + Husky hooks (NO GitHub Actions)
- [ ] Shared contracts (zod schemas, IPC, provider interfaces)
- [ ] ADR-0001..0003
- [ ] README run instructions"
issue "Scaffold Electron + React + TypeScript app with electron-vite and pnpm" "M0 Scaffold" "area:scaffold,type:chore,P0" "Main/preload/renderer, contextIsolation, typed window.api, HMR dev script, electron-builder config for win/mac/linux. Exit: pnpm dev opens an empty Projects screen."
issue "Add ESLint, Prettier, Vitest, Playwright-Electron, Husky, lint-staged" "M0 Scaffold" "area:scaffold,type:chore,P0" "Wire pnpm scripts: lint, format:check, typecheck, test, e2e, ci:local."
issue "Create scripts/local-ci.sh and pre-push hook (no GitHub Actions)" "M0 Scaffold" "area:scaffold,type:chore,P0" "Per docs/06-GITHUB-WORKFLOW.md. Must never add .github/workflows."
issue "Define shared zod schemas for Project/Scenario/MselRow/Inject/MediaAsset" "M0 Scaffold" "area:ipc,type:feature,P0" "From docs/05-DATA-MODEL.md. Types derived from schemas. Lives in src/shared/schemas."
issue "Define typed IPC contract and preload bridge" "M0 Scaffold" "area:ipc,type:feature,P0" "src/shared/ipc.ts; one invoke channel per use case; zod validation on main side; renderer hook generator."
issue "Define provider interfaces (TextProvider, EmbeddingProvider, MediaProvider) and mock implementations" "M0 Scaffold" "area:providers,type:feature,P0" "Per docs/02-ARCHITECTURE.md. Mocks return schema-valid canned outputs for tests."
issue "Write ADR-0001 stack, ADR-0002 local CI/no Actions, ADR-0003 project folder format" "M0 Scaffold" "area:docs,type:chore,P1" "docs/adr/. Short: context/decision/consequences."

# ---- M1
issue "Epic: M1 Projects & Ingestion" "M1 Projects & Ingestion" "epic,P0" "Tracking issue for M1."
issue "Project folder store: create/open/recent/settings (project.json CRUD)" "M1 Projects & Ingestion" "area:scaffold,type:feature,P0" "Folder layout per docs/02-ARCHITECTURE.md. Path-escape guards."
issue "Document parsers: PDF (pdfjs + layout heuristics), DOCX, PPTX, MD/TXT, image OCR" "M1 Projects & Ingestion" "area:ingest,type:feature,P0" "Run in worker thread; emit progress. Heading detection -> heading_path."
issue "Section-aware chunker with page numbers" "M1 Projects & Ingestion" "area:ingest,type:feature,P0" "~600 tokens, 80 overlap, keep heading_path and page."
issue "Local ONNX embeddings (bge-small or nomic) with provider fallback" "M1 Projects & Ingestion" "area:retrieval,type:feature,P0" "@xenova/transformers or onnxruntime-node; cache model in userData."
issue "SQLite index: FTS5 + sqlite-vec, hybrid retrieval with RRF and citations" "M1 Projects & Ingestion" "area:retrieval,type:feature,P0" "Rebuildable index.sqlite. Debug search panel in UI."
issue "Documents screen: import, progress, headings preview, tags" "M1 Projects & Ingestion" "area:editor,type:feature,P1" ""
issue "Test fixture: ingest reference/ncia/*.md and assert TIRP 13.6 / AEP Appendix 6 retrieval" "M1 Projects & Ingestion" "area:tests,type:feature,P1" ""

# ---- M2
issue "Epic: M2 Providers & Generation" "M2 Providers & Generation" "epic,P0" "Tracking issue for M2."
issue "Anthropic Messages API adapter (streaming, tool-use JSON, cost log)" "M2 Providers & Generation" "area:providers,type:feature,P0" ""
issue "OpenAI-compatible adapter (LM Studio, Ollama /v1, vLLM, OpenRouter) with JSON-mode detection" "M2 Providers & Generation" "area:providers,type:feature,P0" ""
issue "Ollama native adapter (model list/pull, embeddings)" "M2 Providers & Generation" "area:providers,type:feature,P1" ""
issue "Secrets via Electron safeStorage; provider settings UI with health check and model list" "M2 Providers & Generation" "area:providers,type:feature,P0" "Never persist keys in project folder."
issue "Task -> provider routing table (ideate/draft/critique/embed/image/video/audio)" "M2 Providers & Generation" "area:providers,type:feature,P0" ""
issue "Prompt library: frontmatter loader, per-project overrides, diff/reset UI" "M2 Providers & Generation" "area:generate,type:feature,P0" "Format per docs/05-DATA-MODEL.md."
issue "Author default prompts v1 for all stages from docs/04-TABLETOP-METHODOLOGY.md" "M2 Providers & Generation" "area:generate,type:feature,P0" "Include inject-mix constraints, citation rules, SimCell scripts, rubric format."
issue "Generation pipeline engine: stage graph, checkpoints, re-run, stale marking, repair-on-schema-fail" "M2 Providers & Generation" "area:generate,type:feature,P0" ""
issue "Stages: ideate, scenario_overview, objectives_roles, phase_plan, msel_phase" "M2 Providers & Generation" "area:generate,type:feature,P0" ""
issue "Stages: controller_handbook, rubric, player_briefing, hotwash, critique" "M2 Providers & Generation" "area:generate,type:feature,P0" ""
issue "Scenario screen: streaming log, read-only documents, read-only MSEL table" "M2 Providers & Generation" "area:editor,type:feature,P1" ""

# ---- M3
issue "Epic: M3 Injects & Media" "M3 Injects & Media" "epic,P0" "Tracking issue for M3."
issue "Hidden-window template renderer with pool, PNG@2x and PDF output, golden snapshot tests" "M3 Injects & Media" "area:templates,type:feature,P0" ""
issue "Inject templates batch 1 (tweet, facebook_post, helpdesk_ticket, email, email_forward, memo, system_log, error_dialog, fids_board, media_inquiry_phone_slip, startex/time_jump/endex cards, ics_201_prefill)" "M3 Injects & Media" "area:templates,type:feature,P0" "Each with schema.json + preview.json; brand object support."
issue "ComfyUI adapter: HTTP+WS client, workflow JSON bindings, /object_info node detection" "M3 Injects & Media" "area:comfy,type:feature,P0" ""
issue "Default ComfyUI workflows: image, image-to-video, TTS; binding editor UI" "M3 Injects & Media" "area:comfy,type:feature,P1" ""
issue "Inject stages: inject_text, inject_media_brief, media_render queue, provenance" "M3 Injects & Media" "area:generate,type:feature,P0" ""
issue "Audio post-FX chain (radio band-pass, phone compression, ambience bed)" "M3 Injects & Media" "area:templates,type:feature,P2" ""
issue "Acceptance: regenerate Scenario 3 deck from reference MSEL" "M3 Injects & Media" "area:tests,type:feature,P1" "Every inject in reference/scenario-3/master-inject-deck.md renders."

# ---- M4
issue "Epic: M4 Editing" "M4 Editing" "epic,P1" "Tracking issue for M4."
issue "MSEL grid editor: inline edit, drag retime, bulk shift, insert control cards, lint warnings" "M4 Editing" "area:editor,type:feature,P1" ""
issue "Inject editor: schema-driven form, live preview, regenerate text/media, versions, lock" "M4 Editing" "area:editor,type:feature,P1" ""
issue "Document editors for handbook/briefing/rubric/hotwash with regenerate-section" "M4 Editing" "area:editor,type:feature,P1" ""

# ---- M5
issue "Epic: M5 Export & Facilitator" "M5 Export & Facilitator" "epic,P1" "Tracking issue for M5."
issue "Export templates + printToPDF: MSEL, Inject Deck, Handbook, Briefing (+blank ICS-201), full Exercise Plan" "M5 Export & Facilitator" "area:export,type:feature,P1" ""
issue "Distribution ZIP (facilitator/ players/), scenario.json and scenario.md" "M5 Export & Facilitator" "area:export,type:feature,P1" ""
issue "Optional DOCX export for Handbook and Briefing" "M5 Export & Facilitator" "area:export,type:feature,P2" ""
issue "Facilitator mode: timeline, exercise clock, deliver, second-display media, notes" "M5 Export & Facilitator" "area:facilitator,type:feature,P1" ""
issue "Playwright e2e: create -> import -> ideate(mock) -> generate -> export" "M5 Export & Facilitator" "area:tests,type:feature,P1" ""

# ---- M6
issue "Epic: M6 Polish & Release 0.1" "M6 Polish & Release 0.1" "epic,P2" "Tracking issue for M6."
issue "Onboarding wizard: detect LM Studio/Ollama/ComfyUI on localhost, test buttons" "M6 Polish & Release 0.1" "area:editor,type:feature,P2" ""
issue "Accessibility and error-UX pass" "M6 Polish & Release 0.1" "area:editor,type:chore,P2" ""
issue "Installers for win/mac/linux; release script; CHANGELOG" "M6 Polish & Release 0.1" "area:scaffold,type:chore,P2" "No release automation; gh release create from local build."
issue "User guide, provider setup guides, template authoring guide, CONTRIBUTING" "M6 Polish & Release 0.1" "area:docs,type:chore,P2" ""

say "Done. Backlog at https://github.com/$REPO/issues"
