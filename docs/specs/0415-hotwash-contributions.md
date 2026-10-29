# Spec 0415: Live play: hot wash contributions from devices

Issue: #415 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #407, #411 · Related: #418, #417, #419, #425 (hot wash transcription), #421

## Summary

During the hot wash, participants add strengths, areas for improvement and answers to the debrief questions from their devices, anonymously if they choose. The facilitator sees them arrive on a board, groups related items, edits a typo, promotes the ones that matter, and shows the promoted board on the projector. Promoted items land in `facilitator.json` beside the facilitator's own 3-Up / 3-Down list, so the AAR/IP draft (#419) reads one list; everything else stays in the session log.

## Requirements

### User stories

- As a participant, I want to write down "the PIO had no number for the FBI liaison" from my phone, so that the loudest voice in the room is not the only one the AAR hears.
- As a participant in a non-attributional exercise, I want to post without my role attached when the point is about my own team, so that I say it instead of swallowing it.
- As a facilitator, I want to group six near-duplicates into one finding and promote it in two taps, so that the hot wash stays a discussion, not data entry.
- As an exercise director, I want the promoted items in the AAR draft and the raw items in the log, so that nothing is lost and the report is not a dump.

### Functional requirements

- **FR-1** The facilitator **opens the hot wash on devices** from the Hot wash tab (`controller.notice` `kind: 'hotwash.open'`; 0411's requirement). Every player device's **Hot wash** tab becomes active and shows the scenario's hot wash method and questions (`Scenario.hotwash`, sent in `welcome` so a late joiner has them, requirement below). **Close** (`kind: 'hotwash.close'`) makes the tab read-only. Opening before ENDEX is allowed (a mid-exercise pause is a valid hot wash moment).
- **FR-2** An item is 0406's `hotwash.item`: `kind` (`strength`, `improvement`, `other`, where `other` is used for answers to a specific question and free comments), `text` (1–2000 characters; the UI suggests under 280), `anonymous`, `objectiveId?`. This spec adds (requirements below) `questionId?` (which hot wash question it answers) and `mselRowId?` (the inject it is about, chosen from the player's inbox).
- **FR-3** Attribution. At session level `role`, an item carries the sender's role unless the player ticks **Post without my role** (`anonymous: true`), in which case the controller strips the seat before logging and broadcasting; the per-session `clientRef` is still logged so one device's items can be counted (never identified). At level `named`, the item carries the display name unless **Post anonymously** is ticked. The default of the checkbox is off; the label says exactly what will be shown.
- **FR-4** Moderation. By default items are **accepted automatically**: the controller re-broadcasts each item as `hotwash.update { action: 'accept', text, kind, roleId? }` so every device shows the shared board. The facilitator may switch the session to **Review before showing**; items then wait in an inbox and appear to the room only on **Accept**. `hide` removes an item from devices (and from the promoted board) without deleting it from the log; `restore` undoes.
- **FR-5** Upvotes. A player taps **+1** on another item (`hotwash.item` with `plusOneOf: itemId` and empty text, requirement below), once per item per device; the board sorts by votes within a column. Upvotes are always anonymous in the log.
- **FR-6** The facilitator's **Hot wash board** (Facilitate, a tab) shows columns Strengths · Improvements · Other, each item with kind, role or "anonymous", time, +1 count, linked inject, and the question it answers. Actions: **Group selected** (checkbox multi-select, then one button; drag-and-drop is an optional extra, never the only way, WCAG 2.5.7), **Ungroup**, **Label group**, **Edit text** (typo fixes; the original stays in the log), **Tag** (objective, capability from 0421 when present, inject), **Promote** / **Unpromote**, **Hide** / **Restore**. Every action is a `hotwash.update` to all devices (0406; `ungroup`, `unpromote` and `tag` are requirements below) and a log entry.
- **FR-7** Promote appends to `FacilitatorState.hotwash` (0419's field) one item `{ id: itemId or groupId, kind: 'up' | 'down' | 'other', text, objectiveRef?, rowId?, at }`, mapping strength → `up`, improvement → `down`, other → `other`. A promoted group uses its label as text, or the first item's text when unlabelled, with " (n contributions)" appended; the member items are listed in the log entry `hotwash.promoted`. Unpromote removes the entry. These items appear in the existing Hot wash tab under a **From devices** heading, editable there like the facilitator's own.
- **FR-8** The presentation window gets a **Hot wash** view (`facilitator:present` `view: { kind: 'hotwash' }`, extending 0418 task 2's union): promoted items only, two columns (Strengths, Improvements), other promoted items below, large type, no roles and no names.
- **FR-9** Players see the shared board (accepted items, grouped as the facilitator grouped them, with the facilitator's edits), their own items marked "yours", and promoted items with a mark. Players can delete their own item within 2 minutes of posting (sent as `hotwash.item` with `retractOf`, requirement below; the controller hides it and logs the retraction); after that only the facilitator hides.
- **FR-10** Everything is logged: `hotwash.item` (with the attribution rule of FR-3 applied), `hotwash.plus`, `hotwash.update` (every facilitator action with before and after text for edits), `hotwash.promoted`, `hotwash.open`, `hotwash.close`. The dashboard (0417) shows items, +1s and promoted counts; the AAR (0419) reads promoted items from `facilitator.json` and may list the remaining accepted items as "other contributions".
- **FR-11** A hot wash board from a past session is readable from the Facilitate **Sessions** list (0417) and from the Hot wash tab when the scenario has exactly one session: the same board component, read-only.

### Non-functional requirements

- **NFR-1** Cost: none. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: anonymous items are stripped of their seat on the controller before anything is logged or broadcast; a hidden item never reaches a device that joins later (the controller filters catch-up re-emits); the k-anonymity thinking of 0414 applies to attribution by role: when a role has one connected device, the join screen's statement already told the player that role-attributed posts identify them, and the checkbox is right there. (Project rules 3.)
- **NFR-3** Accessibility: the board columns are lists with headings; grouping and every action work with the keyboard and a screen reader (checkboxes plus buttons); new items are announced in one live region as a count ("3 new items"), not one by one; the composer has a visible label and character count; the presentation view has 4.5:1 contrast and no color-only meaning.
- **NFR-4** Performance: 60 devices posting within a minute (a realistic burst after "go") render without jank on the board (batched state updates, windowed columns above 100 items).
- **NFR-5** Offline: items and +1s queue in the device outbox and send on reconnect; a retraction of an item that was already promoted is refused with a plain message.

### Out of scope

- Voice capture of the hot wash (#425).
- Free-form canvases or sticky-note positioning.
- Threaded replies on items (a hot wash is spoken; the board collects, it does not host a debate).

## Design

### Flow

```
Hot wash tab ─► live:hotwash-open ─► controller.notice {kind:'hotwash.open'} to all; log hotwash.open
device ─► hotwash.item {itemId, kind, text, anonymous, objectiveId?, questionId?, mselRowId?} to controller
controller ◄── hotwash.ts: validate seat (players and evaluators may post; observers may not), apply FR-3,
               log, state; auto-accept → hotwash.update {action:'accept', text, kind, roleId?} to all
facilitator board ─► live:hotwash-update {itemIds, action, …} ─► log; hotwash.update to all; promote →
                     writeFacilitatorState(hotwash += …) and live:changed {what:'hotwash'}
```

### Main process

`src/main/live/hotwash.ts`

```ts
onItem(state, env)                                  // FR-2/3/5/9: item, plusOne, retract; attribution rule
accept(state, itemId) / hide / restore / edit(text) / group(itemIds, label?) / ungroup(groupId) / tag(itemId, tags)
promote(root, scenarioId, state, id) / unpromote    // FacilitatorState.hotwash (0419) through writeFacilitatorState
openOnDevices(state) / closeOnDevices(state)
boardView(state, forSeat?): BoardView               // what the facilitator sees; what a device may see (accepted, not hidden)
```

`SessionState.hotwash: { open: boolean, review: boolean, items: Map<itemId, Item>, groups: Map<groupId, Group>, plus: Map<itemId, Set<clientRef>> }`.

### Protocol use (0406 schemas; what this spec puts in them)

| Type                | Direction           | How this spec uses the payload                                                                                                                                                   |
| ------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotwash.item`      | client → controller | `itemId`, `kind`, `text`, `anonymous`, `objectiveId?`; plus `questionId?`, `mselRowId?`, `plusOneOf?`, `retractOf?` (requirements)                                               |
| `hotwash.update`    | controller → all    | `itemId`, `action` (`accept`, `group`, `promote`, `hide`, `restore`, `edit`, and `ungroup`, `unpromote`, `tag`), `groupId?`, `groupLabel?`, `text?`, `kind?`, `roleId?`, `plus?` |
| `controller.notice` | controller → all    | `kind: 'hotwash.open' \| 'hotwash.close'` (0411's requirement), `text` for the facilitator's framing line                                                                        |
| `welcome`           | controller → client | `hotwash: { method, methodDescription, questions: [{ id, topic, text }] }` so a device has the prompts (requirement)                                                             |

Requirements for 0406 from this spec: `hotwash.item` gains optional `questionId: SafeId`, `mselRowId: SafeId`, `plusOneOf: Base64Url22` and `retractOf: Base64Url22`, with `text` allowed empty when either of the last two is set; `hotwash.update.action` gains `'ungroup' | 'unpromote' | 'tag'` and the payload gains optional `kind`, `roleId`, `plus: int`, `objectiveId`, `capability`, `mselRowId`; `welcome` gains optional `hotwash` (≤ 10 questions, `Text(500)` each).

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:hotwash-open     { projectPath, scenarioId, review?: boolean, text?: string }  → void
live:hotwash-close    { projectPath, scenarioId }                                    → void
live:hotwash-board    { projectPath, scenarioId, sessionId? }                        → BoardView   (sessionId for past sessions)
live:hotwash-update   { projectPath, scenarioId, action, itemIds: string[], groupId?, label?, text?, tags? } → BoardView
live:hotwash-promote  { projectPath, scenarioId, id, on: boolean }                   → FacilitatorState
facilitator:present   { …, view: { kind: 'hotwash' } }                               (extends 0418 task 2)
```

### Renderer

- `src/renderer/src/routes/facilitate/live/HotWashBoard.tsx` (columns, selection, actions), `BoardItem.tsx`, `GroupDialog.tsx`, the **Hot wash board** tab in `SidePanel`; `HotWashPanel.tsx` gains the **From devices** list (0419's `FacilitatorState.hotwash` items with a device marker) and the **Open on devices** / **Close** controls.
- `src/renderer/src/routes/present/PresentHotwash.tsx`: promoted items, two columns, subscribed to `live:changed { what: 'hotwash' }`.
- `src/player/features/hotwash/`: `HotWashScreen.tsx` (questions, composer, board), `ItemComposer.tsx` (kind, text, inject picker, attribution checkbox), `BoardList.tsx`, `outbox` use.

### Wireframes

Player hot wash (phone):

```
┌──────────────────────────────┐
│ Hot wash             open ●  │
│ 3-Up, 3-Down                 │
├──────────────────────────────┤
│ Add an item                  │
│ (•) Strength ( ) Improvement │
│ ( ) Answer: Q2 "Ops↔IT…" ▾   │
│ [What went well / what to    │
│  change…                   ] │
│ About inject: [I-06 FIDS ▾]  │
│ [ ] Post without my role     │
│   Your role (Ops Director)   │
│   is shown unless ticked.    │
│ [          Post            ] │
├──────────────────────────────┤
│ Board · 14 items             │
│ ▲ 6  Ops and IT used two     │
│      different incident      │
│      numbers        PIO      │
│ ▲ 4  No FBI liaison number   │
│      in the plan   anonymous │
│ ▲ 1  Yours: FIDS stayed on   │
│      12 min after decision   │
└──────────────────────────────┘
```

Facilitate Hot wash board:

```
┌ Hot wash board ─────────────────────────────── open · auto-accept ▾ · [Close on devices] [Show on screen] ┐
│ Strengths (5)              │ Improvements (8)                      │ Other / answers (3)               │
│ [ ] ▲3 Clear PA script     │ [x] ▲6 Two incident numbers   PIO    │ [ ] Q2: Ops called IT at 1:20…   │
│      Ops · I-09            │ [x] ▲2 Ops ticket ≠ IT ticket  IT    │      anonymous                    │
│ [ ] ▲1 PIO held statement  │ [x] ▲1 "Which number?"  anon  I-11   │ [ ] Q3: Insider = crime scene     │
│      anonymous             │ ── Group: Incident numbering ★ ──    │      ASC                          │
│ [ ] …                      │ [ ] ▲4 No FBI liaison number  anon   │                                   │
│                            │ [ ] …                                │                                   │
│ 3 selected: [Group selected] [Label…] [Promote ★] [Tag ▾] [Edit] [Hide]                               │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data model

`src/shared/schemas/live.ts`: `HotWashItem { itemId, kind, text, editedText?, anonymous, seat?, displayName?, clientRef, questionId?, mselRowId?, objectiveId?, capability?, at, exerciseTime, accepted, hidden, groupId?, plus, promoted }`, `HotWashGroup { groupId, label?, itemIds, promoted }`, `BoardView`. `FacilitatorState.hotwash` entries written by promote are 0419's shape; no new field is added to it. Log entries (0417): `hotwash.open`, `hotwash.close`, `hotwash.item`, `hotwash.plus { itemId }`, `hotwash.retract { itemId }`, `hotwash.update { action, itemIds, groupId?, label?, before?, after?, tags? }`, `hotwash.promoted { id, text, memberItemIds }`, `hotwash.unpromoted`.

### Migrations

None. `FacilitatorState.hotwash` is 0419's addition with a default; a `facilitator.json` without it reads unchanged.

## Security and privacy

- The attribution rule runs on the controller before logging: an anonymous item's seat and name never reach `log.jsonl`, the broadcast, the export or the AAR. `clientRef` is kept for counting and is unlinkable after the session (0418).
- Observers cannot post; a post from an observer seat is dropped and counted as an anomaly.
- Hidden items are filtered from every re-emit, so a device that joins after a hide never receives it.
- Text is rendered as text; the presentation view shows promoted text only, with no roles or names.
- Edits keep the original in the log so the record cannot be silently rewritten; the board marks edited items.
- What leaves the computer: encrypted items and board updates between the facilitator's app and joined devices, after the facilitator opens the hot wash.

## Testing

- **Unit:** attribution rule (role level with and without the checkbox; named level), auto-accept vs review, +1 once per device, retraction window, group/ungroup/label, edit keeps original, promote mapping to `FacilitatorState.hotwash` (kinds, group label text, unpromote), `boardView` for a device excludes hidden and unaccepted items.
- **Integration:** fake transport, five clients: open; three items (one anonymous); a +1; a retraction; review mode on, one item waits then is accepted; group three and promote; a late joiner sees accepted items and not the hidden one; close.
- **e2e `e2e/live/hotwash.spec.ts`:** Scenario 3 example after a short run; five players and one evaluator; open the hot wash with the scenario's questions; players post six items (two anonymous, one answering Q2, one about I-06); the board shows them with roles or "anonymous"; +1s reorder; the facilitator selects three with checkboxes (keyboard only), **Group selected**, labels the group, **Promote**; the Hot wash tab lists it under **From devices**; **Show on screen** shows the promoted board without roles; `facilitator.json` has the promoted entry; the log has the items with no seat on the anonymous ones. Screenshots light and dark.
- **a11y:** the player hot wash screen and the board (list semantics, checkbox grouping, live region count) and the presentation view in `e2e/a11y.spec.ts`.

## Tasks

1. **Hot wash in main.** `src/main/live/hotwash.ts`, state, attribution rule, log entries, promote into `FacilitatorState.hotwash`, handlers for the channels above. Tests: `hotwash.test.ts`, integration with the fake transport.
2. **Player hot wash feature.** `src/player/features/hotwash/*` (questions, composer with inject picker and attribution checkbox, board with +1 and retract, offline outbox). Tests: component tests.
3. **Facilitate board and Hot wash tab.** `HotWashBoard.tsx`, `BoardItem.tsx`, `GroupDialog.tsx`, tab in `SidePanel`, **From devices** and open/close controls in `HotWashPanel.tsx`. Tests: `HotWashBoard.test.tsx`, `HotWashPanel.test.tsx` additions.
4. **Presentation hot wash view.** `PresentHotwash.tsx`, the `hotwash` kind in `PresentTarget` and `presentHash` (`src/main/facilitator/present.ts`, `src/shared/ipc/facilitator.ts`), **Show on screen**. Tests: `present.test.ts`, `PresentPage.test.tsx` additions.
5. **e2e and docs.** `e2e/live/hotwash.spec.ts`, a11y additions, `docs/guides/live-play.md` (hot wash from devices, anonymity, grouping and promoting, the projector board), `docs/04-TABLETOP-METHODOLOGY.md` (one paragraph on collecting the hot wash from devices), `docs/05-DATA-MODEL.md` log entries.

## Open questions

1. **Auto-accept or review by default?** Recommendation: auto-accept. A hot wash is a trusted room; review mode exists for large or mixed audiences, and hide is one tap.
2. **Should players see each other's items at all?** Recommendation: yes (the shared board). A board nobody else sees is a survey, and 0422 already covers that; seeing items prompts "+1" instead of six duplicates.
3. **Should +1 counts show on the projector?** Recommendation: no on the promoted view (it is the facilitator's curated list); yes on the facilitator's board.
4. **Evaluators posting hot wash items.** Recommendation: allowed, attributed as "Evaluator" (their label), since evaluators often surface the sharpest improvements; the facilitator can hide anything out of place.
