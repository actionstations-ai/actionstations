# Spec 0437: Micro-tabletops: short drills for new staff

Issue: #437 · Milestone: 0.8.0 · Status: Partly implemented (ADR-0057; see Implementation notes) · Depends on: #406 (session protocol), #411 (player page) for the shared-device mode only · Related: #424 (corrective actions and program), #421 (Core Capabilities), #438 (program health dashboard), #429 (SimCell assistant)

## Summary

A drill is a 15-minute exercise on one annex of one plan, for one person or a small team: a short situation, three to five questions, and a facilitator that checks each answer against the plan and offers hints that get more specific when someone is stuck and fewer as they improve. Drills run on the facilitator's computer (one keyboard, or a team around one screen) or on players' own devices through the live player page. Each run's result goes into the program view, so managers see which annexes staff have practised.

## Requirements

### User stories

- As a training coordinator, I want to build a drill from one annex of our plan in a few minutes, so that new staff practise that annex before their first full exercise.
- As a new staff member, I want to work through a short situation on my own and get pointed to the right plan section when I am stuck, so that I learn where things are in the plan.
- As a supervisor, I want to run the same drill with three people around one screen during a shift briefing.
- As a program manager, I want drill results to show up next to full exercises in the program view, so that coverage between exercises is visible.
- As a participant, I want to know the drill is practice, not a performance review, and to choose whether my name is recorded.

### Functional requirements

**Building a drill**

- **FR-1** The user picks one document and one section of it (a heading and everything under it; the "annex"). The picker lists headings from the document's chunks (`IndexStore.chunks(documentId)` heading paths). An annex larger than 12,000 tokens is refused with a request to pick a narrower section.
- **FR-2** Drill settings: audience (`new_staff` or `refresher`), duration (10, 15 or 20 minutes; default 15), mode (`solo` or `team`, 2–6 people), number of steps (3–5; default 4), optional focus (free text, for example "notification deadlines").
- **FR-3** "Build drill" runs one generation job with `prompts/drill_build.md` and retrieval limited to the annex's chunks. Output: title, one-paragraph situation, one or two objectives, and the steps. Each step has a prompt (a question or a short inject followed by a question), expected points (each with a citation to a chunk inside the annex), three prewritten hints, and a short model answer.
- **FR-4** Hints are graded: **Level 1** points to the kind of thing to consider without naming the answer ("Who has to be told, and how soon?"); **Level 2** points to the plan section by heading and page; **Level 3** quotes the plan line that answers it.
- **FR-5** Build checks (deterministic, in `src/main/drills/lint.ts`): every expected point and every Level 2/3 hint cites a chunk whose heading path is inside the annex; the Level 3 quote appears verbatim in that chunk; no step's prompt contains its own model answer; steps fit the duration (about 3 minutes per step plus 2 minutes for the situation); names follow the repository naming rule (fictional people, real agencies allowed). Failures are shown on the drill and block "Ready" until fixed or overridden by the user.
- **FR-6** The user can edit every field before marking the drill **Ready**. Only Ready drills can be run.
- **FR-7** A drill can also be built from a scenario: "Make drills from this scenario" proposes one drill per plan section the scenario's `overview.coreSectionsTested` cites, reusing the scenario's situation in shortened form.

**Running a drill**

- **FR-8** A run shows the situation, then one step at a time. The participant (or the team, through one typist) answers in free text.
- **FR-9** After each answer the facilitator assesses it with `prompts/drill_assess.md`: which expected points the answer covered (fully or partly), which are missing, and one follow-up question if something important is missing. The assessment refers only to the step's expected points; it does not invent new ones.
- **FR-10** Hints are offered, never forced. After an answer that misses points, the facilitator offers the next hint level. The participant can also ask for a hint at any time. The hint text shown is the prewritten text from the drill (FR-3, FR-6); the model does not write hints at run time.
- **FR-11** Fading. For each participant label and drill (or annex, across drills on the same annex), the app keeps how often each hint level was needed. On a repeat run: hints are offered only after two missed attempts instead of one when the previous run needed no Level 3 hint; Level 3 is withdrawn for a step answered without hints in two earlier runs (the participant can still open the plan). The run screen states the current hint rule so it is never hidden.
- **FR-12** Scoring per step: the share of expected points covered, with partial credit at half, reduced by hint use (Level 1 none, Level 2 −25 %, Level 3 −50 % of that step's points). Shown as covered points and hints used, not as a pass/fail grade.
- **FR-13** The debrief at the end lists, per step, what was covered, what was missed with its plan citation, and the model answer; and one line on what to review. It can be printed or saved as PDF through the existing export pipeline (`src/main/export/pdf.ts`).
- **FR-14** Time: a visible clock counts up against the planned duration. Running over does not stop the drill (WCAG 2.2.1, timing adjustable). Pause and resume are always available.
- **FR-15** No-model mode: when no text provider is configured or the `draft` model fails the drill check (FR-18), the run uses a checklist: after each answer the participant ticks which expected points they covered, then sees the model answer. Hints and fading work the same, because hints are prewritten.

**Where drills run**

- **FR-16** **This computer:** the Drills screen runs a drill in the app window. Team mode adds a participant list (labels, optional names) and records the run under the team.
- **FR-17** **Player page:** the facilitator starts a drill session over a live-play connection (#406, #407/#408/#409). Each participant's device shows the situation and steps; answers travel encrypted to the facilitator's app, which assesses them and sends feedback and hints back. The facilitator sees every participant's progress. A participant's answers are visible to the facilitator, not to other participants unless the facilitator shares them in the debrief.
- **FR-18** Before a model-assessed run, the app checks the routed `draft` model with three fixed assessment probes (an answer that covers all points, one that covers none, one paraphrase). If it misjudges any, the run uses no-model mode (FR-15) and says why.

**Results and the program view**

- **FR-19** Each finished run is saved in the project. A run records participants as labels (default "Participant 1…"); names are optional and entered by the participant.
- **FR-20** When the project is linked to a program (#424), each finished run is added to the project snapshot the program keeps (`ProjectSnapshot`, `<Name>.asprogram/projects/`) as a drill summary: date, document and annex heading path (as a `PlanSectionRef`), Core Capability ids (#421) from the drill's objectives, participant count, minutes, coverage share, hint use. No answer text and no names go to the program folder. A run can also be offered as evidence when verifying a corrective action that cites the same plan section (`CorrectiveActionVerification` with `method: 'review'` and a note naming the drill run; #424's `method: 'drill'` belongs to #431 redline drills).
- **FR-21** The program dashboard (#438) counts drills separately from exercises: "Practised in drills" next to "Exercised", per plan section.
- **FR-22** The run screen and the debrief carry a fixed notice: "This drill is practice. Results show which plan sections need review; they are not a measure of individual performance."

### Non-functional requirements

- **NFR-1** Cost: local models are enough; no paid service is needed. No-model mode needs no model at all (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: drill content and answers stay in the project folder. The player-page mode uses the end-to-end encrypted session; nothing else leaves the computer (Project rules 3). Names are optional and never sent to the program folder.
- **NFR-3** Accessibility: WCAG 2.2 AA. Keyboard-only operation; answers in a labelled multi-line field; hints and feedback announced through a polite live region; the clock is not announced every second; no time limit enforced (2.2.1); works at 320 px width on the player page (1.4.10).
- **NFR-4** Performance: assessment returns within 10 s on a 30B-class local model; a build job finishes within 2 minutes.
- **NFR-5** Offline: fully offline on "This computer"; the player-page mode works on the local-network connection (#407).

### Out of scope

- Grading staff for certification or HR records.
- Spoken answers (could come later through #425's speech-to-text).
- Drills spanning more than one document.
- Adaptive generation of new steps at run time.

### Evidence

The graded, fading hints follow the "scaffolding ladder that gradually fades as learner confidence grows" in AgentBnB ([Anwar and Liu, arXiv 2511.00265](https://arxiv.org/abs/2511.00265v1)). Its pilot had four graduate students in solo play and reported intention to use and a ceiling effect on a simple quiz, not learning gains. The evidence for this design is thin. That is why hints are prewritten and reviewable, the hint rule is visible, and the debrief records hint use so the program can see whether it helps.

## Design

### Data model

New `src/shared/schemas/drill.ts`:

```ts
export const DrillCitation = Citation.extend({ chunkId: z.number().int() })

export const DrillStep = z.object({
  id: SafeId,
  prompt: z.string().max(1200),
  expectedPoints: z
    .array(z.object({ id: SafeId, text: z.string().max(300), citation: DrillCitation }))
    .min(1)
    .max(6),
  hints: z.tuple([
    z.object({ level: z.literal(1), text: z.string().max(300) }),
    z.object({ level: z.literal(2), text: z.string().max(300), citation: DrillCitation }),
    z.object({
      level: z.literal(3),
      text: z.string().max(600),
      citation: DrillCitation,
      quote: z.string().max(600),
    }),
  ]),
  modelAnswer: z.string().max(1200),
})

export const Drill = z.object({
  id: SafeId,
  version: z.number().int(),
  title: z.string().max(120),
  status: z.enum(['draft', 'ready']),
  annex: z.object({ documentId: SafeId, documentTitle: z.string(), headingPath: z.string() }),
  audience: z.enum(['new_staff', 'refresher']),
  durationMin: z.union([z.literal(10), z.literal(15), z.literal(20)]),
  mode: z.enum(['solo', 'team']),
  focus: z.string().max(200).default(''),
  situation: z.string().max(1500),
  objectives: z
    .array(z.object({ id: SafeId, text: z.string(), capability: CoreCapabilityId.optional() }))
    .min(1)
    .max(2),
  steps: z.array(DrillStep).min(3).max(5),
  fromScenarioId: SafeId.optional(),
  provenance: z.array(StageRun).default([]),
  lint: z.array(LintIssue).default([]),
})

export const DrillRun = z.object({
  id: SafeId,
  drillId: SafeId,
  drillVersion: z.number().int(),
  where: z.enum(['this_computer', 'player_page']),
  participants: z
    .array(z.object({ label: z.string().max(40), name: z.string().max(80).optional() }))
    .min(1)
    .max(6),
  assessment: z.enum(['model', 'checklist']),
  hintRule: z.enum(['first_miss', 'second_miss']),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  pausedSec: z.number().default(0),
  steps: z.array(
    z.object({
      stepId: SafeId,
      attempts: z.array(
        z.object({
          participantLabel: z.string(),
          text: z.string().max(4000),
          at: z.string(),
          covered: z.array(SafeId),
          partial: z.array(SafeId),
          missing: z.array(SafeId),
          followUp: z.string().optional(),
        }),
      ),
      hintsUsed: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])),
      score: z.number().min(0).max(1),
    }),
  ),
  coverage: z.number().min(0).max(1).optional(),
})
```

Project folder:

```
drills/<drillId>/drill.json
drills/<drillId>/runs/<runId>.json
drills/hint-history.json        { [participantLabel]: { [annexKey]: { [stepId]: { runs, hintMax } } } }
```

Drills are project-level, not under `scenarios/`, because they are built from documents, not from a scenario. All files are optional and ignored by older versions (ADR-0016).

### Generation

- `prompts/drill_build.md` (stage `drill_build`, task `draft`, output `DrillBuildOutput` in `src/shared/schemas/generation.ts`). Retrieval: `IndexStore.chunks(documentId)` filtered to the annex heading path, passed whole when it fits, else `search(query, { documentIds: [documentId] })` restricted to the annex. Citation keys use the existing scheme from `src/main/generate/sources.ts`.
- `prompts/drill_assess.md` (task `draft`, output `DrillAssessOutput { covered: string[], partial: string[], missing: string[], followUp?: string }`). The prompt contains only the step, its expected points and the answer; the answer is wrapped as data.
- Both use the existing validation and repair path (ADR-0007) and appear in `provider-calls.jsonl` like other stages.
- Mock fixtures for both in `src/main/providers/mock/fixtures.ts`.

### Main process

New `src/main/drills/`:

| File         | Role                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.ts`   | read/write drill, runs, hint history (atomic, zod)                                                                                                                                       |
| `annex.ts`   | list headings of a document, collect annex chunks, size check                                                                                                                            |
| `build.ts`   | the build job (jobs queue, `job:progress`), then `lint.ts`                                                                                                                               |
| `lint.ts`    | FR-5 checks                                                                                                                                                                              |
| `assess.ts`  | model assessment, assessment probes (FR-18), checklist fallback                                                                                                                          |
| `hints.ts`   | hint rule and fading from hint history (pure, unit-tested)                                                                                                                               |
| `score.ts`   | FR-12 scoring (pure)                                                                                                                                                                     |
| `live.ts`    | drill session over the live-play protocol: `drill.start`, `drill.step`, `drill.answer`, `drill.feedback`, `drill.hint`, `drill.end` message types (request to #406's `src/shared/live/`) |
| `program.ts` | adds the drill summary to the linked program's project snapshot (#424 `src/main/program/`)                                                                                               |

### IPC

`src/shared/ipc/drills.ts`, handlers in `src/main/ipc/handlers/drills.ts`. `P = { projectPath }`.

| Channel                                        | Request                                         | Response                                                |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `drills:list`                                  | `P`                                             | `{ id, title, status, annex, runs, lastRunAt }[]`       |
| `drills:annexes`                               | `P & { documentId }`                            | `{ headingPath, tokens, page? }[]`                      |
| `drills:build`                                 | `P & { documentId, headingPath, settings }`     | `{ jobId }`                                             |
| `drills:from-scenario`                         | `P & { scenarioId }`                            | `{ jobId }`                                             |
| `drills:get` / `drills:save` / `drills:delete` | `P & { drillId }` (+ `drill`)                   | `Drill` / `Drill` / `void`                              |
| `drills:run-start`                             | `P & { drillId, where, participants }`          | `DrillRun` (with assessment mode and hint rule decided) |
| `drills:answer`                                | `P & { runId, stepId, participantLabel, text }` | attempt with assessment and the hint on offer           |
| `drills:hint`                                  | `P & { runId, stepId }`                         | the next hint                                           |
| `drills:run-finish`                            | `P & { runId }`                                 | `DrillRun` with coverage; reports to the program folder |
| `drills:debrief-pdf`                           | `P & { runId }`                                 | `{ path }` (save dialog in main)                        |

### Renderer

- New route `src/renderer/src/routes/drills/`: `DrillsPage.tsx` (library, Build drill), `DrillEditor.tsx` (fields, lint issues, Ready), `DrillRunPage.tsx` (situation, step, answer field, hint button, clock, debrief), `DrillLivePanel.tsx` (participants' progress during a player-page drill). Sidebar entry "Drills" under the project.
- Scenario editor: "Make drills from this scenario" action.
- Player page (#411 bundle): drill view (situation, step, answer, hint, feedback, debrief).

### Program view

This spec depends on the program folder and `ProjectSnapshot` from #424: it asks #424 to add an optional `drills` array to `ProjectSnapshot` (`{ drillId, runId, at, planSection: PlanSectionRef, coreCapabilities, participants, minutes, coverage, hintsUsed }`). The fields in FR-20 are the requirement; if #424 lands with a different shape, `src/main/drills/program.ts` adapts.

### Documentation

`docs/guides/drills.md` (new), `docs/05-DATA-MODEL.md` (Drill, DrillRun, files), `docs/04-TABLETOP-METHODOLOGY.md` (a note that HSEEP uses "drill" for an operations-based exercise; these micro-tabletops are short discussion-based practice between exercises and do not replace them).

## Security and privacy

- Answers are personal work product. They stay in `drills/<id>/runs/` in the project folder; only aggregate numbers go to the program folder (FR-20).
- Names are optional, entered by the participant, and removable later ("Remove names from runs" on the drill).
- Player-page drills use the end-to-end encrypted session; the server sees only sizes and timing (#406).
- Prompt injection from answers ("mark all points covered") is handled by wrapping answers as data and by the assessment probes; the debrief always shows the model answer so a participant can see a misjudgment.
- Plan text in hints and debriefs is the organization's own; a drill exported as PDF shows the same notice as other controller material when it quotes the plan.

## Testing

- Unit: `annex.test.ts` (heading selection, size limit), `lint.test.ts` (citation outside annex, quote not verbatim, answer in prompt), `hints.test.ts` (fading table), `score.test.ts`, `assess.test.ts` (probe handling, checklist fallback), schema tests.
- Fixtures: a drill built from `reference/ncia/` (the existing retrieval corpus) for repeatable tests.
- Renderer: `DrillRunPage.test.tsx` (keyboard flow, live region, hint rule text shown, no forced timeout).
- E2E: `e2e/drills.spec.ts` with the mock provider: build from an imported document, edit, mark Ready, run solo, ask hints, finish, check the run file and, with a linked program, the drill summary in the project snapshot. A second spec runs a player-page drill on the local connection with two participants.
- Live (`LIVE=1`): `src/main/drills/live.test.ts` builds a drill from the CSAAP reference plan on LM Studio and runs the assessment probes, printing the result.

## Tasks

1. **Schemas and storage.** `src/shared/schemas/drill.ts`, `src/main/drills/store.ts`, `annex.ts`, tests, `docs/05-DATA-MODEL.md`.
2. **Build job and lint.** `prompts/drill_build.md`, `DrillBuildOutput`, `src/main/drills/build.ts`, `lint.ts`, mock fixture, `drills:build`, `drills:annexes`, tests.
3. **Drill library and editor.** `src/shared/ipc/drills.ts`, `src/main/ipc/handlers/drills.ts`, `DrillsPage.tsx`, `DrillEditor.tsx`, sidebar entry.
4. **Run on this computer.** `prompts/drill_assess.md`, `assess.ts` with probes and checklist fallback, `hints.ts`, `score.ts`, `DrillRunPage.tsx`, run channels, `e2e/drills.spec.ts` (solo).
5. **Debrief PDF and team mode.** Debrief export through `src/main/export/pdf.ts`, participant list, hint history per participant label.
6. **Program reporting.** `src/main/drills/program.ts` writing drill summaries into #424's `ProjectSnapshot`; "Practised in drills" counts in #438's dashboard.
7. **Player-page drills.** `src/main/drills/live.ts`, protocol message types, player-page drill view, `DrillLivePanel.tsx`, e2e with two participants.
8. **Drills from a scenario and docs.** `drills:from-scenario`, `docs/guides/drills.md`, methodology note.

## Implementation notes (what the code does differently)

The first release builds the "This computer" mode, the program reporting and the Drills screen. Differences from the text above:

- **Names.** The regression drills of #431 already own `drills/`, `drills:*`, the `Drill` and `DrillRun` schemas and the "Drills" sidebar entry. Micro-drills use `micro-drills/`, `micro-drill-runs/`, `microdrills:*`, `MicroDrill`, `MicroDrillRun`, `src/main/microdrill/` and the sidebar entry "Micro-drills" (route `/p/:projectKey/micro-drills`). Stages and prompts are `micro_drill_build` and `micro_drill_assess`.
- **Storage.** Runs are in `micro-drill-runs/<runId>.json` (a collection beside `micro-drills/`), and the hint history in `micro-drill-hints.json` at the project root, keyed annex key, participant label, step id, as `{ runs, lastHintMax, cleanRuns }`.
- **Schemas.** `provenance` is not stored on a drill (`provider-calls.jsonl` records the stage runs). `fromScenarioId` is not stored. A drill has `lintOverridden`. A run has `drillTitle`, `annex`, `checklistReason` and `withdrawnLevel3`; `where` is `this_computer` only. Build output cites passages by key (P1...) and the build maps keys to chunks; an unknown key becomes chunk -1, which the checks flag.
- **Fading (FR-11).** Hints wait for a second missed answer when every participant label has run the annex before and none needed a Level 3 hint in its latest run. Level 3 is withdrawn for a step when every label answered it without hints in its latest two runs.
- **Scoring (FR-12).** Covered points are the union across a step's answers; the reduction uses the highest hint level used.
- **Assessment probes (FR-18).** Results are cached for ten minutes per project. The mock provider judges answers by word overlap so probes pass and fail as intended.
- **IPC.** Channels: `microdrills:list`, `annexes`, `build`, `get`, `save` (re-runs the checks), `delete`, `remove-names`, `runs`, `run-start`, `run-get`, `answer`, `hint`, `run-finish`, `debrief`, `debrief-pdf`. `answer` returns the run and the hint level on offer; the hint text comes from `hint`. The debrief PDF is written to `<project>/exports/` rather than through a save dialog.
- **Program (FR-20, FR-21).** `ProjectSnapshot.drills` is an optional array of `MicroDrillSummary`, rebuilt with the snapshot (and refreshed when a run finishes). Health sections gain `practisedRuns` and `lastPractisedAt`, shown as "Practised in drills" in the Plan sections table and its CSV; they never change `timesCited` or `never`.
- **Not built yet:** FR-16's team participant list is built but hint history is per label only. FR-17 is built (see "Player page" below).
- **Player page (FR-17, #499, ADR-0065).** `src/main/microdrill/live.ts` (`LiveDrills`), frames `drill.open`, `drill.answer`, `drill.feedback`, `drill.close`, the player page's `features/drills/` and the Micro-drills screen's `DrillLivePanel`. It differs from the text above: a device gets its own solo run (`where: 'player_page'`) instead of one run with a participant list, so the program receives one summary per device; the debrief is per run; a drill session needs a running live session (not surveys-only); expected points reach a device only in the reply to its own answer. The live test with the CSAAP plan (`live.ts`) and the two-participant e2e are covered by `session.test.ts` (two real clients on the LAN server) instead.
- **Drills from a scenario (FR-7, #499).** `microdrills:from-scenario` (`scenarioId`, the build settings) builds one draft drill per distinct plan section the scenario's `overview.coreSectionsTested` cites, up to five. The annex for a citation is the shallowest enclosing section that fits the size limit; sections with none are listed as skipped. The scenario's theme and threat (600 characters) go to the build prompt as `scenarioSituation` to be reused in shortened form. The drills are ordinary drafts. The button is on the Build panel (**Make drills from this scenario**). `fromScenarioId` is still not stored.
- **Run evidence for corrective actions (FR-20, #499).** The status dialog of a single action, when the new status is Verified and the action cites plan sections, lists the program's micro-drill summaries (from the project snapshots) whose section is the cited one or inside or around it. Choosing one sets the method to Review, suggests a result from the coverage share (80% or more pass, 50% or more partial), fills the note with the run id, date, project and coverage, and records the project id. Only the totals the program keeps are used.
- **Copy.** The screens, the guide and the debrief say that the evidence for the format is thin.

## Open questions

1. **Should the model write hints at run time when an answer goes off in an unexpected direction?** Recommendation: no for 0.8.0. Prewritten, reviewed hints are predictable on small local models; the follow-up question already covers unexpected answers.
2. **Fading key: participant label or person?** Recommendation: participant label on this computer, plus an optional local "learner" profile later. Labels avoid storing identities by default.
3. **Count drills toward exercise coverage in #438?** Recommendation: show them as a separate "Practised" column. HSEEP exercises and drills test different things, and mixing them would overstate coverage.
4. **Where do drills live in the UI: inside Facilitate or as their own screen?** Recommendation: their own "Drills" screen; Facilitate stays focused on the full exercise.
