# Spec 0421: Exercise Evaluation Guides, Core Capabilities and expected actions from the plans

Issue: #421 · Milestone: 0.6.0 · Status: Implemented (ADR-0025) · Depends on: — · Related: #416 (evaluator forms, live play), #419 (AAR/IP), #420 (HSEEP document set), #422 (surveys)

> **As built (0.6.0).** The implementation follows this spec with these differences, each explained where it applies: (1) the `eeg` stage is an _independent_ stage — re-running it marks nothing stale and keeps a ready scenario ready, which is how "Generate evaluation guides" works on older and hand-authored scenarios (FR-12); (2) a hand-written critical task picks its citation from the plan sections the scenario already cites, so `citation` stays required and `EEG_TASK_UNCITED` is an error (open question 1); (3) the EEG lints run only once a scenario has an evaluation, so the bundled examples keep passing their checks until their guides are generated; (4) the EEG packet is one blank copy with an "Evaluator ____" line (seats arrive with #416); (5) the MSEL grid's "Criteria" column and the inject editor's criteria line are a follow-up — the Evaluation tab's **Criteria by MSEL row** table, the MSEL PDF and the deck pages carry the per-row task references; (6) the Scenario page's tabs live in `ScenarioPage.tsx`, not `ScenarioSections.tsx`.

## Summary

Every objective is mapped to one or more FEMA Core Capabilities, and each capability gets an Exercise Evaluation Guide (EEG) whose critical tasks come from the organization's own plans, with citations ("per EOP 6.4, notify the county EMA within 30 minutes"). Each MSEL row carries the critical tasks it is meant to trigger as evaluation criteria that an evaluator rates met / partial / not met / not observed. The ratings are discussion aids for the hot wash and the AAR/IP, never grades of people.

## Requirements

### User stories

- As an exercise designer, I want each objective tied to the Core Capabilities HSEEP expects, so that the ExPlan, SitMan, EEGs and AAR/IP use the same vocabulary as our grant and accreditation paperwork.
- As an exercise designer, I want the EEG critical tasks to quote our plans by section, so evaluators check what our procedures say, not a generic checklist.
- As an evaluator, I want to see, for each inject, which critical tasks it should trigger and rate each one in four clicks, on paper or in the evaluator form (#416).
- As a facilitator, I want the ratings and notes rolled up per objective and capability for the hot wash, with the plan section next to each item, so the discussion stays about procedures and not about people.
- As an exercise designer, I want to review and edit every mapping and task before the exercise, because the model drafts and a person who knows the organization decides.

### Functional requirements

- **FR-1** The app ships the 32 FEMA Core Capabilities (National Preparedness Goal, 2nd edition) as data: id, name, mission areas, one-sentence definition. The list is static and public domain; it is never edited per project.
- **FR-2** A new generation stage `eeg` runs after `rubric` and before `player_briefing` in the scenario pipeline. For each objective it proposes one to three Core Capabilities with a reason, and for each capability an EEG with 3–8 critical tasks. Every critical task cites a retrieved plan section (citation key resolved to a `Citation`, as every other stage does). A task whose citation does not resolve is dropped and recorded as `CITATION_DROPPED`; a model never adds a task the plans do not support.
- **FR-3** A critical task may name the role expected to perform it (`expectedBy`, a role id), a timing ("within 30 minutes", taken from the plan text), and the MSEL rows (`rowIds`) where an evaluator should look for it. Rows named must exist; unknown ids are dropped with a log line, as `applyRubric` does for rubric links.
- **FR-4** Each MSEL row gets evaluation criteria: the critical tasks whose `rowIds` include it, plus its own expected action split into one criterion when no task maps to it, so no inject is left without something to observe. Criteria are derived by code from the EEGs (deterministic, `src/main/generate/eeg-criteria.ts`), not asked of the model, and are recomputed whenever the MSEL or the EEGs change.
- **FR-5** Ratings use HSEEP's four values: `met`, `partial`, `not_met`, `not_observed`. An observation records a rating, an optional note, the task or criterion it rates, the row it was observed on and the exercise time. Observations are non-attributional: no player name is stored; `evaluator` is an optional free label ("Evaluator 2").
- **FR-6** Observations entered without live play (paper EEGs typed up afterwards, or the facilitator rating criteria from the Facilitate screen) are stored in `scenarios/<id>/evaluation.json`. Observations entered through the live evaluator form (#416) arrive in the live session log (#417); the AAR (#419) reads both through one record builder. The same `Observation` schema is used in both places.
- **FR-7** The Scenario page gets an "Evaluation" section (structured editor): objectives with their capabilities (add, remove, pick from the 32), EEGs with critical tasks (edit text, citation, expected role, timing, linked rows), and the per-row criteria view. Regenerate runs the `eeg` stage with instructions, as for the rubric.
- **FR-8** Facilitate's side panel gets the **Evaluation** tab that 0418 names: without a live session it shows the due or delivered inject's criteria with four rating buttons and a note field, writing `evaluation.json`; with a session running, 0416 adds the evaluators' incoming observations to the same tab. The Hot wash panel groups observations and notes by objective and capability, each line carrying its plan citation.
- **FR-9** Lints: `EEG_CAPABILITY_MISSING` (an objective with no capability, warning), `EEG_TASK_UNLINKED` (a critical task linked to no row, info), `EEG_ROW_UNCOVERED` (a non-control row with no critical task, info), `EEG_TASK_UNCITED` (should not occur after FR-2; error if it does), `EEG_CAPABILITY_UNKNOWN` (a capability id not in the 32; dropped, warning). All feed the existing Scenario check. As built, they run only once the scenario has an evaluation (any objective mapping or EEG): a scenario without one is a readiness matter (FR-12), not a warning.
- **FR-10** Export: an **EEG packet** PDF and DOCX (one EEG per capability in the HSEEP 2020 layout: capability, objectives, target, critical tasks table with Observation Keys and Rating columns, Observation Notes, Analysis/Strengths/Areas for Improvement space), one blank copy per evaluator seat. The C/E Handbook and the MSEL exports show capability and critical task references per row (#420). Observations never appear in the players/ folder of the distribution ZIP.
- **FR-11** The critical task object keeps the shape the live evaluator form (#416) consumes: `{ id, capability, task, citation, expectedBy? }`; this spec adds fields, never renames or removes those.
- **FR-12** Existing scenarios open unchanged. "Generate evaluation guides" appears as the next action when a ready scenario has none; running it adds EEGs without touching other documents. As built, the button runs `generate:rerun-stage` for `eeg`, and `rerunStep` treats `eeg` as an independent stage (`INDEPENDENT_STAGES` in `engine.ts`): nothing downstream reads the evaluation, so no run is marked stale and the status stays `ready`. (`generate:continue` was ruled out: on a hand-authored scenario with no provenance it would regenerate everything.)

### Non-functional requirements

- **NFR-1** Cost: one additional model call per scenario (CONTRIBUTING, Project rules 1 is about GitHub cost; the stage adds no CI step). The `eeg` prompt caps `maxTokens` at 4000 and retrieval at `k: 10` so a 32k local context holds it.
- **NFR-2** Privacy: observations stay in the project folder; nothing leaves the computer (Project rules 3). Evaluators are labels, not accounts.
- **NFR-3** Accessibility: WCAG 2.2 AA. Rating buttons are a radio group with visible labels, not colour-only; the structured editor works from the keyboard like the rubric editor.
- **NFR-4** Offline: the stage runs through the configured text provider like every other (Project rules 4). The capability list and EEG rendering need no network.

### Out of scope

- Scoring people or teams; aggregate "scores" as a percentage of tasks met are shown only as counts of met / partial / not met per capability, with the HSEEP capability rating chosen by a person in the AAR (#419).
- Automatic extraction of capabilities from a THIRA or an Integrated Preparedness Plan.
- Operations-based exercise EEGs (performance measures with times, equipment checks).
- Live multi-evaluator sync and the evaluator form itself (#416).

## Design

### Core Capabilities data

`src/shared/core-capabilities.ts`:

```ts
export const MISSION_AREAS = ['prevention', 'protection', 'mitigation', 'response', 'recovery'] as const
export const CORE_CAPABILITIES = [
  { id: 'planning', name: 'Planning', areas: ['prevention','protection','mitigation','response','recovery'], definition: '…' },
  { id: 'public_information_and_warning', name: 'Public Information and Warning', areas: [all five], definition: '…' },
  { id: 'operational_coordination', name: 'Operational Coordination', areas: [all five], definition: '…' },
  { id: 'forensics_and_attribution', … areas: ['prevention'] },
  { id: 'intelligence_and_information_sharing', … areas: ['prevention','protection'] },
  { id: 'interdiction_and_disruption', … areas: ['prevention','protection'] },
  { id: 'screening_search_and_detection', … areas: ['prevention','protection'] },
  { id: 'access_control_and_identity_verification', … ['protection'] },
  { id: 'cybersecurity', … ['protection'] },
  { id: 'physical_protective_measures', … ['protection'] },
  { id: 'risk_management_for_protection_programs_and_activities', … ['protection'] },
  { id: 'supply_chain_integrity_and_security', … ['protection'] },
  { id: 'community_resilience', … ['mitigation'] },
  { id: 'long_term_vulnerability_reduction', … ['mitigation'] },
  { id: 'risk_and_disaster_resilience_assessment', … ['mitigation'] },
  { id: 'threats_and_hazards_identification', … ['mitigation'] },
  { id: 'critical_transportation', … ['response'] },
  { id: 'environmental_response_health_and_safety', … ['response'] },
  { id: 'fatality_management_services', … ['response'] },
  { id: 'fire_management_and_suppression', … ['response'] },
  { id: 'infrastructure_systems', … ['response','recovery'] },
  { id: 'logistics_and_supply_chain_management', … ['response'] },
  { id: 'mass_care_services', … ['response'] },
  { id: 'mass_search_and_rescue_operations', … ['response'] },
  { id: 'on_scene_security_protection_and_law_enforcement', … ['response'] },
  { id: 'operational_communications', … ['response'] },
  { id: 'public_health_healthcare_and_emergency_medical_services', … ['response'] },
  { id: 'situational_assessment', … ['response'] },
  { id: 'economic_recovery', … ['recovery'] },
  { id: 'health_and_social_services', … ['recovery'] },
  { id: 'housing', … ['recovery'] },
  { id: 'natural_and_cultural_resources', … ['recovery'] },
] as const  // 32 entries; a unit test asserts the count and unique ids
export const CoreCapabilityId = z.enum(CORE_CAPABILITIES.map((c) => c.id))
```

Definitions are the one-sentence capability descriptions from the National Preparedness Goal (a US government work). The domain profile (`src/shared/domains/schema.ts`) gets an optional `coreCapabilities: string[]` hint listing the capabilities a domain most often exercises (airport: Operational Coordination, Public Information and Warning, Cybersecurity, Infrastructure Systems, Critical Transportation, On-scene Security …); the prompt shows these first. Profiles without the field fall back to the common three plus Cybersecurity and Infrastructure Systems.

### Schemas (`src/shared/schemas/evaluation.ts`, exported from `schemas/index.ts`)

```ts
export const Rating = z.enum(['met', 'partial', 'not_met', 'not_observed'])

/** Shape consumed by the live evaluator form (#416): id, capability, task, citation, expectedBy? */
export const CriticalTask = z.object({
  id: Id, // "T-03"
  capability: CoreCapabilityId,
  task: z.string().min(1), // "Notify the county EMA within 30 minutes of activation"
  citation: Citation, // the plan section the task comes from
  expectedBy: Id.optional(), // role id
  /** Added by this spec. */
  timing: z.string().optional(), // "within 30 minutes", as the plan states it
  rowIds: z.array(z.string()).default([]), // MSEL rows where it should be observed
  objectiveRefs: z.array(z.string()).default([]), // objective ids
  locked: z.boolean().default(false),
})

export const Eeg = z.object({
  capability: CoreCapabilityId,
  /** HSEEP "capability target": one sentence, in the organization's words. */
  target: z.string().default(''),
  objectiveRefs: z.array(z.string()).default([]),
  criticalTasks: z.array(CriticalTask).default([]),
})

export const ObjectiveCapability = z.object({
  objectiveId: Id,
  capability: CoreCapabilityId,
  why: z.string().default(''),
})

export const Evaluation = z.object({
  objectiveCapabilities: z.array(ObjectiveCapability).default([]),
  eegs: z.array(Eeg).default([]),
})

/** A criterion as shown on one MSEL row / inject page; derived, never stored. */
export const RowCriterion = z.object({
  id: z.string(), // taskId, or `${rowId}:expected` for the row's own expected action
  rowId: z.string(),
  text: z.string(),
  taskId: Id.optional(),
  capability: CoreCapabilityId.optional(),
  citation: Citation.optional(),
})

export const Observation = z.object({
  id: Id,
  at: IsoDateTime,
  exerciseTime: ExerciseTime.optional(),
  rowId: z.string().optional(),
  taskId: Id.optional(),
  criterionId: z.string().optional(),
  rating: Rating,
  note: z.string().default(''),
  /** Free label such as "Evaluator 2"; never a person's name by default. */
  evaluator: z.string().max(60).optional(),
  source: z.enum(['facilitate', 'paper', 'live']).default('facilitate'),
})

/** scenarios/<id>/evaluation.json */
export const EvaluationRecord = z.looseObject({
  formatVersion: z.number().int().default(1),
  observations: z.array(Observation).default([]),
  updatedAt: IsoDateTime,
})
```

`Scenario` (`schemas/scenario.ts`) gains `evaluation: Evaluation.default({ objectiveCapabilities: [], eegs: [] })`. `STAGES` gains `'eeg'` (after `'rubric'`); `PIPELINE_STAGES` in `src/main/generate/engine.ts` inserts `'eeg'` between `'rubric'` and `'player_briefing'`. `Objective` is unchanged; capabilities hang off `evaluation.objectiveCapabilities` so an objective edit never loses them.

### Stage output (`schemas/generation.ts`)

```ts
export const EegOutput = z.object({
  objectiveCapabilities: z
    .array(
      z.object({
        objective: z.string(), // exact objective name
        capabilities: z
          .array(z.object({ capability: CoreCapabilityId, why: z.string() }))
          .min(1)
          .max(3),
      }),
    )
    .min(1),
  eegs: z
    .array(
      z.object({
        capability: CoreCapabilityId,
        target: z.string(),
        criticalTasks: z
          .array(
            z.object({
              task: z.string(),
              citation: CitationKey, // required: one key per task
              expectedBy: z.string().optional(), // role key
              timing: z.string().optional(),
              rowIds: z.array(z.string()),
            }),
          )
          .min(3)
          .max(8),
      }),
    )
    .min(1),
})
```

Registered in `STAGE_OUTPUT_SCHEMAS`. With nothing retrieved the stage fails with a clear message ("no plan sections found for the objectives; import the plans or widen the brief") rather than relaxing the citation requirement: an EEG without plan citations is the generic one every competitor produces.

### Prompt (`prompts/eeg.md`)

Frontmatter: `name: eeg`, `stage: eeg`, `outputSchema: EegOutput`, `task: draft`, `modelHints: { temperature: 0.3, maxTokens: 4000 }`, `retrieval.k: 10`, queries: each objective's text, `'{{scenario.overview.threat}}'`, `'notification requirements timelines'`, `'roles responsibilities checklist'`, `'{{threat.keyCoordination}}'`. Variables: `project, domain, threat, scenario, roles, objectives, capabilities (the 32, with the domain's preferred first), doctrine, retrieved, instructions`.

The system text follows the house style of `rubric.md` (data blocks `<documents>` and `<scenario_state>`, citation keys only in JSON fields) and adds: pick capabilities from the list only, by id; write the target in the organization's words; every critical task is an observable action a controller can see or hear, taken from the cited section, with the section's own timing when it states one; prefer tasks the MSEL gives a chance to perform and name those rows; never write a task the documents do not support; do not rate or grade. The user block lists objectives, roles (keys), the MSEL rows (id, tag, event, expected action) and the plan sections tested.

### Mapper and criteria (`src/main/generate/mappers-eeg.ts`, `src/main/generate/eeg-criteria.ts`)

`applyEeg(s, out, retrieved)`: objective names → ids (exact match, then case-insensitive; unknown names logged and skipped); role keys → ids with `resolveToRoles`; citation keys → `Citation` with `rekeyCitations` semantics (unresolved → task dropped + `CITATION_DROPPED` with `rowId: 'eeg'`); `rowIds` filtered to existing rows; task ids assigned `T-01…` in order; locked tasks from a previous run are kept and matched by capability + normalized text. `rowCriteria(s): RowCriterion[]` builds FR-4; `src/shared/lint-messages.ts` gets the new codes; `src/main/generate/lint-eeg.ts` implements FR-9 and is called from `lintScenario`.

### Storage and IPC

- `scenarios/<id>/evaluation.json` (EvaluationRecord), written by `src/main/evaluation/store.ts` with the same serialized-write queue pattern as `facilitator/state.ts`.
- `src/shared/ipc/evaluation.ts` (new domain file): `evaluation:get` → `EvaluationRecord`; `evaluation:observe` `{ projectPath, scenarioId, observation }` → record (upsert by id); `evaluation:remove` `{ …, observationId }`; `evaluation:criteria` → `RowCriterion[]` (derived server-side so the Facilitate screen and #416 share one implementation). Handler `src/main/ipc/handlers/evaluation.ts`.
- `scenarios:save` already persists `scenario.evaluation`. The live evaluator form (#416) writes observations into the session log as `eval.observation` messages (0406: `observationId`, `revision`, `taskId`, `rating`, `notes`, `exerciseTime`, `observedAt`, `injectId?`, `mselRowId?`), which map onto `Observation` one to one (`observationId → id`, `notes → note`, `mselRowId → rowId`, `observedAt → at`, `source: 'live'`; the highest `revision` wins). Evaluators are named in live play (0418), so there `evaluator` carries the seat's display label. `evaluation:criteria` is the channel the live form reads critical tasks from.

### Renderer

- `src/renderer/src/editors/docs/structured/EvaluationEditor.tsx`: capabilities per objective (combobox over the 32, grouped by mission area), EEG cards with task rows (text, citation chip via `CitationChips.tsx`, role select, timing, row multi-select, lock), "Regenerate" through `RegenerateButton` for stage `eeg`. `owners.ts`: `PART_STAGE.evaluation = 'eeg'`.
- `src/renderer/src/routes/scenarios/ScenarioSections.tsx`: "Evaluation" section after Rubric; `readiness.ts` adds "Generate evaluation guides" when `evaluation.eegs` is empty on a ready scenario.
- `src/renderer/src/routes/facilitate/EvaluationTab.tsx` (the **Evaluation** tab of `SidePanel` in `FacilitateParts.tsx`, shared with 0416): for the selected or latest delivered row, its criteria with a four-way radio group and note; writes through `evaluation:observe`. `HotWashPanel.tsx` gains a "By objective and capability" view: counts per rating, the observations and inject notes under each, each line with its citation.
- MSEL grid (`editors/msel`): a read-only "Criteria" column toggle showing task ids per row; inject editor shows the row's criteria under the expected action.

### Export

- `src/main/export/eeg.ts`: `eegView(model)` and `templates/export/eeg.html` (HSEEP 2020 EEG layout per capability: header, objectives, target, critical tasks table with columns Task · Source · Expected by · Observation Keys (the linked injects) · Rating ☐M ☐P ☐N ☐NO · Notes), then Observation Notes and Analysis blocks. `documentFileNames` adds `eegs: '<Title>-EEGs.pdf'`, `eegsDocx`. New `ExportTarget` `eeg_pdf`; the `docx` target also writes the EEG packet (`eegDocx` in `docx.ts`, built from the same view). MSEL (`views.ts mselView`) and deck (`deckView`) get `capabilities` and `taskIds` per row; the MSEL PDF prints them in a narrow column, the deck page under "Expected action". The ZIP keeps the EEG packet in facilitator/ (`playerFileNames` unchanged).
- `scenario.json` export includes `evaluation`; `scenario.md` gets an "Evaluation guides" section.

### Migration of existing projects

`Scenario.evaluation` defaults to empty on load (loose object, ADR-0016); `evaluation.json` is created on first observation. No format version bump: an older build ignores the field and keeps it on save (#208). Example projects (`examples/`) get EEGs by running the stage with `scripts/make-example.mjs` once the stage lands; `tests/fixtures/scenarios/scenario-3.json` gets a hand-written `evaluation` block (Scenario 3's three objectives → Public Information and Warning, Operational Coordination, Cybersecurity, Infrastructure Systems; tasks citing TIRP 13.6, 13.7, 1.4.5, ASP 6.4).

## Security and privacy

Observations and notes are exercise records about procedures; the UI never asks for a player's name and the schema has no field for one. The `evaluator` label is optional and shown as entered. Nothing leaves the computer except the stage's prompt to the configured text provider, which carries plan excerpts and the MSEL as today. Prompt injection from documents is handled as in every stage (data blocks, `dataSafe`). `evaluation.json` is read with `readJsonOr` and written atomically; ids are `SafeId`.

## Testing

- Unit: `core-capabilities.test.ts` (32 entries, unique ids, every mission area used); `mappers-eeg.test.ts` (objective name matching, dropped citations, unknown rows, locked tasks kept); `eeg-criteria.test.ts` (every non-control row gets at least one criterion; a row with two tasks gets both); `lint-eeg.test.ts`; `evaluation/store.test.ts` (upsert, serialized writes); handler tests for the new channels (pattern: `handlers/facilitator.test.ts`).
- Golden / fixture: `tests/fixtures/scenarios/scenario-3.json` with EEGs passes `scenario-fixtures.test.ts`; a new `tests/content/eeg-scenario-3.test.ts` asserts the hand-written EEGs cite only sections present in `reference/ncia/` headings and that each MSEL decision row (I-06, I-09) is linked by at least one task. Mock-provider fixture for `EegOutput` in `providers/mock/fixtures.ts`; `engine.test.ts` extended so the pipeline runs `eeg` after `rubric` and marks it stale when `msel_phase` re-runs.
- Export: `documents.test.ts` renders the EEG packet for the Scenario 3 fixture and checks capability names, task text and citations appear; `zip.test.ts` asserts the EEG PDF never lands in players/.
- E2E: `e2e/facilitator.spec.ts` extended: rate a criterion, reload, the observation persists and the Hot wash panel shows it under its capability; `e2e/doc-editors.spec.ts` extended for the Evaluation editor (add a capability, edit a task, save). `e2e/export.spec.ts` adds `eeg_pdf`.
- Live (`LIVE=1`): `tests/live/pipeline.live.test.ts` writes `evaluation` into the sample run; the reviewer reads the EEGs next to `reference/scenario-3/controller-handbook.md` and checks they would not embarrass themselves beside it.

## Tasks

1. **Core Capabilities data and schemas.** `src/shared/core-capabilities.ts`, `src/shared/schemas/evaluation.ts`, `schemas/index.ts`, `schemas/scenario.ts` (`evaluation`, `'eeg'` stage), `schemas/generation.ts` (`EegOutput`), `domains/schema.ts` (`coreCapabilities?`), unit tests.
2. **Prompt and stage.** `prompts/eeg.md`, `src/main/generate/mappers-eeg.ts`, `eeg-criteria.ts`, `engine.ts` (`stepEeg`, pipeline order), `providers/mock/fixtures.ts`, `engine.test.ts`; `docs/guides/prompts.md` lists the stage.
3. **Lints.** `src/main/generate/lint-eeg.ts`, `lint.ts` wiring, `src/shared/lint-messages.ts`, tests.
4. **Evaluation record and IPC.** `src/main/evaluation/store.ts`, `src/shared/ipc/evaluation.ts`, `ipc/index.ts`, `ipc/handlers/evaluation.ts`, tests.
5. **Evaluation editor.** `editors/docs/structured/EvaluationEditor.tsx`, `owners.ts`, `routes/scenarios/ScenarioSections.tsx`, `readiness.ts`, component tests, `e2e/doc-editors.spec.ts`.
6. **Facilitate: Evaluation tab and hot wash roll-up.** `routes/facilitate/EvaluationTab.tsx`, `FacilitateParts.tsx` (tab), `HotWashPanel.tsx`, `FacilitatePage.tsx`, `facilitate.css`, `e2e/facilitator.spec.ts`.
7. **Export.** `templates/export/eeg.html`, `src/main/export/eeg.ts`, `views.ts` (capability and task columns), `documents.ts`, `docx.ts` (`eegDocx`), `naming.ts`, `run.ts`, `src/shared/ipc/export.ts` (`eeg_pdf`), `routes/export/targets.ts`, `manifest.ts`, tests; `docs/guides/getting-started.md` export list.
8. **Fixtures, examples and docs.** `tests/fixtures/scenarios/scenario-3.json` evaluation block, `tests/content/eeg-scenario-3.test.ts`, example repair run, `docs/04-TABLETOP-METHODOLOGY.md` §2 (the package gains EEGs), `docs/05-DATA-MODEL.md`, ADR [0025](../adr/0025-core-capabilities-and-eegs.md) (0024 is taken by live play). The example repair run (`scripts/make-example.mjs`, which needs the local model stack) is left for the examples refresh: until then each example offers "Generate evaluation guides".

## Follow-ups

- MSEL grid: a read-only "Criteria" column toggle (task ids per row) and the inject editor's criteria line under the expected action. The grid's column set is fixed and keyboard-navigated; adding a column is its own change.
- One blank EEG copy per evaluator seat once seats exist (#416).
- Example projects: run the `eeg` stage with `scripts/make-example.mjs` and package the guides.

## Open questions

1. **Should critical tasks without a plan citation be allowed when the plans are silent?** Decided: no. The stage fails loudly when nothing is retrieved, and the designer can add a task by hand in the editor; its **Source** is picked from the plan sections the scenario already cites (overview, MSEL rows, other tasks), so `citation` stays required (FR-11, #416) and `EEG_TASK_UNCITED` is an error for data that arrives any other way. When the scenario cites nothing yet, **Add task** is disabled with a hint.
2. **Where does the capability rating per objective (P/S/M/U) live?** Recommendation: in the AAR draft (#419), chosen by a person, with the counts of met / partial / not met shown beside it; never computed as a grade here.
3. **Do we store observations per evaluator seat?** Recommendation: a free `evaluator` label only; seats and sync belong to live play (#416).
4. **Should the per-row criteria also split long expected actions into several criteria?** Recommendation: no; one criterion per row's expected action, plus the linked tasks. Splitting by sentence produced noisy half-criteria in a trial read of Scenario 3's rows.
