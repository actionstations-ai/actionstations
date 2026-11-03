# Spec 0444: Tabletop Bench, a public benchmark of LLMs generating tabletop exercises

Issue: #586 · Status: Approved by the owner (delegated, 2026-11-03), building · Builds on: spec 0434 (local model benchmark), #585 (model profiles), #584 (concurrency and triage)

## Summary

Tabletop Bench publishes the benchmark of spec 0434 as a public, citable artifact: versioned and
hashed task sets, model-free scoring, result files from open-weight models run locally, a
leaderboard, and a way for anyone to submit a run. It lives in three places that all read the same
files: the public repository `actionstations-ai/tabletop-bench`, a Hugging Face dataset and
leaderboard Space, and a page on actionstations.ai. Scoring stays in this repository, run by the
app's own pipeline. No benchmark numbers are published until the reruns with the model-card
settings of #585 are done.

## Requirements

### User stories

- As a researcher, I want a fixed, versioned task set and a stated scoring method, so that I can
  cite results and compare my model with others without trusting a judge model.
- As a model author or hobbyist, I want to run one command on my machine and submit the result file
  in a pull request, so that my model appears on the leaderboard.
- As a reader, I want to know which numbers the maintainers reproduced, so that I can tell a claim
  from a check.
- As the maintainer, I want adding a result to be one command and the leaderboard to be generated,
  so that publishing costs minutes, not an afternoon.

### Functional requirements

**Name, homes and licenses**

- **FR-1** The benchmark is called **Tabletop Bench**. Homes: GitHub `actionstations-ai/tabletop-bench`
  (public), Hugging Face dataset `mdctric/tabletop-bench` and Space `mdctric/tabletop-bench-leaderboard`
  (user `mdctric`; no Hugging Face organization exists yet, and both can be transferred to one
  later without changing the file formats), and `actionstations.ai/tabletop-bench/`.
- **FR-2** Licenses: task sets, result files and the leaderboard data are **CC BY 4.0**. Runner and
  report code are under the app's license (PolyForm Internal Use 1.0.0 with the education
  permission), text copied from this repository. The benchmark is never described as open source.
- **FR-3** No GitHub Actions in the new repository (Project rules 1). Everything is local scripts.

**Task sets**

- **FR-4** A task set is the files that define what a suite asks: the suite file (cases, weights,
  thresholds, seeds, context length), the planted-defect files of its critique cases, the gold MSEL
  statistics, the judge prompt and calibration rows, and `corpus.json` (the corpus hash of each
  example and the exact drafting briefs). `scripts/bench/taskset.mjs` (`pnpm bench:export`) builds
  it from `bench/` and `examples/`.
- **FR-5** A task set has a **hash**: sha256 over the sorted (path, file sha256) pairs of its files.
  `taskset.json` records suite, suite version, scoring version, the per-file hashes and the hash.
  Changing any case, weight, threshold, defect, brief or example document changes the hash and
  bumps `suiteVersion`. A published task set is never edited; a new version is a new folder
  (`tasks/standard-v2/`).
- **FR-6** Every run file carries `taskSetHash` (new optional field of `BenchRun`, written by the
  runner), `suiteVersion`, `scoringVersion`, `appVersion`, `appCommit`, prompt and corpus hashes,
  `hardware` (coarse), and `model` with its quantization, digest, context length and `inference`
  (the model profile id and sampling settings of #585). Results from different task-set hashes or
  scoring versions are never ranked together.

**Scoring**

- **FR-7** Scoring is deterministic and model-free, exactly as spec 0434 FR-9 to FR-16. The
  optional local judge is not part of Tabletop Bench scores.
- **FR-8** There is **one implementation of scoring**: `scripts/bench/score/` in this repository.
  The public repository contains no scoring code (see Design, "One source of truth").

**Models**

- **FR-9** Published results are open-weight models run locally through LM Studio or Ollama (MLX on
  Apple Silicon through LM Studio), with sampling taken from the model card through the model
  profiles of #585 and recorded in `model.inference`. The runner refuses non-loopback endpoints
  (0434 FR-3).
- **FR-10** Hosted models are supported by design, not run: the runner calls the app's provider
  adapters, so a hosted adapter that is added to `src/main/providers/*` can be benchmarked by
  lifting the loopback rule behind an explicit flag in a later spec. Until then no paid hosted call
  is made, and the result schema's `model.tool` accepts only local tools.

**Running and submitting**

- **FR-11** `tb run` in the public repository checks that the app checkout's exported task-set hash
  equals the hash in `tasks/<suite>-v<N>/taskset.json`, runs `pnpm bench` there, and copies the run
  file back. A mismatch stops the run with the two hashes shown.
- **FR-12** `tb add <run.json>` validates a run file (shape, no absolute paths or host and user
  fields, task-set hash known, `model.inference` present, the model not a mock), copies it to
  `results/<suite>-v<N>/`, and regenerates the leaderboard. It is the only step needed to add a
  result.
- **FR-13** Anyone may submit a run file by pull request. A submitted run has status `community`.
  The maintainers do not edit run files.

**Verification**

- **FR-14** A run becomes `verified` when the maintainers rerun the same suite on the same model
  (same ref, quantization and digest, same `taskSetHash` and `scoringVersion`, same profile and
  sampling) and the rerun agrees within tolerance. `tb verify <community> <rerun>` decides and
  writes `verification/<run file name>`.
- **FR-15** Tolerance. The two overall medians differ by at most `max(5, widest repeat range of the
two runs)` points; every task median differs by at most 10 points; drafting reliability differs
  by at most 0.15. Runs agree on the task-set hash, scoring version and model digest or the
  verification is refused as "not comparable". Hardware may differ. The numbers follow from the one
  published pair of repeats measured under 0434 (ranges of 5 to 15 points between seeds), so
  5 points is the least that two correct runs of a seeded 3-repeat suite can be expected to hold.
  A rerun outside tolerance sets the status `disputed` with both numbers shown; it does not delete
  the submission. A verified record names the rerun file (so the check is itself checkable).
- **FR-16** The leaderboard shows one row per model (ref, quantization, profile), using the run
  with the highest status (`verified` over `community`) and, among equals, the latest. The status is
  text in its own column, never only colour.

**Leaderboard and publishing**

- **FR-17** `tb build` generates, from `results/` and `verification/` only: `leaderboard/leaderboard.json`
  (schema in the repository), `leaderboard/LEADERBOARD.md`, the README table between markers, and
  `dist/hf/` (the dataset and Space folders). With no results every table says **First results
  coming** and the numbers are absent.
- **FR-18** The Hugging Face dataset holds `tasks/`, `results/`, `verification/`, a dataset card and
  a flat `results.jsonl` (one run per line) for the Hub dataset viewer. The Space is a static HTML
  page that reads `leaderboard.json` with no server and no tracking. `scripts/publish-hf.sh`
  uploads both with the `hf` CLI.
- **FR-19** The website page `actionstations.ai/tabletop-bench/` explains the benchmark in plain
  language, links the repository, dataset and Space, and renders the leaderboard from a copy of
  `leaderboard.json` imported at build time (the same pattern as spec 0434 task 10). Its empty state
  reads "First results coming".

### Non-functional requirements

- **NFR-1** Cost: zero. No hosted model, no Actions, no paid service. Hugging Face and GitHub free tiers.
- **NFR-2** Privacy: run files contain scores, model metadata and coarse hardware only (0434 NFR-2).
  `tb add` rejects anything else.
- **NFR-3** The tooling has no dependencies beyond Node 20, so the repository clones and works.
- **NFR-4** Accessibility: tables have header rows and text status values; the Space and site page
  meet WCAG 2.2 AA (contrast, keyboard, no colour-only meaning).
- **NFR-5** Reproducibility: a result can be traced to the app version and commit, task-set hash,
  corpus hashes, prompt hashes, seeds and the model digest.

### Out of scope

- Publishing any number before the #584 and #585 reruns.
- Hosted and paid models; image, video and voice tasks; judge scores in the composite.
- A hosted submission service or accounts; submissions are pull requests.

## Design

### One source of truth

Two options were weighed.

1. **The public repository holds the runner and scoring.** Self-contained, but scoring depends on
   the app's own `lintScenario`, citation grounding, pipeline stages and prompt files, and the
   cases drive the built app through its IPC. Copying that would fork the scoring, and the copies
   would drift: the tasks measure the product, so the product must be the reference.
2. **The app repository keeps runner and scoring; the public repository holds the task sets, results,
   methods and tooling that does not score.** Chosen.

The app repository is the single source of truth for what is asked (`bench/`, `examples/`) and how
it is scored (`scripts/bench/score/`). The public repository holds a hashed export of the task
sets, so readers can inspect, cite and pin them. `tb run` refuses to run when the app checkout
exports a different hash, so a result can never mix a stale task set with new scoring. `tb build`
only aggregates scores that the app already computed (medians per model, latest run, status); it
computes no scores. The cost is that reproducing a result needs an Action Stations checkout at
the recorded `appCommit`; the methods page says how, and the task-set export lets reviewers read
every case without one.

### Public repository layout

```
README.md                  methods summary, how to run, how to submit, citation, license, tables
CITATION.cff               citation metadata
LICENSE.md, LICENSE-EDUCATION.md   runner and tooling (copied from the app)
LICENSE-DATA.md            CC BY 4.0 for tasks/, results/, verification/, leaderboard/
tb.mjs, lib/               the command line (check, run, add, verify, build)
tasks/<suite>-v<N>/        exported task set + taskset.json (hash)
results/<suite>-v<N>/      run files (BenchRun JSON), one per run
verification/              verification records
leaderboard/               generated leaderboard.json, LEADERBOARD.md
hf/                        dataset card and Space source (static)
docs/                      METHODS.md, SUBMITTING.md, VERIFYING.md
tests/                     node:test tests for the tooling
```

### App-side changes

- `scripts/bench/taskset.mjs`, `pnpm bench:export`: builds and hashes the task set, optionally
  writes it to a folder (`--out`). Tests in `tests/scripts/bench-taskset.test.ts`.
- `BenchRun.taskSetHash` (optional) written by `buildRun`.
- The generated `docs/benchmarks/` report is unchanged and continues to serve the app's per-tier
  recommendations; Tabletop Bench is the public, versioned view of the same runs.

### Result and verification status

`community` (submitted, not reproduced) → `verified` (reproduced within FR-15) or `disputed`.
Status is derived by `tb build` from `verification/`; run files do not change.

## Security and privacy

- Run files are untrusted input: `tb add` parses them, checks types, rejects absolute paths and
  host or user fields, and escapes every string in generated Markdown and HTML.
- The leaderboard page builds DOM with `textContent`, never `innerHTML` from data.
- No secrets exist in the repository; the Hugging Face token stays in the user's `hf` login.

## Testing

- App: `tests/scripts/bench-taskset.test.ts` (files, hash stability and change, export re-hash).
- Public repository: `node --test` for validation, hash check, verification tolerance (inside,
  outside, not comparable), leaderboard selection (verified over community, tiers of status),
  empty state, and escaping.

## Tasks

1. Task-set export and hash in the app; `BenchRun.taskSetHash`; tests. (this PR)
2. Public repository with tooling, task sets, docs, licenses; tests.
3. Hugging Face dataset and Space; `publish-hf.sh`.
4. Site page and import script.
5. After #584 and #585 merge: rerun the standard suite for the chosen open-weight models, add them
   with `tb add`, verify, and publish (separate issue; the owner reviews the first numbers).

## Open questions

1. **Organization.** The Hugging Face assets sit under `mdctric` until an organization exists;
   moving them changes URLs only. Recommendation: create the organization before the first numbers.
2. **Task-set size.** The standard suite (3 corpora, 5 briefs, 6 critique cases) is small. Growth
   goes into new suite versions (`standard-v2`), never edits.
3. **Contamination.** The task inputs and planted defects are public, so a model trained on them
   could overfit. A held-out suite kept private by the maintainers is a later option; a public
   result would then name it as such.
