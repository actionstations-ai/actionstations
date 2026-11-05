# ADR-0086: Guidebook distances are entered or invented, never bundled

Date: 2026-11-05 · Status: Accepted · Issues: #802, #796 · Spec: [0456](../specs/0456-ems-fire.md) FR-4, FR-6

## Context

A hazmat exercise needs isolation and protective action distances. The Emergency Response Guidebook publishes them, but no public-domain statement for its text and tables has been confirmed, so the app cannot ship them. A figure that shows invented numbers next to a real UN number would also look like real guidance.

## Decision

- **No guidebook content ships.** The hazmat toolkit and its templates carry no guide text and no distance table. Previews use a fictional material with invented distances.
- **Three ways to get numbers.** The facilitator types them from their own copy and names the edition; the scenario uses a fictional material and labels the numbers as invented; or, once terms are confirmed, a data file (`ErgTable`, edition plus entries) is loaded. The zone figure refuses numbers entered from a guidebook without an edition, and always prints where the distances came from.
- **The zone figure is a plain plan.** `protective_action_zone` draws the isolation circle and the downwind square from the wind, with a scale bar, a table and the places inside or outside each zone, and `zoneGeoJson` gives the same polygons for map overlays. It does not model dispersion.
- **A lint rule backs the labeling.** `erg_distance_untabled` flags a real UN number that appears with distances in the same sentence when no loaded table matches, unless the sentence is marked fictional or names the guidebook.
- **Triage figures** (`triage_counts`, `patient_tracking_board`, `hospital_capacity_board`) print every priority as a word and a fill pattern; the numbers are drawn from data and never generated as pixels.

## Consequences

- Handbooks can state the source of every distance because the figure and the decision form carry it.
- Adding a table later is a data file and a registration, not a change to the figure.
- The rule is registered with the field lint rules, so it runs on the injects of the hazmat types and the common report types.
