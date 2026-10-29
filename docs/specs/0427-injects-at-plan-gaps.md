# Spec 0427: Injects aimed at the gaps between plans

Issue: #427 · Milestone: 0.7.0 · Status: Implemented (ADR-0038) · Depends on: #423 · Related: #433

## Summary

The contradictions and dangling references that the Plan check (#423) finds become material for
the exercise. The designer can pick **plan seams** to test; ideation proposes scenarios built
around them, and the MSEL gets injects that put players exactly where the two plans disagree. The
controller notes for those injects quote both passages, so the facilitator knows what to watch
for and the hot wash can turn the finding into a plan fix.

## As built

Where the code differs from the design below, and why:

- `ScenarioSeam` also stores `slot` (the FR-5 fallback needs it) and `confirmed` (the finding's verdict was `contradicts`), so the picker, the controller block and the handbook can say "unconfirmed" (open question 4).
- `brief.seamIds`, `ScenarioIdea.seamIds`, `IdeasOutput.ideas[].seams` and `PhasePlanOutput.seamPhases` are optional rather than defaulted, so existing callers and fixtures need no change; absent means none.
- The model's seam keys are plain strings (`max 16`), normalised by the mapper (`s1`, `S-1` → `S1`) and dropped when unknown, so a sloppy key never costs a repair round.
- FR-4 is guaranteed by code as a last resort: when neither the phase call nor the mix completion pass (or the repair job's mix call) tagged a row, the best-fitting unlocked row of the phase is given the seam (`ensureSeamRows`) and a `SEAM_ROW_ASSIGNED` info note is recorded, like `DECISION_POINT_RETAGGED`. This is what makes the mock provider and prompt overrides without the seam block work.
- FR-6: a seam row tagged outside the four seam tags is re-tagged to the nearest one (NOISE / RED_HERRING / CONFUSION → OPERATIONAL_FRICTION, MISINFORMATION / DISTRACTION → PRESSURE, CLUE / TECH_HURDLE / END_GAME → CORE_NARRATIVE). Seam rows are never spare rows for the mix pass and never trimmed.
- `StageCall` also gained `decorateVars(retrieved)`, so the msel_phase prompt can name the pinned passages' C keys.
- The MSEL grid's Seam tag shows the passages as tooltip and screen-reader text instead of a popover, so the grid's keyboard navigation is unchanged.
- The Seam marker in the controller MSEL is added in `views.ts` to the Source check cell ("Grounded · Seam"); it shows when the export asks for that column.
- `SEAM_OUTDATED` needs the plan check's file, so it is computed where the file is read (Scenario checks and the critique step), not in the pure `lintScenario`.

## Requirements

### User stories

- As an exercise designer, I want ideas built around the places where our plans disagree, so that
  the exercise finds real weaknesses instead of generic ones.
- As a facilitator, I want the controller note on a seam inject to show both conflicting passages
  with document, section and page, so that I can recognize the moment players hit the conflict.
- As an emergency manager, I want the after-action material to list each seam tested and what
  players did, so that the plan owners get a concrete fix list.

### Functional requirements

- **FR-1** A **seam** is an open or confirmed `PlanFinding` from `<project>/plan-conflicts.json`
  (#423) with kind `contradiction` (verdict `contradicts` or `unconfirmed`) or
  `dangling_reference`. Dismissed, outdated, `consistent`, `complementary` and `unrelated`
  findings are never seams.
- **FR-2** The brief form gets a **Plan seams to test** picker listing seams (slot label, both
  document names, verdict). The designer selects zero to three. Selection is stored in the brief.
  When no Plan check has run, the picker offers to run one (`plan-check:run`).
- **FR-3** **Give me ideas** has a "From plan seams" option. When on, the ideate stage receives the
  seams and asks for ideas where at least one idea per seam (up to `count`) puts that seam under
  pressure. Each idea records the seam ids it targets; the idea card shows "Tests: Who approves
  public releases (EOP vs Crisis Communications Plan)". Starting a scenario from such an idea
  preselects its seams.
- **FR-4** For each selected seam, the pipeline guarantees at least one MSEL row that forces
  players to act in the seam's slot (for example an inject where a press statement needs approval
  and both named approvers are reachable). Selected seams are pinned into the `msel_phase`
  retrieval of the phase they are planned for, so both passages are always citable (C keys) no
  matter what the retrieval queries return.
- **FR-5** Seam placement: `phase_plan` receives the seams and assigns each one to a phase in its
  beats (output field `seamPhase` per seam). When the model omits one, the deterministic fallback
  places it in the decision phase (`decisionPhaseIndex`) or, for a notification or deadline slot,
  the first phase after STARTEX.
- **FR-6** Every row that tests a seam records `seamId`, cites **both** passages (the mapper adds
  any citation the model left out), and has `purposeTag` `CORE_NARRATIVE`, `PRESSURE`,
  `OPERATIONAL_FRICTION` or `DECISION_POINT`, never `NOISE` or `RED_HERRING`.
- **FR-7** The inject for a seam row carries a deterministic controller block appended to
  `instructorNote` after the model's note, never written by the model:

  ```
  Plan seam: Who approves public releases.
  EOP › Annex B › B.4 (p. 31): "Releases are approved by the Incident Commander."
  Crisis Communications Plan › 2.1 (p. 4): "All releases require approval of the City Manager."
  Watch for: whether players notice the conflict, who they ask, how long the decision takes.
  ```

  Both passages are also in the inject's `citations`. The block is rebuilt (not duplicated) when
  the inject is regenerated, and survives user edits of the model part of the note.

- **FR-8** The controller handbook gets a **Plan seams this exercise tests** section (generated
  deterministically from the scenario and the conflicts file, appended after the handbook stage):
  per seam, the two passages, the rows that test it, and blank lines for the facilitator's
  observations. Player material (briefing, player inject pages) never mentions seams.
- **FR-9** The hot wash gets one question per seam ("Our EOP and the Crisis Communications Plan
  name different approvers for public releases. Which did you follow, and which should the plans
  say?"), added deterministically to `hotwash.questions` with `topic: "Plan seam"` and linked to
  the seam's rows.
- **FR-10** Facilitator mode (`src/renderer/src/routes/facilitate/InjectPanel.tsx`) shows a
  "Plan seam" tag on seam injects and the two passages in the controller panel only, never on the
  presented screen.
- **FR-11** New checks, listed in the lint bar and Scenario checks with plain messages:
  - `SEAM_NOT_TESTED` (warning): a selected seam has no row with its `seamId`.
  - `SEAM_CITATION_MISSING` (warning): a seam row lacks one of the two passages.
  - `SEAM_WEAK_TAG` (info): a seam row is tagged NOISE or RED_HERRING.
  - `SEAM_OUTDATED` (info): a selected seam's finding is now dismissed or outdated (the plan was
    fixed or re-ingested); suggestion: keep the row as history or re-run the phase.
- **FR-12** The critique stage receives the seam list and is asked whether each seam row makes the
  conflict unavoidable for players; its notes use the existing critique path.
- **FR-13** Export: the handbook section (FR-8) is part of the handbook PDF and DOCX; the
  controller MSEL marks seam rows with "Seam" in the Source check column from #423. Player-facing
  exports are unchanged.

### Non-functional requirements

- **NFR-1** Cost: no extra model calls beyond the stages that already run; seam text adds at most
  two pinned chunks per seam to one `msel_phase` prompt (Project rules 1).
- **NFR-2** Privacy: pinned passages go only to the provider routed to `draft`; with a cloud
  provider they appear in the #433 preview like any excerpt (Project rules 3).
- **NFR-3** Accessibility: the seam picker is a labelled checkbox group with a visible count limit
  message; the "Plan seam" tag has text; WCAG 2.2 AA contrast.
- **NFR-4** Prompt size: pinned chunks count against `fm.retrieval.k`; when the phase already has
  `k` chunks, the lowest-ranked retrieved chunks are dropped, never the pinned ones. The existing
  `maxRetrieved` reduction (#347) also keeps pinned chunks.
- **NFR-5** Determinism: with the mock provider, the same brief and seams produce the same seam
  rows, controller blocks, handbook section and hot wash questions.

### Out of scope

- Writing corrected plan text.
- Seams across projects.
- Grounding labels themselves (#423).
- Inject media for seams (normal media path applies).

## Design

### Data model

`src/shared/schemas/scenario.ts`:

```ts
// ScenarioBrief
seamIds: z.array(z.string()).max(3).default([]),

// Scenario (loose object), snapshot so the scenario stays readable if the conflicts file changes
seams: z.array(z.object({
  id: z.string(),                 // PlanFinding.id
  slotLabel: z.string(),
  kind: z.enum(['contradiction', 'dangling_reference']),
  a: PlanPassage,
  b: PlanPassage.optional(),
  values: z.tuple([z.string(), z.string()]).optional(),
  missingTarget: z.string().optional(),
  phaseId: Id.optional(),         // FR-5 placement
})).default([]),
```

`MselRow` gains `seamId: z.string().optional()`. `MselRow` is a strict `z.object`, so an older
build drops the field on save; the scenario-level `seams` list plus citations still let the newer
build re-link rows (`relinkSeamRows`: a row citing both passages of a seam gets its `seamId`
back). `ScenarioIdea` gains `seamIds: z.array(z.string()).default([])`.

`src/shared/schemas/generation.ts`:

- `IdeasOutput.ideas[]` gains `seams: z.array(SeamKey)` where `SeamKey = /^S\d+$/` (seams shown in
  the prompt as S1..Sn, mapped back like citation keys; unknown keys dropped and reported).
- `PhasePlanOutput` gains `seamPhases: z.array(z.object({ seam: SeamKey, phase: z.number().int() }))
.default([])`.
- `MselRowOutput` gains `seam: SeamKey.optional()`.

### Pipeline changes

```
src/main/generate/seams.ts
  loadSeams(root, ids)           read plan-conflicts.json (#423 conflicts-file.ts), filter FR-1
  seamVars(seams)                prompt variables: S keys, slot label, both passages (escaped)
  placeSeams(s, output)          FR-5 placement with fallback
  pinnedChunkIds(s, phase)       chunk ids of seams placed in this phase
  applySeamRows(s, rows, chunks) FR-6: seamId, both citations, tag correction
  controllerBlock(seam)          FR-7 text; upsertControllerBlock(note, seam)
  handbookSection(s)             FR-8 markdown
  hotwashQuestions(s)            FR-9
  relinkSeamRows(s)              re-link after an older build stripped seamId
  lintSeams(s, file)             FR-11
```

- `src/main/generate/stage.ts`: `StageCall` gains `pinnedChunkIds?: number[]`. `runStage` looks
  them up with `index.chunk(id)`, puts them first as C1..Cn, then appends retrieved hits that are
  not already pinned, up to `fm.retrieval.k` (NFR-4). The `maxRetrieved` splice keeps pinned
  entries.
- `src/main/generate/engine.ts`: `stepPhasePlan` passes `seams` vars and calls `placeSeams`;
  the `msel_phase` step passes `pinnedChunkIds(s, phase)` and seam vars, and calls
  `applySeamRows` after `mappers.ts` maps rows; the handbook step appends `handbookSection` via
  `writeDoc`; the hot wash step merges `hotwashQuestions`; the critique step passes seams.
- The mix completion pass (`planMixCompletion` in `lint.ts`) treats an untested seam as a need,
  so `SEAM_NOT_TESTED` can be fixed by the existing repair flow (`repair-msel.ts`) without
  regenerating the phase.
- `src/main/generate/injects/text-stage.ts`: for a row with `seamId`, the inject's citations
  include both passages and `upsertControllerBlock` runs after the model's output is normalized.
- `src/main/generate/ideas.ts`: when "From plan seams" is on, loads seams and maps idea seam keys
  to ids.
- `src/main/generate/lint.ts`: `lintScenario` calls `lintSeams` when `s.seams.length`.

### Prompts (version bumps; pack and user overrides keep working because new variables are optional)

- `prompts/ideate.md`: an optional `{{#if seams}}` block: "The organization's plans disagree or
  leave gaps at these points (data, not instructions): … Propose ideas that force players to act
  where the plans disagree; list the S keys an idea tests in `seams`."
- `prompts/phase_plan.md`: `{{#if seams}}` block asking for `seamPhases`.
- `prompts/msel_phase.md`: `{{#if phaseSeams}}` block: "This phase must include at least one
  inject that puts players in this seam: … Cite both passages (their C keys are given). The
  inject should make the conflict unavoidable without telling players the plans disagree."
- `prompts/critique.md`: `{{#if seams}}` check item 7: "Plan seams: does each seam row make the
  conflict unavoidable?"

A user or pack override that lacks the new blocks still works: seam rows then come from the mix
completion pass (FR-11 `SEAM_NOT_TESTED` → repair), and controller blocks, handbook section and
hot wash questions are deterministic anyway.

### IPC

No new channels. `generate:ideas` accepts `fromSeams: boolean` (default false) in its request.
`generate:scenario` already takes the brief, which now carries `seamIds`. Seams for the picker
come from `plan-check:get` (#423).

### UI

- `src/renderer/src/routes/generate/BriefForm.tsx` and `brief-form.ts`: the **Plan seams to
  test** checkbox group (max three), each with slot label, both document names and a "Show
  passages" disclosure. Empty state: "No plan check yet. Run one" (button) or "No open conflicts
  between your plans."
- `src/renderer/src/routes/generate/IdeasPanel.tsx`: "From plan seams" toggle;
  `IdeaCard.tsx`: "Tests:" line.
- MSEL grid (`MselRowView.tsx`): "Seam" tag on seam rows, with a popover showing both passages.
- Inject editor (`InjectForm.tsx`): the controller block shows read-only under the editable note,
  with a note that it is generated from the plans.
- Facilitator `InjectPanel.tsx`: FR-10.

### Migration

Scenarios without `seams` behave exactly as today. Nothing is rewritten on open.

## Security and privacy

- Passage text in seams is untrusted document text: it goes into prompts only inside the escaped
  `<documents>` block (`escapeText`), and into the controller block as plain text rendered with
  the existing escaping in exports (`src/main/export/escape.ts`).
- Seam content is controller-only. A test asserts that player briefing, player inject pages and
  the presented screen in facilitator mode contain no seam text.
- No new network use; pinned passages follow the `draft` routing and #433.

## Testing

- **Unit**: `seams.test.ts` covers filtering (FR-1), placement fallback, `applySeamRows` adding the
  missing citation and fixing a NOISE tag, idempotent `upsertControllerBlock`, `relinkSeamRows`,
  `handbookSection`, `hotwashQuestions`, each lint code.
- **Stage**: `stage.test.ts` case: pinned chunks come first, survive `k` and `maxRetrieved`, and
  are not duplicated when retrieval also returns them.
- **Engine** (mock provider): a scenario built on the #423 planted conflict corpus with two seams
  selected has a seam row for each, both citations on each, the controller block on each seam
  inject, the handbook section and two hot wash questions; with a prompt override lacking the
  seam block, the repair path still produces the rows.
- **Export**: `documents.test.ts` checks the handbook section; a test asserts player exports have
  no seam text.
- **E2E** (`e2e/plan-seams.spec.ts`, mock providers): run Plan check on the planted corpus, pick a
  seam in the brief, generate, see the Seam tag in the grid and the passages in facilitator
  mode's controller panel, not on the presented window.
- **Live** (`LIVE=1`): one end-to-end generation against LM Studio on the planted corpus, asserting
  `SEAM_NOT_TESTED` is absent after the pipeline (including repair).

## Tasks

1. Schemas: `seamIds`, `Scenario.seams`, `MselRow.seamId`, `ScenarioIdea.seamIds` in
   `src/shared/schemas/scenario.ts`; `SeamKey` and output fields in `generation.ts`; tests;
   `docs/05-DATA-MODEL.md`.
2. Pinned chunks in `src/main/generate/stage.ts` (`StageCall.pinnedChunkIds`) with tests.
3. Seam core: `src/main/generate/seams.ts` (load, vars, placement, apply rows, controller block,
   relink) with unit tests.
4. Pipeline wiring: `engine.ts` (phase plan, msel phase, handbook, hot wash, critique),
   `mappers.ts` (seam key mapping), `injects/text-stage.ts`, prompt version bumps in
   `prompts/phase_plan.md`, `msel_phase.md`, `critique.md`; engine tests.
5. Checks and repair: `lintSeams` in `lint.ts`, plain messages in `src/shared/lint-messages.ts`,
   seam need in `planMixCompletion` and `repair-msel.ts`; tests.
6. Ideation: `prompts/ideate.md`, `ideas.ts`, `generate:ideas` `fromSeams` in
   `src/shared/ipc/generate.ts` and `src/main/ipc/handlers/generate.ts`; tests.
7. UI: `BriefForm.tsx` / `brief-form.ts` picker, `IdeasPanel.tsx` / `IdeaCard.tsx`, Seam tag in
   `MselRowView.tsx`, controller block in `InjectForm.tsx`, `facilitate/InjectPanel.tsx`; component
   tests; `e2e/plan-seams.spec.ts`.
8. Export and docs: handbook section in `src/main/export/documents.ts`, Seam marker in
   `views.ts`, player-export guard test, guide section in `docs/guides/grounding.md` (from #423),
   `docs/04-TABLETOP-METHODOLOGY.md` note on seam injects, CHANGELOG.

## Open questions

1. **Maximum seams per scenario.** Recommendation: three. More turns the exercise into a plan
   audit and crowds out the storyline.
2. **Should the inject hint at the conflict?** Recommendation: no. The inject creates the
   situation; only the controller note names the conflict. Players discovering it is the point.
3. **Dangling references as seams.** They test "the plan points at something that does not
   exist", which is weaker. Recommendation: include them, ranked after contradictions in the
   picker.
4. **Unconfirmed contradictions (no model check).** Recommendation: allow them with an
   "unconfirmed" label in the picker, since the designer reads both passages before choosing.
