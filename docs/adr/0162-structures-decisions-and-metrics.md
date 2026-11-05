# ADR-0162: Structures decisions, inspection program and metrics

Date: 2026-11-05 · Status: Accepted · Issue: #853, #855, #856 (epic #704, spec 0471)

## Context

The structures exercises are scored on timing against events only the simulation knows (a failure onset, a collapse, the correct placard of each building) and on decisions players make with forms. The generic metrics read zone series and decision kinds; none compares a placard with a ground truth or measures a notice against a regulatory clock.

## Decision

- Eleven decision forms live in the toolkit's `decisionForms`, all with ids prefixed `structures_` because the id is the decision kind that metrics and other toolkits read. A choice's option id is the slug of its label, so the placard form yields `inspected`, `restricted_use` and `unsafe`, and the notify form yields `osha`, `owner`, `insurer` and `building_official`. Evacuation, exclusion zone and team assignment have drawable area fields.
- Four metrics are written, each in its own file in `src/main/evaluation/metrics/` with the field in the name: `structures_warning_to_action`, `structures_reporting_timeliness`, `structures_rescue_timeline` and `structures_placard_agreement`. They register through `registerStructuresToolkit()`, called from `src/main/index.ts`. Stop work against the action level also uses the generic `threshold_timing` on the monitoring series, and the status of the structure uses `message_consistency`.
- Designers set targets that a regulation does not: owner and insurer notice hours, the time within which a secondary hazard must be controlled, and the shift length. The OSHA clocks come from the event (8 hours for a fatality, 24 for the others). Every metric lists its inputs and caveats and prints `n/a` for what it cannot compute.
- Placard agreement is read against the simulated damage state and reports under- and over-restriction separately, with a confusion table, because two qualified evaluators can differ on a borderline building. A building placarded twice is scored on its last placard and counted as a conflict.
- The inspection program (`program.ts`, generator `structures-inspection-program`) writes the building list and truth, a record of observed conditions for each building that fits its true placard, a limited evaluator roster with qualifications, owner and public requests, and a trap list. The facilitator switches traps on in the parameters; none is on by default. The structure follows the public guidance for post-disaster building safety evaluation, and the records are an exercise's own, not any program's forms. The ethics case is scored by a facilitator rubric (information gathered, escalation chain, documentation) and has no metric or right answer.

## Consequences

A scenario that uses the toolkit gets timing, reporting, rescue and inspection results from the same ground truth the figures draw. The metrics are tied to the form ids, so a change to a form id changes a metric's contract. FEMA P-2055 content is to be checked against the document when the library pack is built.
