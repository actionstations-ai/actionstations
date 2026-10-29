# ADR-0042: Injects reach devices as sealed blobs, with receipts keyed by release

Date: 2026-10-29 · Status: Accepted · Issue: #412 · Spec: [0412](../specs/0412-inject-delivery.md) · Related: ADR-0027 (protocol), ADR-0032 (LAN server), ADR-0033 (player page)

## Context

Deliver in Facilitate already stamps a row, opens the presentation window and shows a hand-out hint. With a live session running it must also put the inject on the devices of the people it is for: the rendered page or photo, the exact text for screen readers, audio with a transcript. The facilitator needs to see who has it and who has read it, and to take it back. Staff-only material (the expected action) must never reach a player's device.

## Decision

- **One release, one frame per destination.** `inject.release` is sent to each target (`role:`, `team:`, `all`) with the same `releaseId`; a device that matches two targets keeps one copy (the page lists a release once). Evaluators and observers get a copy addressed to the reserved `role:evaluators` and `role:observers` and see it marked "Not addressed to you". `inject.recall` (reason `withdrawn`) is how Undo deliver takes it back.
- **Expected actions go in the evaluators' copy only, sealed with the staff key,** and only when the facilitator turns **Show expected actions to evaluators** on. Every other frame is sealed with the players key and carries no such field.
- **Media are sealed blobs, staged ahead.** At session start a background pass uploads each inject's files through the controller's `LiveClient.putBlob` (on the LAN the blob store is the app's memory, per session). A template page ships as a 1x `device` PNG (at most 1200 px wide, made with Electron's `nativeImage`) plus the 2x `original`; photos, video and audio ship as they are. A file over the connection's blob cap is left out and the release says it is shown on the main screen. Releasing an inject whose files are not staged yet stages them first.
- **Receipts are `inject.receipt` frames sealed to the controller:** `delivered` when the item is in the device's list for its seat, `read` after the detail has been visible for one second, `actioned` on the player's button. They are queued in the device's outbox, keyed by release and status, and the controller ignores a repeat. A receipt from a seat the release was not for is logged as an anomaly and ignored; evaluators and observers are always accepted but not counted as targets.
- **Targeting is a filter, not a key.** As in the protocol, every device holds the players key, so another role's frames are readable by someone who modifies the page. That is accepted for a tabletop (ADR-0027, open question on per-role keys).
- **Targets are computed by one pure function** shared by the main process and the Facilitate page (`src/shared/live/targets.ts`), so the chips the facilitator sees are the targets that are sent.

## Consequences

- The staging cache and the release table live in memory with the session; a restarted app has neither (a LAN session cannot be resumed anyway, ADR-0032). A relay or self-hosted session (#408, #410) will reuse the same code through the same `LiveClient`.
- Receipt counts cover the devices seated when you look: a phone that joins later is counted once it is seated and has received the catch-up.
- The page stores every frame it can open and filters at render time (ADR-0033), so a release that arrives by role and by team is collapsed in the list, not on arrival.
- Hand-outs that are printed or read aloud still need the facilitator; the device copy is an addition, and **Send to devices** can be turned off per inject.
