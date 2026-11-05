# ADR-0142: AI incident data is simulated, seeded and labeled

Date: 2026-11-05 · Status: Accepted · Issues: #766, #781 · Spec: [0467](../specs/0467-ai-incidents.md) · Related: ADR-0075 (figures), ADR-0076 (case data), ADR-0082 (epidemiology simulation)

## Context

No public dataset can replay a deepfake fraud or a model incident, and real synthetic media of real people must not be reused. The exercise still needs a harmful-output rate that drifts, a moderation queue that backs up, detector scores that are sometimes wrong and a payment timeline, and its metrics need ground truth to score decisions against.

## Decision

- **Small parametric functions** in `src/main/toolkits/ai/simulate.ts`, with one seeded random source (the media simulators' mulberry32): an evaluation series that is flat and then ramps after a changepoint, queue volumes with a surge and a fixed review rate, detector scores for two classes drawn from overlapping normal distributions, and a payment timeline of request, approval, release and settlement followed by discovery, hold and recall. The same parameters give the same data on every machine.
- **Errors exist by design.** The detector classes overlap, so a threshold always yields false positives and false negatives, and the figure states both counts and the score in words with its uncertainty.
- **Labeled simulated.** Every figure summary and caption says simulated and fictional. Case datasets written by the generators carry the framework's simulated provenance (ADR-0076).
- **Figures take plain data** (`src/main/render/figures/ai/`). Four of five kinds draw through generic kinds (time series, annotated timeline, table), so axes, markers and data tables behave the same; the detector distribution is drawn directly. The SVG description always equals the text summary.
- **Metrics read events and decisions**, not figure data, so a figure cannot change a score.

## Consequences

- The models are not calibrated to any real system and say so.
- A new figure for this field is a data shape and a draw function, not a new simulator.
