# Changelog

All notable changes to Tabletop Generator are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pull requests are referenced as `PR #NN`, issues
as `#NN`. Releasing: rename `[Unreleased]` to the new version with the release date, then run
`scripts/release.sh` (see `docs/RELEASING.md`).

## [Unreleased]

### Added

- Installers: macOS dmg (arm64), Windows NSIS (x64) and Linux AppImage (x64) with the app
  icon, version and architecture in every artifact name; `scripts/release.sh` (dry run by
  default) and `scripts/package-smoke.mjs`, which tests the packaged app (#50).
- Facilitator mode: exercise clock, inject timeline, second-display presentation and hot
  wash notes (#45, PR #122).
- MSEL grid editor with inline editing, drag-to-retime, bulk time shift, control cards and
  lint (#38, #82, PR #119).
- First-run setup wizard with local service detection and test buttons, linked from
  Settings and the empty Projects screen (#48, PR #118, PR #120).
- Editing: document and structured editors with regenerate-section (#40, PR #116).
- M3 acceptance test: regenerate the Scenario 3 inject deck against live local models
  (#36, PR #112).
- Inject generation stages: inject text, media brief and media render jobs, plus the
  injects/library IPC (#34, PR #111).
- ComfyUI adapter, default image/video/audio workflows with a binding editor, and audio
  post-processing (#32, #33, #35, PR #99).
- Inject templates: social, news and internal-comms (PR #101); technical, operational and
  voice-transcript (PR #96); documents, forms and facilitator control cards (PR #95) (#31).
- Template render core: template contract, composer and offscreen PNG/PDF rendering (PR #89),
  a render window pool, `render:inject`, golden-image tests and the template gallery
  (PR #93) (#30).
- Generation pipeline engine with stages, default prompts v1 and persisted, resumable jobs
  (#25, PR #88).
- Text provider adapters: Anthropic, OpenAI-compatible (LM Studio and others) and Ollama
  (#18, #19, #20, PR #78).
- Scenario store with the Scenarios and Generate screens and a read-only MSEL view
  (#28, PR #76).
- Provider settings screen, task routing and API keys kept in the OS keychain through
  Electron `safeStorage` (#21, #22, PR #74).
- Prompt library loader with per-project overrides and a prompt editor (#23, PR #73).
- Hybrid retrieval (SQLite FTS5 + sqlite-vec) with optional local ONNX embeddings
  (#13, #14, PR #68).
- Document parsers (PDF, DOCX, PPTX, XLSX, HTML, Markdown, text, images with OCR), a
  section-aware chunker and the ingest pipeline (#11, #12, PR #63).
- Documents screen and a debug search panel (#15, PR #59).
- Project store, Projects page, project overview and settings (#10, PR #56).
- Electron + React + TypeScript scaffold, typed IPC contracts and local CI (#2, PR #53).
- Architecture decision records in `docs/adr/` and the app README (#8, PR #52).

### Changed

- Packaged builds ship only `out/` and production dependencies; template goldens, test
  fixtures and package test suites are excluded, and native binaries for other operating
  systems are dropped from each installer (#50, PR #94).
- Vitest runs without its file-system module cache so glob-discovered handlers and adapters
  are always found (PR #80).
- Test files are kept out of handler and adapter discovery (#57, PR #58).

### Fixed

- Injects stay linked to their MSEL rows when rows are renamed (#121, PR #123).
- Template capture is deterministic: resizes settle before capture and `UnknownVizError`
  is retried (#30, PR #97, PR #100).
- Generation pipeline review fixes (#90, PR #98).
- Phase names in the stage timeline and log; document section markers hidden (#28, PR #92).
- Distinct project navigation labels and workflow order (#28, PR #77).
- CommonJS-safe `wavefile` import; the built app is launched in local CI (#61, PR #62).
- pdf.js fonts and tesseract data are unpacked from `app.asar` (#64, PR #67).

### Security

- Electron fuses set on packaged builds: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are
  disabled; cookie encryption, `OnlyLoadAppFromAsar` and embedded asar integrity
  validation are enabled (#55). `GrantFileProtocolExtraPrivileges` stays on until the
  renderer moves to a custom protocol (#117).
