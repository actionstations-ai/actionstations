# Spec 0417: Live play: controller dashboard and session log

Issue: #417 · Milestone: 0.6.0 · Status: Draft · Depends on: #406, #411 · Related: #418, #412, #413, #414, #415, #416, #419 (AAR reads the log), #428 (controller tools read a log slice), #422

## Summary

Two things every other live-play feature needs. The **session log** is the append-only record of a live session in the project folder (`scenarios/<id>/live/<sessionId>/log.jsonl`): every join, release, receipt, message, vote, hot wash item, survey response, observation, notice and clock change, timestamped on the wall clock and the exercise clock, exportable as JSON and CSV, and replayable to rebuild a session after a crash. The **Room** dashboard reads the live state built from it: who is connected and in which seat, delivery and read status per inject, unanswered injects, response times, votes, messages, hot wash and evaluation counts, anomalies. The log is the input to the AAR/IP draft (#419).

## Requirements

### User stories

- As a facilitator, I want one glance to tell me who is here, what has landed, who has read it and who has gone quiet, so that I run the room instead of polling it.
- As a facilitator, I want an inject that nobody has acted on after ten minutes flagged, so that I can prompt the role or move on knowingly.
- As an exercise director, I want everything said and done during play in a file I can open in a spreadsheet, so that the AAR is built from the record and the record survives the app.
- As a facilitator whose laptop died at 1:40, I want to reopen the app and carry on, so that a crash costs a minute, not the exercise.
- As a security reviewer, I want the log to contain no names unless the session was explicitly named, so that a discussion-based exercise stays non-attributional even in its files.

### Functional requirements

- **FR-1** Session folder. `scenarios/<scenarioId>/live/<sessionId>/` holds `session.json` (the `LiveSession` from 0418, plus `lastIndex`, `endedAt`, `summary` counts at end), `log.jsonl` (FR-2), `attachments/` (0413), `staged/` and `blobs.json` (0412). The folder name is 0406's `SessionId`, validated before it becomes a path segment; everything goes through `safeJoin`.
- **FR-2** Log entry. One JSON object per line, UTF-8, `\n`-terminated, at most 64 KiB per line (attachments and media are never inline; the entry carries blob ids):

  ```ts
  SessionLogEntry {
    i: number,                       // controller-assigned index, 1, 2, 3… (total order for this session)
    at: IsoDateTime,                 // controller wall clock when the entry was written
    ex?: ExerciseTime,               // exercise clock at that moment; absent before the first clock.state
    kind: string,                    // 'session.start' | 'client.join' | 'inject.release' | … (list below)
    actor: { kind: 'controller' | 'client' | 'server' | 'system', clientRef?, seat?: { kind, roleId?, teamId? },
             evaluator?, displayName? /* named sessions only */, persona? },
    ref?: { rowId?, releaseId?, injectId?, channel?, messageId?, voteId?, itemId?, groupId?, surveyId?,
            observationId?, taskId?, noticeId? },
    data: Record<string, unknown>,   // the feature's payload for this kind (sub-specs define it)
    env?: { from, seq, index? }      // the received frame's identifiers: `from` is the sender's clientRef (FR-4; never the raw id), `seq`, 0406 arrival index
  }
  ```

  Kinds: `session.start`, `session.resume`, `session.end`, `client.join`, `client.leave`, `client.reseat`, `client.kick`, `key.rotate`, `clock.state`, `inject.release`, `inject.receipt`, `inject.retract`, `inject.answered` (FR-9), `message`, `message.handled`, `message.star`, `message.pinned`, `vote.open`, `vote.cast`, `vote.rationale`, `vote.close`, `vote.reopen`, `vote.recorded`, `hotwash.open`, `hotwash.close`, `hotwash.item`, `hotwash.plus`, `hotwash.retract`, `hotwash.update`, `hotwash.promoted`, `hotwash.unpromoted`, `survey.open`, `survey.response`, `survey.close` (0422), `eval.assign`, `eval.observation`, `eval.watch`, `eval.ask`, `controller.notice`, `anomaly` (a dropped or rejected frame with its reason), `stage.progress` (blob staging milestones). Names follow the protocol type where one exists.

- **FR-3** Write rules. Entries are appended in the order the controller processes them, through one serialized writer per session; a feature's state changes only after its entry is appended. `fsync` at least once a second and before `session.json` is updated. A torn last line (crash mid-write) is dropped on read with a warning in the job log. Nothing is ever rewritten in place: corrections are new entries (`hotwash.update` with before and after, `eval.observation` with a higher revision).
- **FR-4** Attribution. At level `role`, `actor` carries `seat` and `clientRef` and never `displayName`; votes carry no `clientRef` (0414); anonymous hot wash items carry no seat (0415). At level `named`, `displayName` is included where the sub-spec says so. The session key, join tokens, raw `clientId`s and IP addresses never appear.
- **FR-5** Export. **Export log** writes JSON (`{ format: 'actionstations/live-session', formatVersion: 1, session, entries }`) or CSV (columns `index, at, exercise_time, kind, actor_kind, role, team, evaluator, display_name, ref_row, ref_id, summary, data_json`; RFC 4180 quoting; UTF-8 with BOM so Excel opens it; cells starting with `=`, `+`, `-`, `@` are prefixed with `'`). `summary` is a one-line human reading of the entry ("I-06 released to Ops Director, IT Director", "PIO → SimCell: We are investigating…"). `display_name` is empty unless the session was `named` and the facilitator ticks **Include display names** in the export dialog. The distribution ZIP (`export:run` `zip`) gets an optional `facilitator/live-sessions/<sessionId>.json` when the facilitator ticks **Include live session logs**; never in `players/`.
- **FR-6** Sessions list. The Facilitate Live tab shows past sessions of the scenario (date, duration, clients, releases, messages, votes, hot wash items, observations; from `session.json.summary`), with **Export JSON**, **Export CSV**, **Open folder**, **View** (read-only Room and boards for that session) and **Delete session data** (confirmation names what is deleted: log, attachments, staged media; `facilitator.json` and `evaluation.json` are not touched).
- **FR-7** Resume. A session whose `session.json` has no `endedAt` is shown first in the list as **Interrupted** with **Resume** and **Close as ended**. Resume replays `log.jsonl` through each feature module's reducer (`applyLogEntry(state, entry)`) to rebuild `SessionState`, reconnects the transport (0410; a relay session past its 72-hour life cannot resume and the UI says so), logs `session.resume`, and re-emits state as devices rejoin (0406's rekey step 4 logic). Open votes become `interrupted` (0414); open surveys stay open (0422).
- **FR-8** Room dashboard (Facilitate tab **Room**), from `dashboard.ts`:
  - **Roster**: per seat the connected, away (no presence for 60 s) and removed counts, with names when connected; empty player seats highlighted.
  - **Injects**: per released row the targets, delivered / read / actioned counts, time to first read (median across targets), answered status (FR-9), and an **Unanswered** list sorted by age.
  - **Messages**: threads with messages waiting and the oldest wait; median controller response time this session; messages per role.
  - **Votes**: the open vote's tally and the last results.
  - **Hot wash**: items, +1s, promoted; whether the board is open on devices.
  - **Evaluation**: observations, coverage percentage, evaluators connected.
  - **Health**: transport state and connection kind, blob store used vs cap, dropped frames by reason (`LiveClient.onDropped`), rejected feature messages, protocol version, last log index and file size.
- **FR-9** Unanswered injects. A released row is **unanswered** when `expectsResponse` is true (`MselRow.expectsResponse` once 0428 lands; until then the purpose-tag defaults 0428 lists), the window has passed (`MselRow.responseWindowMin` when present, else the session's `unansweredAfterMin`, default 10), and none of these happened: an `actioned` receipt from a targeted seat, a player message from a targeted seat sent after the release (any message, or one with `replyTo` the release), or the facilitator pressed **Mark answered** (`inject.answered`, with an optional note). The row's Timeline entry shows a badge "No response · 12 min"; the `StatusLine` live region announces each row once when it becomes unanswered; **Mark answered** clears it. Response time per release is first answer minus release, shown in the Injects table and in the exported summary.
- **FR-10** Session log view. The Room tab has a **Log** sub-view: the newest 200 entries with kind, time, actor and summary, a kind filter and a text search, **Load earlier**, and **Star** on messages (0413). It reads `live:log-tail`, never the whole file into the renderer.
- **FR-11** Slice API for other features. `readSlice(root, scenarioId, sessionId, { kinds, after? })` returns `{ kind, at, ex, rowId?, releaseId?, inReplyTo?, fromRoleId?, text? }` for 0428's tracker and for the AAR's `live-log.ts` adapter (0419), so no other module parses the file format.
- **FR-12** Fixture. `tests/fixtures/live/session-scenario-3.jsonl` is produced deterministically by the integration test (fixed clock, fixed ids) and committed; it is the contract 0419 and 0428 test against, and the format doc links to it.

### Non-functional requirements

- **NFR-1** Cost: none. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: the log is a project file like `facilitator.json`; it never leaves the computer unless the facilitator exports it or includes it in a ZIP; FR-4's rules keep names out at level `role`; **Delete session data** removes the record when an organization's retention policy asks. (Project rules 3.)
- **NFR-3** Accessibility: the Room tab is tables with headers and captions, counts as text, badges with text, and one live region for new unanswered flags; filters are labelled controls; the log view is a windowed table with row headers.
- **NFR-4** Performance: appending is under 1 ms per entry; a 4-hour session with 60 clients (roughly 20 000 entries, 10 MB) replays in under 2 s; `live:dashboard` is computed from in-memory state and answers in under 20 ms; the Room tab refreshes on `live:changed` with a 250 ms debounce.
- **NFR-5** Durability: the log survives a renderer reload (main owns it), an app crash (append-only, fsync), and a power loss up to the last fsync; `session.json.lastIndex` lets resume detect a truncated log and say how many entries were lost.

### Out of scope

- A second-monitor dashboard route (0418 open question 1; the component is reusable).
- Analytics across sessions or scenarios.
- Automatic AAR drafting (0419 reads this log; it does not write it).

## Design

### Module

`src/main/live/log.ts`

```ts
openLog(dir): Promise<LogWriter>                       // creates session folder, validates SessionId
LogWriter.append(entry: Omit<SessionLogEntry, 'i' | 'at'>): Promise<SessionLogEntry>   // serialized; assigns i and at
LogWriter.flush(): Promise<void>                       // fsync
readEntries(dir, opts?: { after?: number, limit?: number, kinds?: string[] }): AsyncIterable<SessionLogEntry>
replay(dir, reducers: Reducer[]): Promise<{ state: SessionState, dropped: number }>
readSlice(root, scenarioId, sessionId, opts): Promise<LogSliceRow[]>   // FR-11
exportJson(dir, out, opts: { includeNames }) / exportCsv(dir, out, opts)
summarize(entry): string                               // FR-5 summary column; shared with the Log view
writeSummary(dir)                                      // session.json.summary at end
```

`src/main/live/dashboard.ts`: `dashboardView(state, scenario, now): DashboardView` (pure), `unanswered(state, scenario, now): UnansweredRow[]` (FR-9, pure, unit-tested with a fixed clock), `responseTimes(state)`. Every feature module exports `applyLogEntry(state, entry)` so `replay` is a fold over the reducers in `src/main/live/*.ts`.

`src/main/export/csv.ts`: a small RFC 4180 writer with formula-prefix guarding, reused by future CSV exports (0422 survey results).

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:dashboard        { projectPath, scenarioId }                                      → DashboardView
live:log-tail         { projectPath, scenarioId, sessionId?, before?: number, limit?: number, kinds?: string[], q?: string } → { entries: SessionLogEntry[], hasMore }
live:log-export       { projectPath, scenarioId, sessionId, format: 'json' | 'csv', outPath, includeNames?: boolean } → { path, entries }
live:session-resume   { projectPath, scenarioId, sessionId }                           → LiveSession
live:session-close    { projectPath, scenarioId, sessionId }                           → LiveSession   (mark an interrupted session ended)
live:session-delete   { projectPath, scenarioId, sessionId }                           → void
live:mark-answered    { projectPath, scenarioId, releaseId, note?: string }            → void
live:sessions-list    (0411) returns LiveSessionSummary[] from session.json files, interrupted first
export:run            targets gain 'live_log' (JSON into facilitator/live-sessions/ in the ZIP)
```

### Renderer

- `src/renderer/src/routes/facilitate/live/RoomPanel.tsx` with `RosterSummary.tsx`, `InjectsTable.tsx`, `UnansweredList.tsx`, `MessagesSummary.tsx`, `VotesSummary.tsx`, `HotWashSummary.tsx`, `EvaluationSummary.tsx`, `HealthStrip.tsx`, `LogView.tsx`; `SessionsList.tsx` in the Live tab; `use-dashboard.ts` (debounced refetch on `live:changed`).
- `Timeline.tsx`: the "No response" badge from `TimelineEntry.live.unansweredMin`; `InjectPanel.tsx`: **Mark answered**.

### Wireframe

Room tab (desktop width; stacks on narrow):

```
┌ Room ─────────────────────────────────────────────────────────────────────────────────────────┐
│ This computer · 192.168.4.12 · 14 connected · 1 away · blobs 38 / 2048 MiB · dropped 0  [Log] │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ Seats                       │ Injects                                                         │
│ Ops Director   ● 2          │ Row   To        Deliv  Read  Acted  1st read  Answer   Age      │
│ IT Director    ● 1 ○ 1 away │ I-06  Ops, IT   2/2    2/2   1/2    0:14      msg 1:19  —       │
│ PIO            ● 2          │ I-07  Ops       1/1    1/1   0/1    0:40      —         12 min ⚠ │
│ ASC            ● 1          │ I-08  IT        1/1    0/1   0/1    —         —         4 min    │
│ Airline Liaison ○ empty ⚠   │ Unanswered: I-07 (12 min) [Mark answered] [Message Ops]         │
│ Evaluators     ● 2          ├─────────────────────────────────────────────────────────────────┤
│ Observers      ● 3          │ Messages  3 threads · 1 waiting (PIO, 4 min) · median reply 1:50 │
│                             │ Votes     I-09 closed 9–4 · none open                           │
│                             │ Hot wash  closed · 0 items                                      │
│                             │ Evaluation 9 of 22 tasks observed · 2 evaluators                │
└─────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

Log sub-view:

```
┌ Session log · 1 412 entries ───────────────── [All kinds ▾] [search…        ] [Export JSON] [Export CSV] ┐
│ #     at        ex    kind             actor            summary                                       │
│ 1412  10:22:14  1:19  message          PIO              PIO → SimCell: We are investigating a syst…  ★ │
│ 1411  10:22:02  1:19  inject.receipt   IT Director      I-06 read                                      │
│ 1410  10:21:58  1:19  inject.release   controller       I-06 released to Ops Director, IT Director     │
│ …                                                                                   [Load earlier]     │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data model

`src/shared/schemas/live.ts`: `SessionLogEntry` (FR-2), `LiveSessionSummary { id, startedAt, endedAt?, interrupted, transport, attribution, counts: { clients, releases, receipts, messages, votes, hotwashItems, observations, surveys } }`, `DashboardView`, `UnansweredRow`, `LogSliceRow`. `session.json` is `LiveSession & { lastIndex, summary? }`. `docs/05-DATA-MODEL.md` gets the folder and the entry; `docs/adr/0024-live-play.md` records "the log is the source of truth; state is a fold".

### Migrations

None; the `live/` folder is new. Older builds ignore it (`Scenario` is a loose object and the folder is not referenced from `scenario.json`).

## Security and privacy

- The log holds exercise content in plaintext inside the project folder, like `scenario.json` and the inject media. It is covered by whatever protects the project folder; the app adds nothing weaker (no copies in `userData`, no caches).
- FR-4 is enforced in `log.ts`: `append` strips `displayName` when the session is `role`, refuses entries that carry `clientId`, `joinToken` or `key` fields (a test asserts the deny list), and the export dialog shows what the file will contain before writing.
- `clientRef` is unlinkable after the session (0418): the salt lives in memory and is not in `session.json`.
- Exports are written only to a path the facilitator chose in a save dialog; CSV output guards against formula injection; JSON is pretty-printed and never includes blob bytes.
- **Delete session data** is a confirmed, logged (in the app's job log, not in the deleted file) removal of the session folder; it cannot be undone and the dialog says so.
- Resume reconnects a transport only after the facilitator presses **Resume**; an interrupted session does not reopen a listener on app start.
- What leaves the computer: nothing from this spec. The log is read, exported and deleted locally.

## Testing

- **Unit:** `log.ts` append ordering under concurrent calls, `i` monotonic, fsync cadence (fake timers), torn-line recovery, attribution stripping and the secret deny list, `readSlice` shapes, CSV quoting and formula guard, JSON export shape, `summarize` for every kind; `dashboard.ts` with a fixed clock (unanswered rules: actioned receipt, message after release, mark answered, `expectsResponse` false, window from the row vs the session default; response times; roster states); each feature's `applyLogEntry` reducer replays its own entries to the same state the live path produced (property test over the fixture).
- **Integration:** the full flow of 0418's acceptance criteria 1–7 against the fake transport with a fixed clock and seeded ids, producing `tests/fixtures/live/session-scenario-3.jsonl` (FR-12); the test fails if the committed fixture differs, so format changes are deliberate; replay of the fixture equals the final live state.
- **e2e `e2e/live/dashboard.spec.ts`:** five players; deliver three rows; the Room tab counts match the devices' actions; wait past a 1-minute window (session `unansweredAfterMin: 1` for the test) and see the "No response" badge and the announcement; **Mark answered** clears it; a PIO message answers another; export JSON and CSV to a temp dir and parse them (counts match; no display names at level `role`; BOM present); kill the app (`app.process().kill()`), relaunch with the same userData, the Live tab shows **Interrupted**, **Resume** rebuilds the counts, devices reconnect and their inboxes are intact; end the session; the sessions list shows the summary; **Delete session data** removes the folder. Screenshots light and dark.
- **Packaged smoke:** none beyond 0411's.
- **a11y:** the Room tab and the Log view in `e2e/a11y.spec.ts` (tables, live region, filters).

## Tasks

1. **Log store and schema.** `src/shared/schemas/live.ts` (`SessionLogEntry`, `LiveSessionSummary`), `src/main/live/log.ts` (append, read, replay, slice, summary), `src/main/export/csv.ts`. Tests: `log.test.ts`, `csv.test.ts`. (Build order step 2 in 0418; lands before 0411.)
2. **Session folder, `session.json` and sessions list.** `session.json` writes with `lastIndex` and `summary`, `live:sessions-list`, `live:session-close`, `live:session-delete`; `SessionsList.tsx` in the Live tab. Tests: `session.test.ts` additions, `SessionsList.test.tsx`. (Step 2, with task 1.)
3. **Export.** `exportJson`, `exportCsv`, `live:log-export` with the save dialog and the include-names option, the `live_log` export target in `src/shared/ipc/export.ts` and `src/main/export/run.ts` (ZIP `facilitator/live-sessions/`). Tests: export shape tests, `zip.test.ts` (never in `players/`).
4. **Dashboard view and unanswered injects.** `src/main/live/dashboard.ts`, `live:dashboard`, `live:mark-answered`, `inject.answered` entries; `Timeline.tsx` badge, `InjectPanel.tsx` **Mark answered**, `StatusLine` announcement. Tests: `dashboard.test.ts` with fixed clock, `Timeline.test.tsx`.
5. **Room tab.** `RoomPanel.tsx` and its parts, `use-dashboard.ts`, `LogView.tsx` with `live:log-tail`, the **Room** tab in `SidePanel`. Tests: `RoomPanel.test.tsx`, `LogView.test.tsx`.
6. **Resume.** `replay` wiring in `session.ts` (`resumeSession`), per-feature `applyLogEntry` reducers (`deliver.ts`, `messages.ts`, `votes.ts`, `hotwash.ts`, `evaluation.ts`, `roster.ts`), **Interrupted** / **Resume** in the Live tab, re-emit on rejoin. Tests: reducer equivalence property test, `resume.test.ts`.
7. **Fixture, e2e and docs.** `tests/fixtures/live/session-scenario-3.jsonl` from the integration test, `e2e/live/dashboard.spec.ts`, a11y additions, `docs/05-DATA-MODEL.md` (folder, entry, kinds, export formats), `docs/adr/0024-live-play.md` (log as source of truth), `docs/guides/live-play.md` (the Room, unanswered injects, exporting and deleting the record, resuming).

## Open questions

1. **Should the log be encrypted at rest?** Recommendation: no, in line with every other project file; document it. Organizations that need encryption at rest encrypt the disk or the project folder. Revisit together with any project-level encryption feature.
2. **Default unanswered window.** Recommendation: 10 minutes, overridable per row by 0428's `responseWindowMin` and per session in the Live tab. Scenario 3's cadence is one inject per 10 minutes, so a longer default would flag nothing useful.
3. **Keep the per-ballot `vote.cast` lines in the exported CSV?** Recommendation: yes; they carry no identity (0414) and the AAR's "how divided" reading needs them. The JSON export has them too.
4. **Write a Markdown transcript export as well?** Recommendation: not now; the CSV opens in a spreadsheet and 0419 produces the readable document. Add it if facilitators ask for a quick printout.
