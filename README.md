# Tabletop Generator

Tabletop Generator is a local-first Electron desktop app that turns an organization's source documents (emergency plans, security programs, course material) into complete, editable, exportable tabletop exercises: scenario narrative, Master Scenario Events List (MSEL), inject deck with realistic media (tweets, helpdesk tickets, emails, log files, information boards and HMI screens, radio and phone audio, short video), controller handbook, and player briefing. You connect the LLM, image, voice and video providers you choose (local models via LM Studio, Ollama and ComfyUI, or Anthropic), and every generated item cites the section of your own documents it came from. It generalizes the hand-built CSAAP airport-cybersecurity tabletops in `reference/` to any cyber-physical, emergency-management or operations domain (transit, dams and water utilities, energy, healthcare, campuses, venues, ports, cities, plants, drone operators) through domain profiles (ADR-0014).

Repository: https://github.com/mdcrowley/tabletop-gen

**Naming.** The app shows itself as **Action Stations** (window and menu-bar titles, sidebar logo, app icon). The npm package (`tabletop-gen`), the installer and product name (`Tabletop Generator-<version>-…`), the settings folder (`~/Library/Application Support/Tabletop Generator` on macOS, `%APPDATA%\Tabletop Generator` on Windows, `~/.config/Tabletop Generator` on Linux) and the default projects folder (`~/Documents/Tabletop Generator`) keep the original name, so existing settings and projects are found after the rename.

## Prerequisites

- **OS:** macOS, Windows or Linux.
- **Node.js 22+** and **pnpm 10** (`corepack enable && corepack prepare pnpm@10 --activate`).
- **Native build tools** for `better-sqlite3` (only needed when no prebuilt binary matches your platform):
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools with the "Desktop development with C++" workload
  - Linux: `build-essential` and `python3`
- Optional, for generation: a local model server (LM Studio or Ollama) and/or an Anthropic API key; ComfyUI for image and video media; mlx-audio (Apple Silicon) or the built-in system voice for TTS.

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

Providers are configured in the app under **Providers** (sidebar). **Detect local services** finds LM Studio, Ollama and ComfyUI on localhost, plus the operating system's own voice when one is installed, and adds them in one click. API keys are encrypted with the OS keychain via Electron `safeStorage` into `<userData>/secrets.json` (ciphertext only, owner-only permissions) — never in project files, `settings.json` or logs; if the OS can't encrypt (e.g. Linux without a keyring) the app refuses to store keys. No network calls are made except to providers you configure.

| Provider     | Kind                              | Base URL                                              | Notes                                                                                                                                                    |
| ------------ | --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LM Studio    | OpenAI-compatible                 | `http://localhost:1234/v1`                            | Start the local server in LM Studio (Developer tab) or `lms server start`, then load a model.                                                            |
| Ollama       | Ollama native / OpenAI-compatible | `http://localhost:11434` (OpenAI-compatible at `/v1`) | `ollama serve`, then `ollama pull <model>`. `nomic-embed-text` works as the embedding model.                                                             |
| ComfyUI      | Media (image, video)              | `http://127.0.0.1:8188`                               | Default workflows live in `comfy/workflows/` (no audio default; import a TTS workflow to use one). Missing custom nodes are reported via `/object_info`. |
| Anthropic    | Text                              | `https://api.anthropic.com`                           | Paste an API key in Providers.                                                                                                                           |
| Local TTS    | OpenAI-compatible (audio)         | `http://127.0.0.1:8765`                               | `mlx_audio.server --port 8765` serves VoxCPM2 / Qwen3-TTS on Apple Silicon via `/v1/audio/speech`.                                                       |
| System voice | System voice (audio, offline)     | none                                                  | Fallback TTS on any OS: macOS `say`, Windows SAPI (PowerShell `System.Speech`) or `espeak-ng` / `espeak` on Linux. Detected when installed.              |

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
reference/           Sample input documents per domain + the CSAAP scenario 1–8 gold-standard outputs
examples/            Example projects that ship with the app (Projects → Examples)
scripts/             local-ci.sh, bootstrap-github.sh, dev helpers
e2e/                 Playwright tests
```

## Documentation

| Doc                                                                  | Purpose                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/01-PRD.md`](docs/01-PRD.md)                                   | Product requirements                                                          |
| [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md)                 | Processes, storage, providers, rendering, export                              |
| [`docs/03-INJECT-TAXONOMY.md`](docs/03-INJECT-TAXONOMY.md)           | Supported inject types, fields and render targets                             |
| [`docs/04-TABLETOP-METHODOLOGY.md`](docs/04-TABLETOP-METHODOLOGY.md) | HSEEP-style exercise structure the generator reproduces                       |
| [`docs/05-DATA-MODEL.md`](docs/05-DATA-MODEL.md)                     | Project / Scenario / Inject / Asset schema                                    |
| [`docs/06-GITHUB-WORKFLOW.md`](docs/06-GITHUB-WORKFLOW.md)           | Issues, labels, milestones, branching, local CI                               |
| [`docs/07-AGENT-ORCHESTRATION.md`](docs/07-AGENT-ORCHESTRATION.md)   | How parallel work is split                                                    |
| [`docs/08-ROADMAP.md`](docs/08-ROADMAP.md)                           | Milestones M0 to M6                                                           |
| [`docs/adr/`](docs/adr/)                                             | Architecture Decision Records, listed [below](#architecture-decision-records) |
| [`docs/09-CODE-CONVENTIONS.md`](docs/09-CODE-CONVENTIONS.md)         | How handlers, routes, adapters and templates are wired                        |
| [`docs/guides/`](docs/guides/)                                       | User and contributor guides (see [Guides](#guides))                           |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                 | How to contribute                                                             |

### Architecture decision records

| ADR                                               | Decision                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| [0001](docs/adr/0001-stack.md)                    | Application stack: Electron, React, TypeScript, Vite, pnpm, SQLite + sqlite-vec |
| [0002](docs/adr/0002-local-ci-no-actions.md)      | Local CI only, no GitHub Actions                                                |
| [0003](docs/adr/0003-project-folder-format.md)    | Project folder format                                                           |
| [0004](docs/adr/0004-native-modules-and-tests.md) | Native modules and the test runtime                                             |
| [0005](docs/adr/0005-embeddings.md)               | Embeddings                                                                      |
| [0006](docs/adr/0006-providers-over-fetch.md)     | Provider adapters over fetch                                                    |
| [0007](docs/adr/0007-structured-output.md)        | Structured output from LLMs                                                     |
| [0008](docs/adr/0008-template-rendering.md)       | Template rendering to PNG and PDF                                               |
| [0009](docs/adr/0009-audio-tts.md)                | Audio and TTS (amended by 0010)                                                 |
| [0010](docs/adr/0010-local-tts-openai-speech.md)  | Local TTS through the OpenAI-compatible speech API                              |
| [0011](docs/adr/0011-video-model-ltxv.md)         | LTX-Video as the default local video model                                      |
| [0012](docs/adr/0012-inject-stages.md)            | Inject stages: schema-guided text, deterministic media plan, keep-with-warning  |
| [0013](docs/adr/0013-app-protocol.md)             | Serve the renderer from `app://bundle/`                                         |
| [0014](docs/adr/0014-domain-profiles.md)          | Domain profiles: domain-neutral generation as data                              |
| [0015](docs/adr/0015-repair-in-place.md)          | Repair a finished scenario in place                                             |
| [0016](docs/adr/0016-forward-compatible-files.md) | Forward-compatible project files                                                |

New ADRs start from [`docs/adr/0000-template.md`](docs/adr/0000-template.md).

## `reference/`

`reference/` holds the material the app was modeled on and is measured against, as text. All organizations in it are fictional. See [`reference/README.md`](reference/README.md) for the file-by-file list.

- **Input documents** (what a user would import into a project), one folder per domain:
  - `reference/ncia/` - North Coast International Airport (AEP, ASP, TIRP, terminal map).
  - `reference/transit/` - Riverbend Regional Transit Authority, a bus + light-rail agency.
  - `reference/dam/` - Cedar Ridge Dam, a hydro / flood-control dam.
  - `reference/city-water/` - City of Millbrook Department of Water & Sewer (emergency response plan, OT / cybersecurity plan, SCADA description, public communications plan, system map).
  - `reference/uas-ops/` - Harwick UAS Operations Group, a drone operator flying under Part 107 (flight operations manual, emergency response plan, information security plan, site and airspace sheet).
- **Gold-standard outputs**, the CSAAP airport tabletops: `reference/scenario-1/` to `reference/scenario-8/` each hold the MSEL, controller handbook and player briefing. Scenarios 1–7 also have a master inject deck, and every scenario but 3 has player material (a reference card or evidence packet; scenario 8 "Countdown" has an action menu and clue cards in place of an inject deck). `reference/scenario-3/` ("Flight to Nowhere") is the primary benchmark and describes its inject visuals in `injects/README.md`. Generated output is measured against these.
- `reference/ics-forms/` - ICS-201 and ICS-203 form bases.
- `reference/course/` - course outline used for learning objectives.
- `reference/originals/` - slot for original PDFs/PNGs added by hand; `reference/originals/private/` is gitignored for licensed material.

## `examples/`

`examples/` holds the example projects the app ships, opened from **Projects → Examples** or the setup wizard's first-project step. Opening one copies its `project/` folder to a folder you choose; the shipped files are never changed. Each has an `example.json` manifest and a normal project folder. See [`examples/README.md`](examples/README.md) for the format and the rules for adding one.

| Example                    | Organization (fictional)          | Built from              | Scenarios                                                                       |
| -------------------------- | --------------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `examples/airport-ncia/`   | North Coast International Airport | `reference/ncia/`       | The eight CSAAP scenarios, seeded from `reference/scenario-1/` to `scenario-8/` |
| `examples/city-water/`     | City of Millbrook Water           | `reference/city-water/` | pH on the Edge                                                                  |
| `examples/uas-operations/` | Harwick UAS Operations Group      | `reference/uas-ops/`    | Ghost Flight at Birch Hollow                                                    |

## No GitHub Actions

This repository has no GitHub Actions, by design. There is nothing under `.github/workflows/`, and there never will be. CI is `scripts/local-ci.sh` (`pnpm ci:local`) plus Husky hooks (`pre-commit`: lint-staged; `pre-push`: local CI and gitleaks). PRs include the pasted `ci:local` output. See [ADR-0002](docs/adr/0002-local-ci-no-actions.md).

## Non-negotiables (also in CLAUDE.md)

- **No GitHub Actions.** Nothing under `.github/workflows/`. Checks run locally via `scripts/local-ci.sh` and git hooks.
- **Issues are tracked in GitHub Issues** on `mdcrowley/tabletop-gen`. Every unit of work maps to an issue; commits reference issue numbers.
- **Local-first.** Projects, documents, prompts and generated media live on the user's disk. Remote APIs are opt-in per provider.
- **Provider-agnostic.** LM Studio / Ollama / OpenAI-compatible and Anthropic for text; ComfyUI for image/video, mlx-audio or the system voice for speech, with the abstraction ready for others.

## License

Source-available under the [PolyForm Internal Use License 1.0.0](LICENSE.md): any organization may use and change Action Stations for free for its own internal operations, including running exercises for its own people. Selling or redistributing it, hosting it for others, and consulting, training or facilitation for other organizations need a commercial license; see [COMMERCIAL.md](COMMERCIAL.md). Contributions are accepted under the [CLA](CLA.md). Third-party dependencies keep their own licenses, and packs carry the license their author chose.

## History

The repository started as a handoff package (docs, reference material, templates, bootstrap scripts). That setup is complete: labels, milestones and the seed backlog exist on GitHub, and the original kickoff prompt is not needed to work on the project. `CLAUDE.md` at the repo root carries the standing instructions for Claude Code sessions.
