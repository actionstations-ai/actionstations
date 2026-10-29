# Spec 0438: Program health dashboard

Issue: #438 · Milestone: 0.8.0 · Status: Implemented (0.8.0), with the changes listed under "As built" · Depends on: #424 (program folder, snapshots, corrective actions), #421 (Core Capabilities on objectives, observation ratings) · Related: #419 (AAR present), #431 (drill trend), #417 (exercise dates)

## Summary

One screen in the Program area answers the questions an exercise program manager is asked by leadership, grant reviewers and EMAP assessors: which Core Capabilities and plan sections have been exercised, when and how well; which corrective actions are open and overdue; and what has never been tested. It is computed entirely from the program's project snapshots and corrective-action files (#424), so it works offline and when some project folders are on other machines. Tables come first and are the source of truth; the visuals are secondary. The report exports to PDF and CSV.

## Requirements

### User stories

- As a program manager, I want a matrix of Core Capabilities against the exercises of the cycle, so that I can show coverage and gaps in one page.
- As a program manager, I want to see, per plan document, which sections have been exercised and when, and which never have, so that the next IPPW picks real gaps.
- As a manager, I want the open and overdue corrective actions grouped by capability and owner on the same screen, so that the coverage story and the follow-through story are read together.
- As a designer, I want to click any cell and land on the exercise, the section or the action behind it.
- As a manager, I want a dated PDF and the CSVs behind it, so that the numbers in the board report can be checked.
- As a user without a program, I want a clear pointer to create one, and nothing else.

### Functional requirements

- **FR-1** Route `/program/health` in the Program nav (#424). Without an active program the page shows the Program empty state.
- **FR-2** Inputs are exactly: `program.json`, `schedule.json`, `corrective-actions/*.json`, `projects/<id>.json` snapshots (#424 FR-11). The page never opens a project folder itself; "Refresh" runs `program:refresh` and the page updates on `program:changed`.
- **FR-3** `ProgramHealth` is computed by a pure function `computeHealth(program, schedule, snapshots, actions, now)` in `src/shared/program/health.ts`, used by main (`program:health`, exports) and by renderer tests.
- **FR-4** Capability coverage: for each of the 32 Core Capabilities (#421 `CORE_CAPABILITIES`), the exercises that addressed it (a scenario whose `evaluation.objectiveCapabilities` name it, with `exercisedAt`), the last exercise date, the count in the cycle, the observation ratings aggregated (met/partial/not met), open corrective actions, whether a cycle priority names it, and a status: `never`, `stale` (last exercised earlier than the cycle start or more than `staleAfterMonths` ago, default 24), `current`, `planned` (no exercise yet but a planned exercise in the schedule names it).
- **FR-5** Plan-section coverage: for each document in each snapshot (deduplicated by `sha256`, then by title across projects), its sections to depth 3 with: times cited by an exercised scenario (`planSections` of the snapshot), last date, scenarios, open corrective actions citing it, redlines (#431, when the snapshot includes a count), and `never` when uncited. Section matching uses the heading path after the document short name, normalized (case, punctuation, numbering spacing) so "TIRP › Section 13 › 13.6 FIDS/BHS" from two ingests matches.
- **FR-6** Corrective actions: counts by status, overdue list (due date before today and status open or in progress), ageing buckets (< 90 days, 90–365, > 365 open), by capability, by owner organization; verified-in-cycle count.
- **FR-7** Never-tested list: capabilities with status `never` that a priority names, plan documents with zero cited sections, sections of kind `plan` documents at depth ≤ 2 never cited, planned exercises in past quarters still `planned`.
- **FR-8** Timeline: exercises of the cycle (completed and planned) by quarter with type and capability count; drill runs (#431) with pass/fail counts when snapshots carry them.
- **FR-9** Filters: project, year, mission area (Prevention, Protection, Mitigation, Response, Recovery), document. Filters apply to every panel at once and are kept in the URL query so a filtered view can be bookmarked.
- **FR-10** Every count is a link: a capability cell opens the list of scenarios behind it with "Open scenario" (if the project is reachable) and "Open corrective actions" (#424 list with that filter); a section row opens the Documents page of its project at that heading when reachable.
- **FR-11** Export (`program:export` targets added: `health_pdf`, `health_csv`): a PDF report titled with program name, cycle, date and filters, containing the tables of FR-4 to FR-8 in print layout; a ZIP of CSVs (`capabilities.csv`, `sections.csv`, `corrective-actions.csv`, `never-tested.csv`, `timeline.csv`) with the same rows the screen shows.
- **FR-12** Stale data is visible: each snapshot's `takenAt` and `reachable` appear in a "Data freshness" line; a snapshot older than 30 days or unreachable is flagged and the Refresh button is highlighted.

### Non-functional requirements

- **NFR-1** Cost: no network, no model calls (CONTRIBUTING, Project rules 1, 3, 4). This is a read-only view over local JSON.
- **NFR-2** Privacy: owner names appear only in the corrective-actions panel and CSV; the PDF has a "without owner names" option for distribution outside the agency.
- **NFR-3** Accessibility: every panel is a table with `<caption>`, scope headers and sortable columns before any chart; status is text plus a token colour, never colour alone; the heat matrix cells carry the count as text and an `aria-label` ("Operational Coordination, 2026 Q2, 2 exercises"); charts are inline SVG with `<title>`/`<desc>` and a visually hidden table twin; contrast meets WCAG 2.2 AA in both themes; keyboard focus order is panel by panel.
- **NFR-4** Performance: 50 projects × 20 scenarios × 300 sections computes in under 300 ms in the renderer worker-free; tables over 200 rows are windowed (ADR-0017).
- **NFR-5** Determinism: `computeHealth` has no clock access beyond its `now` argument; exports embed the `now` used.
- **NFR-6** Design: tokens from `styles/tokens.css` only; no gradients or animation; print stylesheet for the PDF.

### Out of scope

- Reading project folders directly (snapshots are the contract; a stale snapshot is shown as stale).
- Benchmarks against other organizations, scoring or grades (counts and dates only; HSEEP evaluation is not a score).
- Any model-generated narrative ("the program is healthy because…"); the report prints facts.
- Charting libraries; the few visuals are hand-written SVG.

## Design

### Data flow

```
program folder ──► program:health (main) ──► computeHealth ──► ProgramHealth JSON ──► HealthPage
   │                                                            │
   └── projects/<id>.json snapshots (#424)                      └── program:export health_pdf / health_csv
```

The renderer calls `program:health` with the filters; main loads the files (`src/main/program/store.ts`, `actions.ts`, `snapshot.ts`) and runs `computeHealth`. Filtering happens inside `computeHealth` so the PDF and the screen agree.

### Schemas — `src/shared/schemas/program-health.ts` (new)

```ts
export const HealthFilter = z.object({
  projectIds: z.array(Id).optional(),
  years: z.array(z.number().int()).optional(),
  missionAreas: z
    .array(z.enum(['prevention', 'protection', 'mitigation', 'response', 'recovery', 'common']))
    .optional(),
  documentKeys: z.array(z.string()).optional(), // sha256 or normalized title
  staleAfterMonths: z.number().int().min(1).max(120).default(24),
  includeOwners: z.boolean().default(true),
})

export const ExerciseRef = z.object({
  projectId: Id,
  projectName: z.string(),
  scenarioId: Id,
  title: z.string(),
  exercisedAt: IsoDateTime.optional(),
  reachable: z.boolean(),
})
export const ResultCounts = z.object({
  met: z.number().int(),
  partial: z.number().int(),
  notMet: z.number().int(),
  notObserved: z.number().int(),
})

export const CapabilityHealth = z.object({
  id: CoreCapabilityId,
  label: z.string(),
  missionArea: z.string(),
  status: z.enum(['never', 'stale', 'current', 'planned']),
  exercises: z.array(ExerciseRef),
  lastExercisedAt: IsoDateTime.optional(),
  inCycle: z.number().int(),
  results: ResultCounts.optional(),
  openActions: z.number().int(),
  overdueActions: z.number().int(),
  priorityIds: z.array(Id),
  plannedExerciseIds: z.array(Id),
  /** exercise counts per cycle quarter, for the matrix: key "2026-Q2". */
  byQuarter: z.record(z.string(), z.number().int()),
})

export const SectionHealth = z.object({
  documentKey: z.string(),
  documentTitle: z.string(),
  documentKind: DocumentKind,
  headingPath: z.string(),
  depth: z.number().int(),
  timesCited: z.number().int(),
  lastCitedAt: IsoDateTime.optional(),
  exercises: z.array(ExerciseRef),
  openActions: z.number().int(),
  redlines: z.number().int().optional(),
  never: z.boolean(),
})

export const ActionsHealth = z.object({
  byStatus: z.record(CorrectiveActionStatus, z.number().int()),
  overdue: z.array(
    z.object({
      id: Id,
      title: z.string(),
      dueDate: IsoDate,
      daysOverdue: z.number().int(),
      owner: z.string().optional(),
      coreCapabilities: z.array(CoreCapabilityId),
    }),
  ),
  ageing: z.object({
    under90: z.number().int(),
    d90to365: z.number().int(),
    over365: z.number().int(),
  }),
  byCapability: z.array(
    z.object({
      id: CoreCapabilityId,
      open: z.number().int(),
      overdue: z.number().int(),
      verified: z.number().int(),
    }),
  ),
  byOwnerOrg: z.array(
    z.object({ organization: z.string(), open: z.number().int(), overdue: z.number().int() }),
  ),
  verifiedInCycle: z.number().int(),
})

export const NeverTested = z.object({
  capabilities: z.array(
    z.object({ id: CoreCapabilityId, label: z.string(), priorityIds: z.array(Id) }),
  ),
  documents: z.array(
    z.object({
      documentKey: z.string(),
      documentTitle: z.string(),
      projectNames: z.array(z.string()),
    }),
  ),
  sections: z.array(SectionHealth),
  overduePlanned: z.array(
    z.object({ id: Id, title: z.string(), when: z.string(), type: ExerciseType }),
  ),
})

export const TimelineEntry = z.object({
  quarter: z.string(),
  kind: z.enum(['exercise', 'planned', 'drill']),
  title: z.string(),
  type: ExerciseType.optional(),
  capabilities: z.number().int(),
  ref: ExerciseRef.optional(),
  plannedExerciseId: Id.optional(),
  drill: z
    .object({ pass: z.number().int(), fail: z.number().int(), partial: z.number().int() })
    .optional(),
})

export const ProgramHealth = z.object({
  computedAt: IsoDateTime,
  filter: HealthFilter,
  cycle: z.object({
    startYear: z.number().int(),
    years: z.number().int(),
    quarters: z.array(z.string()),
  }),
  freshness: z.array(
    z.object({
      projectId: Id,
      name: z.string(),
      takenAt: IsoDateTime,
      reachable: z.boolean(),
      stale: z.boolean(),
    }),
  ),
  capabilities: z.array(CapabilityHealth),
  sections: z.array(SectionHealth),
  actions: ActionsHealth,
  neverTested: NeverTested,
  timeline: z.array(TimelineEntry),
  totals: z.object({
    exercises: z.number().int(),
    capabilitiesCurrent: z.number().int(),
    capabilitiesNever: z.number().int(),
    sectionsCited: z.number().int(),
    sectionsNever: z.number().int(),
    openActions: z.number().int(),
    overdueActions: z.number().int(),
  }),
})
```

### Snapshot additions required from #424

The `ProjectSnapshot` (#424) must carry, per scenario, `coreCapabilities`, `planSections` and `ratings`; per document, `sections` to depth 3 and `sha256`. This spec adds two optional fields to it: `scenarios[].drillRuns: [{ ranAt, pass, fail, partial }]` (from #431 `drills/*.json` where `drillScenarioId` matches) and `documents[].redlineCount` (from `redlines/*.json`). Both default to absent, so a snapshot taken before #431 lands still validates.

### Pure computation — `src/shared/program/health.ts`

- `computeHealth(input: { program, schedule, snapshots, actions }, filter, now)`; helpers `normalizeHeading(path)`, `documentKey(doc)` (sha256 else normalized title), `quarterOf(iso)`, `cycleQuarters(cycle)`, `capabilityStatus(...)`.
- Section matching: strip the short name prefix (`buildHeadingPath` puts it first, `src/main/ingest/headings.ts`), lower-case, collapse whitespace, remove punctuation except `.`, compare segment by segment; a citation whose path is deeper than depth 3 counts toward its depth-3 ancestor.
- Ratings per capability: sum of the snapshot's `ratings` counts of scenarios naming the capability (coarse by design; #421's `CriticalTask.capability` allows a per-task roll-up once the snapshot carries observations by task, a follow-up).
- Complexity O(scenarios × sections); tested at the NFR-4 size.

### IPC — additions to `src/shared/ipc/program.ts` (#424)

```ts
'program:health': channel(R.extend({ filter: HealthFilter.partial().optional() }), ProgramHealth),
// program:export targets gain 'health_pdf' | 'health_csv'; request gains filter: HealthFilter.partial().optional()
```

### Main process

- `src/main/program/health.ts`: loads inputs through the #424 stores and calls `computeHealth`; caches the last result per program path keyed by file mtimes so repeated filter changes do not re-read 2,000 files.
- `src/main/program/export.ts` (#424) gains `healthPdf(health, program)` through `templates/export/program-health.html` + `htmlToPdf`, and `healthCsvZip(health)` with `writeZip` (`src/main/export/zip.ts`) and a small `csv.ts` helper (RFC 4180 quoting) shared with the IP CSV.

### Renderer — `src/renderer/src/routes/program/health/`

Files: `HealthPage.tsx`, `FiltersBar.tsx`, `TotalsRow.tsx`, `CapabilityMatrix.tsx`, `SectionsTable.tsx`, `ActionsPanel.tsx`, `NeverTestedPanel.tsx`, `TimelineStrip.tsx`, `FreshnessLine.tsx`, `health.css`, `use-health-filter.ts` (URL query ⇄ filter), `svg/` (`Bars.tsx`, `Sparkline.tsx`, each with a hidden table twin). The route is added to `routes/program/index.ts` as `/program/health` (nav label "Health", under the Program group once #424's nav exists).

```
┌ Program health — Summit County Airport Exercise Program · Cycle 2026–2028 · 2026-10-28 ───────┐
│ Filters: Project [All ▾]  Year [All ▾]  Mission area [All ▾]  Document [All ▾]   [Export ▾]  │
│ Data: NCIA Cyber TTX (today) · Water Utility 2025 (12 d) · Transit (unreachable, 41 d ⚠) [Refresh] │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ 7 exercises │ 12 of 32 capabilities current │ 9 never │ 48 sections cited · 131 never │ 14 open │ 3 overdue │
├─ Core Capabilities × quarter ─────────────────────────────────────────────────────────────────┤
│ Capability                     Status   26Q1 26Q2 26Q3 26Q4 27Q1 …  Last      Open  Results   │
│ Operational Coordination       current   1    2    ·    ▢    ·      2026-06   2     8/2/1     │
│ Public Information & Warning   stale     ·    ·    ·    ·    ·      2024-03   3 ⚠   3/1/4     │
│ Cybersecurity                  current   1    1    ·    ▢    ·      2026-04   4     6/3/2     │
│ Fatality Management            never     ·    ·    ·    ·    ·      —         0     —          │
│ … (32 rows; sortable; ▢ = planned)                                                            │
├─ Plan sections ───────────────────────────────┬─ Corrective actions ─────────────────────────┤
│ EOP (NCIA, 2025-01)         48 cited · 22 never│ Open 14  In progress 6  Completed 4  Verified 9│
│  ▸ 6 Public Information     3×  last 2026-04   │ Overdue (3)                                   │
│    6.4 Approval chain       2×  CA 1  redline 1│  CA-0007 PIO approval chain   -211 d  J. Ruiz │
│    6.5 Rumor control        never              │  CA-0012 Vendor VPN cut-off   -120 d  IT Dir. │
│  ▸ 9 Recovery               never ⚠ (plan)     │ Ageing: <90 d 5 · 90–365 d 7 · >365 d 2       │
│ ASP (NCIA)                  11 cited · 30 never│ By owner org: Ops 6 · IT 5 · PIO 3            │
├─ Never tested ────────────────────────────────┴─ Timeline ───────────────────────────────────┤
│ Capabilities named by a priority, never exercised: Public Health, Healthcare & EMS (P-3)     │
│ Documents never cited: TIRP (Transit) · Planned exercises past due: Drill PACS fail-over 26Q3│
│ 26Q1 Seminar ● · 26Q2 TTX ● (14 cap.) · 26Q3 Drill ○ pass 3 fail 1 · 26Q4 Functional ▢      │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

Interactions: a matrix cell opens a popover listing the exercises (`ExerciseRef`) with "Open scenario" (disabled with "unreachable" when the project is not) and "Corrective actions" (navigates to `/program/actions?capability=…`); a section row's heading links to `/p/:projectKey/documents/:documentId#<heading>` when reachable; totals link to their panel.

### Export layout (`templates/export/program-health.html`)

Portrait, Letter; cover line (program, cycle, date, filters, data freshness); each panel as a table with the same columns as the screen; the matrix printed with quarter columns; owner names omitted when `includeOwners` is false. Footer: "Computed <date> from <n> project snapshots; <m> unreachable".

### Migration of existing projects

- None on the project side. Programs created by #424 before this spec need no change; absent snapshot fields default to empty and show as "no data" in the UI rather than zero coverage. Scenarios generated before #421 have no `coreCapabilities`: they appear in the timeline and in plan-section coverage (from `coreSectionsTested` and row citations) but not in the capability matrix; a notice counts them ("3 exercises predate Core Capability mapping — open them and run 'Map objectives to capabilities' (#421)").

## Security and privacy

- Read-only over files in the program folder chosen by the user; paths come from the #424 store and pass `safeJoin`. No project folder is opened by this feature.
- Owner names are personal data; the PDF/CSV dialog defaults to including them inside the agency's own folder and offers "without owner names" for sharing (NFR-2). Nothing is logged.
- No network, no model, no telemetry (Project rules 3).
- Links to projects use the #424 resolver, which refuses paths that are not known projects.

## Testing

- Unit (`src/shared/program/health.test.ts`): status rules (never / stale by cycle start and by months / current / planned); matrix counts per quarter including a scenario exercised twice (two sessions) counted once per `exercisedAt`; section normalization matches the same heading across two ingests with different spacing and short names and does not match "6.4" to "6.41"; depth-3 roll-up; overdue and ageing arithmetic at the day boundary with a fixed `now`; never-tested lists; totals; filters by project, year, mission area, document; unreachable snapshot kept but flagged; snapshot without `coreCapabilities` excluded from the matrix and counted in the notice; NFR-4 size fixture under 300 ms.
- Main (`src/main/program/health.test.ts`): loads a fixture program folder and equals the pure result; mtime cache invalidation; `health_csv` ZIP contains the five CSVs with header rows and RFC 4180 quoting of commas and quotes in titles; `health_pdf` HTML contains every panel caption and omits owner names when asked.
- Renderer (`happy-dom`): every panel renders a `<table>` with a caption; matrix cells have `aria-label`; sort toggles; URL query round-trips the filter; popover lists exercises and disables "Open scenario" for unreachable projects; the notice for unmapped scenarios appears.
- e2e (`e2e/program-health.spec.ts`, after `e2e/program.spec.ts` builds a program with two example projects): open Health → filter by project → matrix updates → export PDF and CSV ZIP → files exist; axe (`e2e/a11y.spec.ts`) on `/program/health` in light and dark themes.
- Packaged smoke: the Health route loads with an empty program.

## Tasks

1. **Schema and pure computation** — `src/shared/schemas/program-health.ts`, `schemas/index.ts`, `src/shared/program/health.ts` (+ `normalizeHeading`, `quarterOf`), `src/shared/program/health.test.ts` with fixtures under `src/shared/program/__fixtures__/`.
2. **Snapshot fields and IPC** — `src/shared/schemas/program.ts` (`drillRuns`, `redlineCount` on `ProjectSnapshot`), `src/main/program/snapshot.ts` (read `drills/`, `redlines/`), `src/shared/ipc/program.ts` (`program:health`, export targets), `src/main/program/health.ts` (loader + cache), `src/main/ipc/handlers/program.ts`, tests.
3. **Health page: filters, totals, matrix** — `src/renderer/src/routes/program/health/{HealthPage.tsx,FiltersBar.tsx,TotalsRow.tsx,CapabilityMatrix.tsx,FreshnessLine.tsx,use-health-filter.ts,health.css}`, `routes/program/index.ts`, component tests.
4. **Health page: sections, actions, never tested, timeline** — `SectionsTable.tsx`, `ActionsPanel.tsx`, `NeverTestedPanel.tsx`, `TimelineStrip.tsx`, `svg/Bars.tsx`, `svg/Sparkline.tsx` (with table twins), links into Documents and Corrective actions, tests.
5. **Exports** — `src/main/program/export.ts` (`healthPdf`, `healthCsvZip`), `src/main/export/csv.ts`, `templates/export/program-health.html`, export dialog option "without owner names", tests.
6. **e2e, a11y, guide** — `e2e/program-health.spec.ts`, `e2e/a11y.spec.ts`, `docs/guides/program.md` "Health" section with screenshots (`e2e/guide-screenshots.spec.ts`), this spec updated.

## Open questions

1. **Stale threshold: cycle start or a month count?** Recommendation: both, as specified — a capability last exercised before the cycle start is stale regardless, and `staleAfterMonths` (default 24) catches long cycles; the filter bar exposes the months value.
2. **Count an exercise per scenario or per session?** Recommendation: per scenario with its latest `exercisedAt`; a scenario run twice (two cohorts) shows "2 sessions" in the popover but one exercise in the matrix, so a repeated classroom run does not inflate coverage.
3. **Should the matrix show observation ratings (met/partial/not met) as colour?** Recommendation: numbers only in the cell, ratings in a separate column; a red/green heat map invites reading HSEEP evaluation as a grade, which #421 states it is not.
4. **Depth of plan-section coverage.** Recommendation: depth 3 (as specified). Deeper paths make the table unreadable; the citations themselves keep full depth and the popover shows them.
5. **Dark-theme chart tokens.** Recommendation: add two sequential tokens (`--chart-1`, `--chart-2`) and one emphasis token to `styles/tokens.css` rather than per-component colours, so the SVGs follow the theme.

## As built

Changes from the text above, made while implementing:

- **Section depth.** Snapshots keep only each document's top-level headings, so declared sections are depth 1; deeper rows (to depth 3) exist where an exercised scenario cited them. A citation counts toward every ancestor up to depth 3, so a cited 13.6 also marks Section 13 as exercised. Capturing deeper headings in the snapshot is a follow-up.
- **`drillRuns` and `redlineCount`** are in the snapshot schema (optional) and are shown when present; `snapshotProject` fills them from `drills/` and `redlines/` (#431): one entry per recorded run of the drill built as that scenario, counting corrective action verdicts, and the number of redlines not rejected per document.
- **No mtime cache** in `src/main/program/health.ts`: the files are read on each request (about 2,000 small files is fast enough; revisit if it is not). Filtering is in `computeHealth`, so screen and exports agree.
- **Filters** are one value per field in the bar (the schema takes lists). The mission-area list has the five areas; `common` was dropped because no data carries it. The document filter limits the plan-section panels and the never-cited documents only.
- **Export** builds the PDF HTML in `src/main/program/health-export.ts` (same approach as the other program PDFs) from `healthTables()` in `src/shared/program/health-tables.ts`, which also feeds the CSV files; there is no separate template file or print stylesheet. The export dialog is `HealthExport.tsx`.
- **Charts.** One SVG chart (ageing) with a hidden table twin, using existing tokens; no new `--chart-*` tokens and no sparkline. Heat colours are not used in the matrix.
- **Section links** open the Documents page of the first reachable project that cited the section (no per-heading anchor yet).
