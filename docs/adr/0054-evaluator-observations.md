# ADR-0054: Evaluator observations go to the evaluation record, one per task, revised in place

Date: 2026-10-29 · Status: Accepted · Issue: #416 · Spec: [0416](../specs/0416-evaluator-observations.md) · Related: ADR-0027 (protocol), ADR-0042 (inject delivery)

## Context

Evaluators rate the exercise's critical tasks on their own device, often offline. The ratings must reach the AAR once, without double counting, and the plan's citations and expected actions must never reach a player.

## Decision

- **The assignment is per device and staff-only.** The controller sends `eval.assign` to `client:<id>` under the staff key, only to a device seated as evaluator that proved the staff key. It carries every critical task (the device filters by its watch list), so "All tasks" needs no second round trip. It is re-sent when the guides, the watch list or the expected-actions switch change; its revision rises only when the content does. Tasks are capped at 120 and 40 KiB, expected actions dropped first.
- **One observation per task, revised in place.** The device keeps an `observationId` per task and raises `revision` on every save. The controller keeps the highest revision per sender and observation, logs every revision, and upserts the latest into `evaluation.json` as `source: 'live'`, id `live-<clientRef>-<observationId>` so no evaluator can overwrite another's.
- **`evaluation.json` is what the AAR reads.** When it holds live observations, the AAR record skips `eval.observation` log entries, so nothing is counted twice. The log keeps the history.
- **Per-row expected actions use the task id `<rowId>_expected`** on the wire (ids cannot hold a colon) and are stored with `criterionId: '<rowId>:expected'`.
- **`Observation` gains `kind` and `capability`** for general notes; a note's rating is `not_observed` unless chosen, and coverage counts task observations only.
- **Offline** uses the existing outbox: every revision is a frame with a strictly increasing creation time, sent in order after catch-up.

## Consequences

- A rating edited offline sends each revision on reconnect; the controller applies them in order.
- The device keeps its observations in IndexedDB so a reload loses nothing; a visit after the session ended discards them.
- Evaluator labels restart each session ("Evaluator 1" joins first); renaming is not offered.
