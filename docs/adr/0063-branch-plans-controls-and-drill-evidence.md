# ADR-0063: Proposal jobs for branch rows and control suggestions

Date: 2026-10-29 · Status: Accepted · Issue: #499 (parts of #426, #430, #437)

## Context

Three follow-ups ask a model for help inside the MSEL editor: rows for each option of a decision,
framework controls for a row, and drills from a scenario. The editor works on an in-memory draft
that autosaves, and a generation job that rewrote `scenario.json` would race with unsaved edits.

## Decision

- `generate:branch-plan` and `compliance:suggest-model` are jobs that return a proposal and never
  write the scenario, like `generate:propose-inject`. The editor applies a proposal to its draft
  after the person reviews it, so the change saves and undoes like any other edit. The buttons are
  disabled while edits are unsaved because the jobs read the saved scenario.
- Branch rows are checked on a copy of the scenario with the structural repairs, which now know
  branch windows: a branch plays between its decision row and its rejoin row, and a branch that
  ends the exercise has its own ENDEX.
- Model-assisted control mapping is a per-project switch, off by default. Rules (plain data, no
  model) run when a phase is generated and store suggestions on rows.
- Drills from a scenario are ordinary draft drills built one per tested plan section. A drill run
  offered as evidence for a corrective action uses only the totals the program keeps, and the
  verification method is Review with a note naming the run.

## Consequences

- No new write path to `scenario.json`, and no change to the pipeline's step list.
- A proposal can go stale if the scenario changes while the job runs; applying replaces only the
  unlocked rows of the planned branches.
- Spec 0430 FR-11 says `generate:rerun-stage`; the spec records the difference.
