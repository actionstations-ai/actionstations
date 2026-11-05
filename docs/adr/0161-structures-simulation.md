# ADR-0161: Structures simulation and figures

Date: 2026-11-05 · Status: Accepted · Issue: #846, #851 (epic #704, spec 0471)

## Context

Scoring a stop-work decision needs to know when a structure began to fail and when each alarm level was first crossed. Scoring placards needs the correct placard for each building. No public source gives either as a feed, so scenarios simulate them. The exercises are not engineering analyses, and a plausible draw that follows intensity and construction type is enough.

## Decision

- `src/main/toolkits/structures/monitoring-sim.ts` makes a sensor series from a baseline, drift, noise, a failure with a linear, accelerating or step shape, and dropouts. The failure onset and each level crossing are written as ground-truth events; a dropout hides the reading from players but not from the truth.
- `damage-sim.ts` draws fictional buildings of five types and gives each a damage state from a logistic fragility relation of shaking intensity and type. The medians are invented exercise values, stated as such in the file; the relation only has to rise with intensity and be higher for weaker construction. Shaking comes from a peak and a fall with distance, from the earth science simulator's intensity relation (`intensityAt`), or from a ShakeMap grid the earthquake connector fetched, so a post-earthquake exercise reuses the seismic toolkit's shaking instead of redoing it.
- Both generators use a seeded generator (`rng.ts`), register through `generator-modules.ts`, and write metric datasets as GeoJSON collections with no features and the rows under `events` or `series`. Dataset labels say simulated; the framework writes the provenance.
- Four figure kinds live in `src/main/render/figures/structures/` with ids prefixed `structures_`. The monitoring figure draws through the generic time series. The status board and the map write placards as words with a shape each, and an `asOf` time shows a building as not yet evaluated until its placard was posted. A separate template, `structures_figure`, carries them, so the shared figure template is untouched. `overlay.ts` makes the same buildings a map overlay layer with posting times for the time slider.
- The site plan refuses a muster point inside an exclusion zone and a feature whose anchor is outside the site; a swing radius may reach past the fence.

## Consequences

Scenarios repeat from their seed and metrics have exact ground truth. The damage shares are plausible, not predictive, and must not be quoted as real. Replacing the invented medians with published fragility curves later changes `FRAGILITY` only.
