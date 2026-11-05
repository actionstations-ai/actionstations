# ADR-0154: Humanitarian measures reuse the generic timing metrics; two new ones cover gaps and coverage

Date: 2026-11-05 · Status: Accepted · Issues: #914, #915 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0150..0153, ADR-0082

## Context

Spec 0469 asks for gap closure, needs coverage, staff safety timing, pipeline timing and message consistency. Threshold timing, decision timing and message consistency already exist. Gap closure (assigned, then covered, share open) and coverage against a facilitator-entered target did not exist on main when this was built.

## Decision

- **Configure the generic metrics where they fit.** Staff safety decisions are threshold timing on a simulated threat level series (movement stop, alert shared and family notified at the first sign of a threat; hibernation, relocation and evacuation at a serious threat). Pipeline and outbreak decisions are decision timing against the break and the declaration threshold. Message consistency lists the four parties.
- **Two humanitarian metrics**, prefixed `humanitarian_`: `humanitarian_gap_closure` reads `gap_open` events and the assign and confirm decisions; `humanitarian_needs_coverage` reads the coverage records the facilitator enters, with the target entered each time. Neither assumes a standard: Sphere indicators stay referenced, not computed.
- **Decision form ids are prefixed `humanitarian_`** because the ids become decision kinds that every metric reads. The forms the metrics read (assign gap, confirm gap covered, record coverage, stop movements and the rest) are part of the metric's contract.
- **The library is links, not documents.** No humanitarian reference was verified as public domain this session, so the guide and pack README link the references with a short summary, and nothing is bundled. A library pack with no documents is not built.
- **Capabilities.** Seven FEMA Core Capabilities carry checkable tasks and a mapping to the six humanitarian capability areas.

## Consequences

- If a shared gap or coverage metric lands on main, these two can be replaced by configuration of it; the decision form ids would stay.
- Example projects need generation with a local model and stay open until that is run.
