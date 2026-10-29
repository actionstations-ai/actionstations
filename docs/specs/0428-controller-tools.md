# Spec 0428: Controller tools and unanswered-inject tracker

Issue: #428 · Milestone: 0.7.0 · Status: Implemented in part (see Implementation notes) · Depends on: — (works without live play) · Related: #417 (controller dashboard and session log), #412 (deliver injects to devices), #413 (messages), #411 (player page), #419 (AAR/IP draft), #426 (regulatory clocks), #433 (redaction preview)

## Summary

Facilitate gains the session controls that paid platforms sell:

- Nudge, rewind and fast-forward the exercise clock, and run it faster than real time.
- Target an inject at a role or a whole team.
- Make social-media injects show likes, shares and replies that grow as the exercise runs.
- Track injects nobody answered and commitments players made but did not keep.

Everything works in a room with a projector and no devices. With live play (#418), the same
tools read and write the session log message types (`inject.release`, `inject.receipt`,
`message.send`, `controller.notice`, `clock.state`). The tracker is rule-based. A local or
cloud model can optionally suggest commitments, and only when the facilitator clicks.

## Requirements

### User stories

- As a controller, I want to jump the clock back two minutes after I delivered a row too
  early, so that the timeline and the deliveries stay true.
- As a controller, I want to run the quiet stretch at 4× speed, so that the exercise reaches the
  next phase without a manual time jump.
- As a controller, I want to send the "PIO media inquiry" to the whole Public Information
  team, so that every PIO seat gets it, not one role.
- As a controller, I want the viral post's likes and replies to grow on the main screen, so that
  the PIO feels the pressure build.
- As a controller, I want a list of injects that got no response and of promises like "we'll
  call the FAA by 10:30" that came due, so that I can prompt the table or note it for the hot
  wash.

### Functional requirements

**Clock control**

- **FR-1** Nudge buttons on `ExerciseClock`: −5, −1, +1, +5 and +15 minutes, plus the existing
  "Time jump to …" and "Set time". Shortcuts: `[` / `]` for −1/+1 min, `Shift+[` / `Shift+]` for
  −5/+5 (configurable in `use-shortcuts.ts`, off when shortcuts are off).
- **FR-2** Clock rate: 0.5×, 1× (default), 2×, 4×, 10×, chosen from a select. The rate applies
  from the moment it changes. Persisted as `rate`, and `clockMinutes` accounts for it.
- **FR-3** Rewind past deliveries: when the clock is set earlier than one or more deliveries,
  a dialog lists those rows. It offers **Keep them delivered** (default) or **Mark them not
  delivered**, which removes their `delivered` stamps and, with live play, sends
  `inject.recall` (Open question 1).
- **FR-4** Every clock change (start, pause, set, nudge, rate, reset, time jump) is appended to a
  clock log with wall time, from/to exercise minutes, rate and reason. The log goes to the
  session log as `clock.state` (#417), and with live play the same event updates devices.
  **Reset** asks for confirmation once deliveries exist.

**Targeting**

- **FR-5** `MselRow.toTeams: string[]` (team names from `Role.team`), alongside `toRoleIds`. The
  resolved recipients are the listed roles plus every role whose team is listed. The MSEL
  editor shows team chips next to role chips, and `toLabel` derives "Ops team, PIO" when empty.
- **FR-6** **Deliver to…** (split button beside Deliver, shortcut `Shift+D`) opens a picker that
  lists teams and roles with the planned recipients preselected. The facilitator can change
  them for this delivery only, and the chosen recipients are stored on the delivery
  (`delivered[rowId].recipients`).
- **FR-7** Timeline filter: chips for teams and roles show only rows addressed to them. The
  filter is kept per scenario in `localStorage`. The side panel shows the resolved recipients.
- **FR-8** Without live play, recipients drive the hand-out label ("Print / hand to Ops team (3
  seats)") and the per-team hand-out sheet. With live play, `inject.release` carries
  `recipients: roleIds` (the live-play protocol spec #406 owns the message shape. This spec only
  needs a list of role ids).

**Simulated engagement**

- **FR-9** An inject whose template has engagement fields (table in Design §3) can carry an
  `engagement` plan: start counts, a curve (`surge`, `steady`, `fade`), peak counts, time to peak in
  exercise minutes, and a list of timed replies (author, handle, text, minutes after
  delivery). The inject editor gets an **Engagement** section with a small preview chart (text
  table alternative) and defaults by purpose tag (`MISINFORMATION`/`PRESSURE` → `surge`, others →
  `steady`).
- **FR-10** After delivery, Facilitate shows live counts for the selected inject. **Refresh on
  screen** re-renders the template with the counts and the replies released so far, then shows
  the new image on the presentation window. **Auto-refresh** re-renders every N exercise
  minutes (default off; 5 when on), at most once per 20 real seconds.
- **FR-11** Engagement renders never replace the inject's stored assets. They go to
  `.cache/engagement/<injectId>/<step>.png` and are deleted when the scenario closes or the
  inject changes. The template renders all text (CONTRIBUTING, Project rules 5).
- **FR-12** **Suggest replies** (optional) asks the `draft` text task for 3–8 replies in the
  inject's voice. The result is a JSON schema list the facilitator edits before saving, and the
  generation pipeline does not run it automatically.

**Tracker**

- **FR-13** A **Tracker** panel (tab beside Hot wash in the side panel, plus a badge with the open
  count) lists flags from these rules. The rules are pure functions in `src/shared/facilitator/tracker.ts`:
  - **T1 Unanswered inject:** delivered, `expectsResponse` (default from purpose tag, see Design §4),
    and no response recorded within `responseWindowMin` (row override, else project default 10)
    exercise minutes after delivery.
  - **T2 Not opened** (live play only): an `inject.release` to a device with no `inject.receipt` of
    kind `read` after 3 real minutes.
  - **T3 Commitment due:** an open commitment whose `dueAt` (exercise minutes) has passed.
  - **T4 Commitment without a time:** an open commitment older than 30 exercise minutes with no due
    time (info level).
  - **T5 Expected action unconfirmed:** at the end of a phase, a delivered row whose `expectedAction`
    has no response, note or observation (info level, shown in the hot wash panel).
- **FR-14** Responses are recorded:
  (a) by **Mark answered** on a row (`A` shortcut), optionally with who and a one-line note;
  (b) automatically with live play, when a `message.send` from a player has `inReplyTo` set to the
  row's `inject.release` or names the row, or when a vote on the row's decision point closes;
  (c) when a note is typed for the row (counts as answered only if the facilitator ticks "This is
  the response").
- **FR-15** Commitments: a facilitator adds one with **Commitment** (`C` shortcut) as text, owner
  (role or team), optional due time ("10:30" scenario time or "+20" minutes) and source row.
  Rule-based detection proposes commitments from player messages (live), facilitator notes and
  the hot wash transcript (#425). It matches commitment phrases ("we will / we'll / I'll / going
  to / plan to") followed by an action verb from a list (notify, call, brief, send, issue,
  activate, file, report, escalate, evacuate, post, isolate, restore…), and parses times ("by
  10:30", "within 20 minutes", "in an hour"). Proposals show as suggestions to accept or
  dismiss. Nothing is added without the facilitator.
- **FR-16** Optional **Find commitments with a model**: runs the `critique` text task over the
  messages and notes since the last scan with a `CommitmentScanOutput` JSON schema, and shows
  the results as suggestions. It runs only on click. The button names the provider, a cloud
  provider shows what is sent (#433), and it is disabled when `critique` is not routed.
- **FR-17** Each flag offers: **Prompt the table** (fills a SimCell nudge text the facilitator
  reads or, with live play, sends as `controller.notice` to controller devices only, never to
  players), **Mark answered / kept / missed**, **Dismiss** (with optional reason) and **Go to row**.
- **FR-18** Tracker state and outcomes (answered, response time, commitments kept/missed) go to
  the session log and the AAR input (#419): `tracker:report` returns per-row response times and
  commitment outcomes with cite keys (`R<n>`, `P<n>`).

### Non-functional requirements

- **NFR-1** Cost: no service. Rules run locally. FR-12 and FR-16 call providers only when the user
  clicks (CONTRIBUTING, Project rules 1 and 3).
- **NFR-2** Privacy: tracker data stays in `facilitator.json`. Message text sent to a model in FR-16
  goes through the #433 preview when the provider is not local.
- **NFR-3** Accessibility: WCAG 2.2 AA. All new controls are keyboard operable with visible
  focus. New flags are announced once through the `StatusLine` live region (polite) and are not
  repeated. Engagement counts on the screen are text, and the chart has a table equivalent.
  Shortcuts follow `aria-keyshortcuts`.
- **NFR-4** Performance: tracker evaluation over 200 rows, 500 messages and 100 commitments takes
  < 5 ms (it runs on each clock tick, once a second). An engagement re-render uses the
  existing render pool and takes < 1.5 s at 2×. Auto-refresh never queues more than one render
  per inject.
- **NFR-5** Determinism: `engagementAt(plan, minutesSinceDelivery)` is a pure function with
  integer output, so the screen, the export and a re-render agree.

### Out of scope

- Real posting to social networks or any outside service.
- Branching on unanswered injects (#430).
- An autonomous agent that writes to players; the model only proposes, and the facilitator
  decides.
- Player-side display of engagement on devices (the live-play feed spec #411 can reuse
  `engagementAt`).

## Design

### 1. Clock (`src/renderer/src/routes/facilitate/clock.ts`, `src/shared/ipc/facilitator.ts`)

`FacilitatorState` becomes `z.looseObject` (ADR-0016; also needed by #426 and live play) and
gains:

```ts
rate: z.number().min(0.25).max(60).default(1),
clockLog: z.array(z.object({
  at: IsoDateTime, kind: z.enum(['start','pause','set','nudge','rate','reset','jump']),
  fromMin: z.number(), toMin: z.number(), rate: z.number(), note: z.string().optional(),
})).max(5000).default([]),
```

- `clockMinutes(c, now) = c.elapsedMin + c.rate * (now − runningSince) / 60 000`. `setRate(s, r, now)`
  folds the elapsed time into `elapsedMin` and restarts `runningSince` (the same pattern as
  `setClock`). New pure helpers: `nudgeClock(s, deltaMin, now)` and `deliveriesAfter(state,
minutes)`. `logClock(s, entry)` caps the log at 5000 entries, keeping the newest.
- The existing `delivered[rowId].exerciseTime` stays the stamp. Rewinding never edits stamps
  unless FR-3's "Mark not delivered" is chosen.
- Live play: the controller publishes `clock.state { elapsedMin, runningSince, rate }` on every
  log entry (the session protocol #406 carries it). Devices compute the time locally, so rate
  changes need no per-second traffic.

### 2. Targeting (`src/shared/schemas/scenario.ts`, `src/shared/facilitator/recipients.ts`)

```ts
MselRow.toTeams: z.array(z.string().max(80)).default([])
FacilitatorState.delivered[rowId].recipients?: z.array(Id)        // resolved role ids at delivery
recipients(row, roles, override?) → { roleIds: string[]; teams: string[]; label: string }
```

`lib/msel.ts` `toLabel` uses `recipients().label`. Generation: `MselPhaseOutput` may emit
`toTeams` when the brief's audience names teams, and the critique keeps it (no lint change). The
MSEL editor (`routes/scenarios/`) adds team chips to the "To" cell.

### 3. Engagement (`src/shared/schemas/inject.ts`, `src/shared/facilitator/engagement.ts`)

```ts
EngagementPlan = z.object({
  curve: z.enum(['surge', 'steady', 'fade']).default('steady'),
  start: z.record(z.string(), z.number().int().nonnegative()),   // metric -> count at delivery
  peak: z.record(z.string(), z.number().int().nonnegative()),
  peakAtMin: z.number().positive().max(600).default(30),
  replies: z.array(z.object({ id: SafeId, atMin: z.number().nonnegative().max(600),
     author: z.string().max(80), handle: z.string().max(40).optional(), text: z.string().max(560) }))
     .max(40).default([]),
})
Inject.engagement: EngagementPlan.optional()
```

Curves map t = minutes / peakAtMin to a fraction f(t) of the way from start to peak:

- `surge`: logistic, 1/(1+e^(−8(t−0.5))), normalized to 0 at t=0 and 1 at t=1, then flat.
- `steady`: linear to 1 at t=1, then +10 % per further `peakAtMin`.
- `fade`: 1 − (1−t)², then flat.

Counts are rounded down to integers. Replies whose `atMin` ≤ minutes since delivery are
released.

Template field map (`src/shared/facilitator/engagement-fields.ts`, keyed by inject type). Pack
templates declare theirs in `meta.json` `engagement` (optional, validated by `TemplateMeta` in `src/main/render/templates.ts`):

| Type                | Metric → field path                                                                                        | Replies → field                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `tweet`             | likes → `metrics.likes`, reposts → `metrics.reposts`, replies → `metrics.replies`, views → `metrics.views` | no list field (FR-10 shows the reply count. Released replies render as separate `tweet` pages in the side panel, "Show reply on screen") |
| `facebook_post`     | reactions → `reactions`, comments → `commentCount`, shares → `shares`                                      | `comments` (latest 4, schema `maxItems`)                                                                                                 |
| `instagram_post`    | likes → `likes`, comments → `commentCount`                                                                 | `comments`                                                                                                                               |
| `reddit_post`       | upvotes → `upvotes`, comments → `commentCount`                                                             | `comments`                                                                                                                               |
| `tiktok_video_card` | views → `viewCount`, likes → `likes`, comments → `commentCount`, shares → `shares`                         | —                                                                                                                                        |
| `leak_site_post`    | views → `views`                                                                                            | —                                                                                                                                        |

`applyEngagement(fields, plan, map, minutes)` returns a new `fields` object that validates
against the template schema (it is tested per template with `preview.json`). It never mutates
the inject.

Rendering: a new channel `render:engagement { projectPath, scenarioId, injectId, minutes }` →
`{ path, step }` calls `renderPng` with the applied fields into
`.cache/engagement/<injectId>/<step>.png`. Step = floor(minutes / refreshMin), so repeated calls
for the same step reuse the file. `facilitator:present` gains an optional `cachePath`
(project-relative, must be under `.cache/engagement/`, checked with `safeJoinReal`) so the
presentation window can show it.

### 4. Tracker (`src/shared/facilitator/tracker.ts`, `commitments.ts`)

```ts
FacilitatorState.tracker: z.object({
  responses: z.record(z.string(), z.object({ at: IsoDateTime, exerciseMin: z.number(),
     by: z.string().optional(), note: z.string().default(''), source: z.enum(['manual','message','vote','note']),
     ref: z.string().optional() })).default({}),
  commitments: z.array(Commitment).max(500).default([]),
  suggestions: z.array(CommitmentSuggestion).max(200).default([]),
  dismissed: z.record(z.string(), z.object({ at: IsoDateTime, reason: z.string().default('') })).default({}),
  lastScan: z.object({ messages: z.string().optional(), notesHash: z.string().optional() }).default({}),
}).default({})

Commitment = z.object({ id: SafeId, text: z.string().max(500), owner: z.string().default(''),
  madeAtMin: z.number(), dueAtMin: z.number().optional(), rowId: z.string().optional(),
  source: z.enum(['manual','message','note','transcript','model']), sourceRef: z.string().optional(),
  status: z.enum(['open','kept','missed','dropped']), closedAtMin: z.number().optional() })

MselRow.expectsResponse: z.boolean().optional()      // default by purpose tag
MselRow.responseWindowMin: z.number().int().min(1).max(240).optional()
```

- `expectsResponse` defaults to true for `CORE_NARRATIVE`, `PRESSURE`, `MISINFORMATION`, `CLUE`,
  `TECH_HURDLE`, `DECISION_POINT` and `OPERATIONAL_FRICTION`. It defaults to false for `NOISE`,
  `RED_HERRING` (answering a red herring is the trap, so the tracker records it but does not flag
  silence), `DISTRACTION`, `CONFUSION`, `STARTEX`, `TIME_JUMP`, `END_GAME` and `ENDEX`.
- `evaluate(scenario, state, session?, now) → Flag[]` is pure. `Flag = { id: stable string
("T1:I-07"), rule, level: 'warn'|'info', rowId?, commitmentId?, since: exerciseMin, text }`.
  Dismissed ids are filtered out. `session` is the optional live-play log slice (the receipts and
  messages the #417 session log store exposes. The tracker only needs `{ kind, at, rowId?,
inReplyTo?, fromRoleId?, text? }`).
- `detectCommitments(text, nowMin) → CommitmentSuggestion[]` uses bounded patterns, with no
  nested quantifiers and input cut at 2000 characters, and a small time parser (`H:MM`,
  `HHMM`, "within/in N minutes|hours"). It is tested on a corpus of 100 sentences from the
  reference exercises with a recorded precision and recall.
- The model scan (`tracker:scan-model` → job kind `commitment-scan`) uses `resolveTextProvider('critique')`
  and `jsonSpec('CommitmentScanOutput', …)` from `providers/json.ts`. The prompt
  `prompts/commitment_scan.md` is new and registered as a stage prompt, so packs and
  projects can override it. Message text is wrapped in delimiters and marked as data.

### 5. IPC

Changes to `src/shared/ipc/facilitator.ts` (this feature's domain file):

| Channel                                                | Request                                          | Response                          |
| ------------------------------------------------------ | ------------------------------------------------ | --------------------------------- |
| `facilitator:state-save`                               | unchanged (carries the new keys)                 | —                                 |
| `render:engagement` (in `src/shared/ipc/render.ts`)    | `{ projectPath, scenarioId, injectId, minutes }` | `{ path, step }`                  |
| `facilitator:present`                                  | adds `cachePath?: RelPath`                       | `void`                            |
| `tracker:scan-model` (new `src/shared/ipc/tracker.ts`) | `{ projectPath, scenarioId, sinceIso? }`         | `{ jobId }`                       |
| `tracker:report`                                       | `{ projectPath, scenarioId }`                    | `TrackerReport` for #419 / export |
| `injects:suggest-replies` (in `injects.ts`)            | `{ projectPath, scenarioId, injectId, count }`   | `{ replies }` (not saved)         |

### 6. UI

Clock row (Facilitate header):

```
┌ Exercise clock ──────────────────────────────────────────────────────────┐
│  1:42:10   ▶ Pause  [−5][−1][+1][+5][+15]  Rate [1× ▾]  ⏭ Time jump to 2:30 │
│  Scenario 11:42 · Local 14:05 · 3 due                       Set time [____] │
└──────────────────────────────────────────────────────────────────────────┘
```

Side panel, Tracker tab:

```
┌ Tracker (4 open) ─────────────────────────────── [Find commitments ▾] ┐
│ ⚠ I-07 Media inquiry (PIO team) · no response 14 min                  │
│     [Prompt the table] [Mark answered] [Dismiss] [Go to row]          │
│ ⚠ Commitment: "We'll notify the FAA by 10:30" · Ops Director · due 11:30 passed │
│     [Kept] [Missed] [Dismiss]                                         │
│ ℹ I-05 expected action unconfirmed: "Isolate BHS VLAN"                │
│ Suggestions (2): "I'll call the county EOC" (note on I-09) [Add] [✕]  │
└───────────────────────────────────────────────────────────────────────┘
```

Engagement (side panel, selected social inject after delivery):

```
Likes 1,284 ↑  Reposts 412  Replies 96 · next reply in 3 min (@LakeportMom)
[Refresh on screen]  Auto-refresh [off ▾]  [Edit plan]
```

## Security and privacy

- Rendering stays in the sandboxed render pool. Engagement fields are validated against the
  template schema like any inject field. `cachePath` is restricted to `.cache/engagement/` with
  `safeJoinReal`.
- `controller.notice` goes only to controller and evaluator devices. Prompting players goes
  through the facilitator's voice, or a SimCell message (#413) the facilitator writes.
- Model scans (FR-16) and reply suggestions (FR-12) run only on click. The provider is named
  and the #433 preview applies to cloud providers. Message text is treated as data in the
  prompt (Architecture §Security).
- The commitment detector has bounded regexes with an input length cap, so text cannot stall
  the renderer.
- Clock rewind with "Mark not delivered" is logged in `clockLog` and the session log, so the AAR
  timeline cannot silently lose a delivery.

## Testing

- **Unit:** `clock.test.ts` (rate math across pause/resume/rate change, nudges below zero
  clamp, `deliveriesAfter`), `recipients.test.ts`, `engagement.test.ts` (curve endpoints,
  monotonic counts, reply release, `applyEngagement` output validated against each mapped
  template's schema with its `preview.json`), `tracker.test.ts` (each rule, dismissal, defaults by
  purpose tag, live-session slice optional), `commitments.test.ts` (corpus precision/recall
  thresholds: ≥ 0.8 precision, ≥ 0.6 recall, recorded in the test), and a 200-row benchmark for
  NFR-4.
- **Component:** clock buttons and shortcuts, rewind dialog, Deliver to… picker, tracker actions,
  engagement panel (happy-dom).
- **Render:** a golden for `tweet` and `facebook_post` with applied engagement at a fixed step
  (`pnpm test:templates` extra case).
- **e2e:** mock provider. Deliver a `MISINFORMATION` tweet, run the clock at 10×, refresh on
  screen, check the presentation window image changed. Leave an inject unanswered past its
  window, check the tracker flag, mark answered, check that `tracker:report` has the response
  time. Close all windows.
- **Live play (when #418 lands):** an integration test with the session-log fixture checks
  T2 and the automatic responses from `message.send`.

## Tasks

1. **Clock rate, nudges and log.** `routes/facilitate/clock.ts` (+tests), `src/shared/ipc/facilitator.ts`
   (`looseObject`, `rate`, `clockLog`), `ExerciseClock.tsx`, `use-shortcuts.ts`, rewind dialog in
   `FacilitateParts.tsx`, `FacilitatePage.tsx` wiring.
2. **Team targeting.** `src/shared/schemas/scenario.ts` (`toTeams`), `src/shared/facilitator/recipients.ts`,
   `renderer/src/lib/msel.ts`, MSEL editor chips (`routes/scenarios/`), Deliver to… picker and
   timeline filter (`Timeline.tsx`, `use-delivery-actions.ts`), hand-out label, the
   `MselPhaseOutput.toTeams` passthrough in `src/shared/schemas/generation.ts`.
3. **Engagement model and editor.** `src/shared/schemas/inject.ts` (`engagement`),
   `src/shared/facilitator/{engagement,engagement-fields}.ts`, `TemplateMeta.engagement` in
   `src/main/render/templates.ts`, the inject editor Engagement section (`routes/scenarios/` inject editor),
   and `injects:suggest-replies`.
4. **Engagement on screen.** `render:engagement` in `src/shared/ipc/render.ts` and
   `src/main/ipc/handlers/render.ts`, `.cache/engagement` lifecycle in `src/main/render/`,
   `facilitator:present` `cachePath` in `src/main/facilitator/present.ts`, the side panel controls,
   template goldens.
5. **Tracker rules and UI.** `src/shared/facilitator/{tracker,commitments}.ts` (+corpus test),
   `FacilitatorState.tracker`, `MselRow.expectsResponse/responseWindowMin`, `TrackerPanel.tsx` in
   `routes/facilitate/`, shortcuts `A`/`C`, the live region announcements.
6. **Model scan and report.** `src/shared/ipc/tracker.ts`, `src/main/ipc/handlers/tracker.ts`,
   `prompts/commitment_scan.md`, the `CommitmentScanOutput` schema in `src/shared/schemas/generation.ts`,
   the mock fixture in `providers/mock/fixtures.ts`, `tracker:report` for #419 and the export.
7. **Live play hooks (after #417/#412/#413 merge).** Map session-log entries into the tracker
   (`inject.receipt`, `message.send` `inReplyTo`, vote close), publish `clock.state` and `controller.notice`,
   `inject.recall` if accepted (Open question 1), integration test.
8. **Docs.** Facilitate guide sections (clock control, targeting, engagement, tracker) and
   `docs/05-DATA-MODEL.md` (`FacilitatorState`, `MselRow`, `Inject.engagement`).

## Open questions

1. **Recall on rewind with live play.** Should "Mark not delivered" remove the inject from player
   devices? _Recommendation:_ yes, with an `inject.recall { rowId }` message in the protocol
   (#406). Devices hide the item and show "withdrawn by the controller". The session log keeps
   both events.
2. **Rate limit.** Allow up to 60× for long exercises run as a quick demo? _Recommendation:_
   offer up to 10× in the select and accept up to 60× only from the Set time form's "rate" field.
   Above 10× a real-time engagement re-render cannot keep up anyway.
3. **Auto-prompt.** Should the tracker send `controller.notice` automatically when a flag
   opens? _Recommendation:_ no. Show the badge and announce once. The controller decides
   whether to intervene, because silence can be part of the exercise.
4. **Commitment detection languages.** _Recommendation:_ English phrase lists in 0.7.0, kept in
   `commitments.ts` as data per language, so #435 can add others.

## Implementation notes (PR for #428)

Built as specified except for these changes, made so the code and older files stay compatible:

- `rate`, `clockLog` and `tracker` are optional keys without a schema default (absent = 1, none, none), like the #426 keys; `MselRow.toTeams` is optional for the same reason.
- Recall on rewind: "Mark not delivered" reuses Undo, which already sends `inject.recall` (open question 1 taken as recommended). The rate select goes to 10×, the typed rate field to 60× (open question 2). No automatic notices (3). English phrase lists as data (4).
- Responses in the tracker are `tracker.responses`, kept by row id; T2 and the automatic responses from `message.send` and votes are implemented as pure rules over an optional session slice (`SessionEntry`) but are not yet fed from the live session log, and `clock.state` and `controller.notice` are not published. Follow-up for the live-play hooks (task 7).
- Not built: the model scan (`tracker:scan-model`, `prompts/commitment_scan.md`, FR-16), **Suggest replies** (FR-12), the per-team hand-out sheet, and the "show reply on screen" pages for tweets. Notes are scanned by rules for suggestions instead.
- `tracker:report` returns response minutes, unanswered rows and commitment outcomes; the AAR draft does not read it yet.
- The unanswered window is shared with the Room dashboard through `DEFAULT_RESPONSE_WINDOW_MIN`.
