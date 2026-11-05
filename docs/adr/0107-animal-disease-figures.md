# ADR-0107: Animal disease figures are schematic and compose the generic kinds

Date: 2026-11-05 · Status: Accepted · Issue: #857

## Context

Premises maps, movement maps, trackers and schedules must be exact (project rule 5), accessible, and must never be mistaken for a map of real farms.

## Decision

Six kinds live in `src/main/render/figures/animal/`. The map kinds (`animal_premises_map`, `animal_movement_map`, `animal_inundation_overlay`) draw on the schematic projection of the earth science maps: no basemap and no tiles, only the layers the data carries (premises, zone rings, county and road lines, flood zones). Premises are marked by shape and by the plan abbreviation (IP, CP, ARP, MP and the rest), sized by head count; route status is a line style and a word; every map says positions are simulated. The table kinds (`animal_premises_table`, `animal_sampling_schedule`) and the depopulation tracker compose the generic `table` and `status_board` kinds, so their layout and accessibility come from those. The epidemic curve and tracing diagram of confirmed premises use the shared `epi_curve` and `epi_contact_network` kinds, fed by builders in `src/main/toolkits/animal_disease/figure-data.ts`. Designations in the builders come only from what the response team knows on the chosen day, so undetected infections stay hidden.

## Consequences

No network or licence question for base maps; a county outline or road lines are optional data the scenario supplies. Every figure carries a summary and a data table, and each has a golden in the `figure` template.
