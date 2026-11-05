# ADR-0131: Justice figures reuse the generic renderers and simulations write ground-truth events

Date: 2026-11-05 · Status: Accepted · Issues: #731, #734 · Spec: [0465](../specs/0465-justice.md) FR-8, FR-10 · Related: ADR-0075 (figures), ADR-0130 (coordination level)

## Context

The justice field needs boards and charts that players read during an incident (unit status, an incident timeline, a jail count by housing area, court functions against recovery time objectives) and simulated events that a metric can score decisions against. Nothing should draw tactical detail, and counts and times must be exact.

## Decision

- **Six figure kinds with a `justice_` prefix**, in `src/main/render/figures/justice/`: unit status, incident timeline, jail population and count status, court continuity board, court recovery timeline and filings backlog. The timeline, recovery timeline and backlog delegate to the generic annotated timeline and bar kinds with fixed lanes and labels. The three boards share one state board renderer that uses the field's own words ("On scene", "Count not clear", "Restored late") beside the color and symbol, so no state relies on color.
- **Boards say building-level things only.** A unit's location is a free text field the guardrails check; no kind takes coordinates inside a building.
- **Simulations write ground-truth events**, not narrative: call received and unit arrival, incident milestones and agency arrivals, count and movement entries, system down and restored, audit discrepancies. Each is a pure function of its parameters (a seeded generator where randomness is used), labeled simulated.
- **Consistency is checked in the generator.** A jail count that differs from the expected population is explained by the movement log (`unexplainedDifferences` is zero when every move is logged and non-zero when one is not). A court restoration order that restores a system before one it needs is refused when the parameters are parsed.
- **Not included yet:** the incident map with staging and the family center, and the connectors for open call data, jail statistics and active shooter reports (#734), which need recorded fixtures from live services.

## Consequences

- The boards and charts share rendering code with the rest of the app and need only their own tests and goldens.
- Metrics (ADR-0132) read the event kinds listed above, so those kinds are part of a contract between the generators and the metrics.
