# ADR-0077: Field metrics are app code with schema-validated config and self-describing results

Date: 2026-11-04 · Status: Accepted · Issue: #653 · Spec: [0448](../specs/0448-toolkits.md) · Related: ADR-0016 (forward-compatible files)

## Context

Toolkits need to score exercises against ground truth: decision timing against events, actions against threshold crossings, consistency of partners' messages. The numbers end up in the Evaluation tab and the AAR, where a reader must be able to see what they rest on. Pack-supplied code is out of scope, and case data (#651) and structured decision frames (#654) are built in parallel.

## Decision

- **A metric is `{ id, configSchema, compute(inputs, config) }`** in `src/main/evaluation/metrics/<id>.ts`, pure and synchronous. A toolkit names a metric by id and supplies config, which the registry validates with zod; packs cannot add metrics.
- **A result carries its inputs, tables and caveats** (`MetricResult`, `src/shared/schemas/metrics.ts`), plus a `data` object for code. Numbers that cannot be computed are `null`/"n/a", never zero.
- **Inputs are small plain types** (`GroundTruthEvent`, `MetricDecision`, `ModeledSeries`) read by adapters (`inputs.ts`): ground truth from a JSON dataset inside the scenario's case folder, decisions from session log entries carrying `data.structured`. Neither adapter imports the case-data or decision-frame code; a change in those shapes is a change in one adapter.
- **Decision timing follows the NWS contingency definitions** (POD, FAR, CSI) with decisions as warnings. Lead time is over hits only, and the result says so, because an unverified warning has no event to lead.
- **Message consistency is deterministic.** The evaluator enters the values; a model may only suggest them, through the text provider the project resolves (so the cloud gate and approval apply), and a suggestion counts only after confirmation.
- **Results live in `evaluation.json`** (`metricResults`, optional, replaced per metric and session), the file the AAR already reads. The AAR renderer adds a "Field Metrics" section when results exist; the Evaluation tab shows the same data.

## Consequences

- Adding a metric is one file, a registry entry and a test; its output renders everywhere without UI work.
- Results are snapshots: they do not recompute when case data or decisions change until a metric is run again.
- Exact string comparison under-counts agreement between differently worded messages; the evaluator resolves that by entering the same value.
