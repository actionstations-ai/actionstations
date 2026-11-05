# ADR-0146: Simulated space weather uses stated simple relations, and the GNSS model counts hours of loss against holdover

Date: 2026-11-05 · Status: Accepted · Issues: #827, #830 · Spec: [0468](../specs/0468-space-weather.md) · Related: ADR-0076 (case data), ADR-0145

## Context

A fictional storm needs series that agree with each other: the flare, the proton event, the solar wind step at arrival, the Kp trajectory and the stated G level, a ground disturbance, a neutral current, GNSS error and the message sequence. Nothing here is a physical model, and an exercise must not mistake it for one.

## Decision

- **One generator, `space-weather-event`.** Parameters are the flare time and class, the peak G and S levels, the CME speed, the arrival uncertainty, the storm duration, the procedure's Kp condition, a ground conductivity factor and the receivers. Everything is derived from the flare time: transit time is one AU over the CME speed, and the peak is six hours after arrival.
- **The stated level wins.** The three-hour interval that holds the peak is set to the peak Kp of the stated G level (5, 6, 7, 8 and 9) and no interval goes above it, so the trajectory and the stated level always agree.
- **One relation for GIC.** Neutral current is 3 A per nT/min of magnetometer change, times a ground conductivity factor. It is stated in the code and the figure, and is not a power flow calculation.
- **Messages in order with lead times.** A watch about a day before arrival, a warning one hour before, an alert as each K-index threshold is first reached (codes go up to 7, the highest seen in the live feeds) and a summary at the end.
- **GNSS model.** Disturbance is the Kp step, held up after the peak for the scintillation hours (days at G4 and above). Error, satellites tracked and alarms follow from it per receiver class. Holdover falls only while GNSS is unusable (error over the limit or fewer than four satellites) and stops at zero. A zone series of hours of loss beyond holdover crosses zero when holdover expires, which is what the failover metric reads.

## Consequences

- Scoring reads ground-truth events and zone series the generator writes, never a real storm's record.
- A user can raise or lower any single effect by a parameter without changing code.
- The model says nothing about real receiver performance; the notices and figures say so.
