# ADR-0045: Messages with the SimCell are threads per channel, answered by persona, logged by role

Date: 2026-10-29 · Status: Accepted · Issue: #413 · Spec: [0413](../specs/0413-player-simcell-messages.md) · Related: ADR-0027 (protocol), ADR-0042 (inject delivery)

## Context

Players need to act on an inject from their phone (call the vendor, answer the reporter, send a photo of the whiteboard) and the facilitator, playing the outside world, needs every role's conversation in one place. The log must show who acted and when.

## Decision

- **A thread is a channel** (`role:<id>`, `team:<slug>`, `client:<ref>`). Players send `message.send` to the controller (sealed to it) with the channel in the payload. Main checks the seat owns the channel, fetches and checks attachments, logs, and echoes the message to the channel with `echoOf` and `fromRole`, signed. The echo is the sender's "sent" tick and gives a second device in the seat the thread.
- **Replies are signed controller frames** with a `persona` and `showPlayedBy` (default on). The page shows only messages the controller signed; the log always records the controller as sender.
- **The renderer and the log see devices by `clientRef`**, never the live client id. Team and device threads exist only after the controller starts them.
- **Attachments** are images only. The device re-encodes to JPEG at most 1600 px under the connection's player cap (dropping EXIF). Main decides the type from the bytes, checks size and hash, and names the file from the blob id under `attachments/`.
- **Pinning to the hot wash is a `message.pinned` log entry.** `FacilitatorState.hotwash` does not accept free items yet; the Hot wash tab and the AAR read the pin from the log when that lands (#419).
- **Messages with photos are not queued offline.** Text queues in the outbox and sends once on reconnect; a photo needs a connection to upload, so the message shows "Not sent" with Try again.

## Consequences

- Thread state is in memory with the session; the log is the record. Every device holds the players key, so role privacy is a filter in the page (ADR-0042).
- No read markers; the facilitator sees how long a player message has waited.
