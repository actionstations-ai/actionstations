# ADR-0052: The hot wash board is controller memory; promoting hands an entry to the Facilitate page

Date: 2026-10-29 · Status: Accepted · Issue: #415 · Spec: [0415](../specs/0415-hotwash-contributions.md) · Related: ADR-0027 (protocol), ADR-0045 (messages)

## Context

Players and evaluators post hot wash items from their devices. The facilitator groups, edits, hides and promotes them, and the promoted ones must reach the AAR through `FacilitatorState.hotwash`.

## Decision

- **The attribution rule runs on the controller** before logging or broadcast. An anonymous item has no seat or name in the log, on the board or on devices; only the salted `clientRef` stays, to count one device's items and +1s.
- **Board state is in memory with the session** (`src/main/live/hotwash.ts`); `log.jsonl` is the record. Items are auto-accepted unless the facilitator chose review mode. Devices learn everything from signed `hotwash.update` frames.
- **Promote returns an entry; the Facilitate page writes it.** The page owns `facilitator.json` while it is open and saves whole-state copies, so a second writer in main would be overwritten. Entry ids are `dev-<itemId or groupId>`; the Hot wash tab lists them under "From devices". The existing kinds (`strength`, `improvement`, `other`) are kept instead of the spec's `up`/`down`.
- **A promoted item or group is locked** (no hide, edit, ungroup or withdraw) until unpromoted, so the entry cannot drift from the board.
- **The projector reads the board from main**, not from `facilitator.json`, so it never races the page's save.
- **The AAR record takes device-promoted findings once**: when `facilitator.json` holds `dev-` entries, the logged items marked promoted are left out.

## Consequences

- A device that joins late replays the relay's history; it applies accept then hide in order, so a hidden item is not shown, but its text did travel under the players key.
- Own-item markers on a device are lost on page reload.
- Reading a past session's board (FR-11) needs the Sessions list (#417) and is not built here.
