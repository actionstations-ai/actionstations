# ADR-0074: The Mini gives partial credit on continuous criteria

Builds on ADR-0072. Issues #612, #613, #614.

## Context

Mini quality was the share of 22 pass/fail checks, so one check was 4.5 points. Two models missed
the Recommended band (quality 80) by a single check, and a lint penalty of 5.1 per 10 rows scored
the same as 40. Most of those checks measure something continuous: lint findings, citation
coverage and support, pace, tag mix, handbook length.

## Decision

- **A criterion on a continuous measure earns credit linearly between a zero point and a
  full-credit point** (0 to 1, beyond either end 0 or 1). Each criterion still weighs 1, so the
  count of criteria is unchanged. True yes/no items stay binary: opens and ends the exercise,
  roles covered, brief ids used, no copied reference text, no lint errors, each planted defect
  found.
- **Full-credit points are the existing thresholds in `bench/suites/mini.json`**, so the task-set
  hash and `suiteVersion` (1) do not change. **Zero points are scoring rules**, kept in
  `CREDIT_RULES` (`scripts/bench/mini/score.mjs`) and listed in spec 0445, "Partial credit":

  | Criterion                 | Zero credit at                                         | Full credit at      |
  | ------------------------- | ------------------------------------------------------ | ------------------- |
  | rows in the phase         | 0 rows                                                 | 15 rows             |
  | rows per hour             | half the band's low edge (2), twice its high edge (15) | the band (4 to 7.5) |
  | purpose-tag mix           | 0 of 5 groups                                          | 5 of 5              |
  | citations resolved        | 50%                                                    | 90%                 |
  | rows citing a source      | 0%                                                     | 80%                 |
  | claims supported          | 0%                                                     | 70%                 |
  | lint penalty per 10 rows  | 20                                                     | 5 or less           |
  | handbook sections         | 0                                                      | 5                   |
  | handbook words            | 0                                                      | 1,000               |
  | handbook repeated phrases | 50%                                                    | 25% or less         |

  The lint zero point (20) is the cap the lint scorer already used. The citation-resolved zero
  point is 50% because a reply that loses half its citations has not resolved them; coverage and
  support start at 0 because there is no floor below none.

- **The Mini has its own scoring version** (`MINI_SCORING_VERSION` = 2). The shared
  `SCORING_VERSION` belongs to the full benchmark and moving it would archive that benchmark's
  runs. Saved Mini runs are scored again offline (`pnpm bench:mini:rescore`) and re-stamped.
- **The band thresholds do not change.** Partial credit raises most quality figures by several
  points because near misses now count; the thresholds are requirements, not a calibration.
- **An uncertain band is shown, not settled with more calls (#613).** When the two-run range
  reaches into another band, the verdict marks the band uncertain and lists every band the range
  reaches. No automatic third run.
- **The failure count sits beside every completion figure (#614).** "1 failure in 10 calls" is
  printed with the completion and in the band reason. The definition (per-call rate raised to the
  14 calls of a scenario) is unchanged and no extra calls are made for a model with one failure.

## Consequences

- One lint finding or one missing citation moves quality by a fraction of a point. A band is no
  longer decided by a single check.
- Quality is not comparable across scoring versions; reports must not mix Mini runs of scoring
  version 1 and 2 without re-scoring.
- A model with one failure in ten calls still lands at about 23% completion; the evidence shows
  why, and the band is not softened.
- The site methods page and the public task-set repository describe the criteria and need the
  mapping table; the task set itself is unchanged.
