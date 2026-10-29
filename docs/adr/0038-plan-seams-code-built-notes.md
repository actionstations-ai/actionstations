# ADR-0038: Plan seams: pinned passages, code-built controller material

Date: 2026-10-29 · Status: Accepted · Issue: #427 · Spec: [0427](../specs/0427-injects-at-plan-gaps.md) · Related: [ADR-0028](0028-deterministic-grounding-first.md)

## Context

The plan check (#423) finds places where two of the organization's plans disagree. #427 turns up to three of them ("plan seams") into injects that put players exactly there. The facilitator must see both passages word for word to recognize the moment, players must not be told, and retrieval may not return the two passages for the phase that tests them. A local model also often forgets an optional field such as "this row tests seam S1".

## Decision

**Seams are snapshotted into the scenario.** `Scenario.seams` copies the picked findings (both passages, slot, verdict) when the phase plan runs, so a scenario stays readable when the plan check runs again or the file goes away. `SEAM_OUTDATED` says when the finding was dismissed or went outdated since.

**The two passages are pinned, not retrieved.** `StageCall.pinnedChunkIds` puts the passages of the seams placed in a phase first in that phase's `msel_phase` prompt (C1..Cn), then the retrieved hits not already among them, up to the prompt's `k`. They count against `k` and survive `maxRetrieved`; the lowest-ranked retrieved hits are dropped instead. Only the one phase's prompt carries them (at most two chunks per seam).

**Everything a facilitator reads about a seam is built by code.** The controller block appended to an inject's instructor note, the handbook's "Plan seams this exercise tests" section and the hot wash question are rendered from the snapshot by `src/shared/seams.ts` and `src/main/generate/seams.ts`. The model writes the inject; it never writes the passages. The controller block starts with a fixed `Plan seam:` line, so it can be split from the written note, rebuilt on regenerate and kept when the user edits the note.

**Every picked seam leaves the pipeline with a row.** The model is asked to tag the row (`seam: "S1"`); an untested seam is a need of the existing mix completion pass and of the repair job; when neither produced a row, code assigns the best-fitting row of the phase (one citing the passages, else the decision or main-story row; never a control card, a NOISE or RED_HERRING row, or a locked row) and records `SEAM_ROW_ASSIGNED` so the designer can check it. Seam rows always cite both passages and never carry a NOISE or RED_HERRING tag; they are never spare or trimmed.

## Consequences

- Works the same with the mock provider and with a prompt override that lacks the seam blocks.
- An assigned row may only touch the seam loosely; the critique is asked whether each seam row makes the conflict unavoidable, and its error notes revise the row.
- No new model calls: seams add text to prompts that already run.
- Player material (briefing, SitMan player edition, inject pages, the presented screen) never reads the seam snapshot or the controller block.
