# Spec 0416: Live play: evaluator observation forms

Issue: #416 · Milestone: 0.6.0 · Status: Implemented (ADR-0054) · Depends on: #406, #407, #411, #421 (EEGs) · Related: #418, #412, #417, #419

## Summary

Evaluators join the live session in the evaluator seat and get an observation form built from the exercise's Exercise Evaluation Guides (#421): the critical tasks per Core Capability, each with its plan citation, rated met / partial / not met / not observed with a note and the exercise time, linked to the inject that triggered it. The form works offline and syncs when the connection returns. Observations go into the session log and into `scenarios/<id>/evaluation.json` (0421's record, `source: 'live'`), so the Facilitate Evaluate panel, the hot wash view by capability and the AAR/IP draft see them without reading the log.

## Requirements

### User stories

- As an evaluator, I want the critical tasks for the roles I watch on my tablet, with the plan section next to each, so that I rate what our procedures say instead of a generic checklist.
- As an evaluator, I want the tasks an inject should trigger highlighted when that inject is released, so that I know what to watch for in the next ten minutes.
- As an evaluator in a basement EOC with no signal, I want to keep rating and have it all arrive when I am back online, so that I never carry paper and a tablet.
- As a facilitator, I want to see which tasks nobody has observed yet, so that I can ask an evaluator to watch for them or add a probing question.
- As a participant, I want observations to be about roles and procedures, never about me by name, so that the exercise stays a safe place to fail.

### Functional requirements

- **FR-1** A client joins with `kind: 'evaluator'` (0411). The controller assigns an evaluator label (`Evaluator 1`, `Evaluator 2`, …; the `evaluator` field of 0421's `Observation`) and, at attribution `named`, keeps the display name beside it. The Live tab lets the facilitator set each evaluator's **watch list** (roles and capabilities) before or during the session; an evaluator may also pick it on the device, and the facilitator's choice wins.
- **FR-2** The controller sends the evaluator its **assignment** (requirement below, `eval.assign`): the EEG critical tasks (`{ id, capability, task, citation, expectedBy?, timing?, rowIds }` from `Scenario.evaluation.eegs`, through 0421's `evaluation:criteria` derivation so per-row expected-action criteria are included), the watch list, the evaluator label, and whether expected actions are shown. It is re-sent whenever the EEG or the watch list changes (idempotent by `assignmentId` plus `revision`).
- **FR-3** The form groups tasks by Core Capability, then by the task order in the EEG. Each task shows the text, the citation ("per TIRP 13.6"), the expected role (`expectedBy`), the timing when present, and the MSEL rows where it should be observed. Each task has a four-way rating control, a note (≤ 4000 characters), the exercise time (filled from the clock when the rating is set; editable), and a linked inject (auto-filled with the most recent released row among the task's `rowIds`; changeable).
- **FR-4** **Watch for** list. When an `inject.release` arrives (evaluators receive every release, 0412 FR-5), the tasks whose `rowIds` include the row move into a **Watch for** strip at the top with the row id and time ("I-06 at 1:15: 3 tasks to watch"), where they stay until rated or dismissed. The strip is a live region announcement, once per release.
- **FR-5** Filters: **My watch list** (default; roles and capabilities assigned), **All tasks**, **Unrated**, **Due now** (the strip). A count per capability shows rated / total.
- **FR-6** General observations: **Add observation** without a task (a strength or an area for improvement the EEG did not anticipate), with a note, exercise time, optional linked row and optional capability. These are 0421 `Observation`s with no `taskId` and `kind: 'note'` (requirement below).
- **FR-7** Every save (first rating or any edit) sends `eval.observation` with the same `observationId` and an incremented `revision`; the controller keeps the highest revision, logs every revision, and upserts the latest into `evaluation.json` through 0421's store (`source: 'live'`, `evaluator` label, `exerciseTime`, `rowId`, `taskId` or `criterionId`). Offline, observations queue in IndexedDB and send in order on reconnect (0411 `queue.ts`); the form shows "3 observations waiting to send".
- **FR-8** The Facilitate **Evaluate** panel (0421's `EvaluatePanel.tsx`) gains a **Live observations** section: a coverage matrix (task × evaluator, cells colored and labelled by rating), a stream of the latest observations with evaluator label, task, rating, note and time, filters by capability and evaluator, and **Ask to watch** (sends a `controller.notice` to that evaluator's client: "Please watch for T-04 at the next inject"). The facilitator's own ratings from 0421 and the live ones sit in one list, distinguished by `source`.
- **FR-9** The dashboard (0417) shows observations count, coverage percentage (tasks with at least one rating other than `not_observed`), and per-evaluator counts.
- **FR-10** Non-attribution of players. The form's header says: "Observations are about roles and procedures. Do not write names." Notes are free text, so this is a rule, not an enforcement; the AAR prompt (0419) also receives role labels only. Evaluator identity follows the session's attribution level (FR-1).
- **FR-11** Paper fallback. Evaluators without a device use 0421's EEG packet PDF and the facilitator types the results into the Evaluate panel after the exercise; both paths end in `evaluation.json`.
- **FR-12** After `session.end` the form stays readable on the device (not editable), so an evaluator can finish notes from memory on paper; the device drops the data when the tab closes.

### Non-functional requirements

- **NFR-1** Cost: none. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: observations are end-to-end encrypted (0406); the assignment contains EEG text and citations (the organization's plan sections) and goes only to evaluator clients (`client:<id>`), never to players; `expectedAction` text reaches evaluators only when the facilitator turns it on. (Project rules 3.)
- **NFR-3** Accessibility: the rating control is a radio group with four 44 px targets and text labels (no color-only ratings: met, partial, not met, not observed each have an icon and a word); grouping by capability uses headings; the **Watch for** strip is an `aria-live="polite"` region; the form works at 320 px wide (phones) and is laid out two-column from 768 px (tablets, the usual evaluator device); 200 % zoom without clipping.
- **NFR-4** Performance: an EEG of 8 capabilities × 8 tasks (64 tasks) plus per-row criteria for 28 rows renders and filters instantly on a mid-range tablet; the assignment payload stays under the relay's 64 KiB envelope cap (long citations are truncated to 200 characters with the heading path kept; the full citation is in the EEG PDF).
- **NFR-5** Offline: at least two hours of offline rating (hundreds of observations) fit the outbox; sending preserves revision order; a reconnect never duplicates an observation.

### Out of scope

- Scoring people or teams; percentages of tasks met appear only as counts (0421).
- Evaluator chat with the facilitator beyond the controller notice (evaluators can use 0413's messages if the facilitator opens a thread to their client).
- Editing the EEG from the device.

## Design

### Flow

```
join {kind:'evaluator'} ─► roster assigns label ─► welcome ─► eval.assign {tasks, watch, label, showExpected} to client:<id>
inject.release (copy to role:evaluators, 0412) ─► device: Watch-for strip for tasks whose rowIds include the row
evaluator rates ─► eval.observation {observationId, revision:1, taskId, rating, notes, exerciseTime, observedAt, mselRowId}
                   (offline: IndexedDB outbox; on reconnect, in order)
controller ◄── evaluation.ts: validate evaluator seat, highest revision wins, log eval.observation, upsert into
               evaluation.json (0421 store, source:'live'), emit live:changed {what:'eval'}
Evaluate panel ◄── evaluation:get (0421) + live:eval-coverage
```

### Main process

`src/main/live/evaluation.ts`

```ts
assignmentFor(root, scenario, evaluator): Assignment     // 0421 evaluation:criteria + Scenario.evaluation.eegs, watch list, label
sendAssignment(state, clientId)                          // on join, on EEG change (project:changed scenario), on watch-list edit
onObservation(state, env)                                // seat check, revision rule, log, upsert through src/main/evaluation/store (0421)
setWatchList(state, clientRef, watch: { roleIds, capabilities })
coverage(state, scenario): CoverageView                   // task × evaluator matrix, counts, percent
```

`SessionState.evaluation: { evaluators: Map<clientRef, { label, watch, assignmentRevision }>, observations: Map<observationId, Observation & { revision }> }`.

Observations are written to `evaluation.json` through 0421's `evaluation/store.ts` upsert (serialized writes), so the Evaluate panel and the hot wash by-capability view (0421 FR-8) show live observations as they arrive, with no second path.

### Protocol use (0406 schemas; what this spec puts in them)

| Type                | Direction                      | How this spec uses the payload                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.observation`  | evaluator → controller         | `observationId`, `revision`, `taskId` (or `criterionId`, requirement), `rating`, `notes`, `exerciseTime`, `observedAt`, `injectId?`, `mselRowId?`                                                                                                                 |
| `eval.assign`       | controller → `client:<id>`     | **new signed type (requirement):** `assignmentId`, `revision`, `label`, `watch: { roleIds, capabilities }`, `showExpected`, `tasks: Array<{ id, capability, task, citation: { documentTitle, headingPath, page? }, expectedBy?, timing?, rowIds, criterionId? }>` |
| `controller.notice` | controller → `client:<id>`     | **Ask to watch** text to one evaluator                                                                                                                                                                                                                            |
| `inject.release`    | controller → `role:evaluators` | the evaluators' copy (0412 FR-5), with `expectedAction` when enabled                                                                                                                                                                                              |

Requirements for 0406 from this spec: one new signed type `eval.assign` (controller → client; ≤ 120 tasks, citations truncated so the payload fits the relay's 64 KiB envelope; stored so catch-up delivers it); `eval.observation` gains `kind: 'task' | 'note'` (default `task`), optional `criterionId: Text(140)` (0421's `${rowId}:expected` criteria), optional `capability: SafeId`, and `taskId` and `rating` become optional when `kind` is `note`. `welcome` cannot carry the assignment: it is per client, large, and must be re-sent when the EEG changes.

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:eval-watch       { projectPath, scenarioId, clientRef, watch: { roleIds: string[], capabilities: string[] } } → void
live:eval-coverage    { projectPath, scenarioId, sessionId? }   → CoverageView   (matrix, counts, percent; past sessions from the log)
live:eval-ask         { projectPath, scenarioId, clientRef, text } → void
live:eval-show-expected { projectPath, scenarioId, on: boolean }  → void          (re-sends assignments)
```

Observations themselves are read through 0421's `evaluation:get`; this spec adds no second read path.

### Renderer

- `src/renderer/src/routes/facilitate/EvaluatePanel.tsx` (0421) gains `LiveObservations.tsx` (coverage matrix, stream, filters, **Ask to watch**) and the evaluators' watch-list editor is in the Live tab's roster row for an evaluator (`RosterList.tsx`, 0411).
- `src/player/features/evaluate/`: `EvaluateScreen.tsx` (filters, capability groups), `TaskCard.tsx` (rating radio group, note, time, linked row), `WatchForStrip.tsx`, `GeneralObservation.tsx`, `assignment.ts` (apply `eval.assign` by revision), `observations.ts` (local store keyed by `observationId`, revision counter, outbox).

### Wireframes

Evaluator form (tablet, two columns; collapses to one on a phone):

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ● 1:17  Flight to Nowhere · Evaluator 2 (watching: IT Director, PIO)   ⚙     │
│ Observations are about roles and procedures. Do not write names.             │
├───────────────────────────────────────────────────────────────────────────────┤
│ Watch for · I-06 at 1:15: 3 tasks                                   [dismiss] │
│  T-04 Verify FIDS data against AODB before trusting it (TIRP 13.6)  [rate]    │
│  T-05 Notify airlines of display outage within 15 min (AEP App. 6)  [rate]    │
│  I-06:expected  Ops opens TIRP 13.6 checklist                       [rate]    │
├───────────────────────────────────────────────────────────────────────────────┤
│ [My watch list ▾] [Unrated] [Due now]            Cybersecurity 2/6 · PIW 1/4  │
│                                                                               │
│ Cybersecurity (Core Capability)                                               │
│ ┌ T-03  IT isolates the affected VLAN per ASP 6.4 (expected by IT) ────────┐ │
│ │ Rows I-08, I-10 · per ASP › 6.4 Code Black protocol, p. 41                │ │
│ │ ( ) Met  (•) Partial  ( ) Not met  ( ) Not observed                       │ │
│ │ Note [IT isolated PACS VLAN but left BHS on the same segment…          ] │ │
│ │ Time [1:12]  Inject [I-08 ▾]                              saved · sent ✓  │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│ ┌ T-04  Verify FIDS data against AODB before trusting it ───────────────────┐ │
│ │ …                                                                         │ │
│                                                                               │
│ [+ Add observation not tied to a task]              3 observations waiting ⟳  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Facilitate Evaluate panel, Live observations section:

```
┌ Live observations ──────────────────────────────────────────────┐
│ Coverage 9 of 22 tasks · 2 evaluators connected                 │
│            Ev.1   Ev.2                                           │
│ T-01 OC     M      —      T-05 PIW   —      P                    │
│ T-02 OC     P      —      T-06 PIW   —      —   [Ask Ev.2 ▾]     │
│ T-03 CS     —      P      …                                      │
│ Latest                                                           │
│ 1:12  Ev.2  T-03 Partial  "IT isolated PACS VLAN but left BHS…"  │
│ 1:09  Ev.1  T-01 Met      "IC declared at 1:05 per AEP 2.3"      │
│ Filter: [All capabilities ▾] [All evaluators ▾] [Live only]      │
└──────────────────────────────────────────────────────────────────┘
```

### Data model

`src/shared/schemas/live.ts`: `Assignment`, `EvaluatorWatch`, `CoverageView`. Observations use 0421's `Observation` unchanged (`source: 'live'`, `evaluator` label). Log entries (0417): `eval.assign { clientRef, revision, taskCount, watch }`, `eval.observation` (0406 payload plus `evaluator`, `clientRef`, `displayName` at `named`), `eval.watch { clientRef, watch }`, `eval.ask { clientRef, text }`.

### Migrations

None. A scenario without `evaluation.eegs` gives evaluators only the per-row expected-action criteria (0421 FR-4) and a line "This scenario has no evaluation guides yet"; the facilitator can generate them from the Scenario page.

## Security and privacy

- Assignments (plan citations and expected actions) go to evaluator clients only, by `client:<id>`; an evaluator who is reseated as a player receives a `welcome` with the new seat and the device discards the assignment.
- Observations are accepted only from clients in the evaluator seat; others are dropped and counted as anomalies.
- The highest-revision rule is per `observationId` and per sender: a client cannot overwrite another evaluator's observation (ids are namespaced by `clientRef` on the controller).
- Evaluator identity: a label at level `role`; the display name only at `named`. Players' names never appear in the structured fields; notes are free text under FR-10's rule, and the AAR prompt strips any identity fields the record carries (0419 FR-10).
- `evaluation.json` stays inside the project folder like every other scenario file; the distribution ZIP never includes it in `players/` (0421).
- What leaves the computer: encrypted assignments and observations between the facilitator's app and evaluator devices, after Start.

## Testing

- **Unit:** `assignmentFor` (watch list filtering, per-row criteria included, citation truncation under the cap), revision rule (older revision ignored, equal ignored, newer wins), upsert into `evaluation.json` with `source: 'live'`, coverage computation, watch-for matching by `rowIds`; player `observations.ts` (outbox order, revision counter survives reload via IndexedDB), `assignment.ts` (apply by revision).
- **Integration:** fake transport, one controller, two evaluators and one player: assignments differ by watch list; a release puts tasks into the strip; ratings arrive and `evaluation.json` has them; an edit arrives as revision 2; an offline evaluator's ten observations arrive once and in order; a player's `eval.observation` is rejected.
- **e2e `e2e/live/evaluator.spec.ts`:** Scenario 3 fixture with 0421's hand-written `evaluation` block; one evaluator (iPad viewport) and two players; the evaluator sees capabilities and citations; deliver I-06; the **Watch for** strip lists T-04; rate Partial with a note; the Evaluate panel's matrix shows it under Ev.1; set the evaluator offline (`context.setOffline(true)`), rate three more tasks, back online, exactly three new lines in the log and `evaluation.json` has four `source: 'live'` observations; **Ask to watch** shows on the device; end the session, the form is read-only. Screenshots light and dark.
- **a11y:** the evaluator form (radio groups, headings, live strip, 200 % zoom, 320 px) and the Live observations section in `e2e/a11y.spec.ts`.

## Tasks

1. **Assignments and observations in main.** `src/main/live/evaluation.ts`, state, log entries, upsert through 0421's store, handlers for the channels above, evaluator labels in `roster.ts`. Tests: `evaluation.test.ts`, integration with the fake transport.
2. **Player evaluator feature.** `src/player/features/evaluate/*` (screen, task card, watch-for strip, general observation, assignment and observation stores with IndexedDB outbox). Tests: component tests, `observations.test.ts`.
3. **Facilitate Live observations.** `LiveObservations.tsx` inside `EvaluatePanel.tsx`, watch-list editor in `RosterList.tsx`, **Ask to watch**, **Show expected actions to evaluators** toggle in the Live tab. Tests: `EvaluatePanel.test.tsx` additions, `RosterList.test.tsx`.
4. **e2e and docs.** `e2e/live/evaluator.spec.ts`, a11y additions, `docs/guides/live-play.md` (evaluators: joining, watch lists, rating, offline), `docs/05-DATA-MODEL.md` log entries and the `source: 'live'` note.

## Open questions

1. **Where does the AAR read live observations from: `evaluation.json` or the log?** Recommendation: `evaluation.json` only (latest revisions, one schema), and 0419's `live-log.ts` adapter skips `eval.observation` entries when `evaluation.json` exists. The log keeps the revision history for audit. Needs 0419's writer to confirm.
2. **Should evaluators see players' messages (0413) for their watched roles?** Recommendation: not in 0.6.0; evaluators observe the room, and the log has the messages for the AAR. Reconsider for remote exercises where the evaluator is not in the room.
3. **Default for "show expected actions to evaluators".** Recommendation: on. The EEG's purpose is to compare what happened with what the plan expects; hiding the expectation makes rating guesswork.
4. **Evaluator labels across sessions.** Recommendation: labels restart per session (`Evaluator 1` is whoever joins first); the facilitator can rename a label in the roster row when they want "Evaluator — Ops table". Persistent evaluator identities would need accounts, which the product does not have.

## Implementation notes (as built)

- The assignment carries every task and the device filters by the watch list ("assignments differ" means the `watch` field differs); expected actions are included by default (open question 3) and the toggle re-sends.
- Per-row expected actions have task id `<rowId>_expected` and capability group `expected-actions`; stored with `criterionId: '<rowId>:expected'`.
- `Observation` gains optional `kind` and `capability`. The AAR record skips log observations once `evaluation.json` holds live ones (open question 1).
- `live:eval-coverage` reports the running session only (no `sessionId`); labels cannot be renamed (open question 4 left as recommended without rename).
- The `eval.assign`, `eval.observation` types and `welcome.features.eval` were already in the protocol; `features.eval` is now true.
- The Evaluation tab hosts `LiveObservations.tsx` (the spec's `EvaluatePanel.tsx` is `EvaluationTab.tsx`); the watch-list editor is in the Live tab (`LiveEvaluators.tsx`), as there is no roster list yet.
- General observations are editable after saving (#498): **Edit** reopens the form filled in and saves a new revision of the same `observationId`; task ratings are revised in place as before.
- Phone-width and axe checks run in `e2e/live/evaluator.spec.ts` (the repo's axe tool is Playwright-based), not in component tests.
