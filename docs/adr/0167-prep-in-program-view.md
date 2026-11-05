# ADR-0167: PREP cycles in the program view

Date: 2026-11-05 · Status: Accepted · Issues: #782 · Spec: [0455](../specs/0455-environmental-response.md) · Related: ADR-0085 (PREP exercise support), spec 0438 (program view)

## Context

PREP exercise settings, per-scenario coverage and the exercise record shipped earlier. FR-10 also asks for coverage across a project's exercises in the program view and the cycle position.

## Decision

- A project snapshot carries an optional `prep` block per scenario (plan type and holder, first date, cycle start, components reached, not-applicable components, worst case discharge, countermeasures in the plan and exercised). It holds no names and no result text.
- `prepCycles` (`src/shared/prep/program.ts`) groups exercises by plan type and plan holder across the linked projects, takes the cycle from the newest exercise that names a start, and reuses `cycleCoverage`. The renderer computes the view from `program:snapshots`; no new IPC channel.
- The Overview shows a PREP card only when some linked project has a PREP exercise. The component finder moved to `src/main/exercises/prep-components.ts` so the snapshot does not load the PDF renderer.

## Consequences

Decisions made in live play are not stored with the scenario, so coverage still counts injects and discussion only. Snapshots written before this change have no `prep` block until the next refresh.
