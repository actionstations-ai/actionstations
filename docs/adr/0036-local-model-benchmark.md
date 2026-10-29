# ADR-0036: Local model benchmark drives the built app with deterministic scoring

Date: 2026-10-29 · Status: Accepted · Issue: #434

## Context

The setup screen recommends one text model per memory tier (`TEXT_TIERS`, ADR-0021), chosen by hand. Users need to know which free local model produces usable exercises on their computer, and the maintainer needs data that is comparable across machines and runs before changing a recommendation. Everything must cost nothing (ADR-0023): no cloud model, no cloud judge, no GitHub Actions. A benchmark that called models from its own code would measure a copy of the product, not the product.

## Decision

- The benchmark (`scripts/bench/`, `pnpm bench`) launches the built app headless through Playwright's Electron driver with a throwaway user-data folder, as `scripts/make-example.mjs` does (the shared code is now `scripts/lib/app-driver.mjs`), and uses only existing IPC channels: `examples:open`, `index:rebuild`, `providers:upsert`, `routing:set`, `generate:ideas`, `generate:scenario`, `generate:rerun-stage`, `scenarios:get`, `scenarios:save`, `scenarios:lint`, `jobs:get`, `jobs:log`. No benchmark code ships in the app. The only app change is the provider option `seed`, sent by the OpenAI-compatible and Ollama adapters.
- Inputs are fixed: the shipped example projects (their documents, briefs and hand-corrected scenarios), suite files with a `suiteVersion` (`bench/suites/`), planted defects (`bench/defects/`), the gold statistics parsed from `reference/scenario-3/msel.md` (`bench/gold/`), the shipped prompts (overrides refused), seeds 11, 23, 37 per repeat and a 32K context.
- Scoring is deterministic and model-free: stage success, the app's own lint findings, citation resolution and coverage, a pass/fail structure rubric, defect recall and noise, and ideation validity, distinctness (term-frequency cosine), resolution and spread. The run file records `scoringVersion`; version 1 has no grounding support score until #423 lands, and reports never rank runs of different suite or scoring versions together.
- Only endpoints on 127.0.0.1 are accepted, with no override; the mock provider is allowed only with `TTX_MOCK_PROVIDERS=1` for the smoke test, and the report refuses mock runs.
- Run files (`BenchRun`) and the report (`BenchReport`, read by the website) are zod schemas in `src/shared/schemas/bench.ts`; the report's JSON Schema is committed beside it. Run files carry coarse hardware only; the report refuses any absolute path or host or user field and escapes every string in the generated Markdown.
- The optional local model judge of the spec (FR-17) is not built yet: it needs the maintainer's calibration set, and its scores would not enter the composite in this version anyway.

## Consequences

- A benchmark result reflects the real product, including retrieval, repair rounds and the critique's revision pass; a prompt or pipeline change can move scores, which the recorded prompt hashes and app commit make visible.
- The structure rubric and the defect word lists are heuristics; they reward structure and specific findings, not prose quality. Changing them bumps the suite version.
- Runs take hours on modest hardware (the standard suite runs five full scenario drafts three times), so published data grows through contributors' pull requests rather than a scheduled job.
- The memory fit uses a rough context-cache estimate (a tenth of the weights at 32K), not per-architecture numbers.
