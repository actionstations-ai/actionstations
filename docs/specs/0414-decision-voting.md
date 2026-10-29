# Spec 0414: Live play: decision-point voting

Issue: #414 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #407, #411, 0418 task 2 (presentation views) · Related: #418, #417, #419

## Summary

At a decision point the facilitator opens a vote; players answer on their devices; the tally appears on the presentation screen as it comes in or when closed. Votes are anonymous by default and may be broken down by role when the facilitator chooses and the room is large enough for that not to identify anyone. Results go into the session log and become the AAR's decision record.

## Requirements

### User stories

- As a facilitator, I want to put "Shut down FIDS or keep it running?" to the room and see the split on the projector, so that the quiet half of the room is counted.
- As a player, I want to vote in one tap and change my mind until the vote closes, so that voting does not interrupt the discussion.
- As an exercise director, I want the recorded decision with its tally and time in the log, so that the AAR states what the group decided and how divided it was.
- As a participant in a non-attributional exercise, I want my ballot to be unlinkable to me, so that I vote what I think.

### Functional requirements

- **FR-1** A vote is 0406's `vote.open`: a question (≤ 300 characters in the UI; the schema allows 500), 2–8 options in the UI (schema: 10; ≤ 80 characters each), `anonymous` (true by default; false is the **by role** mode), `targets` (`all` by default, or a list of roles and teams), `allowChange` (default true), an optional `closesAt` countdown, and (requirements below) an optional rationale prompt so players may add ≤ 280 characters of reasoning, anonymous like the ballot.
- **FR-2** Votes come from two places: **pre-authored** on an MSEL row (`MselRow.decision?: { question, options[] }`, filled by the designer in the MSEL editor and, later, by the generator for DECISION_POINT rows) and **ad hoc** from the Votes tab. Opening a pre-authored vote from the Inject panel is one click.
- **FR-3** Opening a vote sends `vote.open` to the scope; every device in scope shows a banner and the vote screen; devices out of scope (and observers, evaluators) see "Vote in progress" in the feed without a ballot. Only one vote is open at a time per session.
- **FR-4** Players cast `vote.cast`; changing is allowed until close when `allowChange` is on. The device shows "Your vote is recorded" and, when the facilitator has enabled **live results on devices**, the tally.
- **FR-5** Closing (`vote.close`, by the facilitator or the countdown) freezes the tally; devices show the result; the presentation view shows the final result with "Closed at 2:14".
- **FR-6** Presentation view: question, bars per option with counts and percentages, "N of M voted" (M = connected clients in scope), status (open with elapsed time, or closed). In `by_role` mode, each bar is split by role with a legend. Font sizes for a projector; the same view works at 960 × 540 preview size.
- **FR-7** Anonymity. In anonymous mode the log stores the final tally per option and one `vote.cast` entry per ballot with option and time only (no role, no `clientRef`). Dedupe and change-of-vote use an in-memory map `clientRef → option` that is discarded at close. In by-role mode the entries carry the role; a role with fewer than 3 clients connected in scope is shown and logged as "Other" (k-anonymity guard, `k = 3`, configurable per session, never below 2), and `vote.close.byRole` carries folded counts per role and option, never one entry per ballot. The Votes tab warns before opening a by-role vote when any role in scope has fewer than `k` clients.
- **FR-8** Rationales, when enabled, are logged as separate anonymous entries (`vote.rationale` with option and text) and shown to the facilitator after close as a list per option; never attributed.
- **FR-9** Facilitate Votes tab: open a vote (form or pick a pre-authored one), live tally, countdown control, **Show on screen**, **Close**, **Reopen** (within 2 minutes of closing, logged), history of this session's votes with results.
- **FR-10** A vote's result can be **recorded as the decision** on the MSEL row it belongs to: this appends to `FacilitatorState.decisions` (0419's addition: `{ id, at, exerciseTime, rowId, text }` with text like "Shut down FIDS now (7 of 12), vote at 2:14") so the hot wash and the AAR see it without reading the log.
- **FR-11** Resume (0417): an open vote at the time of a crash is closed on replay with status `interrupted`; its tally is what the log holds. Ballots after a resume are not possible for that vote.

### Non-functional requirements

- **NFR-1** Cost: none. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: ballots are end-to-end encrypted (0406); the controller never writes a ballot-to-device link to disk; `by_role` is explicit and guarded. (Project rules 3.)
- **NFR-3** Accessibility: options are a radio group with 44 px targets and visible selection; the result bars have text equivalents (count and percent in the DOM, not only width); the presentation view has at least 4.5:1 contrast on bars and labels; countdown is announced at 30 s and 10 s via a live region, with no flashing.
- **NFR-4** Performance: a ballot updates the projector within 500 ms on LAN; 60 ballots in 5 s render without jank (tally updates are batched at 4 per second).
- **NFR-5** Offline: a ballot cast offline is queued and sent on reconnect; if the vote has closed meanwhile the device shows "The vote closed before your ballot arrived" and the ballot is not counted (logged as `late`).

### Out of scope

- Ranked-choice or multi-select votes (single choice only in 0.6.0).
- Weighted votes or facilitator veto; the tally is the tally.
- Votes outside a live session (paper ballots).

## Design

### Main process

`src/main/live/votes.ts`

```ts
openVote(state, def: VoteDefinition, opts: { rowId? }): Vote            // refuses when one is open
onBallot(state, env)                                                      // scope check, dedupe map, log, tally, emit
closeVote(state, reason: 'facilitator' | 'countdown' | 'interrupted')
reopenVote(state)                                                         // within 2 min
tally(vote, roster, k): TallyView                                         // k-anonymity folding for by-role
recordDecision(root, scenarioId, vote)                                    // FacilitatorState.decisions entry
```

`SessionState.votes: Vote[]` plus `openVote?: { vote, ballots: Map<clientRef, { option, at }> }` (the map is memory only).

### Protocol use (0406 schemas; what this spec puts in them)

| Type         | Direction            | How this spec uses the payload                                                                                                                                                                                                     |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vote.open`  | controller → targets | `voteId`, `question`, `options`, `anonymous`, `allowChange`, `closesAt`, `targets`; devices outside `targets` learn of the vote from the feed's `controller.notice` ("Vote in progress") rather than a ballot                      |
| `vote.cast`  | client → controller  | `voteId`, `optionId` (+ `rationale`, requirement below)                                                                                                                                                                            |
| `vote.close` | controller → all     | `voteId`, `results` (count per option), `byRole` (folded counts, by-role mode only), `reveal: true` when devices should show the result; `reveal: false` closes without showing (the facilitator reveals on the projector instead) |

Requirements for 0406 from this spec: `vote.open` gains optional `rationalePrompt: Text(200)`, optional `mselRowId: SafeId`, and optional `tally: Array<{ optionId, count }>` (a re-sent `vote.open` carries the live tally when the facilitator enabled **live results on devices**, at most 4/s; devices treat a repeated `voteId` as an update); `vote.cast` gains optional `rationale: Text(280)`; `vote.close` gains `status: 'closed' | 'interrupted'`, `voted: int`, `eligible: int`, and `byRole` becomes `Array<{ roleId: RoleId | 'other', optionId, count }>` (aggregated after k-folding) instead of one entry per ballot, since per-ballot roles would defeat FR-7.

### Scenario schema

`src/shared/schemas/scenario.ts` `MselRow` gains `decision: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(8), anonymous: z.boolean().default(true) }).optional()`. `Scenario` is a loose object and the field is optional, so `SCENARIO_FORMAT_VERSION` stays 1 and older files read unchanged. The MSEL editor shows a **Decision** section for DECISION_POINT rows (question and options); the export's MSEL and handbook print the options under the row ("Decision: … Options: …").

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:vote-open      { projectPath, scenarioId, definition: VoteDefinition, rowId? }  → Vote
live:vote-close     { projectPath, scenarioId, voteId }                              → Vote
live:vote-reopen    { projectPath, scenarioId, voteId }                              → Vote
live:votes          { projectPath, scenarioId }                                      → VoteView[]   (tally, status, rationales after close)
live:vote-record    { projectPath, scenarioId, voteId }                              → FacilitatorState
facilitator:present { …, view: { kind: 'vote', voteId } }                            (0418 task 2)
```

### Renderer

- `src/renderer/src/routes/facilitate/live/VotePanel.tsx` (form, pre-authored picker, live tally, controls, history), `VoteForm.tsx`, `TallyBars.tsx` (shared with the presentation view), the **Votes** tab in `SidePanel`; the Inject panel shows **Open vote** when the row has `decision`.
- `src/renderer/src/routes/present/PresentVote.tsx`: the projector view, subscribed to `live:changed { what: 'votes' }`, black background, large type, bars from tokens (`--color-accent` for the leading option, `--color-text-muted` for others, with labels, never color-only).
- `src/player/features/votes/`: `VoteBanner.tsx`, `VoteScreen.tsx` (radio group, rationale, change until close), `Result.tsx`.
- MSEL editor: `DecisionFields.tsx` in the row editor (`src/renderer/src/editors/msel/`).

### Wireframes

Player vote screen (phone):

```
┌──────────────────────────────┐
│ Decision point        2:12   │
│ I-14 · Vote closes in 1:30   │
├──────────────────────────────┤
│ Shut down FIDS and go manual,│
│ or keep it running?          │
│                              │
│ ( ) Shut down now, manual    │
│     boards and PA            │
│ (•) Keep running, verify     │
│     data every 15 min        │
│ ( ) Shut down after the      │
│     next bank of departures  │
│                              │
│ Why? (optional, anonymous)   │
│ [__________________________] │
│                              │
│ [        Cast vote         ] │
│ You can change your vote     │
│ until it closes.             │
└──────────────────────────────┘
```

Presentation view (projector):

```
┌──────────────────────────────────────────────────────────────┐
│  DECISION  I-14                              open · 0:48     │
│                                                              │
│  Shut down FIDS and go manual, or keep it running?           │
│                                                              │
│  Shut down now            ███████████████████   7   58 %     │
│  Keep running, verify     ████████             3   25 %      │
│  Shut down after bank     █████                2   17 %      │
│                                                              │
│  12 of 14 voted                                              │
└──────────────────────────────────────────────────────────────┘
```

Facilitate Votes tab:

```
┌ Votes ───────────────────────────────────────────────┐
│ Open a vote   [From MSEL row ▾ I-14] or [New vote]   │
│ Mode (•) Anonymous ( ) By role  ⚠ PIO has 2 devices  │
│ [x] Allow changing  [ ] Ask why  Countdown [2:00 ▾]  │
│ [x] Live results on devices                          │
│ [ Open vote ]                                         │
├──────────────────────────────────────────────────────┤
│ I-14 · open · 12 of 14      [Show on screen] [Close] │
│  Shut down now          7                            │
│  Keep running           3                            │
│  Shut down after bank   2                            │
├──────────────────────────────────────────────────────┤
│ Earlier: I-09 Declare incident? Yes 9 · No 4 · 1:31  │
│          [Record as decision on I-09]                │
└──────────────────────────────────────────────────────┘
```

### Data model

`src/shared/schemas/live.ts`: `VoteDefinition`, `Vote { voteId, rowId?, definition, openedAt, closedAt?, status, tally, voted, eligible, rationales? }`, `TallyView`. Log entries (0417): `vote.open`, `vote.cast { voteId, optionId, role? }` (role only in `by_role`, folded to "Other" under `k`), `vote.rationale { voteId, optionId, text }`, `vote.close { voteId, status, tally, voted, eligible }`, `vote.reopen`, `vote.recorded { voteId, rowId }`.

### Migrations

None; `decision` is optional on rows.

## Security and privacy

- Ballot-to-device links exist only in the controller's memory during an open vote; the log, exports and `live:votes` never carry `clientRef` for ballots.
- `by_role` is a facilitator decision with a warning; the `k` guard applies to both the display and the log, so a later reader of the log cannot learn more than the room saw.
- The controller accepts a ballot only from a seat in scope, once per client (last one wins when changes are allowed), and only while the vote is open; late and out-of-scope ballots are counted in the dashboard's anomaly count, not in the tally.
- Vote text on the projector is plain text.
- What leaves the computer: the encrypted vote and ballots between the facilitator's app and joined devices, after the facilitator opens the vote.

## Testing

- **Unit:** `tally` with k-anonymity folding (roles under k become "other", total preserved), dedupe and change-of-vote, target checks, countdown close, reopen window, `recordDecision` entry text; `MselRow.decision` schema round trip; `TallyBars` text equivalents.
- **Integration:** fake transport, six clients across three roles; anonymous vote with a change; `by_role` vote where one role has two clients (folded); late ballot after close is rejected and logged `late`; interrupted vote on replay.
- **e2e `e2e/live/votes.spec.ts`:** Scenario 3 example with a `decision` added to I-14 through `scenarios:save`; five players; open from the Inject panel; players vote (one changes), the presentation window shows the bars and "5 of 5 voted" with counts in the DOM; close; devices show the result; **Record as decision** appends to `FacilitatorState.decisions`; the log has five `vote.cast` lines with no role and a `vote.close` tally; a by-role vote shows the k warning and folds PIO (2 devices) into "other". Screenshots of the presentation view light and dark.
- **a11y:** vote screen (radio group semantics, countdown announcements) and the presentation view (contrast, text equivalents) in `e2e/a11y.spec.ts`.

## Tasks

1. **Schema and MSEL editor.** `MselRow.decision` in `src/shared/schemas/scenario.ts`, `DecisionFields.tsx` in the MSEL row editor, MSEL and handbook export lines. Tests: `schemas.test.ts`, editor test, export view test.
2. **Votes in main.** `src/main/live/votes.ts`, state, log entries, k-anonymity tally, handlers for the channels above. Tests: `votes.test.ts`, integration with the fake transport.
3. **Player vote feature.** `src/player/features/votes/*` (banner, screen, result, outbox for late ballots). Tests: component tests.
4. **Facilitate Votes tab and presentation view.** `VotePanel.tsx`, `VoteForm.tsx`, `TallyBars.tsx`, `PresentVote.tsx`, **Open vote** in `InjectPanel.tsx`, **Show on screen**. Tests: `VotePanel.test.tsx`, `PresentPage.test.tsx` addition.
5. **e2e and docs.** `e2e/live/votes.spec.ts`, a11y additions, `docs/guides/live-play.md` (decision points, anonymity and the k guard), `docs/04-TABLETOP-METHODOLOGY.md` (one paragraph: decision points can carry a vote), `docs/05-DATA-MODEL.md` (`decision`, log entries).

## Open questions

1. **Should the generator fill `decision` for DECISION_POINT rows?** Recommendation: yes, in 0421's prompt work (the `msel_phase` stage already writes the decision vocabulary); this spec only reads the field. File it as a sub-task of #421.
2. **Default `k` for the by-role guard.** Recommendation: 3. Two devices per role is common (a principal and a deputy), and 2 would make most rooms identifiable.
3. **Live results on devices: default on or off?** Recommendation: off. Seeing the tally before voting changes votes; the projector shows it when the facilitator chooses.
4. **Observers voting?** Recommendation: never. Observers watch.
