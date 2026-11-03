# Spec 0445: Tabletop Mini Benchmark, a screening benchmark that runs in minutes

Issue: #604 · Status: Approved by the owner (delegated, 2026-11-03), building · Builds on: spec 0434 (local model benchmark), spec 0444 (Tabletop Benchmark), ADR-0070 (critique scoring)

## Summary

The Tabletop Benchmark (spec 0444) takes hours per model. The **Tabletop Mini Benchmark** answers
one question in a few minutes: will this model work for tabletop generation? It makes four model
calls on fixed inputs taken from the bundled examples, scores them with the scorers the full
benchmark already uses, times them, and prints a plain verdict, **will work**, **risky** or
**won't work**, with the reasons and the numbers. It screens a model; it does not rank models
for publication and does not replace the full benchmark.

## What separated models in the 2026-11-03 runs

Ideation scored 59 to 82 for every model, so the Mini leaves it out. What separated models was:
a format failure on the first structured call (gpt-oss under MLX), a reply cut off at the length
limit on a long prompt (qwen3.6 on an MSEL phase) or a long output (qwen3.5-9b on the handbook),
a review step that rewrote correct rows (qwen3-30b), and speed on a 20K-token prompt.

## Requirements

- **FR-1 Probes.** Fixed inputs, one project copy per probe so one model's output never feeds
  another call (`bench/suites/mini.json`, `probes`):
  1. **Format**: re-run `scenario_overview` on city-water "pH on the Edge". Valid structured
     output; repair rounds are reported.
  2. **Long prompt**: re-run `msel_phase` for the **last phase** of the chemical-rmp scenario
     (the prompt carries the corpus, the phase plan, the roles and every earlier phase's rows,
     about 20 to 30K tokens at the suite's 32,768 context). Scored on that phase's rows with the
     lint, citation (resolution, coverage, source check) and structure scorers.
  3. **Long output**: re-run `controller_handbook` on the city-water MSEL. Completes without a
     length cut-off; scored on sections present and repeated phrases (looping).
  4. **Review**: the county-911 `storm-tdos` planted-defect case (`bench/defects/`), run exactly
     as the full benchmark runs it, scored by the full benchmark's critique scorer: recall,
     fixed, damage, deliberate content kept (pressure, misinformation, clue and red-herring rows
     weigh three times), noise.
  5. **Held-out review** (maintainers only, `--held-out`): one case of
     `bench/defects-held-out/`, kept out of the published task set.
  6. **Speed**: output tokens per second over the calls, and the long-prompt call's size and time.
- **FR-2 One scoring implementation.** `scripts/bench/mini/score.mjs` only composes
  `score/lint.mjs`, `score/citations.mjs`, `score/rubric.mjs` and `score/composite.mjs`
  (critique); it adds the handbook's completeness and repetition measures, which have no
  full-benchmark equivalent. A scenario reduced to one phase (`phaseView`) is what the existing
  scorers see for probe 2.
- **FR-3 Time cap.** A call running longer than `callCapSeconds` (180) is cancelled and recorded
  as a failure of that probe ("did not finish within the per-call time cap"). `--cap` changes it
  (30 to 1800). A runaway reply therefore costs three minutes at most.
- **FR-4 Verdict.** `scripts/bench/mini/verdict.mjs`, thresholds in the suite file.
  - _Won't work_: a generation probe (format, long prompt, long output) failed, was cut off or
    timed out; or the Mini score is under 45.
  - _Risky_: all ran, and any of: Mini score under 60; a repair round in a generation call; a
    handbook with 25% or more repeated phrases; a review that damages 10% or more of correct rows
    (advice: turn the review step off or check its changes), finds under 30% of planted defects,
    or failed; output under 15 tokens per second; the long prompt taking over 150 s.
  - _Will work_: none of the above.
  - The Mini score is the weighted mean of the probes (format 0.10, long prompt 0.35, long output
    0.20, review 0.35; the held-out review shares the review weight).
- **FR-5 Run file and task set.** `MiniRun` (`src/shared/schemas/bench.ts`) holds the probes,
  speed, score, verdict, model (with its model-card sampling), coarse hardware, prompt and corpus
  hashes and `taskSetHash`. `pnpm bench:export -- --suite mini` writes the Mini task set (the suite
  file, the county-911 defect file, the gold statistics, `corpus.json` with the corpus hash of
  each probe example) and its hash, as for the other suites. Changing a probe or threshold bumps
  `suiteVersion`.
- **FR-6 Running.** `pnpm bench:mini -- --models <a,b,c>` or `pnpm bench -- --suite mini --models …`.
  A list of models runs one after the other. For an LM Studio model the runner loads it at the
  suite's context length (`lms load <id> --context-length 32768 -y`), runs the Mini and unloads it,
  so a list is one command; `--no-load` leaves loading to the user, `--stop-server` runs
  `lms server stop` at the end. A model that cannot run (not found, app error) is reported and the
  list continues. Local endpoints only, as for the full benchmark.
- **FR-7 Validation without a model.** `pnpm bench:mini:replay <run-dir>…` computes the Mini
  probes from the saved work folders of full runs (see below).
- **FR-8 Publishing.** The public repository and the website page carry the Mini next to the full
  Tabletop Benchmark: task set, methods, an empty results table ("First results coming"), how to
  run and how to submit. The full benchmark's user-facing name is **Tabletop Benchmark** (URL and
  repository slugs unchanged).

## Validation against the 2026-11-03 full runs

Computed with `pnpm bench:mini:replay` from the saved runs in `~/Code/as-triage/.tmp/triage`
(8 models, quick suite, one repeat) and `.tmp/fast` (gemma, qwen3-30b; three repeats; first
repeat used). The replay reads the same kind of call from each run's own drafted scenario (its
overview, its last MSEL phase, its handbook, its saved county-911 critique), so it shows whether
the probes see the failures, not what a live Mini would score on the fixed inputs.

| Run                           | Full overall | Full drafting | Full flags                           | Mini score | Mini verdict   | Why                                             |
| ----------------------------- | ------------ | ------------- | ------------------------------------ | ---------- | -------------- | ----------------------------------------------- |
| qwen3.8-27b                   | 74.3         | 84.9          | none                                 | 84.9       | Risky          | review damaged 54% of correct rows              |
| gemma-4-26b (triage)          | 60.3         | 66.1          | none                                 | 81.1       | Risky          | review damaged 31%                              |
| qwen3-30b                     | 68.4         | 76.8          | none                                 | 75.8       | Risky          | review damaged 56%                              |
| qwen3.5-4b                    | 57.4         | 70.3          | none                                 | 74.5       | Will work      | none                                            |
| nemotron-3.5-lightning-30b    | 58.5         | 62.9          | none                                 | 70.4       | Risky          | review damaged 38%                              |
| qwen3.5-9b                    | 63.3         | 69.3          | reliability 50% (handbook cut off)   | 57.1       | **Won't work** | handbook cut off at the length limit            |
| qwen3.6-35b                   | 49.6         | 47.2          | reliability 40% (MSEL phase cut off) | 34.5       | **Won't work** | MSEL phase cut off at the length limit          |
| gpt-oss-20b (MLX)             | 8            | 0             | reliability 0% (format)              | 12.3       | **Won't work** | overview not valid structured output            |
| gemma-4-26b (fast, 3 repeats) | 77           | 80.4          | none                                 | 82.3       | Will work      | none                                            |
| qwen3-30b (fast, 3 repeats)   | 75.6         | 77.3          | review damage 23.3%                  | 68.9       | Risky          | review damaged 42%; held-out review got no JSON |

- **Ranking.** Spearman rank correlation of the Mini score with the full overall score is 0.79
  and with full drafting 0.81 over the 8 triage runs (0.65 and 0.76 over all 10 rows, where gemma
  and qwen3-30b appear twice). The Mini puts the four runs that failed a generation call at the
  bottom, as the full suite does.
- **Flags.** All four named failures are seen: gpt-oss format, qwen3.5-9b handbook cut-off,
  qwen3.6 MSEL phase cut-off, and qwen3-30b review damage. The three generation failures give
  _won't work_; the damage gives _risky_.
- **Caveat on damage.** The triage runs predate the critique fixes of #590 and #592, so their
  reviews damaged more rows than the fast runs' (31 to 56% against 0 to 23%); the damage flag
  fires for four of the eight there. It is a true statement about those runs and it is why the
  verdict wording says "check its changes" and not "do not use".
- **Misses.** None among the four named failures. A Mini probe reproduces a cut-off only when
  the model fails on the fixed input; qwen3.6 failed the last phase and qwen3.5-9b the handbook,
  which is why the long-prompt probe is the last phase (earlier phases passed for qwen3.6) and why
  the handbook probe runs on the largest bundled example MSEL. A model whose failure depends on
  its own upstream output is not guaranteed to fail on the fixed input; the full benchmark remains
  the check for those.

## Live timing check

One run on gemma-4-26b-a4b-it-mlx (LM Studio, MLX, 32,768 context, 128 GB Apple Silicon) with the
held-out review: **175 seconds** from `lms load` to unload, of which 126 seconds were model time
(format 8 s, long prompt 24 s for 29,744 prompt tokens, handbook 20 s, review 60 s, held-out
review 14 s). Verdict: will work, Mini score 90.7 (format 100, long prompt 92, long output 96,
review 95, held-out review 73). A 30B model that runs at a third of that speed would take about
10 minutes; the 3-minute per-call cap bounds a runaway.

## Out of scope

Ideation, injects and media, several repeats (one seed, 11) and ranking for publication. A Mini
result is `community` evidence of a screening, never `verified`.

## Open questions

1. Whether the review damage flag should be advisory in the verdict (it is _risky_ now, matching
   the full benchmark's advisory critique). Recommendation: keep, and revisit after the first
   published Mini results.
