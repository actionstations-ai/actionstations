# Spec 0430: Branching scenarios decided by rules

Issue: #430 · Milestone: 0.8.0 · Status: Draft · Depends on: #414 (decision-point voting), #417 (session log) · Related: #421 (expected actions), #423 (grounding labels), #431 (drills reuse the run path)

## Summary

A scenario can carry branches: at a decision-point row the MSEL forks into two or more labelled paths that later rejoin the trunk or end the exercise. During Facilitate, which branch plays is decided by a rule applied to the players' vote (#414) or by the controller, never by a model. A model may propose the next inject for a branch, but the controller accepts or rejects it, and a pure function computes the session state from the recorded decisions, so a seeded JSONL log (#417) replays the run exactly. The editor shows branches as indented lanes under their decision row, lint catches unreachable and dead-end branches, and the MSEL exports stay readable both as a full branched document and as a linear path.

Research behind the rules-decide design: LLM agents in simulated crises escalate unpredictably and react to wording rather than substance (Rivera et al., "Escalation Risks from Language Models in Military and Diplomatic Decision-Making", FAccT 2024; Lamparth et al., "Human vs. Machine: Behavioral Differences Between Expert Humans and Language Models in Wargame Simulations", AIES 2024). The open-source "casus" wargame engine pattern is adopted: models decide nothing about state; pure functions compute state; the transcript is a JSONL file that replays bit-for-bit.

## Requirements

### User stories

- As an exercise designer, I want a decision point ("pay the ransom or rebuild?") to lead to different injects depending on what the room decides, so that players feel consequences instead of hearing "let's assume you rebuilt".
- As a designer, I want to write or generate the rows of each branch in the same MSEL grid, see which rows belong to which branch, and be told when a branch cannot be reached or never ends.
- As a facilitator, I want the branch chosen by the vote result under a rule I set in advance (plurality, majority, controller decides), shown on the presentation screen, so that the choice is defensible and the same in every run with the same inputs.
- As a facilitator, I want to override the rule when the room's discussion deserves it, with the override recorded.
- As a facilitator in a branch nobody wrote enough injects for, I want the model to propose the next inject from the plan context, and to accept, edit or reject it before anything is delivered.
- As an evaluator writing the AAR (#419), I want the log to say which decisions were made, by which rule and inputs, and which path was played.
- As a facilitator who prints, I want a PDF or Excel MSEL where branches are clearly marked and a linear MSEL of the path we played (or of the default path before the exercise).

### Functional requirements

- **FR-1** `Scenario` gains `branches: Branch[]`; `MselRow` gains optional `branchId` (absent = trunk) and optional `decision: Decision` (only meaningful on a row whose `purposeTag` is `DECISION_POINT`). A scenario without branches is byte-identical to today's after a save.
- **FR-2** A `Decision` names a question, 2–6 options, a rule, a default option and an optional timeout. Each option points to a branch id or to "continue on trunk".
- **FR-3** A `Branch` names its decision and option, has a label, and either a `rejoinRowId` (a trunk or ancestor-branch row at which play continues) or ends the exercise (its last row is an ENDEX card).
- **FR-4** Rules: `plurality` (most votes; tie → default), `majority` (option with more than half of votes cast; else default), `threshold` (named option when its share ≥ `minShare`; else default), `controller` (the controller picks; the vote, if any, is advisory), `unanimous` (all cast votes agree; else default). The rule evaluator is a pure function with no randomness; tie-breaking is always the default option.
- **FR-5** A decision opens when the facilitator delivers its row. It closes by the facilitator pressing "Decide" (applies the rule to the vote tally from #414, or the controller's choice), or by timeout (applies the rule to the tally so far). Every decision records `{ rule, input, chosen, by: 'vote'|'controller'|'timeout'|'override', at }`.
- **FR-6** The facilitator may override a closed decision before the first row of the chosen branch is delivered; the override is logged with a required note; the earlier decision record is kept.
- **FR-7** The active path (rows that can be delivered) is `activePath(scenario, decisions)`: trunk rows plus rows of chosen branches, in time order, cut at an open decision. Rows of unchosen branches are shown dimmed and cannot be delivered; a "Skipped (branch not taken)" marker appears in the timeline.
- **FR-8** `facilitator.json` gains `branching: { seed, decisions }`. The seed is a ULID generated when the session starts and is written in the `session.start` log entry; no computation in this spec uses randomness, so the seed exists for #414/#417 features that do (randomized option order on the player page, anonymous vote ids) and for replay fidelity.
- **FR-9** Replay: `replay(scenario, events) → SessionState` is pure. A recorded session log (#417 JSONL) replayed against the same scenario yields a state whose canonical JSON hash equals the hash the app wrote when the session ended. "Replay check" in Facilitate runs this and reports a mismatch (the scenario changed since the run).
- **FR-10** Model proposals: "Propose next inject" in a branch calls `generate:propose-inject` with the active path, the decision, the branch's existing rows and retrieved plan sections; the result is a draft `MselRow` (plus `InjectTextOutput`) shown in a review card. Accept adds the row to the branch (`locked: false`, provenance stage `branch_inject`); reject discards it. The log records the proposal hash and the verdict either way. No proposal is delivered without acceptance.
- **FR-11** Generation: a `branch_plan` stage (prompt `prompts/branch_plan.md`, schema `BranchPlanOutput`) drafts the rows of each option for a decision the designer marks "branch this"; rows pass the same deterministic repairs and lints as `msel_phase` rows (docs/04 §4a). The designer can also write branches by hand.
- **FR-12** Lint (`src/main/generate/lint-branches.ts`, run by `scenarios:lint`): `BRANCH_UNREACHABLE`, `BRANCH_DEAD_END`, `BRANCH_REJOIN_BACKWARD`, `BRANCH_CYCLE`, `DECISION_NO_DEFAULT`, `DECISION_OPTION_ORPHAN` (option names a missing branch), `DECISION_NOT_DECISION_POINT` (decision on a row with another tag), `BRANCH_EMPTY` (info: option continues on trunk with no rows), `BRANCH_ROLE_GAP` (warning: a role receives nothing for 30 minutes of a branch), `BRANCH_TIME_ORDER` (a branch row timed before its decision row or after its rejoin row).
- **FR-13** Editor: branch rows appear as an indented lane under their decision row with a coloured left bar and the branch label; a Branches panel lists decisions, options, rules and rejoin points; actions: "Branch this decision…", "Move rows to branch", "Set rejoin row", "Convert branch to trunk", "Delete branch (rows become trunk or are deleted — ask)". A path filter shows all / trunk only / one branch / default path.
- **FR-14** Exports. `msel_pdf`, `deck_pdf`, `exercise_plan_pdf`: trunk table per phase as today; a decision row shows its options with "→ Branch B1 Pay"; each branch prints as a shaded sub-table immediately after the phase containing its decision, titled "Branch B1 — Pay the ransom (rows I-12a…I-15a; rejoins at I-16)"; deck pages carry a "Branch B1" badge in the header. New `msel_xlsx` target (`exceljs`, already a dependency): sheet "MSEL" with a Branch column, one sheet per branch, a "Decisions" sheet. New `path_pdf` target: a linear MSEL of one path — the played path when a session exists (with a "Decisions taken" box), else the default path (with an "Alternatives" appendix listing the branches not on it).
- **FR-15** `scenario.md` / `scenario.json` exports include `branches` and `decision` fields; the markdown lists decisions and branches after the phases.
- **FR-16** Facilitate without #414 installed or without connected players still works: rule `controller` or the facilitator entering a tally by hand ("show of hands").

### Non-functional requirements

- **NFR-1** Cost: nothing new leaves the machine; the only model calls are the designer's `branch_plan` and the facilitator's explicit "Propose next inject" (CONTRIBUTING, Project rules 1, 3, 4 — through `resolveTextProvider`).
- **NFR-2** Privacy: votes reach the log as #414 records them (anonymous by default); the decision record stores the tally, not voter identities, unless #414's "by role" option is on.
- **NFR-3** Accessibility: branch lanes are conveyed by text ("Branch B1", row group headers) and `aria-level`, not colour alone; the decision dialog is keyboard-complete; the presentation screen announces the chosen option.
- **NFR-4** Determinism: `decide`, `activePath`, `replay`, `lintBranches`, `pathOrder` are pure functions in `src/shared/branching/` with no I/O, so main, renderer and tests share them.
- **NFR-5** Performance: a scenario with 8 branches and 120 rows lints in under 50 ms; the grid keeps ADR-0017 windowing.

### Out of scope

- Probabilistic or model-adjudicated outcomes (a "dice roll" rule can be added later as a seeded pure function; not in 0.8.0).
- Branches that change roles, phases or the rubric (branches contain rows and injects only).
- Nested decisions deeper than three levels (lint `BRANCH_DEPTH` as info at depth 4+; nothing prevents it).
- Merging two branches into a third (a branch rejoins the trunk or an ancestor branch only).

## Design

### Graph model

The MSEL stays an ordered array (`scenario.msel`) so every existing editor, repair and export keeps working. Branch membership is a tag on the row. The graph is derived:

```
trunk:   START … I-10 [D1: pay or rebuild?] I-16 … END
                   ├── B1 "Pay":     I-11a I-12a I-13a  → rejoin I-16
                   └── B2 "Rebuild": I-11b [D2: notify public now?] I-14b → rejoin I-16
                                       ├── B3 "Now":   I-12b  → rejoin I-14b
                                       └── B4 "Later": (no rows) → continue B2
```

Rules the lint enforces: a branch's decision row lies on the trunk or on an ancestor branch; `rejoinRowId` is a row on the trunk or an ancestor branch with `time` ≥ the branch's last row; following rejoin pointers never visits a branch twice; every branch without a rejoin ends with an ENDEX-tagged row.

### Schemas — `src/shared/schemas/scenario.ts`

```ts
export const BranchRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plurality') }),
  z.object({ kind: z.literal('majority') }),
  z.object({ kind: z.literal('threshold'), optionId: Id, minShare: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('controller') }),
  z.object({ kind: z.literal('unanimous') }),
])
export const DecisionOption = z.object({
  id: Id, label: z.string().min(1).max(80), description: z.string().default(''),
  /** Branch that plays when chosen; absent = continue on the current path. */
  branchId: Id.optional(),
})
/**
 * Extends the `MselRow.decision` that 0414 introduces ({ question, options: string[], mode }).
 * A preprocess accepts that shape: each string becomes { id: slug(label), label }, `rule`
 * defaults to plurality and `defaultOptionId` to the first option, so a 0.6/0.7 scenario
 * opens unchanged and 0414's VoteDefinition is built from `options.map(o => o.label)`.
 */
export const Decision = z.preprocess(fromVoteOnlyDecision, z.object({
  id: Id,
  question: z.string().min(1),
  options: z.array(DecisionOption).min(2).max(8),
  mode: z.enum(['anonymous', 'by_role']).default('anonymous'),      // 0414
  rule: BranchRule.default({ kind: 'plurality' }),
  defaultOptionId: Id,
  /** Minutes of exercise clock after the row is delivered; absent = no timeout. */
  timeoutMin: z.number().int().positive().optional(),
  /** Which roles' votes count (#414 scope); empty = everyone in the room. */
  votingRoleIds: z.array(Id).default([]),
}))
export const Branch = z.object({
  id: Id, label: z.string().min(1).max(80),
  decisionId: Id, optionId: Id,
  rejoinRowId: z.string().optional(),      // MselRow.id; absent = branch ends the exercise
  /** Designer's note on what this branch teaches. */
  rationale: z.string().default(''),
})
// MselRow additions
branchId: Id.optional(),
decision: Decision.optional(),
// Scenario additions
branches: z.array(Branch).default([]),
```

`SCENARIO_FORMAT_VERSION` becomes 2 and is written only when `branches.length > 0`; a scenario without branches is still written as version 1 so builds from 0.5–0.7 open it. A 0.7 build opening a version-2 file gets the existing "newer format" refusal, which is the right outcome: it would otherwise show every branch as trunk rows and a facilitator could deliver both sides of a decision.

### Session state — `src/shared/ipc/facilitator.ts`

```ts
export const DecisionRecord = z.object({
  decisionId: Id, optionId: Id,
  by: z.enum(['vote', 'controller', 'timeout', 'override']),
  rule: BranchRule,
  /** The 0414 vote this was decided from, when there was one. */
  voteId: Id.optional(),
  /** Tally by option id as the rule saw it (folded from 0414's `vote.close` tally array, or entered by hand). */
  input: z.object({ tally: z.record(Id, z.number().int().nonnegative()), cast: z.number().int(), eligible: z.number().int().optional() }),
  at: IsoDateTime, exerciseTime: ExerciseTime,
  note: z.string().default(''),
  /** The record this one replaced (override). */
  supersedes: Id.optional(),
})
// FacilitatorState additions
branching: z.object({
  seed: Id.optional(),
  decisions: z.array(DecisionRecord).default([]),
  /** Proposals seen this session: hash → verdict, so a repeated proposal is not re-shown. */
  proposals: z.array(z.object({ hash: z.string(), rowId: z.string().optional(), verdict: z.enum(['accepted', 'rejected']), at: IsoDateTime })).default([]),
}).default({ decisions: [], proposals: [] }),
```

### Pure functions — `src/shared/branching/`

| File              | Exports                                                                                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph.ts`        | `buildGraph(scenario)` → `{ trunk: MselRow[], branches: Map<id, { branch, rows: MselRow[], parent?: id }>, decisions: Map<id, { row, decision }> }`; `ancestors(branchId)`; `pathOrder(scenario, chosen: Map<decisionId, optionId>)` → ordered rows of that path (used by exports and Facilitate). |
| `decide.ts`       | `decide(decision, input: { tally, cast }, controllerChoice?) → { optionId, by }` — the rule table from FR-4.                                                                                                                                                                                       |
| `active-path.ts`  | `activePath(scenario, decisions: DecisionRecord[]) → { rows: MselRow[], openDecision?: Decision, skipped: Set<rowId> }`. Effective decisions = latest record per decision id.                                                                                                                      |
| `replay.ts`       | `replay(scenario, entries: SessionLogEntry[]) → SessionState` folding `decision.close`, `decision.override`, `inject.release` (0412), `proposal.accept`; `stateHash(state)` = sha256 of canonical JSON (sorted keys).                                                                              |
| `lint.ts`         | `lintBranches(scenario) → LintWarning[]` (FR-12).                                                                                                                                                                                                                                                  |
| `default-path.ts` | `defaultDecisions(scenario)` → every decision resolved to its default option.                                                                                                                                                                                                                      |

`src/main/generate/lint.ts` calls `lintBranches` and merges its warnings; `src/main/generate/repair-msel.ts` treats rows of a branch as their own window (re-timing stays between the decision row's time and the rejoin row's time; ENDEX-last applies per terminal branch).

### Session log entries (#417 contract)

The log is `scenarios/<scenarioId>/live/<sessionId>/log.jsonl` (0417/0418), written by `src/main/live/log.ts`; `SessionLogEntry` in `src/shared/schemas/live.ts` gains these entry types (naming follows `session.start`, `vote.open`, `vote.close`):

```
session.start        gains { seed, scenarioHash }
vote.open / vote.cast / vote.close   (0414; vote.close carries { voteId, tally: [{ optionId, count }], voted, eligible })
decision.open        { decisionId, rowId, exerciseTime }
decision.close       DecisionRecord                      // tally folded from vote.close, or hand-entered
decision.override    DecisionRecord (supersedes set, note required)
proposal.offer       { hash, branchId, decisionId, provider, model, promptHash }   // no prompt text
proposal.accept      { hash, rowId }
proposal.reject      { hash }
session.end          gains { stateHash }
```

A decision can be made without a live session (controller choice or a hand-entered tally): the entries then go to a local-only session the facilitator state opens for the run (0417's log store without a transport), so replay works the same way. `scenarioHash` is sha256 of `scenario.json` with `updatedAt`, `warnings` and `provenance` removed; replay check compares it first and says "the scenario changed after this run" when it differs. 0414's "Record as decision" note on the row stays as it is; this spec adds the structured record beside it.

### Generation

- Stage `branch_plan` (added to `STAGES`, `STAGE_OUTPUT_SCHEMAS`, `src/main/generate/scenario-jobs.ts`): input = the decision row, its options, the phase goal and beats, the trunk rows after the decision up to the proposed rejoin, retrieved plan sections for each option's consequence ("procedure after paying a ransom", "rebuild from backups verification"). Output:

```ts
export const BranchPlanOutput = z.object({
  branches: z
    .array(
      z.object({
        optionLabel: z.string(),
        label: z.string(),
        rationale: z.string(),
        rows: z.array(MselRowOutput).min(0).max(8),
        rejoinRowId: z.string().optional(), // trunk row id, or omitted to end with ENDEX
      }),
    )
    .min(1),
})
```

The engine assigns branch ids, sets `branchId` on each row, suffixes row ids with the branch letter (`I-11a`), validates `rejoinRowId` exists on the trunk after the decision (else repair round), runs §4a repairs and the lints, and marks the stage in `provenance`. Available as `generate:rerun-stage` with `stage: 'branch_plan', itemId: <decisionId>`.

- `generate:propose-inject` (new channel in `src/shared/ipc/generate.ts`): `{ projectPath, scenarioId, branchId, afterRowId? }` → `{ jobId }`; result `{ row: MselRow, inject?: InjectTextOutput, hash }` where `hash` = sha256 of the row's event + expectedAction + format. Prompt `prompts/branch_inject.md` (`outputSchema: MselPhaseOutput`, one row asked). The job runs under the scenario's job lock like `generate:injects` so an editor save cannot race it. Accepting is a `scenarios:save` from the renderer plus `facilitator:state-save` with the proposal verdict; the main side never mutates the scenario from the proposal.

- Grounding (#423): the proposal card shows the grounding label of the proposed row; `unsupported` rows show a red label and "Accept anyway" instead of "Accept".

### Facilitate changes — `src/renderer/src/routes/facilitate/`

- `Timeline.tsx` reads `activePath` instead of `scenario.msel`; rows of unchosen branches render dimmed with "not taken"; the open decision renders a barrier row.
- New `DecisionPanel.tsx`, shown in the **Votes** tab of the side panel (0418) under 0414's `VotePanel` for the open decision: options with their branches, live tally (0414's `live:votes` or a hand-entered tally), rule, countdown when `timeoutMin` is set, buttons "Decide by rule", "Controller chooses…", and after closing "Override…" (until the first branch row is delivered). Writes `decision.close` through the 0417 log store and updates `facilitator.json`.
- `use-delivery-actions.ts`: delivering a decision row appends `decision.open`; delivering a row not on the active path is refused in the UI.
- New `ProposeInjectCard.tsx` (FR-10) with the review card and grounding label.
- Presentation window: `PresentTarget` (0418, `src/main/facilitator/present.ts`) gains `{ kind: 'decision', decisionId }` → `/present/<key>/<scenario>/decision/<decisionId>`, a view showing the question, the options and, when closed, the chosen option and rule ("Chosen by majority: 7 of 11"); 0414's `vote` view stays for votes that are not branch decisions.
- "Replay check" button in `HotWashPanel.tsx`: runs `replay` against the stored log and shows "matches" or the first diverging event.

```
┌ Facilitate — Flight to Nowhere ───────────────────────────── 1:42 ▶ ┐
│ 1:30  I-10  DECISION  Pay the ransom or rebuild from backups?        │
│       ┌ Decision D1 ── rule: majority · default: Rebuild ──────────┐ │
│       │ ● Pay      ███████ 4                                      │ │
│       │ ● Rebuild  ████████████ 7      11 of 12 voted · 2:10 left │ │
│       │ [Decide by rule]  [Controller chooses ▾]  [Enter tally…]  │ │
│       └───────────────────────────────────────────────────────────┘ │
│ 1:40  I-11a ░ Branch B1 Pay — not taken                             │
│ 1:40  I-11b ▌Branch B2 Rebuild  Vendor says backups are 9 days old   │
│ 1:55  I-12b ▌Branch B2          ...                                  │
│ 2:05  I-16  CORE  Restoration claim (trunk resumes)                  │
│                                           [Propose next inject (B2)] │
└──────────────────────────────────────────────────────────────────────┘
```

### Editor changes — `src/renderer/src/editors/msel/`

- `model.ts` / `use-grid-state.ts`: rows grouped by `branchId`; a branch lane is inserted after its decision row (not by time) so the reader follows the fork; inside a lane rows keep time order.
- `MselRowView.tsx`: left bar + "B1" chip from `TagChip`; the decision row shows an options summary cell ("Pay → B1 · Rebuild → B2 · rule: majority").
- New `BranchesPanel.tsx` (side panel, replaces nothing): list of decisions and branches with rules, rejoin pickers and the actions in FR-13; `DecisionDialog.tsx` edits a decision; `operations.ts` gains `moveRowsToBranch`, `setRejoin`, `flattenBranch`, `deleteBranch`.
- `MselToolbar.tsx`: path filter `All | Trunk | B1 | B2 | Default path`; "Generate branches" for the selected decision row (runs `branch_plan`).
- `LintBar.tsx`: the new codes with "Go to row" like the existing ones.

```
┌ MSEL ─ Phase 3: Manual Mode ──────────────────── Path: [All ▾]  [Branches] ┐
│ Time  ID     From        To     Event                       Expected action │
│ 1:30  I-10   CISO        All    DECISION Pay or rebuild?    Decide; cite…   │
│              options: Pay → B1 · Rebuild → B2 · rule: majority · default B2 │
│   ▌B1 Pay the ransom ─────────────────────────── rejoins I-16 ──────────── │
│   ▌1:40  I-11a  Negotiator  IT    Wallet address and a 48 h… Legal review… │
│   ▌1:55  I-12a  FBI         IC    Agent asks for the PCAP…  Preserve…      │
│   ▌B2 Rebuild from backups ───────────────────── rejoins I-16 ──────────── │
│   ▌1:40  I-11b  Vendor      IT    Latest clean backup is…   Verify per…    │
│   ▌1:50  I-11c  Ops         IC    DECISION Notify public now? (D2)          │
│   ▌   ▌B3 Now … rejoins I-14b                                               │
│ 2:05  I-16   SimCell     All    Restoration claim…          Verification…  │
└──────────────────────────────────────────────────────────────────────────── ┘
 Branches panel: D1 Pay or rebuild? [majority ▾] default [Rebuild ▾] timeout [10] min
   B1 Pay (2 rows) rejoin [I-16 ▾]  B2 Rebuild (3 rows, 1 decision) rejoin [I-16 ▾]
   ⚠ BRANCH_ROLE_GAP: PIO receives nothing in B1 (25 min)
```

### Export changes — `src/main/export/`

- `documents.ts` (`buildDocumentHtml` for `msel`, `exercise_plan`): uses `buildGraph`; per phase, the trunk table then one sub-table per branch whose decision row is in that phase (recursively for nested branches), with the title line from FR-14; `templates/export/msel.html` gains `.branch` styles (shaded, 1 cm indent, label row). Decision rows render options as a bulleted cell.
- `deck`: injects ordered by `pathOrder` of the trunk followed by branches in editor order; header badge "Branch B1 — Pay".
- New `xlsx.ts`: `mselWorkbook(model)` with `exceljs`; target `msel_xlsx` in `EXPORT_TARGETS`, `ORDER`, `TARGET_LABELS`, `documentFileNames` (`<Title>-S<n>-MSEL.xlsx`); ZIP includes it under `facilitator/`.
- New target `path_pdf` and `documents.ts` doc `path`: linear rows from `pathOrder(scenario, playedOrDefault)`; a "Decisions taken" table (decision, chosen option, rule, tally, time) when a session exists, else an "Alternatives not on this path" appendix listing each branch with its row id range. `export:run` gains optional `sessionId` to select the played path.
- `manifest.ts`: `scenario.md` prints a "Decisions and branches" section after the phases.

### Migration of existing projects

- Scenarios without branches: no change; format version stays 1 on save.
- `facilitator.json` gains `branching` with defaults on first read (`FacilitatorState.parse` fills it).
- Rows with 0414's `decision: { question, options: string[], mode }` are read through the preprocess (option ids from slugged labels, rule plurality, default first option) and written back in the richer shape on the next save; 0414's `VoteDefinition` builder reads `options.map(o => o.label)` so voting is unchanged.
- Older session logs (#417, before this spec) have no decision entries; replay produces the trunk-only state and the replay check reports "no decisions recorded".
- Projects duplicated or exported as examples carry branches; `scripts/make-example.mjs` needs no change beyond the lints running.

ADR when the work lands (next free number): `docs/adr/NNNN-branching-rules-decide.md` (branch tag on rows, rules as pure functions, model proposes only, JSONL replay).

## Security and privacy

- Model output never changes session state: proposals are drafts in a review card; decisions are computed from votes and controller input. This is the main mitigation against the escalation and wording-sensitivity findings cited above, and it is enforced structurally (no main-process code path writes a decision from a provider response).
- Proposal prompts contain plan excerpts and MSEL rows already in the project; they go only to the provider the project routes `draft` to (Project rules 3, 4). The log stores the proposal hash and provider/model names, not prompt text.
- Vote inputs come from #414 over the local network; this spec consumes a tally, never device identifiers.
- Branch ids and row ids are `SafeId`/row-id strings validated by zod; nothing in a branch becomes a file path except inject ids, which already are `SafeId`.
- Replay hashes use sha256 over canonical JSON; a mismatch is informational, not a security control.

## Testing

- Unit (`src/shared/branching/*.test.ts`): `decide` for every rule including ties, zero votes, a tally naming an unknown option (ignored), `threshold` at the boundary; `activePath` with nested branches, override, and an open decision; `pathOrder` for default and played paths; `replay` over a recorded fixture log equals the stored `stateHash`; `lintBranches` fixtures for each code; property test (fast-check is not a dependency — use a 500-case seeded loop) that `replay(events).hash` is stable under event re-serialization.
- Schema: version-1 scenario round-trips unchanged; a branched scenario writes version 2; a version-2 file refused by a mocked older `SCENARIO_FORMAT_VERSION`.
- Generation (`src/main/generate/engine.branches.test.ts`): `branch_plan` with the mock provider yields rows tagged to branches, ids suffixed, lints clean; a rejoin to a missing row triggers the repair round; `generate:propose-inject` returns a draft and does not touch `scenario.json`.
- Export (`src/main/export/documents.test.ts`, new `xlsx.test.ts`): branched MSEL HTML contains one sub-table per branch in the right phase; `msel_xlsx` has the expected sheets and Branch column (read back with `exceljs`); `path_pdf` HTML for the default path contains no branch rows not on it and lists alternatives.
- Renderer (`happy-dom`): lane grouping in `model.test.ts`; `BranchesPanel` rule and rejoin edits produce the expected scenario patch; `DecisionPanel` disables "Decide by rule" with no tally for `majority` and enables it for `controller`; "Override" disappears after the first branch row is delivered; `Timeline` dims not-taken rows and refuses delivery.
- e2e (`e2e/branching.spec.ts`): open example → add a decision with two branches in the editor → lint shows and clears a dead end after setting rejoin → Facilitate: deliver decision, enter a tally, decide, deliver a branch row, end session → replay check passes → export `msel_pdf`, `msel_xlsx`, `path_pdf` and assert files; a11y pass on the editor with branches and the decision panel.
- Live (`LIVE=1`): `branch_plan` against LM Studio on the NCIA example produces 2 branches with ≥ 2 rows each and no `BRANCH_*` errors.

## Tasks

1. **Schemas and pure graph** — `src/shared/schemas/scenario.ts` (Branch, Decision, row/scenario fields, format version 2 rule in `src/main/scenario/store.ts`), `src/shared/branching/{graph,decide,active-path,default-path}.ts`, tests, `docs/05-DATA-MODEL.md`.
2. **Lint and repairs** — `src/shared/branching/lint.ts`, `src/main/generate/lint.ts` (merge), `src/main/generate/repair-msel.ts` (branch windows), `src/shared/lint-messages.ts` (fix hints), tests.
3. **Session state and replay** — `src/shared/ipc/facilitator.ts` (`DecisionRecord`, `branching`), `src/shared/branching/replay.ts`, `src/shared/schemas/live.ts` (`SessionLogEntry` types above, agreed with 0417/0414), `src/main/live/log.ts` (append from the facilitator side, local-only session), `src/main/facilitator/state.ts` (seed on session start), tests.
4. **Editor lanes and panel** — `src/renderer/src/editors/msel/{model.ts,use-grid-state.ts,MselRowView.tsx,BranchesPanel.tsx,DecisionDialog.tsx,operations.ts,MselToolbar.tsx,LintBar.tsx,msel-editor.css}`, tests.
5. **Facilitate decisions** — `src/renderer/src/routes/facilitate/{Timeline.tsx,DecisionPanel.tsx,use-delivery-actions.ts,HotWashPanel.tsx}`, `routes/present/` decision view, `src/main/facilitator/present.ts` (decision payload), tests.
6. **Generation: branch_plan** — `prompts/branch_plan.md`, `src/shared/schemas/generation.ts` (`BranchPlanOutput`), `src/shared/schemas/scenario.ts` (`STAGES`), `src/main/generate/scenario-jobs.ts`, `src/main/generate/engine.ts` (stage wiring, id suffixing), `packs/bundled.json` (prompt in core pack), tests.
7. **Generation: propose inject** — `prompts/branch_inject.md`, `src/shared/ipc/generate.ts` (`generate:propose-inject`), `src/main/ipc/handlers/generate.ts`, `src/renderer/src/routes/facilitate/ProposeInjectCard.tsx`, grounding label hook (#423), tests.
8. **Exports** — `src/main/export/{documents.ts,xlsx.ts,run.ts,naming.ts,manifest.ts,zip.ts}`, `src/shared/ipc/export.ts` (`msel_xlsx`, `path_pdf`, `sessionId`), `templates/export/msel.html` branch styles, `src/renderer/src/routes/export/` target checkboxes, tests.
9. **e2e, guide, ADR** — `e2e/branching.spec.ts`, `e2e/a11y.spec.ts`, `docs/guides/facilitate.md` and `docs/guides/editing.md` sections with screenshots, `docs/04-TABLETOP-METHODOLOGY.md` §3 "Branches", `docs/adr/NNNN-branching-rules-decide.md`.

## Open questions

1. **Bump the scenario format for every scenario or only branched ones?** Recommendation: only branched ones (as designed). It keeps every existing project openable by older builds and still protects a branched scenario from being run flat.
2. **Should a vote with no players connected fall back to the default or block?** Recommendation: the "Decide by rule" button stays disabled until a tally exists; "Enter tally…" and "Controller chooses" are always available, so a room without devices is never stuck.
3. **Where does the branch lane sit in the grid: after the decision row (story order) or interleaved by time?** Recommendation: after the decision row, as drawn; time interleaving puts two realities side by side and is what the path filter is for.
4. **Allow a branch to rejoin a later phase?** Recommendation: yes, as long as the rejoin row is later in time; the export prints the branch in the phase of its decision and notes the rejoin phase.
5. **Should "Propose next inject" also be offered on the trunk?** Recommendation: no in 0.8.0. On the trunk the designer already wrote the rows; the feature exists for thin branches. Revisit if facilitators ask.
6. **0414 ships `MselRow.decision` with `options: string[]` in 0.6.0; this spec widens it.** Recommendation: land the preprocess in 0414's task 1 if the two are built close together (option objects from day one cost nothing); otherwise the preprocess here converts on read and no file is migrated.
