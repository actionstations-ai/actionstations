# ADR-0082: Epidemiology simulations are small, documented and seeded

Date: 2026-11-05 · Status: Accepted · Issues: #836, #838 · Spec: [0457](../specs/0457-epidemiology.md) · Related: ADR-0075 (figures), ADR-0076 (case data)

## Context

The epidemiology toolkit needs outbreaks to draw: a curve, a line list, a contact roster, a wastewater series and a dispensing queue. They must agree with each other, be repeatable in tests, and never pass as real data or as a forecast. They are teaching models with parameters the designer sets.

## Decision

- **Compartment model.** SIR and SEIR equations are written out in `simulate/compartment.ts`. The deterministic solver is fourth-order Runge-Kutta with a fixed step (`1 / stepsPerDay` days); cumulative infections and onsets are carried as state, so daily incidence is an exact difference. The stochastic variant is a chain-binomial model on the same rates with a seeded generator. Populations are conserved in both.
- **One random source.** `simulate/rng.ts` (mulberry32) is the only source of randomness. Every generator takes a seed, so a fixed seed gives the same outbreak on every machine. Person-level draws use a stream per person, so one person's draws do not depend on the others'.
- **Common-source generator.** Food consumption, attack rate, exposure time, a lognormal incubation clamped to the pathogen's range, a report delay and a status tier (confirmed, probable, suspect). Companion dishes make plausible distractors. The tests require the true vehicle to have the highest odds ratio across twelve seeds.
- **Contacts, wastewater, dispensing.** A close contact overlaps the case's infectious period for at least a designer-set number of minutes; some contacts are unreachable. Wastewater is the case curve convolved with a gamma shedding kernel plus noise, with a designer-set levels scale labeled simulated. Dispensing is a per-minute queue with Poisson arrivals and lognormal service times.
- **Pathogen facts** live in `src/shared/epidemiology/arithmetic.ts` with their sources. Only incubation and infectious periods are carried, and only for the seven reviewed pathogens.
- **Generators go through the case-data framework** (`epi-compartment`, `epi-common-source`, `epi-contacts`, `epi-wastewater`, `epi-dispensing`), so provenance is written by the framework: origin simulated, never a retrieval date. Line lists and rosters carry an exercise marking in every entry.
- **Figures** (`src/main/render/figures/epi/`) take plain data. The epidemic curve schema takes onset times only, so it cannot be drawn by report date. Status is shown by pattern or shape and a word as well as color. Dispensing and wastewater figures draw through the generic time series kind.
- **Checks.** The solver is compared with the final size relation, with an independent fine-step integration, and for conservation. The figure fixtures are built from the simulations, and their SVG is kept as file snapshots.

## Consequences

- The models are not calibrated to any disease. The pathogen table sets only the incubation and infectious periods that lint rules and the contact generator use.
- Teams that want realism can replace a simulated series with a replayed one; the figure kinds take either.
- A new pathogen needs a cited entry and a reviewer, not new code.
