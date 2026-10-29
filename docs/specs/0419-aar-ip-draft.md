# Spec 0419: AAR/IP draft from the exercise record

Issue: #419 · Milestone: 0.6.0 · Status: Draft · Depends on: #421 (EEGs and Core Capabilities) · Related: #417 (live session log), #416 (evaluator forms), #420 (HSEEP document set), #422 (surveys)

## Summary

After the exercise, the app drafts the After-Action Report / Improvement Plan in the HSEEP 2020 layout from everything the exercise produced: facilitator notes, hot wash items, decision log, votes and messages from live play, evaluator observations and survey results. Strengths and areas for improvement are grouped per objective and Core Capability and cite the plan sections involved; corrective actions carry an owner and a due date the designer fills in. The draft is editable and exports to PDF and Word. It works with a full live-play record and equally with nothing more than a facilitator's notes and a hot wash.

## Requirements

### User stories

- As a facilitator, I want an AAR/IP draft an hour after ENDEX that already contains what we observed, so I spend my time judging and correcting rather than typing.
- As an emergency manager, I want strengths and areas for improvement tied to objectives, Core Capabilities and our plan sections, because that is what our grant and accreditation reviewers look for.
- As a planner, I want each corrective action to have an owner, a capability element and a due date, so the Improvement Plan is a tracker, not a paragraph.
- As a facilitator who ran a paper exercise, I want the same draft from my hot wash notes alone, with the gaps shown as gaps instead of filled with invented findings.
- As a participant, I want nothing in the AAR to name me or grade me; HSEEP exercises are non-attributional.

### Functional requirements

- **FR-1** An **exercise record** is assembled from the scenario folder before drafting: the scenario (objectives, capabilities, EEGs, rubric, hot wash guide, MSEL), `facilitator.json` (delivered injects with times, per-inject notes, general notes, hot wash items, decision log), `evaluation.json` (observations, #421), the live session log when present (#417: inject releases and receipts, messages, votes, hot wash items, evaluator observations, survey responses) and survey results (#422). Every item gets a stable `ref` (`note:I-09`, `obs:01J…`, `vote:3`, `survey:feedback:q4`, `log:…`) so findings can point at their evidence.
- **FR-2** The record builder works with any subset of sources. With only the scenario and facilitator notes, the draft is produced from those; the AAR states in its Exercise Overview which sources were available ("Evidence: facilitator notes, hot wash; no evaluator observations or participant feedback were recorded").
- **FR-3** The Facilitate screen's Hot wash panel captures **3-Up / 3-Down items** (kind `strength` / `improvement` / `other`, the same vocabulary as the live `hotwash.item` message in 0406; text, optional objective and inject) and a **decision log** (exercise time, inject, decision text, deciding role) during the exercise, saved in `facilitator.json`. These exist so an exercise without live play still produces evidence; with live play, the Hot wash board (0415) and these items are shown together.
- **FR-4** A new stage `aar` (on demand, not part of the scenario pipeline) drafts: an executive summary; per Core Capability exercised, a rating proposal with reasons, strengths and areas for improvement; per area for improvement an analysis, the plan sections involved (citations) and a recommendation with one or more corrective actions (action, capability element: Planning / Organization / Equipment / Training / Exercises; suggested owner role). Every strength and area for improvement lists the evidence refs it rests on; a finding with no evidence ref is dropped and logged (`AAR_UNSUPPORTED_FINDING`). Owners and due dates are never invented: the model proposes a role, a person sets the organization, point of contact and dates.
- **FR-5** Ratings use the HSEEP 2020 values per capability: Performed without Challenges (P), Performed with Some Challenges (S), Performed with Major Challenges (M), Unable to be Performed (U). The draft proposes one per capability from the observations and notes; the editor shows the counts of met / partial / not met observations next to it and the person confirms or changes it. The HSEEP definitions of the four ratings are shown in the document.
- **FR-6** The AAR is stored as structured data (`scenarios/<id>/aar.json`) plus a rendered Markdown document (`documents/aar.md`) with section markers like the handbook, editable in the existing Markdown document editor; the Improvement Plan table and the ratings are edited in a structured editor and re-rendered into the Markdown. History and restore work as for other documents.
- **FR-7** Exports: AAR/IP as PDF and DOCX in the HSEEP 2020 layout (Exercise Overview; Analysis of Core Capabilities with the capability rating table; per capability Strengths and Areas for Improvement with Analysis / Reference / Recommendation; Appendix A Improvement Plan table: Core Capability · Issue/Area for Improvement · Corrective Action · Capability Element · Primary Responsible Organization · Organization POC · Start Date · Completion Date; Appendix B Exercise Participants (organizations only, from `conduct` details); Appendix C Participant Feedback Summary when surveys have responses; Appendix D Acronyms). Facilitator folder only in the distribution ZIP.
- **FR-8** The draft cites plan sections through the existing `Citation` type and shows them as "TIRP 13.6 (p. 41)". It may cite only sections that were retrieved for the stage or already cited in the scenario (EEG tasks, MSEL rows, overview); other keys are dropped with `CITATION_DROPPED`.
- **FR-9** "Draft AAR/IP" is offered on the Facilitate screen after ENDEX (or when any note exists) and on the Scenario page; re-running with instructions regenerates the model-written parts but keeps rows the person locked (ratings, corrective actions, edited text).
- **FR-10** Non-attribution: the record builder strips any field that live play marks as a participant identity (at attribution level `named`, 0418, display names on messages, votes and hot wash items become role labels or "a player"); evaluators are named in live play because they sign their observations (0418), so their name reaches the record only as the `evaluator` label and never the AAR body; the prompt receives role labels only; the schema has no person fields except the owner/POC the designer types into the Improvement Plan.
- **FR-11** Corrective actions can be exported as a CSV/XLSX tracker sheet (one row per action) with the Excel MSEL writer from #420 so an organization can track them outside the app.

### Non-functional requirements

- **NFR-1** Cost: one or two model calls per draft (the second only when the first overflows the context and the record is sent in a condensed form, as `critique` does). No CI changes (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: the record never leaves the project folder except as the prompt to the configured provider (Project rules 3). Live-play identities are removed before the prompt is built, not after.
- **NFR-3** Accessibility: WCAG 2.2 AA in the editor (table editing from the keyboard, rating as a labelled radio group); the exported PDF carries headings for the capability sections.
- **NFR-4** Offline: works with local providers; a 32k context must hold a 25-row exercise with 40 observations and 30 notes. The record is condensed (notes truncated to 300 characters, observations grouped per task) before the prompt is built.

### Out of scope

- Multi-year improvement tracking across exercises and a corrective-action dashboard (future issue; the exported tracker sheet covers the immediate need).
- An AAR for operations-based exercises (performance measures, timelines of actual response).
- Automatic distribution of the AAR or follow-up reminders.

## Design

### Exercise record (`src/main/aar/record.ts`)

```ts
export interface ExerciseRecord {
  scenario: Scenario
  sources: { facilitator: boolean; evaluation: boolean; live: boolean; surveys: boolean }
  delivered: { rowId: string; exerciseTime: string; at: string }[]
  notes: { ref: string; rowId?: string; text: string }[] // per-inject + general
  hotwash: {
    ref: string
    kind: 'strength' | 'improvement' | 'other'
    text: string
    objectiveRef?: string
    rowId?: string
  }[]
  decisions: { ref: string; exerciseTime?: string; rowId?: string; text: string; byRole?: string }[]
  observations: Observation[] // #421 schema, from evaluation.json and the live log
  votes: {
    ref: string
    rowId?: string
    question: string
    options: { label: string; count: number }[]
  }[]
  messages: {
    ref: string
    exerciseTime?: string
    fromRole: string
    toRole?: string
    text: string
  }[]
  surveys: SurveySummary[] // #422 summaries (means, distributions, free text)
}
```

Sources are read through small adapters in `src/main/aar/sources/`: `facilitator.ts` (reads `FacilitatorState`), `evaluation.ts`, `surveys.ts` (calls the summarizer from #422) and `live-log.ts`, which replays `scenarios/<id>/live/<sessionId>/log.jsonl` through the reader in `src/main/live/log.ts` (0417) and maps the protocol's message types (0406) onto the record: `inject.release` and `inject.receipt` → `delivered`; `message` (0413, with `message.pinned` marking the ones the controller pinned) → `messages`; `vote.open` / `vote.close` tallies (0414) → `votes`; `hotwash.item` (0415) → `hotwash`; `eval.observation` (0416: `observationId`, `revision`, `taskId`, `rating`, `notes`, `exerciseTime`, `observedAt`, `mselRowId?`) → `Observation` (`observationId → id`, `notes → note`, `mselRowId → rowId`, `observedAt → at`; the highest `revision` wins); `survey.response` → the survey store (#422). When a scenario has several sessions the most recent ended one is used and the Draft dialog lets the facilitator pick another. The adapter is the only module that knows the log's shape; a missing or unreadable log yields `sources.live = false` and a warning, never a failed draft. Identity fields are dropped in `live-log.ts` (FR-10). `condenseRecord(record, budget)` trims for the prompt (NFR-4).

### FacilitatorState additions (`src/shared/ipc/facilitator.ts`)

```ts
hotwash: z.array(z.object({
  id: SafeId, kind: z.enum(['strength', 'improvement', 'other']), text: z.string(),
  objectiveRef: z.string().optional(), rowId: z.string().optional(), at: z.string(),
})).default([]),
decisions: z.array(z.object({
  id: SafeId, at: z.string(), exerciseTime: z.string().optional(), rowId: z.string().optional(),
  text: z.string(), byRole: z.string().optional(),      // role id, never a name
})).default([]),
```

Defaults keep old `facilitator.json` files valid. `HotWashPanel.tsx` gets the 3-Up / 3-Down capture list (add, edit, remove, tag with objective and inject); `InjectPanel.tsx` gets a "Log decision" action on the delivered row.

### AAR schema (`src/shared/schemas/aar.ts`)

```ts
export const CapabilityRating = z.enum(['P', 'S', 'M', 'U'])
export const CapabilityElement = z.enum([
  'planning',
  'organization',
  'equipment',
  'training',
  'exercises',
])

export const EvidenceRef = z
  .string()
  .regex(/^(note|obs|hw|dec|vote|msg|survey|log):[A-Za-z0-9:_.-]+$/)

export const CorrectiveAction = z.object({
  id: Id,
  action: z.string(),
  element: CapabilityElement,
  ownerRole: Id.optional(), // proposed by the model
  ownerOrganization: z.string().default(''), // typed by a person
  poc: z.string().default(''), // typed by a person
  startDate: z.string().optional(), // ISO date, typed
  dueDate: z.string().optional(), // ISO date, typed
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  locked: z.boolean().default(false),
})

export const Finding = z.object({
  id: Id,
  title: z.string(),
  analysisMd: z.string(),
  citations: z.array(Citation).default([]),
  evidence: z.array(EvidenceRef).min(1),
  objectiveRefs: z.array(z.string()).default([]),
  recommendation: z.string().default(''), // areas for improvement only
  correctiveActions: z.array(CorrectiveAction).default([]),
  locked: z.boolean().default(false),
})

export const CapabilityAnalysis = z.object({
  capability: CoreCapabilityId,
  rating: CapabilityRating.optional(), // confirmed by a person
  proposedRating: CapabilityRating.optional(),
  ratingRationale: z.string().default(''),
  observationCounts: z.object({
    met: z.number(),
    partial: z.number(),
    not_met: z.number(),
    not_observed: z.number(),
  }),
  strengths: z.array(Finding).default([]),
  areasForImprovement: z.array(Finding).default([]),
})

/** scenarios/<id>/aar.json */
export const Aar = z.looseObject({
  formatVersion: z.number().int().default(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  exerciseDate: z.string().optional(),
  executiveSummaryMd: z.string().default(''),
  sourcesUsed: z.array(z.enum(['facilitator', 'evaluation', 'live', 'surveys'])),
  capabilities: z.array(CapabilityAnalysis).default([]),
  participantFeedbackMd: z.string().default(''),
  provenance: z.array(StageRun).default([]),
})
```

`SCENARIO_DOCS` gains `'aar'` so `documents/aar.md` gets the editor, history and `scenarios:doc-*` channels; `Scenario.documents.aar` RelPath is recorded like the others. `STAGES` gains `'aar'`; it is not added to `PIPELINE_STAGES`.

### Stage output and prompt

`schemas/generation.ts`:

```ts
export const AarOutput = z.object({
  executiveSummaryMd: z.string(),
  capabilities: z
    .array(
      z.object({
        capability: CoreCapabilityId,
        proposedRating: CapabilityRating,
        ratingRationale: z.string(),
        strengths: z.array(
          z.object({
            title: z.string(),
            analysisMd: z.string(),
            evidence: z.array(z.string()).min(1),
            citations: z.array(CitationKey),
          }),
        ),
        areasForImprovement: z.array(
          z.object({
            title: z.string(),
            analysisMd: z.string(),
            evidence: z.array(z.string()).min(1),
            citations: z.array(CitationKey),
            recommendation: z.string(),
            correctiveActions: z
              .array(
                z.object({
                  action: z.string(),
                  element: CapabilityElement,
                  ownerRole: z.string().optional(),
                }),
              )
              .min(1),
          }),
        ),
      }),
    )
    .min(1),
  participantFeedbackMd: z.string().optional(),
})
```

`prompts/aar.md`: `stage: aar`, `outputSchema: AarOutput`, `task: draft`, `temperature 0.3`, `maxTokens 6000`, retrieval queries from each area the record suggests (`'{{scenario.overview.threat}}'`, the EEG citations' heading paths, `'corrective action responsibilities'`), `k: 8`. Variables: `project, domain, threat, scenario, roles, capabilities, eegs, record (condensed), ratingsGuide, doctrine, retrieved, instructions`. Rules in the system text: write about procedures and plans, never about people; name roles, not players; every finding lists `evidence` refs copied exactly from the record (the refs appear in the record block as `[note:I-09]` and so on); cite plan sections by key only in the JSON fields; a capability with no observations and no notes gets `proposedRating` omitted and a one-line "not enough evidence" rationale rather than an invented rating; corrective actions are concrete ("Add a FIDS manual-operations checklist to TIRP 13.7"), one capability element each; do not propose owners outside the organization's roles. The user block carries the objectives with capabilities, the EEG tasks with citations, the MSEL in one line per row, and the condensed record with refs.

On `noJson` the stage retries once with `condenseRecord(record, 'tight')` (the pattern used by `callCritique`).

### Mapper, drafting job and store

- `src/main/aar/draft.ts`: `draftAar(root, scenarioId, instructions, ctx)` builds the record, runs `runStage<AarOutput>` with `promptName: 'aar'`, maps the output (`applyAar`: role keys → ids, citation keys → `Citation`, evidence refs validated against the record and unknown ones dropped, findings left with no evidence removed with `AAR_UNSUPPORTED_FINDING` in the job log, locked items from the previous `aar.json` preserved by id and title match), computes `observationCounts` per capability from the record, writes `aar.json` and renders `documents/aar.md`.
- `src/main/aar/store.ts`: `readAar`, `writeAar` (atomic, history under `history/aar.jsonl` via `scenario/history.ts`), `renderAarMarkdown(aar, scenario)` with `<!-- section:… -->` markers per HSEEP section so edited prose survives a re-render of the tables.
- Job kind `draft-aar` (`schemas/job.ts`), started through `startScenarioJob` so the scenario is claimed while the draft runs.
- IPC (`src/shared/ipc/aar.ts`): `aar:get` → `Aar | null`; `aar:draft` `{ projectPath, scenarioId, instructions? }` → `{ jobId }`; `aar:save` `{ …, aar, baseUpdatedAt? }` → `Aar` (CONFLICT on a stale base, as `scenarios:save`); `aar:record` → a redacted `ExerciseRecord` summary for the editor's evidence side panel. Handler `ipc/handlers/aar.ts`.

### Renderer

- `routes/scenarios/AarPage.tsx` at `/p/:projectKey/scenarios/:scenarioId/aar`: top bar (Draft / Re-draft with instructions, export), left the Markdown editor on `documents/aar.md` (existing `MarkdownDocEditor`, doc kind `aar`), right a structured side panel: capability rating cards (proposed vs confirmed, counts), the Improvement Plan table editor (`editors/docs/structured/ImprovementPlanEditor.tsx`: owner organization, POC, dates, status, lock), and an Evidence drawer that resolves a finding's refs to the underlying note, observation, vote or survey line.
- Facilitate: after ENDEX (or any time from the overflow menu) a "Draft AAR/IP" action starts the job and opens the AAR page when done. `readiness.ts` adds "Draft the AAR/IP" when `facilitator.json` has notes and no `aar.json` exists.

### Export

- `templates/export/aar.html` + `src/main/export/aar.ts` (`aarView`): the HSEEP 2020 AAR/IP layout from FR-7, with the capability rating table (capability × objectives × P/S/M/U), the rating legend, strengths and areas with "Reference:" lines from citations, and Appendix A as a landscape table. Evidence refs are printed as footnote-style markers ("Evidence: I-09 note; 2 observations") never as raw ids.
- `docx.ts`: `aarDocx(model)` from the same view (tables through the existing `table()` helper).
- `ExportModel` gains `aar?: Aar` and `docs.aar`; `ExportTarget` gains `aar_pdf`; `docx` includes the AAR when present; `naming.ts` adds `aar`, `aarDocx`, `improvementPlanXlsx`; `run.ts` writes them; the `zip` keeps them in facilitator/. The Improvement Plan tracker sheet uses the workbook helpers from #420 (`src/main/export/xlsx.ts`).

### Migration of existing projects

No scenario format bump. `FacilitatorState` gains defaulted arrays. `aar.json` and `documents/aar.md` appear only after the first draft. Projects opened by an older build keep the unknown `documents.aar` key (#208). The example projects ship without an AAR (they have no conduct record); the guide shows the flow with a screenshot from the Scenario 3 fixture run.

## Security and privacy

The record contains what people said in the room. It stays in the project folder, is shown only in the facilitator's app, and goes to a provider only as the condensed prompt when the facilitator clicks Draft, through the routed text provider. Live-play display names are removed in the source adapter before anything else sees the record (FR-10). The AAR has no participant list beyond organizations the designer types. Files are read with schema validation and written atomically; the AAR document editor runs through the same Markdown pipeline (no raw HTML) as the handbook.

## Testing

- Unit: `aar/record.test.ts` (each source present or absent; identity stripping; refs unique and stable; condensation under a budget), `aar/sources/live-log.test.ts` against a fixture `log.jsonl` in the 0417 format with 0406 message payloads (`tests/fixtures/live/scenario-3/log.jsonl`; observation revisions, pinned messages, a `named` session whose display names must not survive), `aar/draft.test.ts` with the mock provider (unknown evidence dropped, locked actions kept, rating omitted without evidence, retry with a tighter record on `noJson`), `aar/store.test.ts` (markers survive re-render), schema tests, handler tests.
- Golden / fixture: `tests/content/aar-scenario-3.test.ts` builds a record from the Scenario 3 fixture plus a hand-written `facilitator.json` (notes on I-06, I-09, I-12; three strengths, three improvements; two decisions) and a mock `AarOutput`, renders the Markdown and compares with `tests/fixtures/aar/scenario-3.aar.md` (golden text); asserts every citation heading exists in the fixture's documents and that no player name string from the facilitator notes appears in the prompt built for the stage.
- Export: `documents.test.ts` renders the AAR PDF HTML and `docx.test.ts` the DOCX for the fixture; `zip.test.ts` asserts the AAR never lands in players/.
- E2E: `e2e/aar.spec.ts` with the mock provider: open the Scenario 3 fixture, add a hot wash item and a decision in Facilitate, draft the AAR, confirm a rating, set an owner and due date, export `aar_pdf` and `docx`, check the files exist and the PDF text contains "Improvement Plan".
- Live (`LIVE=1`): `tests/live/aar.live.test.ts` drafts from the sample-run scenario with a scripted facilitator record through LM Studio and writes the result to `tests/fixtures/aar/sample-run/` for review.

## Tasks

1. **Record capture in Facilitate.** `src/shared/ipc/facilitator.ts` (hotwash items, decisions), `routes/facilitate/HotWashPanel.tsx`, `InjectPanel.tsx`, `use-facilitator-state.ts` tests, `e2e/facilitator.spec.ts`.
2. **Schemas and prompt.** `src/shared/schemas/aar.ts`, `schemas/index.ts`, `schemas/scenario.ts` (`'aar'` doc kind and stage), `schemas/generation.ts` (`AarOutput`), `schemas/job.ts` (`draft-aar`), `prompts/aar.md`, mock fixture, tests.
3. **Exercise record builder.** `src/main/aar/record.ts`, `aar/sources/{facilitator,evaluation,surveys,live-log}.ts`, `tests/fixtures/live/scenario-3/log.jsonl`, tests.
4. **Drafting job, store and IPC.** `src/main/aar/draft.ts`, `aar/store.ts`, `src/shared/ipc/aar.ts`, `ipc/index.ts`, `ipc/handlers/aar.ts`, tests.
5. **AAR page and editors.** `routes/scenarios/AarPage.tsx`, `routes/scenarios/index.ts` (route), `editors/docs/owners.ts` (`aar` label and stage), `editors/docs/structured/ImprovementPlanEditor.tsx`, `CapabilityRatings.tsx`, `EvidenceDrawer.tsx`, `readiness.ts`, Facilitate entry point, component tests, `e2e/aar.spec.ts`.
6. **Export.** `templates/export/aar.html`, `src/main/export/aar.ts`, `model.ts`, `documents.ts`, `docx.ts` (`aarDocx`), `naming.ts`, `run.ts`, `src/shared/ipc/export.ts` (`aar_pdf`), `routes/export/targets.ts`, Improvement Plan sheet via `export/xlsx.ts` (#420), tests.
7. **Fixtures, docs and ADR.** `tests/content/aar-scenario-3.test.ts`, `tests/fixtures/aar/`, `docs/guides/methodology.md` ("After the exercise"), `docs/05-DATA-MODEL.md`, `README.md` feature list, ADR `docs/adr/NNNN-aar-from-exercise-record.md` at the next free number when the work lands (0024 is taken by live play; several 0.6.0 specs are claiming numbers at once) covering the record format, the non-attribution rule and evidence refs.

## Open questions

1. **One AAR per scenario or one per conduct?** Recommendation: one per scenario in 0.6.0, stored beside the scenario; a second delivery of the same scenario starts from "Duplicate scenario". Multiple conducts per scenario, each with its own record and AAR, is a 0.7.0 issue once live play has run in the field.
2. **Should the model propose the P/S/M/U rating at all?** Recommendation: yes, as `proposedRating` with a rationale and the observation counts beside it; the document prints only the confirmed `rating`, and an unconfirmed capability prints "Rating pending" so a draft is never mistaken for a decision.
3. **Does the AAR go into the players/ folder?** Recommendation: no. HSEEP distributes the AAR/IP to participants after approval, but that is the organization's step, not the export's; facilitator/ only.
4. **Prompt size with many live messages.** Recommendation: messages are summarized to counts per role plus the ones the controller pinned in live play (0413 `message.pinned`), capped at ten; only hot wash items, decisions, observations and notes go in full.
