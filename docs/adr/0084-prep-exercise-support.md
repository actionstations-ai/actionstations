# ADR-0085: PREP exercise support is data plus a record

Date: 2026-11-05 · Status: Accepted · Issue: #782 · Spec: [0455](../specs/0455-environmental-response.md)

## Context

Plan holders for oil spill response plans follow the PREP Guidelines: an annual Incident Management Team tabletop, a worst case discharge scenario once per cycle, every countermeasure in the plan exercised once per cycle, the 15 Appendix A core components exercised across the cycle, and a signed record. The guidelines are voluntary and differ by plan type (objectives, certification, verification, retention, cycle length).

## Decision

- **Rules are data** in `src/shared/prep`: the 15 components with their sub-items, the objective sets and records rules per plan type (vessel, marine facility, inland facility, pipeline, Area), and the tags that say which inject type or decision form exercises which component. The text was read from version 2016.1 of the guidelines, not recalled.
- **Settings live in the scenario's exercise details** (`conduct.prep`, optional, so older files are unchanged). The designer enters results; the app never decides that an objective was met.
- **Cycle arithmetic and coverage are pure functions**: the year of the cycle for a date, and coverage of the components by the PREP exercises that fall inside a cycle, with components the plan holder marked as not applicable left out.
- **The record is a template** (`prep_exercise_record`, two Letter pages) rendered to a PDF in the project's exports folder. It leaves the signature line empty and lists participant roles, not invented names.
- **Tags come from injects and, later, decisions.** A decision form's id maps to components; until live decisions are stored with the scenario, discussion-only components are ticked by hand.

## Consequences

- A new guideline edition is a data change plus a version line.
- Coverage reflects the scenarios in one project; the multi-year program view can read the same function.
- The wording is generic guidance, never a finding that a plan complies.
