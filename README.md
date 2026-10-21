# Tabletop Generator

Tabletop Generator is a local-first Electron desktop app that turns an organization's source documents (emergency plans, security programs, course material) into complete, editable, exportable tabletop exercises: scenario narrative, Master Scenario Events List (MSEL), inject deck with realistic media (tweets, helpdesk tickets, emails, log files, FIDS boards, radio and phone audio, short video), controller handbook, and player briefing. You connect the LLM, image, voice and video providers you choose (local models via LM Studio, Ollama and ComfyUI, or Anthropic), and every generated item cites the section of your own documents it came from. It generalizes the hand-built CSAAP airport-cybersecurity tabletops in `reference/`.

Repository: https://github.com/mdcrowley/tabletop-gen

## Prerequisites

- **OS:** macOS, Windows or Linux.
- **Node.js 22+** and **pnpm 10** (`corepack enable && corepack prepare pnpm@10 --activate`).
- **Native build tools** for `better-sqlite3` (only needed when no prebuilt binary matches your platform):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools with the "Desktop development with C++" workload
  - Linux: `build-essential` and `python3`
- Optional, for generation: a local model server (LM Studio or Ollama) and/or an Anthropic API key; ComfyUI for image, video and TTS media.

## Commands

```bash
pnpm install                  # install deps; builds native modules for Electron
pnpm dev                      # launch the app (electron-vite, HMR)
pnpm test                     # Vitest unit tests (run under Electron-as-Node, mock providers)
pnpm lint && pnpm typecheck   # ESLint + tsc
pnpm ci:local                 # full local CI: scripts/local-ci.sh
pnpm e2e                      # Playwright end-to-end tests against the Electron app
pnpm build                    # electron-builder installers (dmg / nsis / AppImage)
```

`pnpm ci:local` runs a frozen install, lint, format check, typecheck, unit tests, template golden tests and a build check. Set `E2E=1` to include Playwright.

## Connecting providers

Providers are configured in the app under **Settings > Providers**. API keys are stored in the OS keychain via Electron `safeStorage`, never in project files or logs. No network calls are made except to providers you configure.

| Provider  | Kind                              | Base URL                                              | Notes                                                                                                  |
| --------- | --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| LM Studio | OpenAI-compatible                 | `http://localhost:1234/v1`                            | Start the local server in LM Studio (Developer tab) or `lms server start`, then load a model.          |
| Ollama    | Ollama native / OpenAI-compatible | `http://localhost:11434` (OpenAI-compatible at `/v1`) | `ollama serve`, then `ollama pull <model>`. `nomic-embed-text` works as the embedding model.           |
| ComfyUI   | Media (image, video, TTS)         | `http://127.0.0.1:8188`                               | Default workflows live in `comfy/workflows/`; the app reports missing custom nodes via `/object_info`. |
| Anthropic | Text                              | `https://api.anthropic.com`                           | Paste an API key in Settings.                                                                          |

Each generation task (ideate, draft, critique, embed, image, video, audio) can be routed to a different provider. Without any provider configured, the app still runs with a deterministic offline embedder and mock providers for testing.

## Repository layout

```
src/main/            Electron main: ipc/, providers/, ingest/, generate/, render/, export/, db/
src/renderer/        React app: routes/, components/, editors/, state/
src/shared/          Types, zod schemas, IPC contracts
templates/injects/   HTML/CSS templates per inject type
prompts/             Default prompt files (markdown with frontmatter)
comfy/workflows/     Default ComfyUI workflow JSON per media type
docs/                PRD, architecture, taxonomy, methodology, ADRs
reference/           CSAAP source material + Scenario 3 gold-standard outputs
scripts/             local-ci.sh, bootstrap-github.sh, dev helpers
e2e/                 Playwright tests
```

## Documentation

| Doc                                                                  | Purpose                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/01-PRD.md`](docs/01-PRD.md)                                   | Product requirements                                                                                                                        |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md)                 | Processes, storage, providers, rendering, export                                                                                            |
| [`docs/03-INJECT-TAXONOMY.md`](docs/03-INJECT-TAXONOMY.md)           | Supported inject types, fields and render targets                                                                                           |
| [`docs/04-TABLETOP-METHODOLOGY.md`](docs/04-TABLETOP-METHODOLOGY.md) | HSEEP-style exercise structure the generator reproduces                                                                                     |
| [`docs/05-DATA-MODEL.md`](docs/05-DATA-MODEL.md)                     | Project / Scenario / Inject / Asset schema                                                                                                  |
| [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md)           | Issues, labels, milestones, branching, local CI                                                                                             |
| [`docs/07-AGENT-ORCHESTRATION.md`](docs/07-AGENT-ORCHESTRATION.md)   | How parallel work is split                                                                                                                  |
| [`docs/08-ROADMAP.md`](docs/08-ROADMAP.md)                           | Milestones M0 to M6                                                                                                                         |
| [`docs/adr/`](docs/adr/)                                             | Architecture Decision Records (stack, local CI, project format, native modules, embeddings, providers, structured output, rendering, audio) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                 | How to contribute                                                                                                                           |

## `reference/`

`reference/` holds the CSAAP material the app was modeled on, as text:

- `reference/ncia/` - sample input documents for the fictional North Coast International Airport (AEP, ASP, TIRP, terminal map). This is what a user would import into a project.
- `reference/ics-forms/` - ICS-201 and ICS-203 form bases.
- `reference/scenario-3/` - the gold-standard outputs (MSEL, master inject deck, controller handbook, player briefing, inject visual targets). Generated output is measured against these.
- `reference/course/` - course outline used for learning objectives.
- `reference/originals/` - slot for original PDFs/PNGs added by hand; `reference/originals/private/` is gitignored for licensed material. See [`reference/README.md`](reference/README.md).

## No GitHub Actions

This repository has no GitHub Actions, by design. There is nothing under `.github/workflows/`, and there never will be. CI is `scripts/local-ci.sh` (`pnpm ci:local`) plus Husky hooks (`pre-commit`: lint-staged; `pre-push`: local CI and gitleaks). PRs include the pasted `ci:local` output. See [ADR-0002](docs/adr/0002-local-ci-no-actions.md).

## Non-negotiables (also in CLAUDE.md)

- **No GitHub Actions.** Nothing under `.github/workflows/`. Checks run locally via `scripts/local-ci.sh` and git hooks.
- **Issues are tracked in GitHub Issues** on `mdcrowley/tabletop-gen`. Every unit of work maps to an issue; commits reference issue numbers.
- **Local-first.** Projects, documents, prompts and generated media live on the user's disk. Remote APIs are opt-in per provider.
- **Provider-agnostic.** LM Studio / Ollama / OpenAI-compatible and Anthropic for text; ComfyUI first for image/video/voice, with the abstraction ready for others.

## History

The repository started as a handoff package (docs, reference material, templates, bootstrap scripts). That setup is complete: labels, milestones and the seed backlog exist on GitHub, and the original kickoff prompt is not needed to work on the project. `CLAUDE.md` at the repo root carries the standing instructions for Claude Code sessions.
