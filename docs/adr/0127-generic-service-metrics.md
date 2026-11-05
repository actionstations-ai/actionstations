# ADR-0127: Service level, time to completion and needs coverage are generic metrics

Date: 2026-11-05 · Status: Accepted · Issues: #713 · Spec: [0464](../specs/0464-human-services.md) · Related: ADR-0074 (toolkits), ADR-0082 (epidemiology metrics)

## Context

Human services exercises are scored on answer rates and waits, on how long it takes to finish something for everyone in a group, and on whether the needs that came up were met. The justice and humanitarian fields use the same three measures for other services, so the ids and settings must not be human-services-only.

## Decision

- **Three generic metrics, registered with the built-in set** (`service_level`, `time_to_completion`, `needs_coverage`, in `src/main/evaluation/metrics/`), not by a human services register function, so any toolkit can configure them. Their ids are the only ones in this field without the `hs_` prefix, because the other fields share them.
- **Service level reads a modeled series** (offered, answered, abandoned, rerouted, average and longest wait per channel), so the same metric scores a simulated surge and a replay of published statistics. The target is a setting whose default is a published goal, and the goal and its source are printed in the result inputs. The share answered promptly is estimated from intervals and the result says so.
- **Time to completion counts open members, not zeros.** The start is an event or a decision; the group comes from events when the scenario has them; a completion is a decision of a kind naming the member, optionally qualified by a field value (`identity_check:verified`). Median and slowest are over completed members, and the open ones are listed.
- **Needs coverage matches decisions to recorded needs** by category (and place when both name one), earliest unmet need first, with a count per decision. Needs are supports requested, never diagnoses.
- **Choice values are compared as option ids.** Live play stores a choice as a slug of its label, capped at 40 characters, so the toolkits keep the labels the metrics read short and the tests assert the ids.
- **The shelter opening uses the existing threshold timing metric**, against a simulated wind series written for each shelter site. Surge response uses decision timing against the queue-over-timer events.

## Consequences

- Justice and humanitarian configure these metrics with their own event kinds and decision kinds and need no new metric code.
- A decision that records time as an exercise-clock "H:MM" cannot yet complete a member with a stated time; doors open is a separate report decision for that reason.
- The default answer rate target will go out of date; it is data in the toolkit, not code.
