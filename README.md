# Tabletop Generator

Tabletop Generator is a local-first Electron desktop app that turns an organization's source documents (emergency plans, security programs, course material) into complete, editable, exportable tabletop exercises: scenario narrative, Master Scenario Events List (MSEL), inject deck with realistic media (tweets, helpdesk tickets, emails, log files, information boards and HMI screens, radio and phone audio, short video), controller handbook, and player briefing. You connect the LLM, image, voice and video providers you choose (local models via LM Studio, Ollama and ComfyUI, or Anthropic), and every generated item cites the section of your own documents it came from. It generalizes the hand-built CSAAP airport-cybersecurity tabletops in `reference/` to any cyber-physical, emergency-management or operations domain (transit, dams and water utilities, energy, healthcare, campuses, venues, ports, cities, plants, drone operators) through domain profiles (ADR-0014).

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
scripts/dev-bundle.sh         # macOS: .dev-app/Action Stations.app, a renamed Electron so the menu bar and Dock say Action Stations
pnpm test                     # Vitest unit tests (run under Electron-as-Node, mock providers)
pnpm lint && pnpm typecheck   # ESLint + tsc
pnpm ci:local                 # full local CI: scripts/local-ci.sh
pnpm e2e                      # Playwright end-to-end tests against the Electron app
LIVE=1 pnpm test -- tests/live/pipeline.live.test.ts   # full generation run against LM Studio (writes tests/fixtures/generate/sample-run/)
LIVE=1 pnpm test -- tests/live/injects.live.test.ts    # Scenario 3 inject deck + media on LM Studio, ComfyUI and mlx-audio (writes tests/fixtures/injects/sample-run/)
pnpm build                    # electron-builder installers (dmg / nsis / AppImage)
```

`pnpm ci:local` runs a frozen install, lint, format check, a Markdown link check, typecheck, unit tests, a build check, the template golden tests, a launch smoke test of the built app and a gitleaks scan. Set `E2E=1` to include the full Playwright suite. See [CONTRIBUTING](CONTRIBUTING.md#local-ci) for what each step does and how to run the live tests.

## Guides

| Guide                                                               | For                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Getting started](docs/guides/getting-started.md)                   | Install, create a project, import and search documents, connect a model, generate a scenario.                                                                                                                                                                                                 |
| [Provider setup](docs/guides/providers/README.md)                   | Routing, embeddings, and step-by-step setup for [LM Studio](docs/guides/providers/lm-studio.md), [Ollama](docs/guides/providers/ollama.md), [Anthropic](docs/guides/providers/anthropic.md), [ComfyUI](docs/guides/providers/comfyui.md) and [local TTS](docs/guides/providers/local-tts.md). |
| [How a good tabletop exercise is built](docs/guides/methodology.md) | The exercise design the generator follows.                                                                                                                                                                                                                                                    |
| [Prompts](docs/guides/prompts.md)                                   | How prompts are layered, what each stage can use, and how to change them safely.                                                                                                                                                                                                              |
| [Template authoring](docs/guides/templates.md)                      | Writing inject templates, golden images, and adding a new inject type.                                                                                                                                                                                                                        |

## Connecting providers

Providers are configured in the app under **Providers** (sidebar). **Detect local services** finds LM Studio, Ollama and ComfyUI on localhost and adds them in one click. API keys are encrypted with the OS keychain via Electron `safeStorage` into `<userData>/secrets.json` (ciphertext only, owner-only permissions) — never in project files, `settings.json` or logs; if the OS can't encrypt (e.g. Linux without a keyring) the app refuses to store keys. No network calls are made except to providers you configure.

| Provider  | Kind                              | Base URL                                              | Notes                                                                                                  |
| --------- | --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| LM Studio | OpenAI-compatible                 | `http://localhost:1234/v1`                            | Start the local server in LM Studio (Developer tab) or `lms server start`, then load a model.          |
| Ollama    | Ollama native / OpenAI-compatible | `http://localhost:11434` (OpenAI-compatible at `/v1`) | `ollama serve`, then `ollama pull <model>`. `nomic-embed-text` works as the embedding model.           |
| ComfyUI   | Media (image, video, TTS)         | `http://127.0.0.1:8188`                               | Default workflows live in `comfy/workflows/`; the app reports missing custom nodes via `/object_info`. |
| Anthropic | Text                              | `https://api.anthropic.com`                           | Paste an API key in Providers.                                                                         |
| Local TTS | OpenAI-compatible (audio)         | `http://127.0.0.1:8765`                               | `mlx_audio.server --port 8765` serves VoxCPM2 / Qwen3-TTS on Apple Silicon via `/v1/audio/speech`.     |

Each generation task (ideate, draft, critique, embed, image, video, audio) can be routed to a different provider on the Providers page; a project can override any task on its own Provider routing page. Setup steps, measured timings and troubleshooting for each provider are in the [provider guides](docs/guides/providers/README.md). Without any provider configured the app still ingests and searches documents with a deterministic offline embedder. For offline development and e2e, launch with `TTX_MOCK_PROVIDERS=1` to route every task to a built-in mock provider that returns schema-valid output.

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
| [`docs/09-CODE-CONVENTIONS.md`](docs/09-CODE-CONVENTIONS.md)         | How handlers, routes, adapters and templates are wired                                                                                      |
| [`docs/guides/`](docs/guides/)                                       | User and contributor guides (see [Guides](#guides))                                                                                         |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                 | How to contribute                                                                                                                           |

## `reference/`

`reference/` holds the CSAAP material the app was modeled on, as text:

- `reference/ncia/` - sample input documents for the fictional North Coast International Airport (AEP, ASP, TIRP, terminal map). This is what a user would import into a project. `reference/transit/` (a bus + light-rail agency) and `reference/dam/` (a hydro / flood-control dam) are the same for two other domains.
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
