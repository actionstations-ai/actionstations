# ADR-0050: Votes keep ballots unlinkable to devices, and fold small roles under k

Date: 2026-10-29 · Status: Accepted · Issue: #414 · Spec: [0414](../specs/0414-decision-voting.md) · Related: ADR-0027 (protocol), ADR-0042 (inject delivery)

## Context

At a decision point the facilitator wants every seat counted, not the loudest voices. People vote what they think only if the ballot cannot be traced to them, in the room and later in the log, and a split by role in a small room can point at one person (a role held by one or two devices).

## Decision

- **Ballots are sealed to the controller** (`vote.cast`, key `c`). Dedupe, change of vote and the in-scope check use a map from device to ballot kept in the controller's memory only. It is dropped two minutes after the vote closes, which is also the reopen window. It is never written to disk.
- **The log carries no device reference for a ballot.** An anonymous `vote.cast` has the option and the time (`actor` is `client` with no `clientRef`, no seat, no `env`). A changed ballot is a second line that names the option it replaced (`changedFrom`), so the log can be tallied without a device. Refused ballots (out of scope, unknown option, after close) are `anomaly` lines with no device either.
- **By role is explicit, and guarded.** The group size `k` is 3 by default and never under 2. A role with fewer than `k` devices in scope (connected, or having voted) is shown and logged as `other`; `vote.close.byRole` carries folded counts per role and option, never one entry per ballot. If the folded group would be a single device it is left out of the split, since "Other" would then name one person. The form warns before opening when a role in scope is under `k`.
- **The tally is derived from the ballots held, not counted separately,** so a change of vote cannot double count, and updates to the projector and to devices (live results, when on) are batched at four a second.
- **A vote still open when the session ends is closed as `interrupted`** with the tally so far, so the log never ends with an open vote. Resume (spec 0417) will replay the same way.
- **The result leaves the controller as a callback** (`onVoteClosed`) with the options, counts, leaders and status, so scenario branching (#430) can read it without parsing the log.
- **Recording a decision returns the entry, and Facilitate adds it.** The facilitator page owns `facilitator.json` and saves the whole file; a write from the main process would be overwritten by the next save from the page.

## Consequences

- Anyone with the controller's memory during an open vote could link ballots to devices. That is the controller's computer, which already holds every key.
- Someone watching the room can still guess how a person voted from timing. The log keeps the time of each ballot; that is the cost of a log that can be audited.
- A vote with `liveResults` shows the tally to devices before they vote; it is off by default for that reason.
