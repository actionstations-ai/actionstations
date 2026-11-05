# ADR-0106: Animal disease zones, spread and capacity as simple seeded models

Date: 2026-11-05 · Status: Accepted · Issue: #860, #862

## Context

The exercise needs zones drawn from the plans, fictional premises for a county, spread over time and a depopulation backlog, with every number traceable and nothing passing as a forecast of a real outbreak.

## Decision

`src/main/toolkits/animal_disease/` holds four small pieces. `zones.ts` computes zones from great-circle distance to the closest infected premises using the plan minimums in `plan-rules.ts`; the designer can override sizes with a recorded reason, and an FMD run must state its sizes because the FMD zone sizes are not verified here. `simulate/premises.ts` places fictional premises around hubs from a county inventory. `simulate/spread.ts` infects by a distance kernel with a hard maximum distance or along movement links, with controls cutting movement, using the epidemiology toolkit's seeded random source. `simulate/capacity.ts` is a queue (crews, a daily working window, disposal sites with capacity and travel) and a vaccination throughput model with checkpoints and a cold chain window. Two generators, `animal-premises-spread` and `animal-depop-capacity`, write premises features, presumptive positive and depopulation events for scoring and series, all labeled simulated.

## Consequences

Runs repeat exactly for a seed and every rule has a worked example in the tests. The models are teaching tools: they carry no calibration to real farms, and the product says so.
