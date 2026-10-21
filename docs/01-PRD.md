# 01 — Product Requirements: Tabletop Generator

## Problem

Building a good tabletop exercise by hand takes days: read the organization's plans, invent a plausible threat, write a timed Master Scenario Events List, draft 15–25 injects in a dozen different formats (tweets, tickets, radio calls, log dumps, news calls), build facilitator and player packets, design a rubric. The CSAAP team did this for North Coast International Airport (see `reference/scenario-3/`) and the result is excellent — but every new scenario starts from zero, and media injects (a fake tweet screenshot, a FIDS board photo, a voicemail) are the slowest part.

## Users

- **Primary:** instructors and exercise designers (CSAAP faculty, airport emergency managers, security trainers) who own a body of plans and need many scenarios over time.
- **Secondary:** facilitators running an exercise (need printable decks, a timeline view, and the ability to swap an inject mid-course).
- **Tertiary:** students/players (consume exported packets; never touch the app).

## Goals

1. Go from "here are my plans" to a complete, print-ready TTX package in under an hour of user time.
2. Generated content cites the user's own documents (section numbers) so players are forced into the doctrine.
3. Media injects look real enough to provoke a reaction in the room.
4. Everything is editable; the AI drafts, the human finishes.
5. Runs entirely on a laptop with local models when desired; can use Claude when quality matters.

## Non-goals (v1)

- Multi-user real-time collaboration.
- Running the exercise live with a clock, scoring, and player devices (a "Facilitator Mode" timeline is in scope; a full exercise-control system is not).
- Cloud sync, accounts, billing.
- Fine-tuning models.

## Functional requirements

### FR-1 Projects
- Create/open/duplicate/archive projects. A project is a folder: `project.json`, `documents/`, `scenarios/`, `media/`, `prompts/`, `index.sqlite`.
- Project settings: organization name and type (airport, hospital, utility, campus, generic), default audience roles, default provider assignments, branding (logo, colors used by templates).
- Import documents: PDF, DOCX, PPTX, XLSX, MD, TXT, HTML, PNG/JPG (OCR). Show parse status, page count, extracted headings. Tag documents (plan, policy, map, form, course material, prior exercise).
- Ingestion builds a section-aware chunk index with headings preserved ("TIRP §13.6 FIDS/BHS System Failure"), stores embeddings locally, and supports hybrid (BM25 + vector) retrieval with citations.

### FR-2 Prompt library
- Global defaults in `prompts/` (markdown with YAML frontmatter: name, stage, model hints, variables).
- Per-project overrides; diff view against default; reset to default.
- Stages: `ideate`, `scenario_overview`, `objectives_roles`, `msel_phase`, `inject_text`, `inject_media_brief`, `controller_handbook`, `rubric`, `player_briefing`, `hotwash`, `critique` (self-review pass).
- Variables available to prompts: project metadata, retrieved document chunks with citations, scenario state so far, inject taxonomy, role list, duration, phase goals.

### FR-3 Providers
- **Text:** adapters for Anthropic Messages API, OpenAI-compatible chat completions (covers LM Studio, Ollama's OpenAI endpoint, vLLM, OpenRouter, OpenAI), Ollama native. Streaming, tool/JSON-mode where available, token accounting, retry/backoff, per-call cost estimate for remote providers.
- **Embeddings:** local ONNX (default), or provider embedding endpoint.
- **Media (image/video/audio):** ComfyUI adapter (queue prompt, poll/WebSocket progress, fetch outputs, map named inputs in a workflow JSON to inject fields). Users import workflow JSON and bind inputs via a small mapping UI. Ship default workflows for: photo-real scene, "screenshot style" composite, short video (image-to-video), TTS voice line. Stub adapters (interfaces + fixtures) for remote providers so they can be added without refactors.
- **Template renderer:** HTML/CSS templates rendered to PNG/PDF in a hidden Electron BrowserWindow. Used for all text-bearing injects.
- Provider health check, model listing, and a "test this provider" button.
- Task → provider routing table (ideation, drafting, critique, embeddings, image, video, voice).

### FR-4 Scenario generation
- **From prompt:** user enters threat/theme, audience roles, duration, learning objectives, optional constraints ("must test TIRP §13 and ASP §6.4", "include a PIO track", "include one red herring and one noise inject per phase"). System retrieves relevant doctrine, drafts the Scenario Overview, then phases, then injects, then handbook/rubric/briefing — each step streamed and visible.
- **From ideas:** system proposes 5–10 scenario concepts grounded in the documents (title, one-paragraph hook, systems affected, plan sections exercised, difficulty, why it is a good teaching scenario). User picks one, optionally edits the brief, then generation continues as above.
- Generation is a resumable pipeline with checkpoints; any stage can be re-run with a different provider/prompt without redoing the rest.
- A **critique pass** checks the draft against a checklist (timeline consistency, every role gets injects, decision points exist, doctrine citations are real, no inject depends on information players cannot have) and proposes fixes.

### FR-5 Inject system
- Inject = structured record (see `05-DATA-MODEL.md`) + 0..n media assets.
- Types per `03-INJECT-TAXONOMY.md`. Each type defines fields, a default template, an optional media brief, and export behavior (page in deck, audio file, video file).
- Media generation per inject: pick template vs. AI vs. both (e.g., AI scene photo composited into the tweet template). Regenerate text or media independently. Lock an inject to prevent regeneration.
- Inject library: save any inject as a reusable template across projects.

### FR-6 Editing
- MSEL grid: phase headers, time, ID, from, to, event/message, expected action, type tag, media indicator; inline edit; drag to reorder/retime; bulk shift times; insert time-jump cards.
- Document editors (rich text / markdown) for Overview, Handbook, Briefing, Rubric, Hot Wash.
- Inject editor: fields form on the left, live media preview on the right, provider/prompt chooser, regenerate buttons, version history (keep last N).
- Scenario-level consistency checks surfaced as warnings (e.g., inject references Gate Z99 but map has no Z gates — flagged, not blocked).

### FR-7 Export
- PDF: MSEL (landscape table), Master Inject Deck (one inject per page, header with ID/time/target/type, media embedded), Controller/Evaluator Handbook, Player Briefing Packet (with blank ICS-201 pages), full "Exercise Plan" combining all.
- Media: PNG per image inject, MP4 per video, WAV/MP3 per audio, with filenames `S<scenario>-I<id>-<type>.<ext>`.
- Distribution ZIP: `facilitator/` (everything) and `players/` (briefing + blank forms only).
- Machine-readable: `scenario.json` (full) and `scenario.md`.
- Optional DOCX for Handbook and Briefing.

### FR-8 Facilitator mode (minimal)
- Read-only timeline of the MSEL with a running exercise clock, "deliver" button that marks an inject delivered and opens its media full-screen on a second display, notes field per inject for the hot wash.

## Non-functional

- Offline-capable except for configured remote providers.
- Project folders are human-readable and git-friendly (JSON + markdown + media files; SQLite index is rebuildable and gitignored).
- Startup < 3 s; ingesting a 60-page PDF < 30 s on a laptop CPU.
- Windows, macOS, Linux builds via `electron-builder`; auto-update is out of scope.
- Accessibility: keyboard-navigable grids and editors; exported PDFs tagged with headings.

## Success criteria for v1

Using only the NCIA documents in `reference/ncia/`, a user can generate a new 4-hour cyber-physical scenario (not FIDS) in one session, edit five injects, render media for at least eight injects (including one TTS phone call and one AI scene photo), and export a distribution ZIP whose PDFs are comparable in structure and quality to `reference/scenario-3/`.
