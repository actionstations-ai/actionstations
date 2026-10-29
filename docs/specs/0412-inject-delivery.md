# Spec 0412: Live play: deliver injects to players' devices

Issue: #412 · Milestone: 0.6.0 · Status: Implemented (#412) · Depends on: #406, #407, #411 · Related: #418, #417, #408 (asset caps)

## Summary

When the facilitator delivers an MSEL row while a live session runs, the released inject arrives on the targeted roles' or teams' devices as the rendered artifact (the template PNG, the AI image or video, the TTS audio) with the exact text available to screen readers, and the devices send delivered, read and actioned receipts back. Targeting follows the MSEL row (`toRoleIds`, `toLabel`) and can be overridden per release. Media is pre-staged at session start so a release is one small message.

## Requirements

### User stories

- As a facilitator, I want **Deliver** to do what it does today and also put the inject on the right devices, so that live play costs me no extra clicks.
- As a player, I want the tweet, the memo or the FIDS screenshot on my phone, legible, with the text readable by my screen reader, so that I can act on it and quote it.
- As a facilitator, I want to see who has received and read each inject, and to resend one to another role when the room's organization differs from the plan.
- As a controller, I want an inject I delivered by mistake withdrawn from devices, so that an undo is an undo.

### Functional requirements

- **FR-1** With a session active, `deliver(rowId)` (the existing action in `use-delivery-actions.ts`) also calls `live:release-inject`. The existing behaviour (presentation window, hand-out hint, `delivered` stamp in `facilitator.json`) is unchanged.
- **FR-2** Default targets by delivery mode: `hand_to_role` → the row's roles (`role:<id>` for each; a role whose team is also wholly addressed collapses to `team:<slug>`); `read_aloud` → the row's roles; `display_main_screen` → `all` (feed item, since the room sees it on the projector) plus the presentation window as today; `play_audio` → the row's roles get the audio in their inbox and the projector plays it as today. A row with no roles and no label, or `toLabel` "All", targets `all`.
- **FR-3** The Inject panel shows the computed targets as chips with an **Edit targets** control (roles, teams, everyone, specific connected clients) and a **Send to devices** checkbox (on by default while a session is active) so a facilitator can keep an inject off the devices.
- **FR-4** The release is 0406's `inject.release`: `releaseId`, `mselRowId`, `injectId`, `title`, `injectType` (the type label), `deliveryMode`, `sender` (the MSEL row's `from`), `text` (FR-6), `exerciseTime`, `targets`, `media` (FR-7), `expectsResponse` (`MselRow.expectsResponse` when 0428 has landed, else the purpose-tag default it defines). `instructorNote` and `expectedAction` are never sent to players; the expected action goes to evaluators only, inside their copy of the release (FR-5), and only when the facilitator turns **Show expected actions to evaluators** on.
- **FR-5** Observers and evaluators receive every release, whatever its targets (the controller sends them a copy addressed to `role:evaluators` / `role:observers`, two reserved destinations the roster maps to those seats), marked "Not addressed to you" so they can follow play. Players see only what is addressed to their seat or to all.
- **FR-6** Exact text. `text.body` is built from the inject's fields in the template's `schema.json` property order, as `Label: value` lines (labels from the schema's `title`, else the field name humanized), skipping empty fields and image slots, followed by the MSEL row's `event` when the inject has no fields; `text.headline` is the inject title; `text.altText` is `injectAlt()` (title and type). The player page renders the body in a **Text version** section (collapsed by default, expandable, and exposed to assistive technology as the image's description with `aria-describedby`); the image's `alt` is `altText`.
- **FR-7** Media. `media` is a list of 0406 `BlobRef`s (at most 6) with `name` set to `device`, `original`, `poster` or `audio`. For template PNGs (2×) a `device` rendition (1×, at most 1200 px wide, PNG) is produced and listed first; `original` is listed for **Open full size**. AI images and videos ship as-is; audio as-is. A file over the connection kind's blob cap (0406 Blobs table: 8 MiB on the relay, 64 MiB on a self-hosted server, 256 MiB on LAN) is omitted and the release says "Shown on the main screen" for that medium; the Live tab warns when the session's total approaches the per-session cap.
- **FR-8** Pre-staging. `live:session-start` starts a `live-stage` job that renders device renditions and uploads every asset of every inject with media as sealed blobs (`LiveClient.putBlob`, which also serves the LAN case through 0407's server); progress shows in the Live tab ("Staging media 14/26"). Releasing an inject whose blobs are not stored yet stages them first and then releases (the facilitator sees "Preparing…" for the second or two it takes on LAN). After a key rotation (0406) the controller re-seals and re-uploads what re-emitted releases need.
- **FR-9** Receipts. The device sends `inject.receipt` with `status: 'delivered'` when the item is in its list, `'read'` when the detail view has been visible for 1 s, `'actioned'` when the player taps **Mark as actioned** (shown when `expectsResponse` is true). Receipts are keyed by `releaseId`, idempotent per `(client, releaseId, status)` and queued offline.
- **FR-10** Facilitate shows per row: "to 3 · 3 delivered · 2 read · 1 actioned" in the timeline and a per-client list in the Inject panel (seat, display name if any, delivered at, read at, actioned at, exercise times). **Resend** sends the same release (same `releaseId`, idempotent on devices) to additional targets; **Withdraw** (on **Undo deliver**) sends `controller.notice` with `kind: 'retract'` and `ref: releaseId`; devices hide the item and show "Withdrawn by the facilitator" in the feed's history.
- **FR-11** Player inject detail: image with pinch-zoom and **Open full size** (original rendition in a full-screen viewer with close button), video with native controls and captions track when the inject has `voiceLines` (generated WebVTT from the lines), audio with play button and a transcript (the voice lines), the text version, `from`, exercise time, **Mark as actioned**, and **Reply to SimCell** (opens 0413 with the inject quoted).
- **FR-12** Audio injects do not autoplay on devices (browsers block it; and the projector plays it); the inbox item shows a play button and the duration.

### Non-functional requirements

- **NFR-1** Cost: none; staging uses the existing render pool. (CONTRIBUTING, Project rules 1.)
- **NFR-2** Privacy: assets are sealed on the facilitator's computer before upload or serving (0406's blob format: one AES-GCM message, chunked for transport); the server stores ciphertext under the blob id; the player decrypts in WebCrypto and shows a `blob:` URL; nothing is cached by the browser beyond memory (`Cache-Control: no-store` on the GET fallback). (Project rules 3.)
- **NFR-3** Accessibility: every image has `alt` and a text version; video has captions when lines exist; audio has a transcript; the full-size viewer is a focus-trapped dialog; "Mark as actioned" is a 44 px button; receipts never depend on a gesture other than opening the item.
- **NFR-4** Performance: release to visible on 20 LAN devices within 2 s (device rendition at most 400 KB for a paper page); the staging job for the Scenario 3 example (26 rows) finishes in under 60 s on a laptop with the default pool.
- **NFR-5** Templates for text (Project rules 5) still hold: the artifact the player sees is the template render; the text version is the same fields, not OCR.

### Out of scope

- Players forwarding injects to each other.
- Editing an inject from the Facilitate page during play (use the editor; a re-render re-stages on next release).
- Scheduled or automatic release by the clock (the facilitator presses Deliver; see open questions).

## Design

### Flow

```
Deliver (renderer) ─► facilitator:state-save (as today)
                   └► live:release-inject { rowId, targets?, sendToDevices }
                          └► deliver.ts: resolve inject, targets, text, staged BlobRefs
                                 ├► log: inject.release
                                 └► session.send(target, 'inject.release', payload)  (one envelope per target destination)
device ◄── inject.release ── opens the frame, lists the item, LiveClient.getBlob(ref) on display (relay.blob.get
                             chunks, or the LAN GET fallback), verifies tag and sha256, shows a blob: URL
device ──► inject.receipt {delivered} … {read} … {actioned}
controller ◄── receipts ─► deliver.ts: log inject.receipt, update SessionState.receipts, emit live:changed {what:'receipts'}
```

### Main process

`src/main/live/assets.ts`

```ts
stageInject(root, scenarioId, sessionId, inject): Promise<StagedBlob[]>
  // device rendition: composeDocument + renderPng(zoom 1) into live/<sessionId>/staged/<assetId>-device.png
  // (never through renderInjectAssets: the inject file is not touched); AI/video/audio: the original file;
  // each file becomes a BlobRef through LiveClient.putBlob (sealed under the current epoch), recorded in
  // live/<sessionId>/blobs.json { assetId, name, blobRef, epoch } so a resume does not re-upload
stageAll(ctx: JobContext, …)      // the live-stage job: every inject with assets, progress per inject
resealFor(epoch)                  // after session.rekey: re-upload what re-emitted releases need
```

`src/main/live/deliver.ts`

```ts
resolveTargets(row, inject, roles, override?): Destination[]  // FR-2; collapses roles to teams
injectText(inject, templateSchema, row): { headline, body, altText }   // FR-6 (pure; unit-tested)
releaseInject(state, req): Promise<Release>                  // logs, sends per destination, records in state.releases
onReceipt(state, env)                                        // validates seat is a target (or observer/evaluator), logs, updates
retract(state, releaseId)
```

`SessionState.releases: Map<releaseId, { release, targets: Destination[], receipts: Map<clientRef, { delivered?, read?, actioned? }> }>`.

Template schema access for `injectText` reuses `loadTemplate(type, root)` from `src/main/render/templates.ts`.

### Protocol use (payload fields; schemas in 0406)

| Type                | Direction            | How this spec uses the payload                                                                                                                                                                                                                                                            |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inject.release`    | controller → targets | `releaseId`, `mselRowId`, `injectId`, `title`, `injectType` (label), `deliveryMode`, `sender` (MSEL `from`), `text: { headline, body, altText }` (FR-6), `exerciseTime`, `targets`, `media: BlobRef[]` with `name` ∈ `device` / `original` / `poster` / `audio` (FR-7), `expectsResponse` |
| `inject.receipt`    | client → controller  | `releaseId`, `status`, `at`                                                                                                                                                                                                                                                               |
| `controller.notice` | controller → targets | `kind: 'retract'`, `ref: releaseId`, `text: 'Withdrawn by the facilitator'` (requirement from 0411)                                                                                                                                                                                       |

Requirements for 0406 from this spec: `inject.receipt.status` gains `'actioned'`; `inject.release` gains optional `captionsVtt: Text(20_000)` (WebVTT built from the inject's `voiceLines`) and optional `expectedAction: Text(2_000)` (present only in the evaluators' copy); two reserved destinations `role:evaluators` and `role:observers` that the server treats like any `role:` (clients filter) and the roster maps to those seats.

### IPC (`src/shared/ipc/live.ts`, this spec's part)

```
live:release-inject  { projectPath, scenarioId, rowId, targets?: Destination[], sendToDevices?: boolean } → Release
live:resend-inject   { projectPath, scenarioId, releaseId, targets: Destination[] }                       → Release
live:retract-inject  { projectPath, scenarioId, releaseId }                                               → void
live:receipts        { projectPath, scenarioId }   → Record<releaseId, { rowId, targets, perClient: ReceiptRow[], counts }>
live:stage-status    { projectPath, scenarioId }   → { jobId?, staged, total, failed: [{ injectId, reason }] }
```

### Renderer

- `use-delivery-actions.ts` `deliver` gains the live call when `useLiveSession().active`; errors toast "Delivered to the room, but not to devices: …" and keep the local stamp.
- `InjectPanel.tsx`: `TargetChips.tsx` (edit targets dialog), `SendToDevices` checkbox, `ReceiptList.tsx`, Resend and Withdraw actions.
- `Timeline.tsx` `TimelineEntry` gains `live?: { to, delivered, read, actioned }` rendered as a compact badge after the delivered stamp.
- `src/player/features/injects/`: `InboxItem.tsx`, `InjectDetail.tsx`, `FullSizeViewer.tsx`, `TextVersion.tsx`, `media.ts` (`LiveClient.getBlob`, object-URL cache, revoke on unmount, drop all at `session.end`), `receipts.ts` (visibility timer, outbox).

### Wireframes

Player inject detail (phone):

```
┌──────────────────────────────┐
│ ‹ Inbox         1:15 · I-06  │
│ FIDS board                   │
│ From: Gate agent             │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │   [rendered FIDS PNG]    │ │
│ │                          │ │
│ └──────────────────────────┘ │
│ [Open full size]             │
│ ▸ Text version               │
│   Board: Departures          │
│   Row 1: DL 1189 Miami  B4   │
│   …                          │
├──────────────────────────────┤
│ [ Mark as actioned ]         │
│ [ Reply to SimCell ]         │
└──────────────────────────────┘
```

Facilitate Inject panel additions:

```
│ To devices: [Ops Director] [IT Director] [+ edit]   [x] Send to devices │
│ Delivered 1:15 · 2 of 2 delivered · 1 read · 0 actioned                │
│   Ops Director  Dana      delivered 1:15   read 1:15   —    [Resend ▾] │
│   IT Director   (no name) delivered 1:15   —           —               │
│ [Undo deliver (withdraws from devices)]                                 │
```

### Data model

`src/shared/schemas/live.ts`: `StagedBlob`, `Release`, `Receipt`, `ReceiptRow`; `Destination` is imported from `src/shared/live/`. Log entries (0417): `inject.release { releaseId, mselRowId, injectId, targets, deliveryMode, blobIds, textSha256, expectsResponse }`, `inject.receipt { releaseId, clientRef, seat, status }`, `inject.retract { releaseId }`. No scenario schema change.

### Migrations

None. Staged files live under the session folder and are deleted with **Delete session data** (0417).

## Security and privacy

- Assets are sealed before they reach any socket; the local server stores and streams ciphertext too (so the LAN path and the relay path are the same code). `Cache-Control: no-store`; the player revokes `blob:` URLs when the item leaves the screen.
- Targeting is confidentiality at the UI level, not the key level, in protocol v1: every device holds the frames addressed to other roles, sealed under the shared session key, and `LiveClient` drops them as `NOT_FOR_ME`. A player who modifies the page could read another role's injects. This is acceptable for a tabletop (the same people sit in one room and the controller handbook says artifacts are shared freely at the hot wash); 0406's open question on per-role keys covers the stricter case and nothing in this spec prevents it.
- `text.body` is plain text; the player renders it in a `<pre>`-like block with `white-space: pre-wrap`, never as HTML.
- `instructorNote` and `expectedAction` never go to player seats; `expectedAction` goes to evaluators only when the facilitator turns it on.
- Receipts are accepted only from clients whose seat was a target (or observers and evaluators); others are logged as `rejected` for the dashboard's anomaly count and ignored.
- The staged folder holds plaintext renditions inside the project folder, the same as `scenarios/<id>/media/`; nothing new leaves the project.
- What leaves the computer: encrypted releases and blobs to joined devices, after Deliver.

## Testing

- **Unit:** `resolveTargets` (roles, team collapse, All, override), `injectText` against three templates' `preview.json` (fids_board, memo, email) with a snapshot per template, `assets.ts` rendition size bound and sha256, receipt validation and idempotency, retract.
- **Integration:** fake transport, three clients (Ops, PIO, Evaluator): release to Ops → Ops and Evaluator receive, PIO does not; receipts update state; late joiner catch-up includes the release; retract hides it.
- **e2e `e2e/live/inject-delivery.spec.ts`:** Scenario 3 example; render I-06 (fids_board), I-07 (memo), I-03 (radio_call audio); four players (Ops, IT, PIO, Evaluator). Deliver I-06: Ops sees the image (natural width ≥ 1000 at full size, device rendition ≤ 1200 wide), the text version contains a flight row, the presentation window opens as today, PIO's inbox stays empty, the dashboard counts go 1 delivered then 1 read; Ops marks actioned; resend to PIO; undo withdraws from both. Deliver I-03: Ops gets an audio item with a transcript; projector plays it. Offline receipt: Ops offline while reading, back online, exactly one `read` in the log. Screenshots light and dark to `.tmp/live/`.
- **a11y:** inject detail and full-size viewer in `e2e/a11y.spec.ts` (image alt, describedby, dialog focus trap, 200 % zoom).

## Tasks

1. **Exact text and targets (pure).** `src/main/live/deliver.ts` with `injectText`, `resolveTargets`; `src/shared/schemas/live.ts` additions. Tests: `deliver.test.ts` with template snapshots.
2. **Staging and blobs.** `src/main/live/assets.ts` (renditions, `putBlob`, `blobs.json`, reseal after rekey), the `live-stage` job (`src/main/jobs/` registration), `live:stage-status`. Tests: `assets.test.ts` (rendition bounds, cap handling per connection kind, sha256, resume without re-upload).
3. **Release and receipts in main.** `releaseInject`, `onReceipt`, `retract`, state and log entries, `live:release-inject` / `live:resend-inject` / `live:retract-inject` / `live:receipts` handlers in `src/main/ipc/handlers/live.ts`. Tests: integration with the fake transport.
4. **Player inject feature.** `src/player/features/injects/*` (list item, detail, text version, full-size viewer, asset fetch and decrypt, receipts with outbox, captions). Tests: component tests with happy-dom and a fake session.
5. **Facilitate wiring.** `use-delivery-actions.ts` live call, `InjectPanel.tsx` targets and receipts, `Timeline.tsx` badge, Live tab staging progress. Tests: `delivery.test.ts`, `InjectPanel.test.tsx`.
6. **e2e and docs.** `e2e/live/inject-delivery.spec.ts`, a11y additions, `docs/guides/live-play.md` (delivering to devices, targets, receipts, media caps), `docs/05-DATA-MODEL.md` log entries.

## Open questions

1. **Auto-release when the clock reaches a row's time?** Recommendation: no. The facilitator's judgment about pace is the point of a tabletop; add an opt-in "arm" per row later if asked.
2. **Should `display_main_screen` injects also land in the targeted roles' inboxes (not only the feed)?** Recommendation: feed only by default, with the target chips letting the facilitator add roles. Players already see it on the wall; duplicating it in inboxes dilutes "what is mine".
3. **WebP or AVIF device renditions to cut bytes?** Recommendation: PNG now (deterministic, no new dependency, text stays crisp); measure on real phones and revisit if release latency through the relay is the bottleneck.
4. **Expected action visible to players after they mark actioned?** Recommendation: no. It is evaluation material; the hot wash is where it is discussed.

## Implementation notes (as built)

Where the code differs from the text above:

- **Recall, not `controller.notice`.** Withdraw sends `inject.recall` (`reason: 'withdrawn'`), which 0406 already defines; devices hide the item and the feed shows "Withdrawn by the facilitator".
- **Device rendition** is made with Electron's `nativeImage` from the stored 2x PNG (width halved, at most 1200 px) instead of a second `renderPng` pass. The inject file is untouched either way.
- **Staging** is a background pass started with the session (`stageAll` in `delivery-service.ts`) with progress in `live:stage-status`, not a registered `live-stage` job. The blob cache is per session in memory: LAN blobs live in the app's memory, so `blobs.json` and `resealFor` are not needed until the relay and self-hosted servers (#408, #410) land.
- **Shared target function:** `resolveTargets` and `teamSlug` are in `src/shared/live/targets.ts` so the Facilitate chips and the main process agree.
- **Files:** `deliver.ts` (text, captions), `assets.ts` (media plan and staging), `releases.ts` (releases, receipts, resend, retract), `delivery-service.ts` (row to release), player `features/injects/`. Receipts are sent from the session (`sendReceipt` through the outbox) rather than a `receipts.ts`.
- **Not in this change:** **Reply to SimCell** (0413), editing targets down to specific connected clients, the offline-receipt e2e through the Electron app, the Scenario 3 Electron e2e with rendered injects, and the a11y additions to `e2e/a11y.spec.ts`. The harness e2e (`e2e/live/inject-delivery.spec.ts`) covers release, receive, receipts, the evaluator's copy and withdrawal.
- **`expectsResponse`** uses the purpose-tag default (a row with an expected action that is not noise, a red herring, a distraction, a time jump or an end card) until 0428 adds the field.
- **Duplicate frames:** a release addressed by role and by team arrives twice at a device; the page lists it once (`inboxItems`, `feedItems`).
