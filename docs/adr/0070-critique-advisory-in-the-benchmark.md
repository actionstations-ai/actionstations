# ADR-0070: Critique is advisory in the benchmark, and is scored on the revised scenario

## Context

The benchmark (spec 0434) scored critique from the stored notes alone, before looking at the
revision the critique stage makes. Two things were wrong (#592):

- A planted defect the revision removed still counted as missed. In a saved run the planted
  duplicate row was in the snapshot taken before the critique and gone afterwards, and scored zero.
- A revision that broke correct rows cost nothing. In the same run the revision rewrote two
  pressure rows (their deliberate false phone number was replaced and their expected actions
  changed), and a stage that hurt the scenario scored as well as one that did not.

A single run swung 15 to 30 points per case, and critique sat inside the floor, so a model could
be refused a recommendation for a stage that is a reviewer's aid, not the draft.

## Decision

- A planted defect counts as **found** when a note names it or the revised scenario no longer has
  it (**fixed**). Both counts are kept, because a fix with no note is still a fix but is worth
  knowing apart from a note.
- **Damage** is the weighted share of rows outside the planted defects that the revision removed,
  gave a different sender, or rewrote past 60% word overlap in the event or expected action.
  Pressure, misinformation, clue and red-herring rows weigh three times the others, because their
  content is deliberate. The critique score includes it as an `intact` part (weight 0.25).
- **Critique is advisory.** The recommendation floor is drafting at least 50, drafting reliability
  at least 90%, ideation at least 50, and stable. Critique recall, fixed and damage are reported
  next to it with a plain warning when recall is under the floor score or damage is over 10%.
  Critique still counts in the overall score used to rank models that pass.
- `scoringVersion` is 2. Runs at version 1 are archived, not ranked with version 2.
- Critique cases the standard suite does not use are kept as a **held-out** list
  (`bench/suites/held-out.json`), left out of the exported task set.
- `pnpm bench:rescore <run-dir>` scores saved runs again from their work folders, with no model.

## Consequences

- A model with weak notes but sound drafting can be recommended; the report says what its critique
  does so the user can decide whether to rely on it.
- Existing run files are scored under version 1 and archived. Saved work folders can be re-scored
  to compare; the run file itself needs a fresh run to publish.
- Damage thresholds (60% overlap, triple weight, 2 points per percent) are judgement calls and live
  in code and the suite file, so a change is a new scoring version.
