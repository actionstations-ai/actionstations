# ADR-0147: Space weather timing is scored from zone series the generator writes, and dissemination from the decision log

Date: 2026-11-05 · Status: Accepted · Issues: #916, #917 · Spec: [0468](../specs/0468-space-weather.md) · Related: ADR-0146

## Context

The three clocks that matter in a storm are the operating procedure's Kp condition, the end of timing holdover and a proton flux threshold. A fourth question has no clock of its own: whether every entity in the operating plan was told.

## Decision

- **Reuse threshold timing for the clocks.** The generator writes one zone series per clock, each crossing zero when the clock runs out (Kp above the procedure condition, hours of GNSS loss beyond a site's holdover, pfu above the threshold), so the existing metric scores them with a threshold of 0 and no clearance time. A decision with no area applies to every zone; a time source switch names its site, which is an area field whose choices are the series' zones.
- **One new metric, `space_dissemination`.** It takes the entities from the designer (the plan is the project's), reads `space_disseminate` decisions and reports who was told, when, and the minutes after the first SWPC message against an optional target. It states that the log is exercise evidence and not compliance evidence.
- **Decision kinds are prefixed `space_`** so they cannot collide with another field's kinds in a metric.

## Consequences

- The procedure metric measures against a Kp series with three-hour steps, so the crossing is interpolated between interval starts and is a minute-level estimate.
- Designers must list the entities in the dissemination metric's configuration for it to score anything.
