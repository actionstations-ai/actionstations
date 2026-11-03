# Judge calibration rows

`rows.json` holds 60 cited MSEL rows, each with the plan passage it cites and a plausibility
score from 1 to 5 on the scale in `bench/prompts/bench_judge.md`. The optional judge
(`--judge`, spec 0434 FR-17) is marked publishable only when its linearly weighted kappa
against these scores is 0.6 or more (`scripts/bench/judge.mjs`).

How the set was made (#503, 2026-11-02):

- **Sample.** 15 rows each from the standard-suite drafts of `qwen/qwen3.5-4b`,
  `qwen/qwen3.5-9b` and `openai/gpt-oss-120b`, and 15 from the bundled examples, shuffled with
  the source hidden. Exact duplicates were replaced.
- **Scores.** A hosted reference model proposed a score and a one-line reason for every row; the maintainer
  reviewed the set and accepted all 60 without changes (2 confirmed row by row, 58 accepted as a
  set). So the reference is a model's scoring reviewed by a person, not independent human scoring.
- **Spread.** 1: 9 rows, 2: 20, 3: 12, 4: 14, 5: 5.

Replace or extend the set by editing `rows.json` (fields `row`, `passage`, `score`); keep at least
60 rows and keep the text exactly as drafted, since the judge's quotes are checked against it.
