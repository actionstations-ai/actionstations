# ADR-0168: Earth science decisions, timing measures and capability notes

Date: 2026-11-05 · Status: Accepted · Issues: #677 · Spec: [0450](../specs/0450-earth-sciences.md) · Related: ADR-0092

## Context

Spec 0450 FR-12 to FR-14 ask for structured decisions, timing metrics and Core Capability critical tasks. The first two were delivered with the toolkits; a check against the spec found the third missing.

## Decision

- FR-12 lives in the `decisionForms` of `seismic`, `tsunami`, `volcanic` and `debris_flow`. FR-13 lives in their `metrics` (threshold timing against shaking, first wave, lahar travel and rainfall; decision timing against eruption onset and observed waves) over the simulated generators' ground truth.
- FR-14 is added as `capabilities` notes on each toolkit: critical tasks for the seven Core Capabilities the spec names, phrased per hazard. A test keeps the forms, the metrics and the notes tied to the spec.

## Consequences

An evaluator sees hazard-specific critical tasks next to the Core Capability for any scenario that uses these toolkits.
