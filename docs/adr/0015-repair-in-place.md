# ADR-0015: Repair a finished scenario in place

Date: 2026-10-22 · Status: Accepted · Issue: #185

## Context

Generator fixes (#182, #183, #184) only reach scenarios generated after them. A finished
scenario — the bundled examples, or a user's edited exercise — would have to be regenerated
from scratch to get them, which throws away rows, injects and media that are already good and
costs an hour of local model time. The pipeline's repairs are written for a scenario being
built (re-run a stage, mark downstream stale), not for one that is done.

## Decision

A `generate:repair` IPC starts a `repair-scenario` job (src/main/generate/repair.ts) that owns
the scenario like the inject jobs. It reuses the pipeline's own pieces instead of new logic:
`repairStructure` and `overfillRows` (density cap, rubric-linked rows protected), the mix call,
`reviseFromCritique` / `reviseStructureAgain` on the structural and facility issues only
(repair-msel.ts, using helpers exported from engine.ts), the inject checks (`recheckInject`),
`runInjectsJob` with `rowIds`, and `runMediaJob` with `injectIds`. A row counts as changed when
its source, event, expected action or format changed; only those rows get new injects. The
role cap is not applied to a finished scenario. The repair takes one scenario history snapshot.

## Consequences

Fixes reach existing scenarios at the cost of a few model calls. Untouched rows, inject files
and media stay byte-identical, so a reviewer can diff what the repair did. engine.ts exports
more of its step helpers; they are shared, so a change to the pipeline's repairs changes the
repair job too (intended). The job is not resumable: an interrupted repair is re-run, and
because every step reads what is saved, a second run only does what the first left.
