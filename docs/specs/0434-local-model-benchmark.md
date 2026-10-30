# Spec 0434: Benchmark local models on Action Stations tasks

Issue: #434 · Milestone: 0.7.0 · Status: Implemented (scoring version 1 with grounding support; judge deferred, see As built) · Depends on: #423 (citation support scoring) · Related: #433

## Summary

A repeatable benchmark, run on a contributor's own computer with `pnpm bench`, drives the built
app against local models (LM Studio, Ollama) through three tasks: ideation, MSEL drafting and
critique. It uses the shipped example corpora and briefs as fixed inputs and scores the output
with the app's own checks (lint results), citation accuracy, and a deterministic rubric drawn from
the Scenario 3 gold standard. Results are JSON files that a report step merges into one data file
the website reads, with a recommended model per memory size. It costs nothing: no cloud model,
no cloud judge, no GitHub Actions.

## Requirements

### User stories

- As a free user, I want to know which free model is good enough for my computer's memory, so that
  I do not waste an afternoon downloading models that produce broken exercises.
- As a contributor, I want to benchmark a new model with one command and submit the result file in
  a pull request, so that the published table grows without the maintainer's hardware.
- As the maintainer, I want results that are comparable across runs and machines (same inputs,
  seeds, prompts, scoring), so that a model swap in the setup recommendations is backed by data.

### Functional requirements

**Running**

- **FR-1** `pnpm bench -- --models <ref,…> [--suite quick|standard] [--repeats N] [--out <dir>]`
  runs the suite for each model. A model ref is `lmstudio:<model id>` or `ollama:<model name>`
  (`--base-url` overrides the default local endpoints from `src/main/providers/local-detect.ts`).
  It needs `pnpm build:app` first, like `scripts/make-example.mjs`, and launches the built app
  headless through Playwright's Electron driver with a throwaway user-data directory
  (`TTX_USER_DATA`, `TTX_HEADLESS=1`, as `make-example.mjs` does), so the
  contributor's own settings, projects and keys are never read or changed.
- **FR-2** Every task is routed to the model under test (`ideate`, `draft`, `critique`); `embed`
  uses the local ONNX embedder (`bge-small-en-v1.5`, downloaded once on first run after a
  confirmation prompt, or `--embedder hash` for a fully offline run, recorded in the result).
  Media tasks are not routed and never run.
- **FR-3** The runner refuses any endpoint that is not on this machine (loopback only:
  `assertLocalEndpoint` in `scripts/bench/model-info.mjs`, stricter than `isRemoteProvider` of
  #433): the benchmark is for local models and must never send the corpora to a cloud service.
  There is no flag to override this.
- **FR-4** Suites are data, not code: `bench/suites/quick.json` and `bench/suites/standard.json`
  list the cases (FR-6 to FR-8), weights and thresholds, with a `suiteVersion`. Changing a case
  or weight bumps the version; results from different versions are never ranked together.
- **FR-5** Repeatability: each repeat `r` (default 3 in `standard`, 1 in `quick`) sets a fixed seed
  (`[11, 23, 37][r]`) through the provider option `options.seed`, which the OpenAI-compatible
  adapter sends as `seed` and the Ollama adapter as `options.seed` (a small adapter change; LM
  Studio and Ollama both honour it). Temperatures, `maxTokens` and retrieval come from the shipped
  prompt files, whose `promptHash` values are recorded. The runner refuses to run when project or
  global prompt overrides exist in its user-data directory (they cannot, since it is fresh, but the
  check guards future changes).

**Tasks and cases**

- **FR-6** **Ideation**: for each case project (standard: `airport-ncia`, `city-water`,
  `county-911`; quick: `city-water`), open a copy of the example project with `examples:open`
  (its documents are the ones `build.json` names, with simulated names) and rebuild its index,
  then run `generate:ideas` with `count: 6` and an empty brief. One copy per example and repeat
  serves all three tasks.
- **FR-7** **MSEL drafting**: for each case brief taken from `build.json` `scenarios[]` with its
  `userPrompt`, `audience` and `threatFamily` (standard: five briefs, two each from `airport-ncia`
  and `city-water` and the one in `county-911`, a hand-authored entry without a `userPrompt` taking the brief stored with its shipped scenario; quick: the `city-water` `chem` scenario), run `generate:scenario` through the pipeline stages up to and
  including `critique` and the revision passes (`PIPELINE_STAGES` in
  `src/main/generate/engine.ts`), without injects or media. A stage that fails after its repair
  round is recorded and the case continues where the engine allows.
- **FR-8** **Critique**: for each seeded case (standard: six; quick: two), load a hand-corrected
  scenario from `examples/*/project/scenarios/` into the project, apply a fixed list of planted
  defects (`bench/defects/<case>.json`), and run `generate:rerun-stage` for `critique`. Defect
  kinds: time order broken, a row whose expected action contradicts its cited section (the
  planted text names a different authority than the passage), an inject from a player role, a
  duplicate row, a missing decision point, a facility identifier not in the facts, a restoration
  implausibly fast, an outside agency deciding for the organization. Each defect records the row
  and the words a correct note must contain (any of a small synonym set).

**Scoring** (all deterministic; implemented in `scripts/bench/score/`)

- **FR-9** **Reliability** per stage: success rate, repair rounds used, replies with no JSON
  (`StageFailure.noJson`), and dropped citation keys (`CITATION_DROPPED`).
- **FR-10** **Lint** for drafted scenarios: warnings from `scenarios:lint` (the same
  `lintScenario` the app shows) weighted by severity (error 5, warning 2, info 0.5), normalized per
  10 MSEL rows, mapped to 0–100 with a cap; per-code counts are kept for the detail view.
- **FR-11** **Citation accuracy**: (a) resolution: share of cited keys that resolved to a chunk;
  (b) support: share of claim-bearing rows labelled `grounded` by the #423 deterministic check
  (model verification off), with `unsupported` counted against; (c) coverage: share of non-control
  rows (not STARTEX, ENDEX, TIME_JUMP) with at least one citation. Until #423 lands, (b) is
  omitted and its weight moves to (a) and (c); the result records which scoring version ran.
- **FR-12** **Structure rubric** against the gold MSEL (`reference/scenario-3/msel.md`, parsed once
  into `bench/gold/scenario-3.json` and committed): pace within the gold band (rows per hour),
  purpose-tag mix covers the gold's categories (CORE_NARRATIVE, NOISE or RED_HERRING, PRESSURE or
  MISINFORMATION, CLUE, DECISION_POINT, TIME_JUMP), the decision point sits in the decision phase,
  STARTEX first and ENDEX last, every player role receives an inject in every phase, brief
  identifiers used (no `BRIEF_IDS_MISSING`), no `REFERENCE_LEAK`. Each item is pass/fail with a
  weight; the score is the weighted share passed.
- **FR-13** **Ideation**: valid ideas returned (out of 6), distinctness (no two ideas with
  title + hook cosine similarity ≥ 0.85, computed on term-frequency vectors so the number is the
  same on every machine; an embedding model's output depends on its runtime), citation
  resolution of `sectionsExercised` (dropped keys read from the ideate job log), threat-family
  spread (distinct families / ideas), and grounding of `whyItTeaches` (#423, `grounding:ideas`).
- **FR-14** **Critique**: recall of planted defects (a note matches when its `rowId` is the
  defect's row, or a row adjacent for order defects, and its text contains one of the defect's
  words), plus noise: notes on rows with no planted defect and no lint finding, per 10 rows,
  reported but weighted lightly because some may be valid.
- **FR-15** **Speed and footprint**: wall time per task, output tokens per second from `StageRun`
  usage, prompt tokens of the largest request, model size on disk and quantization (from Ollama
  `/api/show` or LM Studio `/api/v0/models`), context length configured.
- **FR-16** **Composite**: per task a 0–100 score from the weights in the suite file; overall =
  weighted mean (drafting 0.5, critique 0.25, ideation 0.25 by default). With repeats, the result
  stores every repeat and reports the median and the min–max range; a range wider than 15 points
  is flagged "unstable".
- **FR-17** **Optional model judge** (off by default, never cloud): `--judge lmstudio:<model>`
  adds a plausibility rubric per MSEL row from a local judge model through
  `prompts/bench_judge.md` (shipped with the benchmark, not the app). The judge must quote the row
  and the cited passage for every score; a score whose quotes are not substrings is discarded.
  Judge scores are published only when the judge's agreement with the human calibration set
  (`bench/calibration/rows.json`, 60 rows scored by the maintainer on the same rubric) reaches
  Cohen's kappa ≥ 0.6, recorded in the result. Judge scores never enter the composite in 0.7.0.

**Results and publishing**

- **FR-18** Each run writes `<out>/<date>-<model-slug>-<machine-slug>.json` (schema
  `BenchRun`, FR-21) and a short Markdown summary to the terminal. Generated projects stay in
  `<out>/work/` for inspection unless `--clean`.
- **FR-19** Contributors submit run files by pull request to `docs/benchmarks/runs/`.
  `pnpm bench:report` validates every run file, drops runs from other suite versions than the
  current one (listed separately as archived), and writes `docs/benchmarks/model-benchmarks.json`
  (schema `BenchReport`) plus `docs/benchmarks/README.md` with a table generated from it.
- **FR-20** **Recommendations per memory size** in the report: for each tier of
  `TEXT_TIERS` in `src/main/setup/models.ts` (memory budget below 10 GB, 10–24, 24–72, 72 GB and
  up, budget as computed by `hardwareView` in `src/main/setup/hardware.ts`), the model with the
  highest median overall score whose size on disk plus a KV-cache estimate for the context used
  fits the tier's budget, provided it passes the floor: no task below 50, drafting reliability
  ≥ 90%, and not flagged unstable. A tier with no model above the floor says so. The report lists
  which runs (hardware, date) back each recommendation.
- **FR-21** The website consumes `docs/benchmarks/model-benchmarks.json` only. The site repository
  copies it into `src/data/model-benchmarks.json` with a script beside its existing
  `scripts/import-bundled.mjs`; the site renders a table and the per-tier recommendations. The
  JSON Schema for the file is committed at `docs/benchmarks/model-benchmarks.schema.json`
  (generated from the zod schema with `z.toJSONSchema`) so the site validates what it imports.

### Non-functional requirements

- **NFR-1** Cost: runs only on the contributor's machine with local models; no cloud provider, no
  cloud judge, no GitHub Actions; not part of `pnpm ci:local` (Project rules 1). Unit tests of the
  scoring are part of `pnpm test`.
- **NFR-2** Privacy: inputs are the shipped fictional examples and public reference material; a
  fresh user-data directory keeps the contributor's projects and keys out of the run; results
  contain scores, model metadata and coarse hardware (platform, chip or GPU name, RAM and VRAM
  rounded to GB), never a hostname, username or file path (Project rules 3).
- **NFR-3** Accessibility: the generated `docs/benchmarks/README.md` table has a header row and
  text values (no colour-only cells); the site follows its own WCAG 2.2 AA checks.
- **NFR-4** Time: `quick` finishes in under 45 minutes for a 9B model on a 32 GB Apple Silicon
  machine; `standard` with 3 repeats in under 8 hours. The runner prints an estimate after the
  first case and supports `--resume` from `<out>/state.json` after an interruption.
- **NFR-5** Platforms: macOS, Windows and Linux, wherever the app and LM Studio or Ollama run.

### Out of scope

- Cloud models (Anthropic) in the published table.
- Image, video and voice model benchmarks (a later issue).
- Inject text and template field quality (a later suite version).
- Automatic changes to `TEXT_TIERS`; the maintainer updates the setup recommendations by hand from
  the report.

## Design

### Layout

```
bench/
  suites/quick.json, standard.json        cases, weights, thresholds, suiteVersion
  defects/<case>.json                     planted defects per critique case
  gold/scenario-3.json                    parsed gold MSEL stats (committed)
  calibration/rows.json                   human-scored rows for the optional judge
  prompts/bench_judge.md                  judge prompt (optional, FR-17)
scripts/bench/
  run.mjs (+ run.d.mts)                   CLI: launch app, set up providers, run cases, write run file
  report.mjs (+ report.d.mts)             merge runs → model-benchmarks.json + README table
  gold.mjs                                parse reference/scenario-3/msel.md → gold/scenario-3.json
  defects.mjs                             apply planted defects to a scenario (pure)
  score/reliability.mjs lint.mjs citations.mjs rubric.mjs ideation.mjs critique.mjs composite.mjs
  model-info.mjs                          size, quant, digest, context from LM Studio / Ollama APIs
scripts/lib/app-driver.mjs                launchApp / invoke / waitForJob, extracted from make-example.mjs
docs/benchmarks/
  runs/*.json                             submitted run files
  model-benchmarks.json                   report (site input)
  model-benchmarks.schema.json            JSON Schema of the report
  README.md                               generated table + how to contribute a run
```

`scripts/lib/app-driver.mjs` takes the launch, `invoke` and job-waiting code out of
`scripts/make-example.mjs` so both scripts share it; `make-example.mjs` keeps its behaviour.

### Schemas (`src/shared/schemas/bench.ts`)

Zod schemas are the source of truth (`docs/09-CODE-CONVENTIONS.md`); the scripts validate files with the built
`out/` bundle or a JSON Schema generated from them.

```ts
export const BenchModel = z.object({
  ref: z.string(), // "ollama:qwen3.5:9b"
  tool: z.enum(['lmstudio', 'ollama']),
  toolVersion: z.string().optional(),
  name: z.string(),
  digest: z.string().optional(),
  quantization: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  contextLength: z.number().int().optional(),
})
export const BenchHardware = z.object({
  platform: z.string(),
  arch: z.string(),
  appleSilicon: z.boolean(),
  ramGb: z.number().int(),
  vramGb: z.number().int().optional(),
  gpuName: z.string().optional(),
  budgetGb: z.number().int(),
})
export const TaskScore = z.object({
  task: z.enum(['ideation', 'drafting', 'critique']),
  score: z.number().min(0).max(100),
  parts: z.record(z.string(), z.number()), // reliability, lint, citations.resolution, …
  details: z.record(z.string(), z.unknown()).default({}), // per-code lint counts, missed defects
  wallSeconds: z.number(),
  outputTokensPerSecond: z.number().optional(),
})
export const BenchRepeat = z.object({
  seed: z.number().int(),
  tasks: z.array(TaskScore),
  overall: z.number(),
  failures: z
    .array(z.object({ caseId: z.string(), stage: z.string(), error: z.string() }))
    .default([]),
})
export const BenchRun = z.object({
  formatVersion: z.literal(1),
  suite: z.string(),
  suiteVersion: z.number().int(),
  scoringVersion: z.number().int(),
  appVersion: z.string(),
  appCommit: z.string(),
  promptHashes: z.record(z.string(), z.string()),
  corpusHashes: z.record(z.string(), z.string()),
  embedder: z.string(),
  model: BenchModel,
  hardware: BenchHardware,
  startedAt: IsoDateTime,
  repeats: z.array(BenchRepeat).min(1),
  median: z.object({ overall: z.number(), tasks: z.record(z.string(), z.number()) }),
  range: z.object({ overall: z.tuple([z.number(), z.number()]) }),
  unstable: z.boolean(),
  judge: z
    .object({
      model: z.string(),
      kappa: z.number(),
      published: z.boolean(),
      scores: z.record(z.string(), z.number()),
    })
    .optional(),
})
export const BenchReport = z.object({
  formatVersion: z.literal(1),
  generatedAt: IsoDateTime,
  suite: z.string(),
  suiteVersion: z.number().int(),
  models: z.array(
    z.object({
      model: BenchModel,
      runs: z.number().int(),
      median: BenchRun.shape.median,
      range: BenchRun.shape.range,
      unstable: z.boolean(),
      hardware: z.array(BenchHardware),
      fitsBudgetGb: z.number(),
    }),
  ),
  recommendations: z.array(
    z.object({
      tier: z.string(),
      minBudgetGb: z.number(),
      maxBudgetGb: z.number().nullable(),
      model: z.string().nullable(),
      reason: z.string(),
    }),
  ),
  archived: z.array(z.object({ suiteVersion: z.number().int(), runs: z.number().int() })),
})
```

### App changes

Small and generic, so the benchmark drives the real product rather than a copy:

- `src/main/providers/text/openai-compatible/chat.ts` and
  `src/main/providers/text/ollama/adapter.ts`: send `config.options.seed` when it is an integer.
  Adapter contract tests cover the field.
- No benchmark code ships in the app; there is no new IPC. The runner uses existing channels
  (`project:create`, `documents:import`, `providers:upsert`, `routing:set`, `generate:ideas`,
  `generate:ideas-result`, `generate:scenario`, `generate:rerun-stage`, `scenarios:get`,
  `scenarios:lint`, `scenarios:save`, `scenarios:create-empty`, `jobs:get`) plus
  `grounding:scenario` from #423.

### Website data contract

`docs/benchmarks/model-benchmarks.json` validated by `model-benchmarks.schema.json`. The site
shows per model: name, tool, quantization, size, median overall and per task with the range,
runs and hardware count, and an "unstable" note; and per memory tier the recommendation and
reason. The site does not compute scores.

## Security and privacy

- The benchmark launches the app with a temporary user-data directory and `TTX_*` test switches
  already used by `make-example.mjs`; it never reads the contributor's settings or secrets.
- Remote endpoints are refused (FR-3), so the corpora never leave the machine.
- Run files are checked by `bench:report` for forbidden fields (paths, hostnames, usernames) and
  rejected if any string looks like an absolute path.
- Submitted run files are data; `bench:report` validates them with the zod schema before use and
  treats every string as text when generating the README table (Markdown-escaped).

## Testing

- **Unit** (`tests/scripts/bench-*.test.ts`): each scorer with fixture scenarios (a clean example
  scenario scores high; a scenario with planted lint failures scores lower by the expected amount);
  `defects.mjs` applies each defect kind deterministically; critique matching (adjacent row for
  order defects, synonyms); composite weights and median/range/unstable; `report.mjs` tier
  selection with fixture runs (fits budget, floor, no model in tier); schema validation and the
  forbidden-field check; `gold.mjs` parses `reference/scenario-3/msel.md` into the committed JSON
  (test fails if the committed file is stale).
- **Adapter contract**: seed passed through for OpenAI-compatible and Ollama fixtures.
- **Smoke** (`e2e/bench-smoke.spec.ts`, part of `pnpm e2e`): runs the `quick` suite against the
  mock provider (`TTX_MOCK_PROVIDERS=1`, a test-only escape from FR-3 since the mock is in-process)
  and validates the run file against `BenchRun`.
- **Live** (`LIVE=1`): `pnpm bench -- --suite quick --models lmstudio:<small model> --repeats 2`
  produces identical lint counts for both repeats with the same seed (determinism check), run by
  the maintainer before each suite version bump.

## Tasks

1. Extract `scripts/lib/app-driver.mjs` from `scripts/make-example.mjs` (launch, invoke, wait for
   job, fresh user-data dir); `tests/scripts/make-example.test.ts` stays green.
2. Seed option in `src/main/providers/text/openai-compatible/chat.ts` and
   `src/main/providers/text/ollama/adapter.ts` with contract tests; note in
   `docs/guides/providers/lm-studio.md` and `ollama.md`.
3. Schemas: `src/shared/schemas/bench.ts`, export, JSON Schema generation script step
   (`scripts/bench/report.mjs --schema`), tests.
4. Gold and defects: `scripts/bench/gold.mjs`, `bench/gold/scenario-3.json`,
   `scripts/bench/defects.mjs`, `bench/defects/*.json`; tests.
5. Scorers: `scripts/bench/score/*.mjs` with `.d.mts` types and `tests/scripts/bench-score.test.ts`.
6. Runner: `scripts/bench/run.mjs`, `scripts/bench/model-info.mjs`, `bench/suites/*.json`,
   `--resume`, remote refusal, `package.json` scripts `bench` and `bench:report`;
   `e2e/bench-smoke.spec.ts`.
7. Report: `scripts/bench/report.mjs` (merge, tiers, README table, archived versions),
   `docs/benchmarks/` skeleton with contribution instructions; tests.
8. Optional judge: `bench/prompts/bench_judge.md`, `bench/calibration/rows.json`, kappa
   computation, `--judge`; tests with a fixed fake judge.
9. First published data: maintainer runs `standard` for the four `TEXT_TIERS` models on available
   hardware, commits run files and the report; CHANGELOG; ADR for "benchmark drives the built app
   with existing IPC; deterministic scoring; judge only with calibration".
10. Site (separate repository `actionstations-site`, own issue): import script and page reading
    `src/data/model-benchmarks.json`.

## Open questions

1. **Embedder for published runs.** Local ONNX matches what users run; hash is fully offline but
   weaker retrieval. Recommendation: local ONNX for published runs; hash allowed for quick local
   checks and marked in the result.
2. **Scoring before #423 lands.** Recommendation: ship scoring version 1 without grounding support
   (FR-11 b) if #423 slips, then bump the scoring version; reports never mix scoring versions.
3. **Context length.** Models behave differently at 8k and 32k context. Decided: 32k for the
   suite (Ollama's `num_ctx` per request; LM Studio's load setting, which the runner checks and
   warns about), not the 16k first recommended: the MSEL stage sends up to about 30,000 input
   tokens per phase (provider guides), so 16k would fail the drafting of capable models for
   lack of context rather than measure them.
4. **Who may submit runs.** Recommendation: anyone by pull request; the maintainer reruns any run
   that would change a recommendation before merging it.
5. **Include inject text in drafting.** It is where small models fail most visibly.
   Recommendation: add it in suite version 2 after the first table is out.

## As built (PR for #434)

Where the code differs from the text above, and why:

- **Corpus**: the cases open a copy of the shipped example project (`examples:open`,
  `index:rebuild`) instead of `project:create` and `documents:import`. The documents are the
  same files `build.json` names, already with simulated names; the copy also holds the
  hand-corrected scenarios the critique cases need, with their document ids intact, and skips
  re-ingesting per case. The critique case saves the scenario with planted defects in place on
  that copy (`scenarios:save`, stored warnings cleared) and re-runs `critique`.
- **Context**: 32k, not 16k (open question 3).
- **Pace item** of the rubric: content rows per hour between half the gold's slowest phase and
  twice its busiest (`thresholds.paceBand: [0.5, 2]`). The gold's own band (5 to 6 an hour) is
  narrower than the hand-corrected examples (about 9.5 an hour), which must pass.
- **Reliability**: a pipeline stage without a successful run counts as failed, so stages the
  engine never reached after a failure count against the model. Hand-made examples that predate
  the `eeg` and `sitman` stages are given those runs in the tests.
- **Schemas**: `BenchModel.tool` also allows `mock` (smoke runs only; `bench:report` refuses
  them); `median.draftingReliability` (0 to 1) carries the floor's reliability; `BenchReport`
  records `scoringVersion`, archives by suite and scoring version, and each recommendation lists
  the runs (`backedBy`: hardware and date) behind it. `ramGb` and `vramGb` are GiB as sold;
  `budgetGb` is in the app's 10^9 units, like `TEXT_TIERS`.
- **Memory fit**: size on disk plus a context-cache estimate of a tenth of the weights at 32k
  (at least 0.25 GB). A tier's budget is its lower bound; the lowest tier assumes 5.5 GB.
- **Remote refusal**: the runner has its own loopback-only check, stricter than `isRemoteProvider` of #433 (a benchmark never needs a host other than this machine).
- **Grounding**: #423 merged before this shipped, so scoring version 1 includes support
  (FR-11 b, from `grounding:scenario`) and the grounding of `whyItTeaches` (FR-13, from
  `grounding:ideas`), using the checker's own label. Support is (grounded − unsupported) /
  claim-bearing rows, at least 0. Weights: citations resolution 0.3, support 0.4, coverage 0.3;
  ideation valid 0.25, distinct 0.2, resolution 0.2, spread 0.15, grounding 0.2. When the check
  fails, the run records a `grounding` failure and leaves the part out.
- **Files**: `scripts/bench/corpus.mjs` (suites, examples, briefs, hashes) and
  `scripts/bench/cases.mjs` (the three case runners) split `run.mjs`;
  `scripts/lib/bench-app.ts` is the bundled entry through which the scripts use the zod
  schemas, `TEXT_TIERS` and `hardwareView` (`scripts/lib/bundle-main.mjs`). Default `--out` is
  `.tmp/bench`; `--repeats` is 1 to 3 (one per seed).
- **Judge and determinism (#503)**: `--judge` (FR-17) and `--determinism` are built. The judge
  scores up to 30 cited rows per run through the local OpenAI-compatible endpoint with
  `bench/prompts/bench_judge.md`, drops scores whose quotes are not in the text, and measures
  linearly weighted kappa against `bench/calibration/rows.json`. That file is the maintainer's to
  write (rows of `row`, `passage`, `score` 1 to 5); until it holds 60 rows the judge block is
  marked unpublished. `--determinism` replaces the `LIVE=1` check: it runs in the smoke test
  against the mock provider.
- **Not built yet**: the first published runs of the `TEXT_TIERS` models (task 9) and the site import
  (task 10). Quick runs of `ollama:qwen2.5:3b` (hash embedder) completed end to end while
  building this.
