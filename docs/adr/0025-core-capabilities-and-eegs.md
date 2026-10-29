# ADR-0025: Core Capabilities and Exercise Evaluation Guides from the plans

Date: 2026-10-28 · Status: Accepted · Issue: #421 · Spec: [0421](../specs/0421-eeg-core-capabilities.md)

## Context

HSEEP evaluates capabilities, not people. The rubric (four metrics, Fail / Pass / Excellence) grades a team's behaviour; it does not say which FEMA Core Capability an objective exercises, and it does not quote the organization's own procedures. Grant and accreditation paperwork, the AAR/IP (#419) and the live evaluator form (#416) all need the HSEEP vocabulary: objectives → Core Capabilities → Exercise Evaluation Guides (EEGs) whose critical tasks come from the plans, rated met / partial / not met / not observed.

## Decision

- The 32 Core Capabilities of the National Preparedness Goal (2nd edition) ship as static data in `src/shared/core-capabilities.ts` (id, name, mission areas, the Goal's one-sentence definition). They are never edited per project. A domain profile may hint which ones it most often exercises (`coreCapabilities`); the prompt shows those first.
- A new pipeline stage `eeg` runs after `rubric` and before `player_briefing`. It maps each objective to one to three capabilities and writes one EEG per capability with three to eight critical tasks. Every task must cite one retrieved plan section: a task whose citation key does not resolve is dropped and recorded as `CITATION_DROPPED` (under the `eeg` row), and the stage refuses to run against an empty retrieval instead of relaxing the requirement. An EEG without plan citations is the generic one every checklist already has.
- Per-row criteria are derived by code (`src/main/generate/eeg-criteria.ts`, served by `evaluation:criteria`), never stored and never asked of the model: a row's linked tasks, else its expected action. The Facilitate screen, the live evaluator form and the exports share that one implementation.
- Observations use HSEEP's four ratings and are non-attributional: the schema has no field for a player's name; `evaluator` is an optional free label. Observations recorded outside live play go to `scenarios/<id>/evaluation.json`; live ones (#416) go to the session log, and the AAR (#419) reads both.
- `Scenario.evaluation` defaults to empty on load (loose object, ADR-0016), so every existing scenario opens unchanged. The `eeg` stage is independent: nothing downstream reads it, so re-running it on a ready scenario marks nothing stale and keeps the scenario ready. That is how "Generate evaluation guides" adds EEGs to older and hand-authored scenarios without touching their other documents.
- The critical task keeps the shape the live evaluator form consumes, `{ id, capability, task, citation, expectedBy? }`; later specs add fields and never rename or remove those.
- Hand-written tasks in the editor pick their citation from the plan sections the scenario already cites (overview, MSEL rows, other tasks). An uncited task cannot be saved; the schema requires the citation and `EEG_TASK_UNCITED` is an error.

## Consequences

- One more model call per scenario (`maxTokens` 4000, retrieval `k: 10`), inside a 32k local context.
- The EEG packet, the MSEL and the deck carry the same task ids, so paper EEGs, the Facilitate ratings and the AAR line up.
- Scenarios whose plans are not imported cannot get EEGs; the failure message says so. This is deliberate: the value of an EEG is the citation.
- The EEG lints only run once a scenario has an evaluation; a scenario without one is a readiness matter (the next-action bar), not a warning, so the bundled examples keep passing their checks until their guides are generated.
