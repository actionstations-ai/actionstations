# ADR-0011: Inject stages — template-schema-guided text, deterministic media plan, keep-with-warning

Date: 2026-10-21 · Status: Accepted · Issue: #34

## Context

The MSEL gives each row a format (taxonomy type) and a one-paragraph event. Turning rows into deck pages needs (a) fields that fit a template's JSON Schema exactly (`additionalProperties: false`), (b) identifiers that stay consistent across 25 pages written in separate model calls, and (c) a media plan that respects CLAUDE.md rule 5 (text-bearing media is template-rendered; AI pixels only for photographic content). Local 30B models fill schemas well when shown the schema, but still drift on field names and invent second hostnames when they cannot see what earlier pages said.

## Decision

- **Type choice is deterministic.** STARTEX / TIME_JUMP / ENDEX rows become control cards. Other rows keep `row.format` when a template is installed; otherwise the first installed type along a fixed fallback chain (`TYPE_FALLBACKS`, by category) is used and reported as `INJECT_TYPE_FALLBACK`; when nothing in the chain is installed the taxonomy type is kept with no template (`INJECT_TEMPLATE_MISSING`) and the model fills the taxonomy's key fields. The model may only switch type to another installed template.
- **The prompt carries the template schema** (one line per field: type, required, description, example) plus a "facts so far" list (hosts, IPs, flights, tickets, places, handles, files, people) extracted from every earlier row and inject, and the story so far. Fields are validated with the template's schema; the ajv issues go back once in a repair call. A page that still fails is **kept with `INJECT_FIELDS_INVALID`** rather than failing the job: a page the user can fix in the editor beats a failed 25-page run. render:inject refuses invalid fields, so the warning is also what the user sees before rendering.
- **Render paths are planned in code, not by the model** (`planMedia`): template when installed; `ai_image` when the taxonomy allows it and the type is photographic (scene/CCTV/signage) or the template has an image slot and the row or the inject's `*Brief` field asks for a photo; `tts` for voice types with post-FX fixed per type (radio / phone / pa+terminal_ambience); `ai_video` only when the row asks for footage. The model is called only when there is a prompt or voice line to write, and its reply is normalised onto the plan (positive-only image prompt — SDXL ignores negation — plus a standard negative prompt; voice lines fall back to the transcript fields).
- **Media job order per inject:** AI image → template (composite via the `<slot>-<ULID>` asset-id convention of render/inject.ts) → TTS (+ post-FX from `providers/media/audio-fx` when present, picked up by a build-time glob) → video. A failed step is recorded (`media_render` StageRun error text, `INJECT_MEDIA_FAILED` warning) and the next step still runs; re-rendering a path replaces only that path's assets.
- **One generation job per scenario** (`CONFLICT` otherwise). `generate:injects` without row ids fills gaps (rows without a finished inject); explicit row ids regenerate and push an `ai` version. Per-inject StageRuns (`inject_text`, `inject_media_brief`, `media_render`, keyed by inject id) live in `scenario.provenance` beside the pipeline's runs.

## Consequences

- Inject quality depends on template schemas carrying good descriptions and examples; templates are the prompt.
- A regenerate run for the whole MSEL costs one text call per row plus one brief call per non-template-only inject (roughly a third of rows for Scenario 3).
- The facts extractor is regex-based (deterministic, no model call); unusual identifier schemes may be missed and must then be caught by the critique stage or the user.
- The ComfyUI adapter and audio-FX chain ship from #32; until merged, image/video steps report "no adapter" and TTS post-FX is logged as skipped.
