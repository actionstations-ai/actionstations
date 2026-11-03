# ADR-0072: The Mini scores Quality x Completion against stated requirements, with no time cap

## Context

The first Mini (ADR-0071) cancelled any call over 180 seconds and gave a verdict from thresholds
chosen by looking at full-benchmark runs. Running it on ten models showed three problems. A
fixed cap judged a slow model as a failed one: a call that would have finished in four minutes was
recorded as a failure. The thresholds and the Spearman check tied the Mini to the full benchmark,
so it was not an independent measure. The long-prompt probe wrote a one-hour phase of about six
rows, which every model passed, so it told models apart little.

## Decision

- **Score = Quality x Completion.** Completion is the chance a full scenario drafts with no failed
  stage: the per-call success rate over every Mini call (a call fails only if it fails after the
  app's normal repair policy, or stalls or loops) raised to the number of model calls in a scenario (14, counted from the
  pipeline). Quality is the share of fixed pass/fail criteria the delivered replies meet,
  measured against the Scenario 3 reference and the planted defects. A call that returns nothing
  costs completion, not quality, so a failure is counted once.
- **Review damage and draft time are reported, not scored.** Draft time is the model's measured
  prompt and generation rates (a least-squares fit over its own calls) applied to the measured
  token budget of a scenario, taken from the pipeline stages and the bundled examples' recorded
  token counts.
- **Bands are requirements, written in the methods** (`bands` in the suite file): Recommended at
  completion >= 90%, quality >= 80, damage <= 5%; Usable with editing at completion >= 75% and
  quality >= 60. They are not calibrated against another benchmark. A slow draft time is never a
  failure.
- **Nothing in the Mini reads full-benchmark results.** Agreement with the full benchmark may be
  reported in the methods as a cross-check only.
- **No per-call time cap.** A call ends only on a stall (no output token for 60 s after the first
  token, or 600 s before it) or a detected loop, both observed on the streamed reply by a guard in
  the provider adapters that is switched on by a provider option only the Mini sets. The app's
  own timeouts keep their defaults. A failed call records its kind and the raw tail of the reply.
- **Each probe runs twice** (seeds 11 and 12), every figure carries its range, and overlapping
  ranges are a tie. The long-prompt probe writes a stretched 180-minute phase: 18 rows requested,
  21 allowed.
- **Replay** scores the saved Mini runs again from their work folders and names every call it
  cannot recompute.

## Consequences

- A repair round is the app's automatic retry and invisible to users, so it is not a failure. It
  is reported as a separate repair rate (its cost is already in the measured draft time).
- With about 10 calls the Mini detects frequent failures, not rare ones; "0 failures in 10 calls"
  is shown with the count and the methods say so.
- A live Mini takes longer: two runs, and no cap. A slow model finishes and is reported slow.
- Changing a criterion, band, limit or the exponent changes the task-set hash and needs a new
  suite version (now 2). Version 1 run files do not parse as version 2 and are replayed, not
  migrated.
- The stream guard is a small addition to two adapters (OpenAI-compatible and Ollama); other
  adapters do not have it, and the Mini runs only against local endpoints of those two kinds.
