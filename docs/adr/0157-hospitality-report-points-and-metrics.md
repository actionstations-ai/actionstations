# ADR-0157: Report points before arrival are triggers placed by the scenario; two metrics are field code

Date: 2026-11-05 · Status: Accepted · Issues: #843, #848 · Spec: [0470](../specs/0470-hospitality.md), [0426](../specs/0426-regulatory-clocks.md)

## Context

42 CFR 71.21(c) and the VSP standards put the gastroenteritis reports before arrival: 24 to 36 hours before, and at least 4 hours before. The clock engine counts forward from a trigger, and spec 0470 asked whether a clock term should gain a "before" direction.

## Decision

- **No engine change.** The regulation `cdc_ship_illness_reporting` defines triggers for the ship being 36 hours and 24 hours from arrival. The 24-hour clock is those 36 hours plus 12 hours; the 4-hour clock is the 24-hour trigger plus 20 hours. The scenario places the triggers from the expected arrival time, and the simulated outbreak writes the same points as ground-truth events.
- **Special reports** follow the 2 and 3 percent levels. The standards state no interval for them or for the immediate report, so those clocks carry a short exercise allowance (60 and 30 minutes) and say so in their rule text. The designer may change it.
- **Two metrics are code:** `hospitality_report_timeliness` scores each report point against its window (a report filed before the 24-hour window opens does not count) and `hospitality_accounting` times the declaration that everyone is accounted for and flags a declaration made while persons were still missing. Time from a level to an action, and message consistency across audiences, use the shared metrics.
- **Form ids carry the field prefix** (`hosp_report_to_authority`, `hosp_guest_accounting`), and the metrics read the option ids those forms produce, tested through the live form conversion.

## Consequences

- A scenario that places the triggers wrongly gets wrong deadlines; the simulation and the regulation test show the arithmetic.
- The regulation is bundled in the hospitality pack, so it is available to a project that switches the domain's regulations on.
