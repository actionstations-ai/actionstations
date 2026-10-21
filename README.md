# tabletop-gen — Claude Code Handoff Package

This folder is everything Claude Code needs to start building **Tabletop Generator**, an Electron desktop app that turns a project's source documents (emergency plans, security programs, course material) into complete, exportable tabletop exercises — scenario narratives, Master Scenario Events Lists, controller handbooks, player briefings, and realistic inject media (tweets, press releases, helpdesk tickets, log files, radio transcripts, FIDS screens, voice calls, short video clips).

The app generalizes what was done by hand for the **Cybersecurity and Airport Administration Program (CSAAP)** tabletops at the fictional North Coast International Airport (NCIA). Those hand-built deliverables are included under `reference/` as the gold standard for output quality.

Target repository: **https://github.com/mdcrowley/tabletop-gen**

## How to use this package

1. Create the GitHub repo (empty, public, no Actions) at the URL above.
2. Clone it, then copy the *contents* of this folder into the repo root:
   ```bash
   git clone https://github.com/mdcrowley/tabletop-gen.git
   cp -R tabletop-gen-handoff/. tabletop-gen/
   cd tabletop-gen
   ```
3. Drop the original PDFs/PNGs from the CSAAP project into `reference/originals/` (see `reference/README.md` for the list — they could not be exported programmatically, only their text).
4. Run `scripts/bootstrap-github.sh` once (needs `gh` authenticated) to create labels, milestones, and the initial issue backlog.
5. Commit and push:
   ```bash
   git add -A && git commit -m "chore: initial handoff package" && git push -u origin main
   ```
6. Open Claude Code in the repo and paste the contents of **`KICKOFF_PROMPT.md`** as your first message.

`CLAUDE.md` sits at the repo root and is picked up automatically by Claude Code on every session — it carries the standing rules (no GitHub Actions, issues in GitHub, concurrency with subagents, stack decisions, etc.).

## What's in here

| Path | Purpose |
|---|---|
| `KICKOFF_PROMPT.md` | The initial ask to paste into Claude Code. |
| `CLAUDE.md` | Standing project instructions Claude Code reads automatically. |
| `docs/01-PRD.md` | Product requirements — what the app must do. |
| `docs/02-ARCHITECTURE.md` | Proposed architecture, provider abstraction (LLM / image / voice / video), storage, export. |
| `docs/03-INJECT-TAXONOMY.md` | Every inject type the system should support, with fields and render targets. |
| `docs/04-TABLETOP-METHODOLOGY.md` | How the CSAAP tabletops were designed — the structure the generator must reproduce. |
| `docs/05-DATA-MODEL.md` | Project / Scenario / Inject / Asset schema. |
| `docs/06-GITHUB-WORKFLOW.md` | Branching, issues, labels, milestones, local CI (no Actions). |
| `docs/07-AGENT-ORCHESTRATION.md` | How Claude Code should parallelize the work with subagents, plugins and tools. |
| `docs/08-ROADMAP.md` | Milestones M0–M6. |
| `reference/` | The CSAAP source material and finished Scenario 3 deliverables (text), plus a slot for the originals. |
| `.github/` | Issue and PR templates (no workflows — intentionally). |
| `scripts/bootstrap-github.sh` | One-shot `gh` script: labels, milestones, backlog issues. |
| `scripts/local-ci.sh` | What CI would do, run locally and as a pre-push hook. |

## Non-negotiables (also in CLAUDE.md)

- **No GitHub Actions.** Nothing under `.github/workflows/`. Checks run locally via `scripts/local-ci.sh` and git hooks.
- **Issues are tracked in GitHub Issues** on `mdcrowley/tabletop-gen`. Every unit of work maps to an issue; commits reference issue numbers.
- **Local-first.** Projects, documents, prompts and generated media live on the user's disk. Remote APIs are opt-in per provider.
- **Provider-agnostic.** LM Studio / Ollama / OpenAI-compatible and Anthropic for text; ComfyUI first for image/video/voice, with the abstraction ready for others.
