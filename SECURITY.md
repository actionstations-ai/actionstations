# Security policy

Action Stations is a local-first desktop app. It reads an organization's plans, stores API keys in the operating system's keychain, talks only to the model and media providers the user configured, and renders generated content in sandboxed windows. A flaw in any of that matters, and we want to hear about it.

## Reporting a vulnerability

**Do not open a public GitHub issue, pull request or discussion for a security problem.**

Email **security@actionstations.ai** with:

- what the problem is and what an attacker could do with it;
- the version or commit you tested (the installer file name, `package.json` version, or `git rev-parse HEAD`);
- the operating system;
- steps to reproduce, and a proof of concept if you have one (a project folder, a `.aspack` pack, a template or a document that triggers it);
- whether you want to be credited, and how.

Please give us a reasonable time to fix the problem before you disclose it anywhere else. We will:

- acknowledge the report within 5 working days;
- tell you whether we can reproduce it and what we plan to do, within 15 working days;
- keep you informed until a fix ships, and credit you in the CHANGELOG unless you ask us not to.

Do not test against other people's systems or data. Testing your own installation, your own projects and your own local model servers is fine.

## Supported versions

Fixes go into the next release. Only the latest release and `main` are supported; there are no backported security releases for older versions.

## What is in scope

- The desktop app: main process, preload, renderer, IPC handlers.
- Project folders (`.asproj`, `.ttxproj`) and what the app does when it opens one.
- Packs (`.aspack`): installing, reviewing, updating and exporting them, and catalogs.
- Template rendering (HTML/CSS inject templates and their render windows).
- Exports (DOCX, PDF, ZIP) and document imports.
- How API keys and other secrets are stored, logged or sent.
- Any network request the app makes to a host the user did not configure.

## Out of scope

- Vulnerabilities in a model provider, ComfyUI, LM Studio, Ollama or a TTS server themselves. Report those to their maintainers.
- Content a model generates. Generated exercises are drafts for a person to review; a model producing inaccurate text is not a security issue unless it lets content escape a sandbox or reach the network.
- Attacks that need an attacker who already controls the user's account or machine.

## How the app is hardened

The design choices behind these rules are in [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) and the ADRs in [`docs/adr/`](docs/adr/). In short: no telemetry, no network calls except to providers the user configured, keys encrypted with Electron `safeStorage`, renderer content served from `app://bundle/` (ADR-0013), template render windows locked down, and packs reviewed (licenses, custom nodes, archive hashes) before they install (ADR-0018). Local CI runs a gitleaks secrets scan and a dependency audit on every full run.
