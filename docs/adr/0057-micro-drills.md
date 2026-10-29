# ADR-0057: Micro-drills: prewritten hints, visible fading, separate "practised" count

Date: 2026-10-29 · Status: Accepted · Issue: #437

## Context

Micro-drills are 15-minute practice on one plan annex. The format borrows a graded, fading hint
ladder from a small pilot (four students, intention to use, no learning outcome). Small local
models write unpredictable hints, and a facilitator needs to know exactly what a participant was
shown. The name "Drills" already belongs to the regression drills of #431 (`drills/`, `drills:*`).

## Decision

- Hints are written once, at build time, reviewed by the user before the drill is Ready, and
  stored in the drill. The model never writes a hint at run time; `microdrills:hint` returns the
  drill's own text. The model's run-time jobs are limited to sorting an answer into covered,
  partly covered and missing for the step's own expected points, and one follow-up question.
- The hint rule is deterministic and shown on the run screen: one missed answer before a hint
  normally, two when every participant label has run the annex before and nobody needed Level 3
  last time; Level 3 is withdrawn for a question every label answered without hints in its latest
  two runs. History is keyed by participant label and annex (`micro-drill-hints.json`), not by a
  person.
- Before a model-checked run, three fixed probe answers are assessed (everything, nothing, a
  paraphrase). Any misjudgement sends the run to a checklist and says why. The result is cached
  for ten minutes.
- Build checks are deterministic (`src/main/microdrill/lint.ts`) and block Ready unless the user
  overrides them. An answer's text is escaped and wrapped as data in the assessment prompt.
- The program receives a summary per finished run in `ProjectSnapshot.drills`: section, Core
  Capabilities, counts, minutes, coverage, hints. No answers and no names. The health dashboard
  shows "Practised in drills" per plan section and does not add it to "times cited".
- Names: the code, folders, channels and screen are `micro-drill` / `microdrills:*` /
  "Micro-drills", so they do not collide with the regression drills.
- All user-facing copy and the docs say that the evidence for the format is thin.

## Consequences

- A reviewed, fixed hint set is predictable and can be audited. Hints cannot adapt to an answer
  that goes in an unexpected direction; the follow-up question is the only adaptive part.
- The mock provider needs a word-matching judge for assessment (`providers/mock/micro-drill.ts`)
  so tests and the e2e run see answers judged by their content.
- A deleted drill takes its runs with it; the program keeps the summaries until its next
  snapshot refresh.
- The live player page, drills from a scenario, and run evidence for corrective actions are not
  part of this change.
