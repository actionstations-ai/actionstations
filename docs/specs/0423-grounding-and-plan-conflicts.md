# Spec 0423: Grounding labels and contradictions between plans

Issue: #423 · Milestone: 0.7.0 · Status: Implemented · Depends on: none · Related: #427, #433, #434

## Summary

Every generated item that makes a claim about the organization's plans (an MSEL row's expected
action, an inject's controller note, an overview "section tested", an idea) gets a label:
**Grounded**, **Needs review** or **Unsupported**, worked out from the plan passages it cites and
shown as a badge with the reason. Separately, a **Plan check** compares the organization's own
documents and lists places where two plans disagree (for example two documents naming different
approvers for public releases), quoting both passages with document, section and page.

## Requirements

### User stories

- As an exercise designer, I want to see at a glance which expected actions the plans actually
  support, so that I review the weak ones before an instructor reads them.
- As a reviewer, I want each label to say why (which words matched which passage, which claim
  found nothing), so that I can trust or overrule it in seconds.
- As an emergency manager, I want to know where our plans contradict each other, with both
  passages side by side, so that I can fix the plans or exercise the conflict (#427).
- As a cautious user, I want grounding to work fully offline with no model call, so that labels
  cost nothing and do not depend on a model judging itself.

### Functional requirements

**Grounding labels**

- **FR-1** The app computes a grounding result for these items: each `MselRow` (claim fields:
  `expectedAction`, plus identifiers in `event`), each `Inject` (`instructorNote`), each
  `overview.coreSectionsTested` entry, and each `ScenarioIdea` (`whyItTeaches` against
  `sectionsExercised`).
- **FR-2** A result has a label (`grounded`, `review`, `unsupported`) or `none` when the item makes
  no plan claim (a STARTEX card, a NOISE row with an empty expected action, a TIME_JUMP card).
  `none` shows no badge.
- **FR-3** The label comes from a deterministic check (no model call) of each claim sentence
  against the **full text** of the cited chunks (looked up with `IndexStore.chunk(chunkId)`, not
  the 200-character `Citation.quote`):
  1. _Resolution_: a citation whose `chunkId` no longer exists in the index (document removed or
     re-ingested) counts as missing.
  2. _Anchor terms_: the claim's anchor terms (role titles, agency names, facility identifiers
     from `facility-facts.md`, numbers with units, durations such as "within 24 hours", section
     numbers, and action verbs from a fixed list: notify, activate, approve, authorize, isolate,
     evacuate, declare, shut down, report) must appear in a cited chunk, after normalization
     (case, punctuation, plural, number words to digits).
  3. _Content overlap_: the share of the claim's content words found in the best cited chunk.
  4. _Semantic similarity_: cosine similarity between the claim and the cited chunk with the
     project's active embedder (`activeEmbedder` in `src/main/retrieve/index.ts`). With the hash
     embedder this signal is skipped and only 1 to 3 count.
- **FR-4** Label rules (thresholds live in one constants file and are tuned against the
  calibration set in Testing):
  - `grounded`: at least one resolved citation, every claim sentence supported (overlap ≥
    `T_SUPPORT` or similarity ≥ `S_SUPPORT`), and every anchor term found in a cited chunk or in
    `facility-facts.md`.
  - `unsupported`: the item makes a plan claim and has no resolved citation, or no claim sentence
    reaches `T_WEAK`, or an anchor term contradicts the cited chunk (a different number, duration
    or role in the same slot; see FR-10 slot extractors).
  - `review`: everything else.
- **FR-5** Each result carries its evidence: per claim sentence, the best chunk, the matched and
  missing anchor terms, the overlap and similarity scores, and the reason in one plain sentence
  ("‘within 1 hour’ is not in TIRP 13.6; the passage says ‘within 2 hours’").
- **FR-6** Grounding runs automatically after `msel_phase`, `inject_text`, `scenario_overview`,
  `ideate` and after any user edit saved through `scenarios:save` / `injects:save`, for the
  changed items only. A result is keyed by a fingerprint of the claim text and citation chunk ids
  (as `rowFingerprint` in `src/main/generate/critique-notes.ts` does for critique notes), so a
  stale result is recomputed, never shown as current.
- **FR-7** An optional **Verify with model** action (per item, per scenario) asks the routed
  `critique` provider to judge support. The model must return, per claim, a verdict and a
  verbatim quote from the cited chunk. A verdict whose quote is not a substring of the chunk
  (after whitespace normalization) is discarded and logged. A model verdict can lower a label
  (`grounded` to `review`) or raise `review` to `grounded`; it can never raise `unsupported`
  without a validated quote. The deterministic result stays visible beside it.
- **FR-8** The user can override a label (mark as Grounded / Unsupported with an optional note).
  The override sticks until the item's fingerprint changes.
- **FR-9** Grounding feeds the existing checks: one `GROUNDING_UNSUPPORTED` warning (severity
  `warning`) per unsupported item and one `GROUNDING_REVIEW` (severity `info`) per review item,
  with `rowId` / `injectId`, listed in the lint bar and the Scenario checks with plain messages in
  `src/shared/lint-messages.ts`. A scenario summary counts labels ("41 grounded · 6 to review · 2
  unsupported").

**Plan conflicts**

- **FR-10** A **Check plans for conflicts** action (Documents page; also offered once after an
  ingest adds a second plan-kind document) runs a `plan-check` job over the project's documents of
  kind `plan`, `policy` and `form` (DocumentKind in `src/shared/schemas/project.ts`):
  1. _Slot extraction_ (deterministic): extractors find typed statements in every chunk: approver
     or authority for an action ("approved by", "authority to", "only the … may"), notification
     target and deadline ("notify … within …"), contact number or address for a named role,
     activation thresholds and levels, reporting deadlines to regulators, and the lead for a
     function. Each statement becomes `{ slot, subject, value, chunkId, span }`.
  2. _Candidate pairs_: two statements from **different documents** with the same slot and a
     matching subject (normalized, or embedding similarity ≥ `S_SUBJECT`) and different values.
     Pairs inside one document are included only when the sections differ and the user turns on
     "also within one document".
  3. _Confirmation_ (optional, on by default when a `critique` provider is routed): the model
     sees both passages and returns `contradicts | consistent | complementary | unrelated` with a
     verbatim quote from each passage. Unvalidated quotes discard the verdict; without a model,
     candidates stay `unconfirmed` and are still listed.
- **FR-11** A run also lists **dangling references** (gaps): a passage that cites a plan, annex,
  appendix or section ("see Annex F", "per the Crisis Communications Plan") that matches no
  ingested document title, short name or heading. Each lists the citing passage and the missing
  target.
- **FR-12** Findings are saved to `<project>/plan-conflicts.json` and listed on the Documents page
  under **Plan conflicts**: both passages side by side (document title, heading path, page, quoted
  span highlighted), the slot ("Who approves public releases"), the two values, and the model
  verdict when there is one. Actions: **Open passage** (DocumentDetail at that chunk), **Not a
  conflict** (dismiss with optional note), **Confirmed**, **Copy for plan owner** (plain text with
  both citations).
- **FR-13** Re-running keeps the user's dismiss / confirm decisions for findings whose two spans
  are unchanged (keyed by a hash of slot + both span texts). Findings whose chunk disappeared are
  marked `outdated` and hidden by default.
- **FR-14** The scan is bounded: at most `MAX_PAIRS` (default 80) candidate pairs go to the model
  per run, ranked by slot weight (authority and deadlines first) and subject similarity. The job
  log says how many were found, sent and skipped.

### Non-functional requirements

- **NFR-1** Cost: grounding and candidate detection are deterministic and free. Model
  confirmation uses whatever the user routed to `critique`; with a local provider it costs nothing
  (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: no new network destination. Model confirmation and "Verify with model" go
  through the routed provider like every other stage, so #433 preview and redaction apply when it
  is a cloud provider (Project rules 3, 4).
- **NFR-3** Accessibility: WCAG 2.2 AA. Badges carry a text label and an icon, never colour alone;
  contrast checked by `scripts/check-contrast.mjs`; the conflict panel's two passages are
  reachable in reading order with headings; every action has a keyboard path.
- **NFR-4** Performance: grounding a 40-row MSEL with its injects takes under 2 s on the reference
  corpus with the hash embedder and under 5 s with local ONNX embeddings (similarities computed in
  one embed batch). The deterministic part of a plan check over `reference/ncia` takes under 10 s.
- **NFR-5** Offline: everything except "Verify with model" and conflict confirmation works with no
  provider configured.

### Out of scope

- Fixing plans or suggesting plan text.
- Grounding free prose in the handbook, briefing and hot wash documents (follow-up issue).
- Cross-project comparison (for example against a regional plan in another project).
- Labels on media (images, audio).

## Design

### Modules

```
src/main/grounding/
  claims.ts          split claim fields into sentences; extract anchor terms
  normalize.ts       case, punctuation, plurals, number words, durations ("1 hr" = "one hour")
  support.ts         per-claim scoring against chunk text (anchors, overlap, similarity)
  label.ts           FR-4 rules → GroundingResult; thresholds in constants.ts
  constants.ts       T_SUPPORT, T_WEAK, S_SUPPORT, S_SUBJECT, MAX_PAIRS
  scenario.ts        groundScenario(s, index, embedder, facts, only?) → results keyed by item
  verify.ts          FR-7 model verification, quote validation
  slots.ts           FR-10 slot extractors (pure, table-driven regexes per slot)
  references.ts      FR-11 dangling reference detection
  plan-check.ts      the plan-check job: extract → pair → confirm → write file
  conflicts-file.ts  read / write / merge plan-conflicts.json
```

`src/main/grounding/` sits beside `src/main/retrieve/` because both read the index; it imports
from `generate/` only the facility facts reader. The engine calls `groundScenario` after the
stages in FR-6 (in `src/main/generate/engine.ts` step functions and
`src/main/generate/injects/text-stage.ts`), and the scenario and inject save handlers call it for
edited items.

### Data model (`src/shared/schemas/grounding.ts`)

```ts
export const GroundingLabel = z.enum(['grounded', 'review', 'unsupported', 'none'])

export const ClaimEvidence = z.object({
  text: z.string(), // the claim sentence
  chunkId: z.number().int().optional(), // best supporting chunk
  overlap: z.number().min(0).max(1),
  similarity: z.number().min(-1).max(1).optional(),
  matched: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
  conflicting: z.array(z.object({ term: z.string(), passage: z.string() })).default([]),
})

export const GroundingResult = z.object({
  label: GroundingLabel,
  reason: z.string(),
  fingerprint: z.string(), // claim text + citation chunk ids
  claims: z.array(ClaimEvidence).default([]),
  model: z
    .object({
      // FR-7, when run
      label: GroundingLabel,
      at: IsoDateTime,
      providerId: z.string(),
      model: z.string(),
      quotes: z.array(z.object({ claim: z.string(), quote: z.string() })),
    })
    .optional(),
  override: z
    .object({ label: GroundingLabel, note: z.string().optional(), at: IsoDateTime })
    .optional(),
  at: IsoDateTime,
  version: z.number().int(), // checker version; a bump recomputes
})

/** Item keys: "row:I-07", "inject:<id>", "overview:<n>", "idea:<id>". */
export const ScenarioGrounding = z.looseObject({
  items: z.record(z.string(), GroundingResult).default({}),
})
```

`Scenario` gains `grounding: ScenarioGrounding.optional()`. `Scenario` is a loose object, so an
older build keeps the field on save (#208). `MselRow` and `Inject` are not changed: an older build
that strips unknown row keys would lose per-row data, so results live at scenario level. Ideas
store their result in `ideas.json` beside each idea (`IdeasFile` in `src/main/generate/ideas.ts`
gains an optional `grounding` map).

The effective label is `override?.label ?? model?.label ?? label`.

`<project>/plan-conflicts.json` (`src/shared/schemas/plan-conflicts.ts`):

```ts
export const PlanPassage = z.object({
  documentId: Id,
  documentTitle: z.string(),
  headingPath: z.string(),
  page: z.number().int().positive().optional(),
  chunkId: z.number().int(),
  span: z.string(), // the statement's exact text
})
export const PlanFinding = z.object({
  id: z.string(), // sha256(slot + spanA + spanB), 16 hex
  kind: z.enum(['contradiction', 'dangling_reference']),
  slot: z.string(), // "release_approver", "notify_deadline", …
  slotLabel: z.string(), // "Who approves public releases"
  subject: z.string(),
  a: PlanPassage,
  b: PlanPassage.optional(), // absent for dangling_reference
  values: z.tuple([z.string(), z.string()]).optional(),
  missingTarget: z.string().optional(), // dangling_reference
  verdict: z.enum(['contradicts', 'consistent', 'complementary', 'unrelated', 'unconfirmed']),
  verdictQuotes: z.object({ a: z.string(), b: z.string() }).optional(),
  status: z.enum(['open', 'dismissed', 'confirmed', 'outdated']).default('open'),
  note: z.string().optional(),
  foundAt: IsoDateTime,
})
export const PlanConflictsFile = z.looseObject({
  formatVersion: z.literal(1).default(1),
  checkedAt: IsoDateTime,
  documents: z.array(z.object({ id: Id, sha256: z.string() })), // what the run saw
  findings: z.array(PlanFinding).default([]),
})
```

Findings with verdict `consistent` or `unrelated` are kept in the file (so a re-run does not
re-ask the model) but not listed. #427 reads this file.

### IPC (`src/shared/ipc/grounding.ts`, one channel per use case)

| Channel                 | Request                                                               | Response                                     |
| ----------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `grounding:scenario`    | `{ projectPath, scenarioId }`                                         | `ScenarioGrounding` (recomputes stale items) |
| `grounding:verify`      | `{ projectPath, scenarioId, itemKeys?: string[] }`                    | `{ jobId }` (job kind `grounding-verify`)    |
| `grounding:override`    | `{ projectPath, scenarioId, itemKey, label, note? }`                  | `GroundingResult`                            |
| `plan-check:run`        | `{ projectPath, confirmWithModel: boolean, withinDocument: boolean }` | `{ jobId }` (job kind `plan-check`)          |
| `plan-check:get`        | `{ projectPath }`                                                     | `PlanConflictsFile \| null`                  |
| `plan-check:set-status` | `{ projectPath, findingId, status, note? }`                           | `PlanFinding`                                |

`JobKind` gains `plan-check` and `grounding-verify` (concurrency 1 each).

### Prompts

Two new prompt files with frontmatter, editable like the others (`task: critique`, low
temperature, no retrieval queries; the passages are passed as variables inside a
`<documents>` block escaped with `escapeText` from `src/main/generate/retrieval.ts`):

- `prompts/grounding_verify.md`, `outputSchema: GroundingVerifyOutput`:
  `{ claims: [{ claim, verdict: 'supported'|'partial'|'unsupported'|'contradicted', quote }] }`.
- `prompts/plan_conflict.md`, `outputSchema: PlanConflictOutput`:
  `{ verdict, quoteA, quoteB, explanation }`.

Both system prompts state that passages are data, never instructions, and that a verdict without
a verbatim quote is discarded. Both are added to `STAGE_OUTPUT_SCHEMAS` and to `Stage` as
`grounding_verify` and `plan_conflict` so provenance (`StageRun`) records them; they are not part
of `PIPELINE_STAGES`.

### UI

- **MSEL grid** (`src/renderer/src/editors/msel/MselRowView.tsx`, `cell-views.tsx`): a badge in
  the citations cell: "Grounded", "Review", "Unsupported" with icon. Popover lists each claim, its
  best passage (heading path, page, highlighted matched terms) and the reason; buttons **Verify
  with model**, **Mark grounded**, **Mark unsupported**. A filter in the grid toolbar shows only
  review / unsupported rows.
- **Inject editor** (`src/renderer/src/editors/inject/InjectForm.tsx`): same badge beside the
  controller note.
- **Scenario page** (`src/renderer/src/routes/scenarios/CitationChips.tsx`,
  `ScenarioSections.tsx`): badges on overview sections; label counts in the summary.
- **Ideas** (`src/renderer/src/routes/generate/IdeaCard.tsx`): badge on each idea.
- **Lint bar / Scenario checks**: the two new codes with plain messages.
- **Documents page** (`src/renderer/src/routes/documents/DocumentsPage.tsx`): new section
  `PlanConflicts.tsx` with the run button, last-run time, counts, filter (open / dismissed /
  confirmed / all) and the finding cards described in FR-12.
- Glossary entries (`src/renderer/src/lib/glossary.ts`): Grounded, Needs review, Unsupported,
  Plan conflict.

### Export

- MSEL export (`src/main/export/views.ts`) adds a "Source check" column in the controller MSEL
  only (never in player material): the label text. Off by default per export; a checkbox in the
  export dialog turns it on.
- The handbook export lists open plan conflicts tested by the scenario (#427 fills this).

### Migration

Existing scenarios have no `grounding`; opening the MSEL editor triggers `grounding:scenario`,
which computes results on demand and saves them with the next save. No file is rewritten just to
add labels.

## Security and privacy

- Chunk text is untrusted (any ingested PDF). The verify and conflict prompts wrap passages in the
  same escaped `<documents>` block as generation and say they are data. A model reply can only
  produce a verdict and quotes, and quotes are validated as substrings, so an instruction hidden
  in a plan cannot fabricate support.
- Reason strings shown in the UI are rendered as text, never HTML.
- Nothing new leaves the computer. Model calls follow the user's routing and #433.
- `plan-conflicts.json` stays in the project folder; it contains quotes from the user's own
  documents, as the index already does.

## Testing

- **Unit** (Vitest): `normalize.test.ts` (durations, numbers, plurals); `claims.test.ts` (anchor
  extraction on rows from `examples/*/project/scenarios`); `support.test.ts` and `label.test.ts`
  (each FR-4 branch, missing chunk, conflicting duration); `slots.test.ts` (one positive and one
  negative case per slot, table-driven); `references.test.ts`; `conflicts-file.test.ts` (merge
  keeps decisions, marks outdated); `verify.test.ts` (fabricated quote is discarded).
- **Calibration set**: `src/main/grounding/fixtures/calibration.json`, 60 rows and injects from the
  shipped examples, labelled by hand (20 per label) with the cited chunk text included.
  `label.calibration.test.ts` asserts agreement ≥ 85% and zero cases where a hand-labelled
  `unsupported` comes out `grounded`. Threshold changes must keep this test green.
- **Planted conflict corpus**: `src/main/grounding/fixtures/conflict-corpus/`, three short
  fictional plans with five planted contradictions (approver, deadline, phone, activation level,
  lead agency), two consistent near-misses and one dangling reference. `plan-check.test.ts` with
  the mock provider expects all five found, the near-misses not listed, the reference listed.
- **Integration**: engine tests (`engine.quality.test.ts` pattern) assert that a generated
  scenario with the mock provider carries `grounding` for every row with an expected action, and
  that editing a row recomputes only that row.
- **E2E** (Playwright, mock providers): open the city-water example, see badges in the MSEL grid,
  open a popover with the keyboard, override a label; run Plan check on the planted corpus and
  dismiss a finding; axe check on both screens.
- **Live** (`LIVE=1`): `plan-check.live.test.ts` runs confirmation against LM Studio on the
  planted corpus.

## Tasks

1. Schemas: `src/shared/schemas/grounding.ts`, `src/shared/schemas/plan-conflicts.ts`, exports in
   `src/shared/schemas/index.ts`, `Scenario.grounding` in `scenario.ts`, tests in
   `schemas.test.ts`; `docs/05-DATA-MODEL.md` entries.
2. Deterministic grounding core: `src/main/grounding/{normalize,claims,support,label,constants}.ts`
   with unit tests and the calibration fixture and test.
3. Scenario integration: `src/main/grounding/scenario.ts`; calls from
   `src/main/generate/engine.ts`, `src/main/generate/injects/text-stage.ts`,
   `src/main/generate/ideas.ts`, and the save handlers in `src/main/ipc/handlers/scenario.ts` and
   `injects.ts`; lint codes and plain messages in `src/shared/lint-messages.ts`; engine tests.
4. IPC and job kinds: `src/shared/ipc/grounding.ts`, `src/shared/ipc/index.ts`,
   `src/main/ipc/handlers/grounding.ts`, `JobKind` additions in `src/shared/schemas/job.ts`,
   concurrency in `src/main/jobs/manager.ts`.
5. Grounding UI: badge component `src/renderer/src/components/GroundingBadge.tsx` with tests,
   wiring in `MselRowView.tsx`, `cell-views.tsx`, `InjectForm.tsx`, `CitationChips.tsx`,
   `IdeaCard.tsx`, grid filter, glossary; e2e spec `e2e/grounding.spec.ts`.
6. Model verification: `prompts/grounding_verify.md`, `GroundingVerifyOutput` in
   `src/shared/schemas/generation.ts`, `Stage` addition, `src/main/grounding/verify.ts`, job
   handler, popover button; tests.
7. Plan check, deterministic part: `src/main/grounding/{slots,references,conflicts-file}.ts`,
   planted corpus fixture, tests.
8. Plan check job and confirmation: `prompts/plan_conflict.md`, `PlanConflictOutput`,
   `src/main/grounding/plan-check.ts`, `plan-check:*` handlers, live test.
9. Plan conflicts UI: `src/renderer/src/routes/documents/PlanConflicts.tsx` (+ css, tests), post-
   ingest offer in `IngestJobs.tsx`, e2e `e2e/plan-conflicts.spec.ts`.
10. Export column and docs: `src/main/export/views.ts`, export dialog checkbox, user guide
    `docs/guides/grounding.md`, ADR for "deterministic grounding first, model verification only
    with validated quotes", CHANGELOG entry.

## Implementation notes

Built as specified, with these differences (decided while building; the open questions below
took their recommendations):

- **No filter in the grid.** A **Source check** bar above the MSEL grid shows the counts and
  lists the rows to check (unsupported first) with Go to row and Details. Hiding rows inside the
  grid would break its keyboard navigation, drag and row numbering.
- **Details is a dialog, not a popover in the citations cell.** The grid uses one roving focus
  per cell, so a second focusable control in a cell is hard to reach from the keyboard. The
  badge in the cell is static text with an icon; **Source check…** in the row's Actions menu, the
  bar's **Details** buttons and the inject editor's **Details** open the dialog. Key events in
  the row menu no longer reach the grid (they used to move the active cell and close the menu).
- **"Makes a plan claim"** (FR-2): an item has citations, or names a role, agency, section,
  duration, quantity or one of the action verbs. A row with neither gets no label.
- **Anchor terms** (FR-3.2): identifiers are tag-shaped ones (letters joined to digits:
  PLC-02, NAOH-FC-203, ERP-2) plus a short list of agency acronyms (FBI, CISA, EPA…); bare
  acronyms such as SCADA or GPS are too common to require. The scenario's role names count as
  known, like facility facts, and its role abbreviations are never anchors.
- **Overlap** is the share of the claim's content words found in all its cited chunks together
  (the best chunk is still named in the evidence). A duration or quantity is checked in the
  passage sentence that states the same thing; a different value there is the conflict.
- **Citations whose chunk id moved** (an index rebuilt in another order, as when an example is
  opened) are found again by document and quote before they count as missing.
- **Overview sections** are labelled by resolution: the cited chunk exists (Grounded), its quote
  is not in it (Needs review), or it is gone (Unsupported).
- **Model labels** (FR-7): every claim supported with a validated quote raises the label to
  Grounded; any validated partial, unsupported or contradicted verdict lowers Grounded to Needs
  review; nothing validated leaves the checker's label. A scenario-wide verify asks about at
  most 120 items, weakest first.
- **Inject edits** (FR-6): `injects:save` recomputes the labels and writes `scenario.json` only
  when a result changed. `grounding:scenario` recomputes stale items without writing, as in
  Migration.
- **Subject matching** for plan conflicts uses token similarity (S_SUBJECT 0.5); embedding
  similarity is not used there.
- **Extra channels:** `grounding:ideas` (idea labels from `ideas.json`) and
  `plan-check:defaults` (whether confirmation is on by default, and why). `grounding:override`
  without a label clears the user's label.
- **The post-ingest offer** appears once in the Plan conflicts section of the Documents page
  when the project has two or more plans and no check has run, not in `IngestJobs.tsx`.
- **Calibration:** 60 rows from the shipped examples (`fixtures/calibration.json`), 20 per
  hand label; four unsupported cases change a duration from the plan's and two cite a chunk
  that was removed. Agreement at the shipped thresholds is 58 of 60; the two disagreements
  are rows the checker calls Grounded that a reader would review.

## Open questions

1. **Label names.** "Unsupported" (issue) or "Largely unsupported" (Preppr)? Recommendation:
   "Unsupported" with the reason always one click away; shorter and fits the grid.
2. **Should `review` rows block "Ready" status?** Recommendation: no. Unsupported rows add a
   warning like any lint; readiness (`readiness.ts`) mentions the count but does not block.
3. **Run model confirmation by default in Plan check?** Recommendation: yes when `critique` routes
   to a local provider; when it routes to a cloud provider, default off and say why, since a full
   check can send up to 160 passages.
4. **Within-document conflicts.** Recommendation: off by default; long single plans produce many
   false positives (an annex legitimately overriding the base plan).
5. **Thresholds per domain pack.** Recommendation: one global set for 0.7.0; revisit with #434
   benchmark data.
