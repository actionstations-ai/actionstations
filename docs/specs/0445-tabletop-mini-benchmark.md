# Spec 0445: Tabletop Mini Benchmark, a screening benchmark that runs in minutes

Issues: #604, #606, #612, #613, #614 · Status: Approved by the owner (delegated, 2026-11-03), building · Builds on: spec 0434 (local model benchmark), spec 0444 (Tabletop Benchmark), ADR-0071 (the Mini), ADR-0072 (requirement-based scoring, no time cap), ADR-0173 (partial credit, uncertain bands, failure evidence)

## Summary

The Tabletop Benchmark (spec 0444) takes hours per model. The **Tabletop Mini Benchmark** answers
one question in about ten minutes: will this model work for tabletop generation? It makes four
model calls on fixed inputs taken from the bundled examples, runs each twice, and reports one
number with a stated meaning:

**Mini score = Quality x Completion**

- **Completion** is the chance that a full scenario drafts with no failed stage.
- **Quality** is the share of credit the model's replies earn over fixed, absolute criteria: 1 for a yes/no
  item met, and a share between 0 and 1 for a continuous measure (see "Partial credit").

Review damage and draft time are shown next to the score, never mixed into it. A band
(**Recommended**, **Usable with editing**, **Not recommended**) follows from requirements written
in the methods. The Mini screens a model; it does not rank models for publication and does not
replace the full benchmark.

## Independence

Nothing in the Mini's scoring, bands or token budget reads a result of the full Tabletop
Benchmark. Quality is measured against the Scenario 3 reference (`bench/gold/scenario-3.json`)
and the planted defects, both fixed inputs. The bands are requirements, not a calibration against
another benchmark. The token budget comes from the pipeline and the bundled examples. The methods
may report how the Mini and the full benchmark agree, as a cross-check only.

## What separated models in the 2026-11-03 runs

Ideation scored 59 to 82 for every model, so the Mini leaves it out. What separated models was:
a format failure on the first structured call (gpt-oss under MLX), a reply cut off at the length
limit on a long prompt or a long output, a review step that rewrote correct rows, and speed on a
20K-token prompt. The first Mini runs added two lessons (#606): a fixed per-call time cap judged
slow models as failed ones, and a one-hour phase of about six rows was too easy to tell models
apart.

## Requirements

- **FR-1 Probes.** Fixed inputs, one project copy per probe and per run so one model's output
  never feeds another call (`bench/suites/mini.json`, `probes`):
  1. **Format**: re-run `scenario_overview` on city-water "pH on the Edge". Valid structured
     output; a repair round is reported in the repair rate, not as a failure.
  2. **Long prompt, a full phase**: re-run `msel_phase` for the **last phase** of the
     chemical-rmp scenario, stretched to 180 minutes (`phaseMinutes`). The app asks for six rows an
     hour, so the model must write 18 rows (allowed 21) with the corpus, the phase plan, the roles
     and every earlier phase's rows in the prompt (20 to 30K tokens at the suite's 32,768
     context). The stretched phase starts where the shipped one did and ends later; the brief's
     duration grows with it.
  3. **Long output**: re-run `controller_handbook` on the city-water MSEL.
  4. **Review**: the county-911 `storm-tdos` planted-defect case (`bench/defects/`), run as the
     full benchmark runs it, scored by the critique scorer.
  5. **Held-out review** (maintainers only, `--held-out`): one case of `bench/defects-held-out/`.
- **FR-2 Two runs of every probe.** `repeats: 2`, seeds 11 and 12, each run on its own project
  copies. Every figure is reported with its range over the two runs. Two models whose ranges
  overlap are a tie (`compareRanges` in `score.mjs`).
- **FR-3 No time cap.** A call is never ended for taking long. It ends only when it stalls or
  repeats itself, detected on the streamed reply (see "Stalls and loops").
- **FR-4 Completion.** A call **fails** only if it fails after the app's normal repair policy
  (the automatic repair round and the longer-answer retry are the app's own retries, invisible to
  users) or if it stalls or loops. The per-call rate is the share of calls that did not fail, over
  every Mini call of both runs. Completion is that rate raised to the number of model calls in a
  scenario (14: see "Token budget"). Both are reported, with the observed count ("0 failures in
  10 calls"); completion is the one in the score and the bands. The **repair rate** (calls that
  needed a repair round or a longer-answer retry) is reported separately, in its own column; it is
  not a failure and does not enter completion. Its cost is already in the measured seconds, so it
  feeds draft time.
- **FR-5 Quality.** The credit earned over the criteria, as a percentage 0 to 100, over the replies
  the model delivered (see "Criteria" and "Partial credit"). A yes/no criterion earns 0 or 1; a
  criterion on a continuous measure earns a share, so one lint finding or one missing citation
  moves quality by a fraction of a point, not by a whole criterion (#612). A call that returned nothing adds no criteria: it costs completion, not
  quality, so a failure is counted once. A run in which no call delivered a reply has quality 0.
- **FR-6 Shown alongside, not mixed in.**
  - **Review damage %**: the share of correct rows the review's revision changed, as the full
    benchmark's damage scorer measures it, averaged over the review calls of a run, with its range.
  - **Draft time**: minutes to draft a full scenario on this hardware, from the model's measured
    rates and the measured token budget of a scenario (see "Draft time"). A slow draft time is
    reported and never a failure.
- **FR-7 Bands.** From the requirements in the suite file (`bands`), applied to the reported
  values:
  - **Recommended**: completion >= 90%, quality >= 80 and review damage <= 5%.
  - **Usable with editing**: completion >= 75% and quality >= 60.
  - **Not recommended**: otherwise.
    When the ranges over the two runs reach into another band, the band is marked **uncertain**
    ("Usable with editing (uncertain)") and the verdict lists every band the range reaches
    (`uncertain`, `reaches`; #613). The reach is judged at the corners of the ranges: lowest
    completion and quality with highest damage, and the reverse. **No extra run is taken** to settle
    it: a third sample would change the cost of a Mini and still leave a range. The verdict lists why the model falls short, names every failed call and, for a
    stall or a loop, the raw tail of the reply.
- **FR-8 One scoring implementation.** `scripts/bench/mini/score.mjs` composes `score/lint.mjs`,
  `score/citations.mjs`, `score/rubric.mjs` and `score/composite.mjs` (critique) and adds the
  handbook's completeness and repetition measures. A scenario reduced to one phase (`phaseView`) is
  what the existing scorers see for probe 2.
- **FR-9 Run file and task set.** `MiniRun` (`src/shared/schemas/bench.ts`) holds the model (with
  its model-card sampling), coarse hardware, prompt and corpus hashes, `taskSetHash`, the stream
  limits, both runs (each probe with its criteria, failure and raw tail), and the result with
  ranges. `pnpm bench:export -- --suite mini` writes the task set. Changing a probe, criterion or
  band bumps `suiteVersion` (now 1, the first published version).
- **FR-10 Running.** `pnpm bench:mini -- --models <a,b,c>` or `pnpm bench -- --suite mini --models …`.
  A list of models runs one after the other. For an LM Studio model the runner loads it at the
  suite's context length, runs the Mini and unloads it; `--no-load` leaves loading to the user,
  `--stop-server` runs `lms server stop` at the end. A model that cannot run is reported and the
  list continues. Local endpoints only, as for the full benchmark. The old `--cap` switch is gone.
- **FR-11 Replay without a model.** `pnpm bench:mini:replay <mini-run-dir>` scores the saved Mini
  runs again from their work folders with the current scoring. It names every call it cannot
  recompute and never fills one in.
- **FR-12 Publishing.** The public repository and the website page carry the Mini next to the full
  benchmark: task set, methods (the criteria, the bands, the formulas, the stall limits), how to
  run and submit. Plain copy.

## Methods

### Stalls and loops

The adapters stream the reply (`stream: true`). When a provider's options carry `streamGuard`
(only the Mini sets it; the app's own calls keep their normal timeouts), a guard
(`src/main/providers/stream-guard.ts`) watches the output tokens, answer and reasoning alike:

- **Stall**: no new token for **60 seconds** once the reply has started, or for **600 seconds**
  before the first token (the time the prompt is read; 30K tokens on a slow machine can take
  minutes).
- **Loop**: the end of the reply is one unit repeated for at least **400 characters** and at least
  **5 times** (a blank run is not a loop). Checked every 200 characters on the last 6,000.

The limits are in the suite file (`stream`). While the guard is on, the request timeout and the
idle timeout are raised above them, so the app's 5-minute adapter default cannot cut a Mini call
short; the default for users is unchanged. A tripped guard fails the call with the kind and the
last 400 characters of what the model wrote; the Mini records both. A reply that is only slow is
never failed.

### Criteria

Each criterion is a fixed statement about the reply, earning credit 0 to 1. Thresholds (the full-credit
points) are in the suite file (`quality`); the zero points are in "Partial credit".

| Probe                           | Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Long prompt (12)                | rows in the phase (full credit at 15); rows per hour within 0.8 to 1.25 of the Scenario 3 reference band (5 to 6); purpose-tag groups of the reference present (the decision point excepted: it belongs to one middle phase); opens with its time jump and, as the last phase, ends with the ENDEX (yes/no); every role receives an inject (yes/no); the brief ids are used (yes/no); no text copied from the reference (yes/no); citations resolved (full credit at 90%); rows citing a source (full credit at 80%); claims supported by the source (full credit at 70%, only when the source check found claim-bearing rows); no lint errors (yes/no); lint penalty per 10 rows (full credit at 5 or less) |
| Handbook (3)                    | handbook sections present (full credit at 5); words (full credit at 1,000; the shipped city-water handbooks run 1,500 to 1,650); repeated 6-word phrases (full credit at 25% or less)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Review (one per planted defect) | the defect is found: a note names it, or the revised MSEL no longer has it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Partial credit (#612)

Quality used to be the share of 22 pass/fail checks, so one check was 4.5 points and could decide a
band. A criterion on a continuous measure now earns credit **linearly between a zero point and a
full-credit point**; a value beyond either end earns 0 or 1. Every criterion still counts once
(weight 1), so the criteria and the 22-criterion total are unchanged. The full-credit points are
the thresholds in the suite file, so the task-set hash does not move; the zero points are scoring
rules, listed here.

| Criterion            | Measure                                            | Zero credit at                                                   | Full credit at      |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------- |
| rows in the phase    | rows                                               | 0 rows                                                           | 15 rows             |
| rows per hour        | content rows per hour of the phase                 | 2 (half the band's low edge, 4) or 15 (twice its high edge, 7.5) | 4 to 7.5 (the band) |
| purpose-tag mix      | reference tag groups present, of 5                 | 0 groups                                                         | 5 groups            |
| citations resolved   | percent of citations that resolved                 | 50%                                                              | 90%                 |
| rows citing a source | percent of content rows with a citation            | 0%                                                               | 80%                 |
| claims supported     | percent of claim-bearing rows the check supports   | 0%                                                               | 70%                 |
| lint penalty         | penalty per 10 rows (error 5, warning 2, info 0.5) | 20                                                               | 5 or less           |
| handbook sections    | sections present                                   | 0                                                                | 5                   |
| handbook length      | words                                              | 0                                                                | 1,000               |
| handbook repetition  | share of repeated 6-word phrases                   | 50%                                                              | 25% or less         |

Example: 12 rows earns 0.8 on the row count; a lint penalty of 7.5 per 10 rows earns (20 - 7.5) /
(20 - 5) = 0.83; 75% of rows citing a source earns 75 / 80 = 0.94.

**Kept as yes/no:** opens with its time jump and ends the exercise; every role receives an inject;
the brief ids are used; no text copied from the reference; no lint errors (any error blocks
use); each planted defect found (a defect is found or it is not). A criterion is **met** only at
full credit; the run file keeps both `met` and `credit`.

Partial credit raises most models' quality by several points against the pass/fail scoring (a
near miss now counts), while the band thresholds (quality 80 and 60) are unchanged and still the
requirements. The run files carry `scoringVersion` 2 (the Mini's own stamp, `MINI_SCORING_VERSION`
in `score.mjs`); the task set stays `mini` v1 with the same hash. Run files saved under scoring
version 1 are scored again with `pnpm bench:mini:rescore` (below), no model call.

The format probe adds no quality criteria; it counts in completion. Review damage is not a
criterion; it is shown next to the score and is part of the Recommended band.

### Completion and the score

Per run, quality is the credit earned over all criteria. Over both runs, the per-call rate is pooled
over every call, completion is `rate ^ 14`, quality is the mean of the runs, and the score is
quality times completion. The range of each figure is the minimum and maximum over the two runs
(the score's range is the runs' own scores, widened to include the reported score).

**Failure evidence (#614).** Every completion figure is shown with the observed count behind it:
"Completion 22.9% (1 failure in 10 calls)" in the summary line, in the band reason and in the
replay table. One failed call in ten is a per-call rate of 90%, and 0.9 raised to 14 is 22.9%, so a
single failure drops a model that would otherwise be at 100% well below the Usable band. The
definition is kept (completion is the chance a whole scenario drafts with no failed stage), and the
Mini makes **no extra calls** for a model with one failure: the count is shown so a reader can see
that the band rests on one call, and the full benchmark is the check for a rare failure.

Completion falls fast by design: it is the chance a whole scenario succeeds. 98% of calls
succeeding gives 75%, and one failure in eight Mini calls gives 15%. **Detection power.** The
Mini makes 8 calls (10 with the held-out review), so it detects frequent failures, not rare ones:
a model that fails 1 call in 20 shows no failure in ten calls more than half the time (0.95^10 =
60%), and its completion then reads 100%. "0 failures in 10 calls" is not "never fails". The
full benchmark is the check for rare failures.

### Token budget

The pipeline (`PIPELINE_STAGES` in `src/main/generate/engine.ts`) makes one model call per stage and
one `msel_phase` call per phase: scenario_overview, objectives_roles, phase_plan, msel_phase (x4),
controller_handbook, rubric, eeg, player_briefing, hotwash, sitman, critique. That is **14 calls**
for four phases; the count is the exponent in completion. (The issue estimated about 15; the
pipeline gives 14, and a critique that revises adds calls the Mini does not count.)

Each bundled example scenario keeps the input and output token counts of every call that drafted
it. The budget of a stage is the mean over the bundled scenarios that ran it (a phase call is the
mean per call times four). `scripts/bench/mini/budget.mjs` computes it from the repository and a
test checks the numbers in the suite file: **237,242 input tokens and 37,839 output tokens** for a
scenario. Injects and media are not part of the scenario pipeline and are not counted. The
recorded output counts are those of the models that drafted the examples; a model that thinks at
length writes more, so its measured rate applies to a budget that can be low for it.

### Draft time

Per run, a least-squares fit over the calls' own timings, `seconds = input / P + output / G`,
gives the prompt-processing rate P and the generation rate G (the calls differ in how much they
read and write, so the two separate). If the fit is not usable (fewer than three calls, or a
negative rate), one pooled rate over all tokens is used and the run file says so (`method`).
Draft time is `budget.input / P + budget.output / G`, in minutes, with its range over the runs.

### Tokens per second (#610)

The fit and the pooled rate estimate draft time only; they are not the figures shown as speeds.
A call's time covers reading its prompt and writing its answer and the split is not recorded, so
each shown rate is a lower bound the calls prove (`rateBounds`): **output tokens/s** is answer
tokens over the time of the calls that wrote one (prompt reading counted as writing time), and
**prompt tokens/s** is the fastest read among the calls (prompt tokens over that call's whole
time). The two are never one figure. The summary says "at least". `pnpm bench:mini:rescore <dir>`
(`scripts/bench/mini/rescore.mjs`) recomputes them, the draft time, the partial-credit quality
(from the raw measures each probe saved; the long-prompt pace and tag mix of older runs are read
again from the saved work folder, and keep their yes/no result when it is missing), the score and
the verdict from saved run files, with no model call. Completion, failure counts and review damage
are not touched.

## Replay of the saved Mini runs

`pnpm bench:mini:replay ~/Code/as-triage/.tmp/mini` scores the ten saved Mini runs of 2026-11-03
again with the current scoring, with no model call. The saved work folders hold what each call left behind
(its provenance, rows, handbook, and for the review the planted-defect snapshot and the revised
MSEL).

What it cannot recompute, and how the table marks it:

- **A call cut by the old 180 s cap** has no saved reply. It is left out of quality and of the
  completion count, and the row says "(partial)" and names the probe.
- **The second run**: one sample was saved, so every range is a single value.
- **The harder long-prompt probe**: the saved call was the unstretched one-hour phase (about
  eight rows). The rows-in-phase criterion is dropped, and the tag-mix and role criteria are
  judged on a short phase, so quality is not comparable with a live run.
- **Cut-off retries** were not recorded, so only repair rounds appear in the repair rate.
- **Source support** is judged only where the saved run holds source-check results for the rows.

| Model                  | Quality | Completion (failures in calls) | Repair rate | Mini score | Damage | Draft time | Band now                      | Saved verdict (earlier) | Not recomputed                     |
| ---------------------- | ------- | ------------------------------ | ----------- | ---------- | ------ | ---------- | ----------------------------- | ----------------------- | ---------------------------------- |
| gemma-4-31b            | 63.6    | 100% (0 in 4)                  | 0%          | 63.6       | 0%     | 67.3 min   | Usable with editing (partial) | Won't work 53.6         | longContext                        |
| nemotron-3.5-lightning | 81.8    | 100% (0 in 5)                  | 0%          | 81.8       | 4.5%   | 6.7 min    | Recommended                   | Will work 85.3          | none                               |
| gpt-oss-20b            | 81.8    | 100% (0 in 5)                  | 60%         | 81.8       | 1.1%   | 7.7 min    | Recommended                   | Risky 86.3              | none                               |
| qwen3-30b-a3b-2507     | 90.9    | 100% (0 in 5)                  | 0%          | 90.9       | 24%    | 9.7 min    | Usable with editing           | Risky 87.9              | none                               |
| qwen3.5-4b             | 72.7    | 100% (0 in 5)                  | 0%          | 72.7       | 0%     | 3.3 min    | Usable with editing           | Will work 83.1          | none                               |
| qwen3.5-9b             | 77.3    | 100% (0 in 5)                  | 0%          | 77.3       | 2.1%   | 8.1 min    | Usable with editing           | Will work 77.5          | none                               |
| qwen3.6-27b            | 90.9    | 100% (0 in 5)                  | 0%          | 90.9       | 8.1%   | 22.7 min   | Usable with editing           | Risky 93.2              | none                               |
| qwen3.6-35b-a3b-mlx    | 95.5    | 100% (0 in 5)                  | 0%          | 95.5       | 19.8%  | 7.1 min    | Usable with editing           | Risky 92                | none                               |
| qwen3.8-27b-mlx        | 94.7    | 100% (0 in 4)                  | 0%          | 94.7       | 0%     | 24.8 min   | Recommended (partial)         | Risky 77.5              | review                             |
| glm-4.7-flash          | 100     | 100% (0 in 2)                  | 0%          | 100        | n/a    | 11.3 min   | Recommended (partial)         | Won't work 28.4         | longContext, review, heldOutReview |

Reading the table:

- No saved call failed after the repair policy, so every model completes at 100% on these
  samples. The repair rate is the new signal: gpt-oss-20b needed a repair round in three of five
  calls (60%), which the earlier scoring counted as a failure and now shows as a repair rate. Its band is
  Recommended on quality 81.8 and damage 1.1%; the repair cost is in its draft time.
- Models that rewrote correct rows (qwen3-30b 24%, qwen3.6-35b 19.8%) are Usable with editing,
  not Recommended, because damage is a condition of the Recommended band.
- Calls cut by the old cap were left out, so those rows are "(partial)". glm-4.7-flash's 100 rests
  on the handbook alone and says nothing about the model.
- Draft time is the measured rates applied to the token budget; gemma-4-31b's 67 minutes comes
  from the slow generation rate measured in its saved run. It is reported, not scored.

## Live timing

A live Mini now makes eight calls (ten with the held-out review) with no cap, so a slow model
takes as long as it takes: gemma-4-26b-a4b (MLX, 128 GB Apple Silicon) took 126 seconds of model
time for one run of five calls in the earlier Mini; two runs of the stretched phase will take about
twice that and a little more. No live run was made for #606; the owner decides on reruns.

## Out of scope

Ideation, injects and media, more than two runs and ranking for publication. A Mini result is
`community` evidence of a screening, never `verified`.

## Open questions

1. The source-support criterion needs the app's source check to find claim-bearing rows in the
   stretched phase; when it finds none the criterion is left out.
2. With about 10 calls the Mini cannot see a failure rate under about 10%. If screening needs to
   catch rarer failures, more runs are the only fix.
