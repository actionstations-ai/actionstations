# ADR-0049: Branching scenarios: rules decide, the model proposes

Date: 2026-10-29 · Status: Accepted · Issue: #430

## Context

A decision point in a tabletop should have consequences, but language models used to adjudicate
simulated crises escalate unpredictably and react to wording rather than substance (Rivera et
al., FAccT 2024; Lamparth et al., AIES 2024). A facilitator also needs to defend a choice of path
and to be able to show later which decisions were taken and why.

## Decision

- **Branch membership is a tag on a row.** `MselRow.branchId` (absent = trunk), `MselRow.decision`
  on a DECISION_POINT row, and `Scenario.branches`. The MSEL stays one ordered array, so every
  editor, repair and export that does not know branches keeps working. The graph (lanes, parents,
  paths) is derived by pure functions in `src/shared/branching/`.
- **Rules decide, never a model.** `decide(decision, tally, controllerChoice?)` is a pure rule table
  (plurality, majority, threshold, unanimous, controller) with no randomness; ties and missing
  input fall back to the decision's default option. `activePath`, `pathOrder` and `replay` are pure
  too. No main-process code path writes a decision from a provider response.
- **The model may only propose.** `generate:propose-inject` returns a draft row and its hash as a
  job result; it does not touch `scenario.json` or the facilitator state. A person accepts (the
  renderer saves the row) or rejects, and the verdict is logged.
- **Replay from a log.** Releases, decisions, overrides and proposal verdicts are appended to a
  local session log, `scenarios/<id>/live/local/log.jsonl`, in the live log format. `replay` folds
  it into a state whose sha256 over canonical JSON is stored beside it; **Replay check** compares
  the two, and the scenario hash first.
- **Format 2 only when branched.** `SCENARIO_FORMAT_VERSION` is 2, written only when
  `branches.length > 0`; other scenarios stay at 1 so older builds open them, and an older build
  refuses a branched file instead of showing both sides of a decision as trunk rows.
- The vote input is an interface (`DecisionTallyInput` / `DecisionTallySource`), so decision-point
  voting from players' devices (#414) feeds the same `decide`; until then the facilitator types a
  show of hands.

## Consequences

- Existing scenarios, editors and exports are unchanged; branch rows are skipped by the trunk
  lints (timing, one ENDEX, phase mix) and checked by the branch lints instead.
- The grid shows branch rows in time order with a text label and a bar, not as an indented lane
  under the decision row: lane ordering would have broken drag-to-retime, which reads neighbours.
  The path filter dims rows instead of hiding them for the same reason.
- Branch generation at design time (`branch_plan`) and a presentation-screen view of the decision
  are not part of this change.
