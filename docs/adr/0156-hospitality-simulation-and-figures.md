# ADR-0156: Hospitality simulations are seeded, coded and labelled; the figures draw counts, not maps

Date: 2026-11-05 · Status: Accepted · Issues: #837, #840 · Spec: [0470](../specs/0470-hospitality.md) · Related: ADR-0075 (figures), ADR-0076 (case data), ADR-0082 (epidemiology simulations)

## Context

The hospitality exercises need counts that agree with each other: cases by day, the day a level is crossed, the reports a ship would send, persons not yet counted at muster, guests per floor, departures against a closing road. Metrics need ground-truth events to compare decisions with. The epidemiology generator models outbreaks from food and contacts; a ship's medical log needs only onset times by group.

## Decision

- **Outbreak at sea** (`hosp-outbreak-at-sea`) draws each ill person's onset around a peak day (crew half a day later), thins cases after isolation starts, and reads cumulative counts, crossings of 2 and 3 percent, and the 24-hour, 4-hour and special reports off the sorted onset times. It reuses the epidemiology toolkit's seeded random source and no other part of it.
- **Emergencies** (`hosp-muster`, `hosp-hurricane`, `hosp-tower-fire`, `hosp-reservation-cyber`) are small parametric timelines. A muster plants a stated number of persons who are counted late; totals reconcile at every minute.
- **Persons are codes** (`P-0001`, `C-014`, `Guest A`); every dataset label says simulated and the log text carries the exercise marking. Events are text entries holding ground-truth JSON, as in epidemiology, so every reader of case data reads them. Cumulative percentages are also written as a modeled series per group.
- **Figures** draw counts: an outbreak curve against the 2 and 3 percent levels, a muster board, a floor status board, a departures timeline and an itinerary port board. The port board is a schematic list, not a map; geographic overlays belong to the weather toolkit. Each figure writes a summary and a table, uses patterns and words as well as color, and rejects data that does not reconcile.

## Consequences

- The models are not calibrated to any ship or property; they give consistent teaching data from parameters.
- A map of the itinerary with a storm cone is not drawn here; scenarios that need one use the weather toolkit's overlays.
