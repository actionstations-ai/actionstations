# ADR-0132: Justice timing measures are two small metrics over simulated events and recorded decisions

Date: 2026-11-05 · Status: Accepted · Issue: #737 · Spec: [0465](../specs/0465-justice.md) FR-11 to FR-13 · Related: ADR-0074 (toolkits), ADR-0131 (justice simulation)

## Context

The spec asks for time to unified command, time to a family center, time to an accurate count, time to restore each court function, AMBER timing, message consistency and dispatch service level. It names a generic "time to completion" metric from the human services spec, which is not in the app yet.

## Decision

- **One metric, `justice_time_to_decision`,** measures minutes from a ground-truth event to the decision that answers it. In single mode the clock starts at the first event of a kind and ends when every required decision has been made, so time to unified command needs both a command post and a unified command decision. In paired mode there is one clock per event, matched to a decision by a shared name (the court `system`), and each is judged against that event's own `rtoHours`, so each function is held to its own recovery time objective. If the generic metric arrives later, these configurations move to it.
- **A second metric, `justice_dispatch_service_level`,** reads arrival events of the call surge and reports the share within the designer's target, the mean and the 90th percentile.
- **AMBER timing and message consistency reuse the generic metrics** (decision timing and message consistency) with justice configuration.
- **Decision form ids carry the field prefix** (`justice_restore_system`), and a form's option ids are the slugs the simulation uses for events (`case_management`, `e_filing`), so the pairing works without a lookup table. That is a contract between the forms and the generators.
- **Targets are the designer's.** No national response or recovery standard is assumed; results show the events and decisions they used and say so in their caveats. Nothing scores tactics.

## Consequences

- Changing a form's option labels changes the ids the paired metric matches on; the wiring test covers it.
- Unified command is scored on decisions the team records, not on what the simulation says happened, so a team that never records the decision gets an incomplete result rather than a score.
