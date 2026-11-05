# ADR-0078: Structured decisions are data forms, sent to one device and sealed back to the controller

Date: 2026-11-05 · Status: Accepted · Issue: #654 · Spec: [0448](../specs/0448-toolkits.md) FR-14 · Related: ADR-0027 (protocol), ADR-0050 (votes), ADR-0018 (packs are data)

## Context

A toolkit can define decisions players make in live play ("Issue a warning", "Order an evacuation", "Request a ground stop") and the facilitator can record when nobody holds a device. The decisions feed the metrics (decision timing needs what, where, who and when), so they must be structured, checked and logged with the exercise time. Votes already solve delivery, replay and attribution; decisions follow that pattern.

## Decision

- **A form is data** (`DecisionForm`, zod, in `src/shared/schemas/decisions.ts`): fields of type `text`, `choice`, `number`, `time` and `area`, required flags, and the seats (role ids) that may use it. An area is picked from named areas, or, when the form allows it, drawn as a polygon. Caps keep a whole form and a whole submission inside one relay frame (checked by test against the relay limit).
- **Forms come through one function,** `provideDecisionForms`, which the toolkit registry (#649) calls. Until it does there are no forms and nothing changes. Forms that fail the schema are skipped with a warning. The only example form lives in test fixtures.
- **Two frame types.** `decision.form` goes from the host, signed, to one device (`client:<id>`) after it joins or moves seats, carrying only the forms its seat may use; sending per device means a reload or a late joiner needs no catch-up. `decision.submit` goes from a device to the controller, sealed to the controller like `vote.cast`. Replay protection is the per-sender sequence of the envelope; a resend after a dropped connection carries the same device-chosen `decisionId`, and the controller counts it once.
- **There is no per-device signature.** Device frames are authenticated as every player frame is: sealed to the controller with a per-message key, sender bound in the authenticated header. The protocol has no device signing key, and adding one is a separate decision.
- **The controller checks every submission** against the form it sent: seat allowed, field ids known, required fields, types, ranges, choices, area in the list (a polygon only when the form allows drawing). Refusals are `anomaly` log lines. Limits: 60 decisions a device and 1000 a session.
- **One log line per decision,** `decision.submitted`, with the exercise time and the real time. Attribution follows the session setting, as in the other player frames: the role is always kept (a decision needs it), the name only in a named session and only in the actor, so a log exported without names has none. Unlike a ballot a decision is not anonymous; the record says which role made it. The facilitator's own entry writes the same line with the controller as actor.
- **One typed record for readers:** `{ id, time, exerciseTime?, kind, formId, title, area?, fields, seat, source }` (`DecisionRecord`). `decisionRecordsFromLog` and `mergeDecisionRecords` read the session log and the facilitator file as one list; the metrics builder (#653) uses them.
- **Facilitate records without devices.** The Live tab form calls `live:decision-record`, which checks the entry, logs it when a session runs, and returns the record. The page keeps it in the facilitator file (the page owns that file, as in ADR-0050), so an exercise with no session still has it.
- **No map editor.** The player page's map view shows places and cannot be drawn on, so the player's area field is a list. The schema and the frame already carry a drawn polygon so a map view with drawing can use them later without a protocol change.

## Consequences

- A toolkit author writes data only; a new kind of field needs app code.
- A decision is attributable to a role for the metrics; participants who want unlinkable input use a vote.
- Forms are fixed for a session once loaded; a toolkit turned on mid-session applies from the next session.
- Facilitate keeps its own copy of each recorded decision; readers merge by id, so the same decision in the log and the file counts once.
