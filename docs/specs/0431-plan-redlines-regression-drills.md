# Spec 0431: Plan redlines and regression drills

Issue: #431 · Milestone: 0.8.0 · Status: Implemented · Depends on: #419 (AAR/IP draft), #421 (EEG criteria and observations), #424 (corrective actions) · Related: #417 (session log), #423 (grounding labels), #430 (branches: the played path), #438 (drill trend)

## Summary

The exercise found that a plan section does not work; the app proposes the fix. From an AAR/IP's areas for improvement and their cited plan sections, a stage drafts revised wording for exactly those sections, the designer edits and accepts each proposal in a diff view, and the export writes a Word document with real tracked changes against the ingested DOCX, or a change memo with quoted current and proposed text when the source is a PDF or anything else. After the organization updates its plan, a regression drill reruns only the injects whose evaluation criteria (#421) were rated not met or partial, under the updated plan, and records pass or fail per criterion and per corrective action over time.

## Requirements

### User stories

- As an exercise designer, I want the areas for improvement that cite plan sections turned into proposed edits of those sections, so that the AAR's "revise EOP § 6.4" becomes text the plan owner can accept or reject in Word.
- As a plan owner who lives in Word, I want a tracked-changes DOCX of my own plan, so that I review the proposal with Accept/Reject as I do every other edit.
- As a plan owner whose plan is a PDF, I want a change memo that quotes the current text and the proposed text side by side with the reason and the exercise that found it, so that the editing team can apply it.
- As a designer, I want to see exactly which words change before anything is exported, and to be told when a proposal rests on text the model did not have (grounding, #423).
- As an exercise program manager, I want to rerun the injects that failed after the plan was updated, as a 45-minute drill with the same roles, so that I know whether the corrective action closed the gap rather than assuming it did.
- As a manager, I want pass/fail per criterion recorded over time and reflected on the corrective action in the program (#424) and the dashboard (#438).

### Functional requirements

- **FR-1** A redline is a project-level record (`<project>/redlines/<redlineId>.json`) with a source (scenario, AAR area for improvement, corrective-action ids), a target (document id, heading path, page), the original excerpt (verbatim from the ingested `text.md`), the proposed text, a rationale, a grounding label (#423), status (`proposed`, `accepted`, `rejected`, `exported`, `applied`) and history.
- **FR-2** `redlines:generate` drafts proposals for the selected areas for improvement (`Finding`s under `Aar.capabilities[].areasForImprovement`, #419) of a scenario's `aar.json`. Per cited section (`Finding.citations`) it retrieves the section's full text from the index (by `documentId` + `headingPath`, not by similarity) and asks the `plan_redline` stage for a revised version plus rationale. A proposal whose `originalExcerpt` is not found verbatim in the section (after whitespace normalization) is rejected and the stage gets one repair round; a still-missing excerpt fails that proposal only.
- **FR-3** The Redlines screen shows each proposal as a word-level diff (deleted red strikethrough, inserted blue underline), the rationale, the plan context around the excerpt, the linked corrective actions and the grounding label; the designer edits the proposed text in place, accepts or rejects, and can add a manual proposal by selecting text in the document view (`routes/documents/DocumentDetail.tsx`).
- **FR-4** Export, per target document: when the ingested original is DOCX, write `<DocTitle>-redline.docx`: a copy of the original with each accepted proposal applied as `w:del`/`w:ins` tracked changes (author "Action Stations", date of export) at the paragraphs holding the excerpt; formatting of untouched runs is preserved. When the original is not DOCX, or a proposal's paragraphs cannot be located in the DOCX, write that proposal into `<DocTitle>-change-memo.docx` (FR-5). Both files are produced when a DOCX has unmatched proposals; the export result says which proposals went where.
- **FR-5** Change memo (new DOCX via the `docx` library, same styles as `src/main/export/docx.ts`): title block (plan title, version or ingest date, exercise, date), then per proposal: heading path and page, "Current text" quoted, "Proposed text", a marked-up paragraph (strikethrough/underline runs from the word diff), rationale, corrective actions, source exercise and AAR item. Also exported as PDF through the existing `templates/export/` route.
- **FR-6** A redline export never modifies the ingested original; the output goes to the chosen folder (default `<project>/exports/`), and the redline status becomes `exported` with the file path and the original's sha256 recorded.
- **FR-7** "Mark applied": when the organization updates the plan and the user imports the new version, the user links the new document to the old (`supersedesDocumentId` on `DocumentMeta`); accepted redlines on the old document are checked against the new text (excerpt gone and proposed text present → `applied`; excerpt still present → "not applied"; neither → "needs review") and the results are shown.
- **FR-8** A drill plan (`<project>/drills/<drillId>.json`) names a source scenario, the session whose results it answers (#417), the rows whose criteria (#421 `RowCriterion`) were rated `not_met` or `partial` by the latest observation, the corrective actions and redlines it tests, and the documents it expects to be updated. "Create drill" builds the plan from `evaluation.json` and the session's observations with every such row preselected and lets the designer add or remove rows.
- **FR-9** "Build drill scenario" materializes the plan as a new scenario (status `draft`, `brief.drillOf: { drillId, sourceScenarioId }`): a STARTEX card summarizing the situation at the first selected row (drafted by the `drill_startex` stage from the source rows before it, or written by the designer), the selected rows with their injects copied (`scenarios:duplicate` machinery, subset), a TIME_JUMP card wherever two consecutive selected rows are more than 20 minutes apart in the source, an ENDEX card, roles copied, phases collapsed to one. Row and inject ids keep their source ids so results line up. Citations are re-resolved against the superseding document when one exists; a heading that no longer exists gets `CITATION_MOVED` (warning) with the nearest heading suggested.
- **FR-10** Running the drill is Facilitate as usual; the Evaluate panel (#421) rates the same criterion ids (row ids and task ids are kept, so `evaluation:criteria` derives identical criteria). Ending the session (or "Record drill run" without a live session) writes a `DrillRun` into the drill plan: per criterion `met`/`partial`/`not_met`/`not_observed`, per corrective action a verdict (`pass` when every linked criterion is met, `fail` when any is not met, `partial` otherwise), the plan documents' sha256 at run time, the session id.
- **FR-11** When the project is linked to a program (#424), ending a drill session offers "Record verification on N corrective actions": writes `CorrectiveActionVerification { method: 'drill', result, drillRunId, projectId, scenarioId }` through `program:action-status` for `pass` (→ `verified`) and a verification record without a status change for `partial`/`fail`.
- **FR-12** Drill history: the Drills screen shows runs over time per drill, per criterion and per corrective action (table first, sparkline second), and a redline whose section was tested shows its latest verdict.
- **FR-13** Exports of a drill scenario work like any scenario (the MSEL header says "Regression drill of <source title>, session <date>"); a `drill-results.csv` and a one-page "Drill results" PDF are added to the drill's export.

### Non-functional requirements

- **NFR-1** Cost: model calls only for `plan_redline` and `drill_startex`, through the project's `draft` provider (CONTRIBUTING, Project rules 1, 4).
- **NFR-2** Privacy: plan text already in the project is the only text sent to a model; redline and drill files stay in the project folder; program writes go only to the program folder the user linked (Project rules 3).
- **NFR-3** Accessibility: diffs are conveyed by text markers and `<del>`/`<ins>` semantics with visible labels ("deleted", "inserted") for screen readers, not colour alone; the drill-history sparkline has a table equivalent.
- **NFR-4** Fidelity: a tracked-changes DOCX opens in Word 2016+, LibreOffice 7+ and Pages without repair prompts; untouched XML round-trips byte-identical except `word/document.xml` and `docProps/core.xml` (modified date).
- **NFR-5** Determinism: the word diff and the paragraph matcher are pure functions; the same inputs give the same DOCX bytes except the export date.

### Out of scope

- Editing the plan's structure (new sections, moved sections, tables, images). Proposals replace text inside existing paragraphs of one section; anything else goes to the memo.
- Tracked changes for PPTX/XLSX plans (memo only).
- Writing plans from scratch, or applying accepted redlines automatically to the ingested document (the plan owner applies them in Word).
- Drills as a separate run mode: a drill is a short scenario and uses Facilitate unchanged.

## Design

### Why DOCX only gets real redlines

A redline that Word understands is XML inside the source `.docx` (`<w:del>`, `<w:ins>` with `w:author`/`w:date`). The project already keeps the original (`documents/<docId>/original.docx`, `src/main/ingest/storage.ts`) and its text (`text.md`), and `mammoth` already maps styles to headings on ingest. A PDF has no editable paragraph model: text extraction loses runs and styles, so "tracked changes in the PDF" would be a new PDF with annotations nobody can accept. A memo with exact quoted text is the fallback plan editors use today.

### Schemas — `src/shared/schemas/redline.ts`, `src/shared/schemas/drill.ts` (new)

```ts
export const RedlineStatus = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'exported',
  'applied',
  'not_applied',
  'needs_review',
])
export const Redline = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  projectId: Id,
  source: z.object({
    scenarioId: Id,
    scenarioTitle: z.string(),
    findingId: Id.optional(), // #419 Finding.id (area for improvement)
    capability: CoreCapabilityId.optional(), // #419 CapabilityAnalysis.capability
    aarCorrectiveActionIds: z.array(Id).default([]), // #419 CorrectiveAction.id
    correctiveActionIds: z.array(Id).default([]), // #424 program ids when linked
    criterionIds: z.array(z.string()).default([]), // #421 RowCriterion.id rated not_met / partial
    sessionId: Id.optional(),
  }),
  target: z.object({
    documentId: Id,
    documentTitle: z.string(),
    documentSha256: z.string().optional(),
    headingPath: z.string(),
    page: z.number().int().positive().optional(),
    /** 'docx' → tracked changes possible; anything else → memo. */
    sourceKind: z.enum(['docx', 'pdf', 'pptx', 'xlsx', 'markdown', 'text', 'html', 'image']),
  }),
  originalExcerpt: z.string().min(1), // verbatim from text.md, whitespace-normalized on compare
  proposedText: z.string().min(1),
  rationale: z.string().default(''),
  grounding: GroundingLabel.optional(), // #423: grounded | review | unsupported | none
  status: RedlineStatus.default('proposed'),
  history: z
    .array(z.object({ at: IsoDateTime, to: RedlineStatus, note: z.string().default('') }))
    .default([]),
  export: z
    .object({
      at: IsoDateTime,
      file: z.string(),
      mode: z.enum(['tracked', 'memo']),
      originalSha256: z.string(),
    })
    .optional(),
  appliedCheck: z
    .object({
      at: IsoDateTime,
      documentId: Id,
      result: z.enum(['applied', 'not_applied', 'needs_review']),
    })
    .optional(),
  by: z.enum(['ai', 'user']),
  provenance: StageRun.optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})

export const DrillRun = z.object({
  id: Id,
  sessionId: Id.optional(),
  ranAt: IsoDateTime,
  documentHashes: z.record(Id, z.string()), // documentId → sha256 at run time
  criteria: z.array(
    z.object({ rowId: z.string(), criterionId: z.string(), taskId: Id.optional(), rating: Rating }),
  ), // #421 Rating
  correctiveActions: z.array(z.object({ id: Id, verdict: z.enum(['pass', 'partial', 'fail']) })),
  programRecorded: z.boolean().default(false),
})
export const Drill = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  title: z.string().min(1),
  sourceScenarioId: Id,
  sourceSessionId: Id.optional(),
  rowIds: z.array(z.string()).min(1),
  criterionIds: z.array(z.string()).default([]),
  correctiveActionIds: z.array(Id).default([]),
  redlineIds: z.array(Id).default([]),
  expectedDocumentIds: z.array(Id).default([]), // plans that should be updated before the drill
  drillScenarioId: Id.optional(),
  runs: z.array(DrillRun).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
```

`DocumentMeta` gains `supersedesDocumentId: Id.optional()` (`src/shared/schemas/project.ts`); `ScenarioBrief` gains `drillOf: { drillId: Id, sourceScenarioId: Id }.optional()`.

### Interfaces used from upstream specs

- **#419** `aar.json` (`Aar`, `src/shared/schemas/aar.ts`): `capabilities[].capability`, `.areasForImprovement[]` as `Finding { id, title, analysisMd, citations: Citation[], recommendation, correctiveActions: [{ id, action, element, … }] }`. The redline prompt receives `title`, `analysisMd`, `recommendation` and the `action` texts; `citations` name the sections.
- **#421** (`src/shared/schemas/evaluation.ts`): `RowCriterion { id, rowId, taskId?, capability?, citation? }` from `evaluation:criteria`; `Observation { rowId?, taskId?, criterionId?, rating }` in `scenarios/<id>/evaluation.json` and in the live log; `Rating`. The drill keeps row and task ids so the criteria derive identically.
- **#417/#418**: `scenarios/<id>/live/<sessionId>/log.jsonl` and `session.json` (`LiveSession.endedAt`); the `live:session-end` path in `src/main/live/` calls a registered hook this spec adds (`onSessionEnd(root, scenarioId, sessionId)`), used to record a drill run.
- **#423**: `GroundingLabel` and the grounding function applied to each proposal's `proposedText` against the section's citation.
- **#424**: `program:action-status` with a verification record; `CorrectiveAction.redlineIds`; the AAR import's `programActionId` on #419 corrective actions, which is how a drill finds the program ids.

### Main process — `src/main/redline/` and `src/main/drill/`

| File                       | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redline/store.ts`         | read/list/save `redlines/<id>.json` (`safeJoin`, `writeJsonAtomic`, `readJson`), status transitions with history, `project:changed { what: 'redlines' }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `redline/section-text.ts`  | `sectionText(index, documentId, headingPath)`: the chunks of exactly that heading path from `SqliteIndexStore` (new method `chunksForHeading`), joined in `ord` order; `findExcerpt(sectionText, excerpt)` with whitespace/quote normalization returning the exact original span.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `redline/stage.ts`         | the `plan_redline` stage call (`src/main/generate/stage.ts` `runStage` with `promptName: 'plan_redline'`), output validation, excerpt check, repair round, grounding label, `Redline` records. Job kind `generate-redlines`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `redline/diff.ts`          | `wordDiff(a, b)` over `diff`'s `diffWordsWithSpace`, returning `[{ kind: 'equal'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 'del' | 'ins', text }]`; shared with the renderer by living in `src/shared/redline/diff.ts` and re-exported. |
| `redline/docx-tracked.ts`  | `applyTrackedChanges(originalDocxPath, proposals, { author, date }) → { bytes, applied: id[], unmatched: id[] }`. Opens the DOCX with `jszip`, parses `word/document.xml` with `@xmldom/xmldom` (new dependency; ADR), builds a paragraph list (`w:p` → concatenated `w:t` text with run boundaries), locates each proposal's excerpt as a contiguous span across one or more paragraphs using the same normalization as `findExcerpt`, splits runs at span edges, wraps removed runs in `w:del` (`w:t` → `w:delText`), inserts a `w:ins` run copying the `w:rPr` of the first removed run, numbers `w:id` uniquely, writes `w:author`/`w:date`, serializes with namespaces intact and sets `w:trackRevisions` in `word/settings.xml` so Word shows the markup pane. Pure in the sense of no I/O except the two files. |
| `redline/memo.ts`          | `changeMemoDocx(model: MemoModel) → Uint8Array` with the `docx` library, reusing `run`, `table`, `heading2` and the header/footer from `src/main/export/docx.ts` (exported for reuse). `MemoModel` carries project brand, plan title, exercise, proposals with diff ops. PDF through `templates/export/change-memo.html` and `htmlToPdf`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `redline/export.ts`        | `exportRedlines(root, redlineIds, outDir)` job (`redline-export`): groups accepted redlines by document, decides tracked vs memo per FR-4, writes files, updates statuses, returns `{ files, perRedline: { id, mode, file } }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `redline/applied-check.ts` | FR-7 over `text.md` of the superseding document.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `drill/store.ts`           | `drills/<id>.json` read/list/save.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `drill/plan.ts`            | `draftDrill(root, scenarioId, sessionId)` from `evaluation.json` and the session log's observations: rows whose latest rating per criterion is `not_met` or `partial`, their criteria, linked corrective actions (through `aar.json` `programActionId` when the AAR was imported, #424) and redlines (by `source.criterionIds`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `drill/build.ts`           | `buildDrillScenario(root, drill)`: subset copy using `duplicateScenario` internals in `src/main/scenario/manage.ts` (extracted to `copyScenarioSubset(root, sourceId, rowIds, opts)`), card insertion (STARTEX/TIME_JUMP/ENDEX from `src/main/generate/injects/control-fallback.ts` templates), citation re-resolution (`reresolveCitations(index, citations, supersedes)` → `CITATION_MOVED` warnings), `brief.drillOf`. Stage `drill_startex` (prompt `prompts/drill_startex.md`, output `{ situationMd }`) with a deterministic fallback that concatenates the source rows' events when no provider is configured.                                                                                                                                                                                                  |
| `drill/record.ts`          | `recordDrillRun(root, drill, sessionId?)` on session end or on demand: reads the observations (`evaluation.json`, live log), takes the latest rating per criterion, computes verdicts, appends `DrillRun`, emits `project:changed { what: 'drills' }`; `recordInProgram(...)` for FR-11.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### IPC — `src/shared/ipc/redlines.ts` (new; merged in `ipc/index.ts`)

```ts
const P = z.object({ projectPath: z.string().min(1) })
export const redlineChannels = {
  'redlines:list': channel(
    P.extend({ scenarioId: SafeId.optional(), documentId: SafeId.optional() }),
    z.array(Redline),
  ),
  'redlines:get': channel(P.extend({ id: SafeId }), Redline),
  'redlines:generate': channel(
    P.extend({ scenarioId: SafeId, findingIds: z.array(SafeId).min(1) }),
    z.object({ jobId: SafeId }),
  ),
  'redlines:create': channel(
    P.extend({ redline: Redline.omit({ id, createdAt, updatedAt, by, status, history }) }),
    Redline,
  ), // manual, FR-3
  'redlines:update': channel(
    P.extend({ id: SafeId, patch: patchOf(Redline.pick({ proposedText, rationale })) }),
    Redline,
  ),
  'redlines:set-status': channel(
    P.extend({
      ids: z.array(SafeId).min(1),
      to: z.enum(['accepted', 'rejected', 'proposed']),
      note: z.string().default(''),
    }),
    z.array(Redline),
  ),
  'redlines:delete': channel(P.extend({ id: SafeId }), z.void()),
  'redlines:export': channel(
    P.extend({
      ids: z.array(SafeId).min(1),
      outDir: z.string(),
      formats: z.array(z.enum(['docx', 'pdf'])).default(['docx']),
    }),
    z.object({ jobId: SafeId }),
  ),
  'redlines:preview-tracked': channel(
    P.extend({ id: SafeId }),
    z.object({ mode: z.enum(['tracked', 'memo']), reason: z.string().optional() }),
  ), // can this one be a real redline?
  'redlines:check-applied': channel(P.extend({ documentId: SafeId }), z.array(Redline)), // FR-7, for the superseding document
  'drills:list': channel(P, z.array(Drill)),
  'drills:get': channel(P.extend({ id: SafeId }), Drill),
  'drills:draft': channel(
    P.extend({ scenarioId: SafeId, sessionId: SafeId.optional() }),
    Drill.omit({ id, createdAt, updatedAt }),
  ), // preview, nothing written
  'drills:save': channel(P.extend({ drill: Drill }), Drill),
  'drills:build-scenario': channel(P.extend({ id: SafeId }), z.object({ jobId: SafeId })), // job 'build-drill'
  'drills:record-program': channel(
    P.extend({ id: SafeId, runId: SafeId, programPath: z.string() }),
    Drill,
  ), // FR-11
  'drills:export-results': channel(
    P.extend({ id: SafeId, outDir: z.string() }),
    z.object({ jobId: SafeId }),
  ),
  'drills:delete': channel(P.extend({ id: SafeId }), z.void()),
}
```

`documents:update` (`src/shared/ipc/documents.ts`) accepts `supersedesDocumentId: SafeId | null`. `project:changed.what` gains `'redlines'` and `'drills'`. `JobKind` gains `generate-redlines`, `redline-export`, `build-drill`, `drill-export`.

### Prompt — `prompts/plan_redline.md`

Frontmatter: `stage: plan_redline`, `outputSchema: RedlineOutput`, `retrieval: none` (the section text is passed whole in `vars.section`). The prompt states the rules: change only what the finding requires, keep the section's voice and numbering, quote `originalExcerpt` verbatim from the section shown, never cite a section that is not shown, one proposal per distinct passage, rationale in two sentences naming the exercise finding. Output:

```ts
export const RedlineOutput = z.object({
  proposals: z
    .array(
      z.object({
        originalExcerpt: z.string().min(20),
        proposedText: z.string().min(1),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(5),
})
```

### Renderer

Routes: `/p/:projectKey/redlines` (nav "Redlines", project scope, group `advanced`, order 70) and `/p/:projectKey/drills` (nav "Drills", `advanced`, order 72); entry points also from the scenario's AAR tab ("Propose plan redlines") and from Facilitate's session summary ("Create regression drill").

```
┌ Redlines — NCIA Cyber TTX ────────────────────── Filter: [Scenario ▾] [Document ▾] [Status ▾] ┐
│ ▸ EOP › 6.4 Public Information  p.41   DOCX ✓ tracked   Grounded   from AAR finding 3 [Accept][Reject] │
│   The PIO ~~may release~~ **releases** information after ~~consulting~~ **written approval from** │
│   the Incident Commander **or, when unavailable within 15 minutes, the Deputy IC**.               │
│   Why: In the exercise the PIO waited 40 minutes for IC approval (I-14, criterion T-03 not met). │
│   Corrective action CA-0007.                             Context ▾   Edit proposed text           │
│ ▸ TIRP › 13.6 FIDS/BHS failure  p.88   PDF → change memo   Review   from AAR finding 5           │
│   …                                                                                               │
│ Accepted 3 · Proposed 2 · Rejected 1                 [Export accepted… ▾ DOCX / PDF]  [Add manual] │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```
┌ Drills ───────────────────────────────────────────────────────── [Create from session ▾] ┐
│ Drill: PIO approval chain (from "Flight to Nowhere", session 2026-04-12)                 │
│ Rows I-14, I-15, I-18 · 4 criteria · CA-0007, CA-0012 · Redlines 2 · Expects EOP v2      │
│ Status: EOP updated (v2 ingested 2026-06-02; 2 redlines applied, 0 not applied)          │
│ [Build drill scenario]  → "Drill: PIO approval chain" (draft)  [Open] [Facilitate]       │
│ Runs                                                                                      │
│  Date        T-03     T-04     I-15:exp I-18:exp CA-0007   CA-0012                        │
│  2026-06-10  met      partial  met      not met  partial   fail                            │
│  2026-09-03  met      met      met      met      pass ✓    pass ✓     [Record in program]  │
│  Trend ▁▃▅█  (table above is the source of truth)                                         │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Components: `routes/redlines/{RedlinesPage.tsx,RedlineCard.tsx,DiffView.tsx,ContextPopover.tsx,ExportDialog.tsx}`, `routes/drills/{DrillsPage.tsx,DrillCard.tsx,CreateDrillDialog.tsx,RunsTable.tsx}`; `DocumentDetail.tsx` gets a "Supersedes…" picker and "Propose redline from selection"; `routes/documents/HeadingTree.tsx` shows a redline count per heading.

### Migration of existing projects

- New folders `redlines/` and `drills/` appear only when first used; `project.json` is untouched except optional fields on `DocumentMeta` (`supersedesDocumentId`) and `ScenarioBrief` (`drillOf`). Format versions stay at 1 (ADR-0016 keeps unknown keys on older builds).
- Scenarios exercised before #421 have no observations: "Create drill" falls back to selecting rows by hand with hot-wash notes (`facilitator.json` `notes`) shown beside each row; the run then records the row's own `${rowId}:expected` criterion only.
- Documents ingested before this spec have `sha256` already (`DocumentMeta.sha256`); nothing to backfill.

ADR when the work lands (next free number): `docs/adr/NNNN-docx-tracked-changes.md` (`@xmldom/xmldom` for round-trip editing of `word/document.xml`; memo fallback; never touching the original).

## Security and privacy

- Threat: a crafted DOCX in a project (zip bomb, external entities). Mitigation: `jszip` with a 200 MB inflated cap (same guard as `src/main/packs/`), `@xmldom/xmldom` configured with no DTD or entity expansion; the input is the user's own ingested file, already parsed once by `mammoth`.
- The original document is read through `readableOriginal` (`safeJoinReal`); the output goes to the user-chosen folder; the project's `documents/` folder is never written by a redline export.
- The `plan_redline` prompt receives one plan section and the AAR finding, through the project's configured provider only (Project rules 3, 4); the Redlines screen names the provider before the first generation like the Scenario page does.
- Tracked-change author is the fixed string "Action Stations", not the OS user name, unless the user sets `redlines.author` in project settings.
- Program writes (FR-11) happen only on the user's click and only to the linked program folder.

## Testing

- Unit: `findExcerpt` normalization (curly quotes, non-breaking spaces, line breaks) and refusal of non-verbatim excerpts; `wordDiff` ops on fixtures; `applyTrackedChanges` on fixture DOCX files in `src/main/redline/__fixtures__/` (single paragraph, span across two paragraphs, excerpt inside a run with bold, excerpt in a table cell → unmatched, duplicate excerpt text → first match only with warning) — assert on the resulting XML (`w:del`, `w:ins`, unique `w:id`, `w:delText`) and that re-ingesting the output with `mammoth` yields the proposed text when all insertions are kept; memo DOCX structure read back with `mammoth`; applied-check states.
- Stage: `plan_redline` with the mock provider yields `Redline` records with grounding labels; a non-verbatim excerpt triggers the repair round, then fails one proposal only.
- Drill: `draftDrill` from a fixture `evaluation.json` and session log; `buildDrillScenario` keeps row, task and inject ids (so `evaluation:criteria` derives the same criterion ids), inserts cards at > 20-minute gaps, collapses phases, re-resolves citations and flags `CITATION_MOVED`; `recordDrillRun` takes the latest observation per criterion and its verdict table (all met → pass; any not met → fail; else partial; not observed ignored unless all are not observed → partial).
- Handlers: zod refusals (`SafeId`), `project:changed` emission, job kinds.
- Renderer (`happy-dom`): `DiffView` renders `<del>`/`<ins>` with visible labels; accept/reject updates status; `CreateDrillDialog` preselects failed rows; `RunsTable` rows and the equivalent text for the sparkline.
- e2e (`e2e/redlines.spec.ts`): example project with a DOCX plan fixture (`reference/ncia/*.docx` exists? else a fixture generated with the `docx` library during the test) → write an `aar.json` fixture → generate redlines with the mock provider → accept one → export → open the DOCX zip and assert `w:ins` exists; PDF plan path yields a memo; `e2e/drills.spec.ts`: create drill → build → Facilitate → rate criteria in the Evaluate panel (#421) → record run → runs table shows the row → export results CSV.
- Fidelity (manual, documented in `docs/guides/redlines.md`): open the exported DOCX in Word, LibreOffice and Pages and record the result in the PR.
- Live (`LIVE=1`): `plan_redline` against LM Studio on the NCIA EOP section 6.4 fixture produces at least one verbatim-anchored proposal.

## Tasks

1. **Schemas and store** — `src/shared/schemas/redline.ts`, `src/shared/schemas/drill.ts`, `schemas/index.ts`, `schemas/project.ts` (`supersedesDocumentId`), `schemas/scenario.ts` (`drillOf`), `schemas/job.ts`, `src/main/redline/store.ts`, `src/main/drill/store.ts`, tests, `docs/05-DATA-MODEL.md`.
2. **Section text and diff** — `src/main/retrieve/store.ts` (`chunksForHeading`), `src/main/redline/section-text.ts`, `src/shared/redline/diff.ts`, tests.
3. **Redline stage** — `prompts/plan_redline.md`, `src/shared/schemas/generation.ts` (`RedlineOutput`), `src/main/redline/stage.ts`, `src/shared/ipc/redlines.ts` (list/get/generate/create/update/set-status/delete), `src/main/ipc/handlers/redlines.ts`, `packs/bundled.json`, tests.
4. **Tracked-changes DOCX** — `package.json` (`@xmldom/xmldom`), `src/main/redline/docx-tracked.ts`, fixtures, tests, `docs/adr/NNNN-docx-tracked-changes.md`.
5. **Memo and export job** — `src/main/export/docx.ts` (export shared helpers), `src/main/redline/memo.ts`, `templates/export/change-memo.html`, `src/main/redline/export.ts`, `redlines:export`, `redlines:preview-tracked`, tests.
6. **Redlines screen** — `src/renderer/src/routes/redlines/*`, `routes/documents/DocumentDetail.tsx` (supersedes picker, manual proposal), `routes/documents/HeadingTree.tsx`, AAR tab button (#419 screen), `components/nav-icons.tsx`, tests.
7. **Applied check** — `src/shared/ipc/documents.ts` (`supersedesDocumentId`), `src/main/ingest/pipeline.ts` (`updateDocument`), `src/main/redline/applied-check.ts`, `redlines:check-applied`, UI status in `RedlinesPage.tsx`, tests.
8. **Drill plan and build** — `src/main/scenario/manage.ts` (`copyScenarioSubset`), `src/main/drill/{plan,build}.ts`, `prompts/drill_startex.md`, `drills:draft`, `drills:save`, `drills:build-scenario`, `CITATION_MOVED` in `src/main/generate/lint.ts`, tests.
9. **Drill runs and program** — `src/main/drill/record.ts`, `onSessionEnd` hook registration in `src/main/live/` (0417), `drills:record-program` (calls `src/main/program/actions.ts` from #424), results CSV/PDF export, `routes/drills/*`, Facilitate session summary button, tests.
10. **e2e, guides** — `e2e/redlines.spec.ts`, `e2e/drills.spec.ts`, `e2e/a11y.spec.ts`, `docs/guides/redlines.md` (with the Word/LibreOffice/Pages fidelity checklist), README, this spec updated.

## Open questions

1. **XML library for round-trip editing.** Recommendation: `@xmldom/xmldom` (namespace-preserving DOM, no native code, small); `fast-xml-parser` reorders attributes and loses mixed content order, which Word notices.
2. **Where redlines live when the same plan is used by several projects.** Recommendation: project level (as designed); the program (#424) links to them by `redlineIds` on corrective actions. A program-level redline store would need the program to hold copies of plan documents.
3. **Should accepted redlines be applied to the ingested text automatically to create "plan v2" inside the app?** Recommendation: no. The organization's plan owner controls the plan; the app proposes and later verifies. Importing the real updated plan is the only path to "applied".
4. **Drill scenario: copy or reference the source injects?** Recommendation: copy (as designed). The drill may be edited (updated plan text in an inject), and the source scenario must stay as it was exercised for the AAR.
5. **Verdict when a criterion is `not_observed` in the drill.** Recommendation: ignore it in the verdict and show it; a drill that never reached the row says nothing about the gap. If every criterion of an action is not observed, the verdict is `partial` with the note "not observed".

## As built

Differences from the design above, and the reasons. The open questions were settled as recommended.

- **Word-level tracked changes.** The excerpt is word-diffed against the proposal and only the
  changed words become `w:del` / `w:ins` (FR-4 said "applied at the paragraphs"); runs around them
  keep their formatting. Paragraph marks are never removed. Text in tables, text boxes or revisions
  already in the file goes to the memo. `word/settings.xml` is left alone (no `w:trackRevisions`) so
  NFR-4's byte-identical rule holds; Word shows revisions without it. An excerpt written with
  Markdown bold or code marks is also tried without them.
- **Section text** comes from the existing `index.chunks()` filtered by heading path (and its
  subsections when the heading has no text of its own), not a new `chunksForHeading` method.
- **Memo PDF** is built from an inline HTML string with the shared print CSS, not a
  `templates/export/change-memo.html` file. The memo "Version" line is the import date.
- **Author** of tracked changes is the fixed text "Action Stations"; the `redlines.author`
  setting was not added.
- **Hand-written proposals** (`redlines:create`) take only the scenario, plan, section and words;
  main fills in the project, titles, hash, page and source kind, and refuses words that are not in
  the section.
- **Drill schema.** `Drill` gains `actionCriteria` (corrective action id to the `rowId|criterionId`
  keys its verdict rests on, taken from the AAR's evidence refs when the drill is drafted), so a run
  needs neither the AAR nor the source session. `drills:save` takes a `DrillPlan` (a draft plus an
  optional id); `drills:record-run` records a run on demand; `redlines:preview-tracked` runs the
  real matcher. The AAR's own corrective action ids stand in when the AAR was not imported to a
  program.
- **Session end.** `src/main/live/end-hooks.ts` runs registered hooks after a session ends
  normally; the drill hook records a run for any drill built on that scenario. The Facilitate
  summary button was not added: **Plan a regression drill** and **Propose plan redlines** are links
  in the AAR page, and **Create drill** is on the Drills page.
- **Program.** `program/actions.ts` gains `addVerification` (a verification record without a status
  change, for partial and fail). Actions that are not in the linked program are skipped.
- **Dashboard (#438).** The project snapshot now fills `scenarios[].drillRuns` (one entry per recorded
  run of the drill built as that scenario, counting corrective action verdicts) and
  `documents[].redlineCount` (redlines not rejected).
- **Not done:** the heading tree's redline count (`HeadingTree.tsx`), and per-redline "latest
  drill verdict" on the card.
