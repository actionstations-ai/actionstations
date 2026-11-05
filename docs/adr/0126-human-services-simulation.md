# ADR-0126: Human services simulations are small queue and arrival models

Date: 2026-11-05 · Status: Accepted · Issues: #710, #712 · Spec: [0464](../specs/0464-human-services.md) · Related: ADR-0075 (figures), ADR-0076 (case data), ADR-0082 (epidemiology simulation)

## Context

The crisis line, shelter, reunification and child welfare exercises need data that agree with each other: a queue board, a wait series, a staffing chart and the events a metric compares decisions with. There is no public history to replay for most of it (shelter counts have no history; contact volumes are published only as monthly aggregates), so the generators write the exercise, and they must never pass as real data.

## Decision

- **Four generators, one random source.** `hs-contact-surge`, `hs-shelter-population`, `hs-reunification-flow` and `hs-displaced-children` are pure functions of their parameters and a seed (`simulate/rng.ts`, mulberry32). The same parameters give the same data on every machine.
- **Contact surge is an interval queue model.** Arrivals are Poisson around a baseline times a surge factor that decays; a number of counselors answers a fixed number of contacts per counselor hour; the rest wait. Contacts waiting beyond the rerouting timer move to backup except the Spanish-language share, which cannot be rerouted; contacts waiting beyond a patience limit abandon. Timers default to the values in GAO-26-108114 as of March 2026 (calls about 2 minutes, texts and chats about 5) and are parameters. Offered always equals answered plus abandoned plus rerouted plus still waiting, and the tests check it.
- **Shelters fill in order.** Arrivals follow a bell curve; evacuees who arrive before any shelter opens wait and are registered at opening; a full shelter spills to the next; when all open shelters are full people are turned away and the hour is recorded. Each resident draws needs from configurable rates; a need is a support requested, never a diagnosis.
- **Reunification is a multi-server queue.** Guardians arrive after a lognormal delay; check-in leads verify one at a time; a share cannot be verified and becomes an exception; a share of students have no guardian.
- **Displaced children are located on a logistic-like curve** with a midpoint that depends on placement type, and a share are never located in the run.
- **Output is ground truth and modeled series.** Datasets use the case-data shapes (ground-truth events, modeled series, plain series) under fixed ids (`HS_DATASETS`) that the metrics and the toolkits name. Every label says simulated; the framework writes `origin: simulated` and no retrieval date.
- **Figures draw through generic kinds where they can.** `hs_contact_series`, `hs_staffing_coverage` and `hs_reunification_flow` build a time series, `hs_queue_board` a status board and `hs_displaced_tracker` a stacked bar, and add the field's own summary (where the measure fell short of its target, the staffing gap, pending and exceptions). The shelter dashboard and map are drawn directly. The map is schematic, with no basemap, and the electricity-dependent overlay carries its counts as text.

## Consequences

- The models are teaching models, not calibrated to any center, shelter or district. The defaults are plausible, not measured; designers set the parameters.
- A replay of real data (published 988 statistics, open shelters, electricity-dependent counts) replaces the simulated series without changing the figure data shape.
- Figures built from one run always agree with the datasets a metric reads.
