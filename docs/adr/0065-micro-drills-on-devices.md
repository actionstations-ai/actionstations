# ADR-0065: Micro-drills on players' devices

## Context

Spec 0437 (FR-17) lets a facilitator send a micro-drill to players' phones. Each player answers alone, the controller's app checks the answer against the plan, and the reply goes to that player only. The drill's expected points, hints and model answers are the controller's material: a player who could read them would not need the hints.

## Decision

- Four frame types: `drill.open` and `drill.close` (host-only, signed, players key), `drill.answer` (player to controller, sealed to the controller like a ballot) and `drill.feedback` (host-only, signed, players key, addressed to one `client:<id>`). `drill.open` carries the situation and the questions. Expected points, hints and the model answer reach a device only inside a `drill.feedback`, one at a time and only after that device asked for a check or a hint. A co-controller cannot sign any of them.
- One run per device. The controller's app starts a solo `MicroDrillRun` (`where: 'player_page'`) when a device first answers, labelled "Participant N". Answers are saved in the project's run files exactly as for a run on this computer; the session log keeps labels and counts, never answer text or a device id. Closing the drill finishes every run and refreshes the program snapshot, so each device is one summary with one participant.
- The same checks as a local run: the three assessment probes decide between model and checklist; in checklist mode the device receives the points to tick after it sends its answer. Hints are the prewritten ones and fade by label.
- Caps: 60 devices per drill and 60 checked answers per device, requests from one device are handled in order, and a drill needs a running live session that is not a surveys-only session.
- `drill.feedback` is sealed with the players key like a message to one player, so it protects against the server and against anyone outside the session, not against a player who extracts the players key from their own device and reads a frame the server addressed to someone else (the server does not deliver it to them). This is the same trust level as `message.send` from the SimCell.

## Consequences

Servers and the hub pick the new types up from `protocol.ts`; the conformance suite checks that a co-controller cannot send them. The player page grows a drill screen and a banner. The facilitator sees each participant's progress by label on the Micro-drills screen. An older player page ignores the new frames.
