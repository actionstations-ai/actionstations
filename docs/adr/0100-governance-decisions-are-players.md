# ADR-0100: Governance determinations are decisions players make, not calculations

## Context

The governance toolkit (spec 0459) works the materiality call for a cyber incident and the disclosure clock that follows it. A tool could compute "material" from a financial estimate, but materiality turns on quantitative and qualitative factors and on judgment, and the toolkit is an exercise aid, not legal advice.

## Decision

- The materiality determination, the filing, the ransom decision and the board notice are structured decisions that players record. The app never computes or suggests the answer.
- The metrics time those decisions against the simulated incident and the regulatory clocks and list gaps in their documentation. They state times and do not judge them; a target for discovery to determination exists only when the designer sets one.
- The simulated incident gives early facts that are incomplete or wrong, a financial range that widens and narrows, and recovery that follows dependencies, so the call has to be made without certainty. It writes ground-truth events and modeled series the metrics read.
- Documents use a fictional company with no ticker, and carry the line "Exercise aid, not legal advice." Format rules check both.
- An Attorney General delay is modeled as its own clock that starts from a manually fired trigger; it replaces the first clock only when the facilitator says so.

## Consequences

- The toolkit cannot say a team decided wrongly, only when and with what record. Practitioners review the guidance before use.
- Firing the clock trigger from a recorded determination stays a facilitator action until the framework can map a recorded decision to a compliance trigger.
