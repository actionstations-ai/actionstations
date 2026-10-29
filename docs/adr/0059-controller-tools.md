# ADR-0059: Controller tools keep the clock log, tracker and engagement in `facilitator.json` and run on rules

Date: 2026-10-29 · Status: Accepted · Issue: #428 · Spec: [0428](../specs/0428-controller-tools.md) · Related: ADR-0016 (loose objects), ADR-0049 (branching), ADR-0042 (inject delivery)

## Context

Controllers need to rewind, speed up and nudge the clock, aim an inject at a team, grow the numbers on a social post, and see which injects nobody answered. All of it must work in a room with a projector and no devices, and must not call a model unless asked.

## Decision

- **State stays in `facilitator.json`.** `rate`, `clockLog`, `tracker` and `delivered[row].recipients` are optional keys of the loose `FacilitatorState`. Absent means "none", so older builds and older files read as before. The clock stays `elapsedMin + rate × real minutes since runningSince`; a rate change folds the elapsed time first.
- **A rewind never edits delivery stamps by itself.** Moving back past delivered rows asks; "Mark not delivered" reuses Undo, so with live play it sends `inject.recall` and devices show the item as withdrawn. The clock log records the choice.
- **Recipients are a pure function** (`recipients(row, roles, override?)`): listed roles plus every role on a listed team. `MselRow.toTeams` is optional. Live release targets reuse it, so a team row goes to `team:<slug>`.
- **The tracker is rule-based.** `evaluate()` is pure and linear; the unanswered window is the live dashboard's default (`DEFAULT_RESPONSE_WINDOW_MIN`, one constant). Promise detection is token-based with an input cap, English phrase lists as data. Suggestions wait for the facilitator.
- **Engagement renders to a cache.** `render:engagement` writes `.cache/engagement/<injectId>/<n>.png` from the template with counts applied; `facilitator:present` accepts only that path shape. Stored assets are never replaced. Pack templates declare fields in `meta.json` `engagement`.
- **Deferred, not dropped:** model-assisted commitment scan and reply suggestions (they would add a provider call; the spec keeps them optional), publishing `clock.state` and `controller.notice` to devices, and feeding message and vote responses and device receipts to the tracker. The pure rules for T2 already take a session slice.

## Consequences

- The file grows by at most 5000 clock entries, 500 commitments and 200 suggestions.
- A project with a pack that has a social template not in the built-in map needs `engagement` in its `meta.json` to use the plan.
- The tracker's automatic answers from devices arrive with the live-play hooks; until then answers are recorded by hand.
