# ADR-0122: Pharmacy simulations are small explainable models that scoring can rerun

Date: 2026-11-05 · Status: Accepted · Issues: #696, #904, #905 · Spec: [0463](../specs/0463-pharmacy.md) · Related: ADR-0076, ADR-0082 (epidemiology simulation), ADR-0120

## Context

Real shortage, queue, cold chain and diversion data cannot be fetched for a fictional organization, and the exercise has to stay consistent as players decide: an allocation tier changes the projected stockout, a late move extends the time out of range. The rules must be explainable to a facilitator.

## Decision

- **Four models** in `src/main/toolkits/pharmacy/simulate/`, each a pure function of its parameters (and a seed where it draws random numbers), registered as case-data generators through `generator-modules.ts`: `pharmacy-shortage`, `pharmacy-queue`, `pharmacy-cold-chain`, `pharmacy-diversion`. The framework labels everything simulated.
- **Shortage:** daily stock, usage, deliveries and an allocation percentage in force from a day on. Days on hand is on hand over usage; an allocation lowers what is served, which moves the projected stockout and the unmet doses. The arithmetic is shared with the figures (`src/shared/pharmacy/arithmetic.ts`).
- **Queue:** seeded arrivals with surges, staff who work first in, first out at a service time, staffing changes from a minute on; the age of the oldest item is read against a target.
- **Cold chain:** a unit holds its setpoint, then warms toward the room along an exponential curve after a failure and cools again if cooling returns; door openings add a short bump. Product viability comes from a table of the scenario's fictional products (highest temperature and minutes allowed above it); the table is exercise content, not manufacturer data.
- **Diversion:** peers follow a daytime profile; one user removes a stated multiple of the peer median, bunched in the small hours, with the share explained by a float assignment reported apart from the share nothing explains. Users are fictional codes and presumed innocent.
- **Ground truth carries its own model.** Each generator's events dataset includes a `*_model` event whose attributes are the parameters, so a metric can rerun the model with the team's decisions (an allocation change, a staffing change, a move) and compare outcomes with and without them, without a second copy of the parameters.

## Consequences

- The models are teaching models, not forecasts; every summary says simulated.
- Decision effects on the models are applied by the metrics at scoring time (ADR-0123); the live view of consequences uses the same functions.
