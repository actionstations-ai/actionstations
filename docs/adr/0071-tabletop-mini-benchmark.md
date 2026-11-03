# ADR-0071: The Tabletop Mini Benchmark screens models with four fixed calls and reuses the full scorers

## Context

The Tabletop Benchmark takes hours per model, too long to screen the many local models people
want to try. The 2026-11-03 runs showed that a few calls separate usable models from unusable
ones: a valid first structured answer, a long prompt, a long output, and the review step.

## Decision

- A separate suite file (`bench/suites/mini.json`, `kind: "mini"`) with its own task set and hash.
  Each probe re-runs one pipeline stage of a bundled example's hand-corrected scenario through the
  app's own `generate:rerun-stage`, so upstream inputs are identical for every model and no
  pipeline code is duplicated.
- No new scorers for existing measures: probes compose the lint, citation, structure and critique
  scorers; only the handbook's completeness and repetition are new (`scripts/bench/mini/score.mjs`).
- Per-call wall-clock cap (180 s); a cancelled call is a recorded failure.
- A verdict (will work, risky, won't work) with reasons, from thresholds in the suite file. The
  held-out review probe lives in `mini-held-out.json` and is added by the maintainers only.
- The runner takes a list of models and loads and unloads each LM Studio model itself.
- Validation is a replay of saved full runs, with no model call (`pnpm bench:mini:replay`).

## Consequences

- A Mini takes minutes and can be run on every model; its result is a screening, labelled as such
  next to the full benchmark and never ranked with it.
- A failure that depends on a model's own upstream output may not appear on the fixed inputs.
- Changing a probe, input or threshold changes the task-set hash and needs a new suite version.
