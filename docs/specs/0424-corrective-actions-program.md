# Spec 0424: Corrective-action tracking and multi-year exercise program

Issue: #424 · Milestone: 0.8.0 · Status: Implemented (PR for #424; see "As built") · Depends on: #419 (AAR/IP draft), #421 (Core Capabilities, EEGs) · Related: #417 (session log), #431 (redlines, drills), #438 (program health)

## Summary

Corrective actions from an AAR/IP stop living inside one scenario. A new **program folder** (`<Name>.asprogram/`), chosen by the user and placeable on shared storage, holds the corrective actions of every linked project, their owners, due dates and status history, and the multi-year Integrated Preparedness Plan (IPP) schedule that HSEEP 2020 expects an Integrated Preparedness Planning Workshop to produce. Projects link to the program; the AAR/IP of a finished exercise is imported into it with one review step; a deterministic proposal says what the next exercise should test. Every file stays JSON validated by zod, offline, with no server.

## Requirements

### User stories

- As an exercise program manager, I want corrective actions from every exercise in one list with owner, due date and status, so that actions stop disappearing when the exercise binder is closed (GAO-20-297: AARs for 29% of 2017–19 disasters and no mechanism to track corrective actions; DHS OIG-12-118: under 40% of National Level Exercise corrective actions completed).
- As a program manager at an agency, I want the program folder on our shared drive, so that colleagues on other machines see the same list without an account or a server.
- As an exercise designer, I want to import the corrective actions an AAR/IP draft (#419) proposes, review each one, and keep its link to the plan sections and Core Capabilities it cites, so that the next exercise can be built from them.
- As a program manager, I want a three-year schedule of seminars, workshops, tabletops, drills and functional exercises tied to program priorities, so that I can show a grant reviewer or EMAP assessor the IPP without a spreadsheet.
- As an exercise designer starting a new scenario, I want the app to propose which capabilities, plan sections and open actions this exercise should test, so that the program closes gaps instead of repeating last year's scenario.
- As a project owner without a program, I want everything to work exactly as today; the program is optional.

### Functional requirements

- **FR-1** A program is a folder `<Name>.asprogram/` with `program.json`, one file per corrective action under `corrective-actions/`, the schedule in `schedule.json`, import records under `imports/`, and project snapshots under `projects/`. The folder is created by the user (Program → Create) or chosen (Program → Open) through the OS directory dialog; the app never creates one silently.
- **FR-2** The app remembers the active program path in `settings.json` (`program.activePath`) and a recent-programs list. One program is active at a time; switching re-reads the folder.
- **FR-3** A project links to at most one program. Linking writes the project id, name and path into `program.json` `projects[]` and a `program: { id, path }` hint into `project.json`. Unlinking removes both; corrective actions that came from the project stay in the program (their `source` keeps the project name).
- **FR-4** A corrective action has: title, description, the area for improvement it answers, Core Capabilities (#421 ids), plan sections (citations), owner (name, organization, optional email), due date, priority, status, a status history with notes, a source (AAR/IP import, drill, or manual), and optional verification (written by #431 drills).
- **FR-5** Status lifecycle: `open → in_progress → completed → verified`, plus `deferred` and `cancelled` from any state; a note is required for `deferred` and `cancelled`. `verified` requires a verification record (a drill run from #431 or a manual "observed in exercise" entry naming project and scenario).
- **FR-6** Import from an AAR/IP: `program:import-aar` reads a scenario's `aar.json` (#419), shows every proposed corrective action with its citations and capabilities, lets the user tick, edit and assign before import, and records the import so re-importing the same AAR item is detected and offered as an update, never duplicated.
- **FR-7** Manual corrective actions can be created, edited and bulk-updated (status, owner, due date) from the Program → Corrective actions screen; a CSV export of the list (same columns as the Improvement Plan table of HSEEP's AAR/IP template) is one click.
- **FR-8** The IPP schedule holds a cycle (start year, 1–5 years), program priorities (text, Core Capabilities, rationale, sources such as an AAR, a THIRA/SPR or a grant condition), and planned exercises (title, HSEEP type, quarter or date, status, priorities and capabilities addressed, intended plan sections, corrective actions it will verify, and the project and scenario once one exists).
- **FR-9** Linking a planned exercise to a scenario is explicit (pick from the linked projects' scenarios); when a linked scenario is exercised (#417 session ended, or facilitator state shows delivered rows), the planned exercise shows as completed with the date.
- **FR-10** "Propose next exercise" is a deterministic function over the program and the project snapshots: it scores Core Capabilities and plan sections by open corrective actions, time since last exercised, program priorities not yet addressed in the cycle, and never-tested status, and returns a ranked list with reasons. The result can be sent to a new scenario brief as constraints ("must test EOP 6.4; verify CA-0012") — the model drafts the scenario, the person decides.
- **FR-11** Every linked project gets a snapshot (`projects/<projectId>.json`) refreshed when the program opens, when a project is linked, and when a scenario's live session ends: scenarios with status and exercise date, Core Capabilities and plan sections they cite, observation ratings from #421, and the document inventory (titles, hashes, top-level headings). #438 reads these snapshots so the dashboard works when a project folder is on another laptop.
- **FR-12** Exports: Improvement Plan table (DOCX and PDF, HSEEP AAR/IP layout: capability, issue, corrective action, primary responsible organization, point of contact, start date, completion date), IPP schedule (DOCX, PDF, CSV), and `program.json` + corrective actions as a ZIP for hand-off.
- **FR-13** Concurrency on shared storage: each file carries `revision` (sha256 of its content at last read) and `updatedAt`; a save whose base revision is stale returns `CONFLICT` with both versions so the user can pick, as `project:facility-facts-save` does. A `.lock.json` (host, user, pid, time) is advisory: the UI shows "Also open by <host>" and keeps editing.
- **FR-14** An older build opening a program with a newer `formatVersion` refuses with the standard message; unknown keys survive a save (`looseObject`, ADR-0016).

### Non-functional requirements

- **NFR-1** Cost: no server, no account, no GitHub compute (CONTRIBUTING, Project rules 1). Shared storage is any folder the OS mounts.
- **NFR-2** Privacy: owner names and emails are personal data entered by the user; they stay in the program folder, never in logs, telemetry (there is none) or provider prompts unless the user sends the IP table to a model on purpose (Project rules 3). The program folder is never read unless the user chose it.
- **NFR-3** Accessibility: WCAG 2.2 AA; the corrective-action list is a real table with sortable column headers, status changes are announced, all dialogs are keyboard-complete.
- **NFR-4** Offline: everything works without network. Performance: a program with 50 projects and 2,000 corrective actions opens in under 2 s; the list is windowed (ADR-0017).
- **NFR-5** Platforms: paths inside `program.json` are stored POSIX-relative when the project sits under the program folder's parent, else absolute; a path that does not resolve falls back to the project id in `settings.recentProjects`.

### Out of scope

- Multi-user real-time editing, accounts, permissions, server sync (last-writer-wins per file with conflict detection is the limit).
- Importing corrective actions from other tools' formats (a CSV import is an open question).
- Grant reporting formats beyond the HSEEP AAR/IP and IPP tables.
- Writing the AAR/IP itself (#419) and Core Capability mapping (#421).

## Design

### Why a program folder, not userData

`userData` is per user and per machine, hidden, excluded from most backups and never shared. An agency's exercise program outlives laptops and is maintained by more than one person. A folder the user chooses behaves like a project folder: visible, backed up, movable, placeable on a shared drive or a synced folder, and inspectable as plain JSON. `settings.json` only remembers which program folder is active. One file per corrective action keeps writes small and lets file-sync tools (and `git`) merge independent edits instead of fighting over one large file.

### Folder layout

```
<Name>.asprogram/
  program.json                      # Program: identity, cycle, priorities, projects[]
  schedule.json                     # Schedule: planned exercises
  corrective-actions/<caId>.json    # CorrectiveAction, one per file
  imports/<importId>.json           # AarImport record (idempotent re-import)
  projects/<projectId>.json         # ProjectSnapshot, refreshed from the project folder
  exports/                          # default output folder (gitignored by the program's .gitignore)
  .lock.json                        # advisory presence lock
  .gitignore                        # exports/, .lock.json
```

### Schemas — `src/shared/schemas/program.ts` (new, exported from `schemas/index.ts`)

```ts
export const PROGRAM_FORMAT_VERSION = 1
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const ProgramProjectLink = z.object({
  projectId: Id,
  name: z.string(),
  /** POSIX-relative to the program folder's parent when possible, else absolute. */
  path: z.string(),
  linkedAt: IsoDateTime,
  lastSeenAt: IsoDateTime.optional(),
})

export const ProgramPriority = z.object({
  id: Id,
  text: z.string().min(1),
  coreCapabilities: z.array(CoreCapabilityId).default([]),   // from #421, src/shared/core-capabilities.ts
  rationale: z.string().default(''),
  sources: z.array(z.object({
    kind: z.enum(['aar', 'thira_spr', 'grant', 'regulation', 'leadership', 'other']),
    ref: z.string(),                                            // free text: "AAR 2025 TTX Flight to Nowhere"
  })).default([]),
})

export const Program = z.looseObject({
  formatVersion: z.number().int().default(PROGRAM_FORMAT_VERSION).refine(v => v <= PROGRAM_FORMAT_VERSION, {...}),
  id: Id, name: z.string().min(1), orgName: z.string().default(''),
  createdAt: IsoDateTime, updatedAt: IsoDateTime, appVersion: z.string(),
  cycle: z.object({ startYear: z.number().int(), years: z.number().int().min(1).max(5) }),
  priorities: z.array(ProgramPriority).default([]),
  projects: z.array(ProgramProjectLink).default([]),
})

export const CorrectiveActionStatus = z.enum(['open','in_progress','completed','verified','deferred','cancelled'])
export const CorrectiveActionSource = z.object({
  kind: z.enum(['aar_ip', 'drill', 'manual']),
  projectId: Id.optional(), projectName: z.string().optional(),
  scenarioId: Id.optional(), scenarioTitle: z.string().optional(),
  exerciseDate: IsoDate.optional(),
  /** The AAR/IP item this came from (#419 `Aar.capabilities[].areasForImprovement[].id` / `.correctiveActions[].id`). */
  aarItemId: z.string().optional(),
  importId: Id.optional(),
})
/** A plan section reference that survives the project being unreachable or re-ingested. */
export const PlanSectionRef = Citation.extend({ documentSha256: z.string().optional() })

export const CorrectiveActionVerification = z.object({
  method: z.enum(['drill', 'exercise', 'review']),
  at: IsoDateTime,
  result: z.enum(['pass', 'partial', 'fail']),
  projectId: Id.optional(), scenarioId: Id.optional(),
  drillRunId: Id.optional(),                                    // #431
  note: z.string().default(''),
})

export const CorrectiveAction = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id, programId: Id,
  title: z.string().min(1).max(200),
  description: z.string().default(''),
  areaForImprovement: z.string().default(''),
  coreCapabilities: z.array(CoreCapabilityId).default([]),
  /** HSEEP capability element (#419 `CapabilityElement`): planning, organization, equipment, training, exercises. */
  element: z.enum(['planning', 'organization', 'equipment', 'training', 'exercises']).optional(),
  planSections: z.array(PlanSectionRef).default([]),
  owner: z.object({ name: z.string().default(''), organization: z.string().default(''), email: z.string().default('') }).default({}),
  dueDate: IsoDate.optional(),
  startDate: IsoDate.optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: CorrectiveActionStatus.default('open'),
  history: z.array(z.object({ at: IsoDateTime, from: CorrectiveActionStatus.optional(), to: CorrectiveActionStatus, note: z.string().default('') })).default([]),
  source: CorrectiveActionSource,
  verifications: z.array(CorrectiveActionVerification).default([]),
  redlineIds: z.array(Id).default([]),                          // #431
  notes: z.string().default(''),
  createdAt: IsoDateTime, updatedAt: IsoDateTime,
})

export const ExerciseType = z.enum(['seminar','workshop','tabletop','game','drill','functional','full_scale'])
export const PlannedExercise = z.object({
  id: Id, title: z.string().min(1), type: ExerciseType,
  when: z.union([z.object({ year: z.number().int(), quarter: z.number().int().min(1).max(4) }), z.object({ date: IsoDate })]),
  status: z.enum(['planned', 'scheduled', 'completed', 'cancelled']).default('planned'),
  priorityIds: z.array(Id).default([]),
  coreCapabilities: z.array(CoreCapabilityId).default([]),
  planSections: z.array(PlanSectionRef).default([]),
  correctiveActionIds: z.array(Id).default([]),
  projectId: Id.optional(), scenarioId: Id.optional(),
  completedAt: IsoDate.optional(),
  notes: z.string().default(''),
})
export const Schedule = z.looseObject({ formatVersion: z.number().int().default(1), exercises: z.array(PlannedExercise).default([]) })

export const AarImport = z.object({
  id: Id, at: IsoDateTime, projectId: Id, scenarioId: Id, aarSha256: z.string(),
  items: z.array(z.object({ aarItemId: z.string(), correctiveActionId: Id, action: z.enum(['created', 'updated', 'skipped']) })),
})

/** What the program keeps about a project so #438 works without the project folder. */
export const ProjectSnapshot = z.looseObject({
  formatVersion: z.number().int().default(1),
  projectId: Id, name: z.string(), orgName: z.string(), orgType: z.string(),
  takenAt: IsoDateTime, reachable: z.boolean(),
  documents: z.array(z.object({ id: Id, title: z.string(), shortName: z.string().optional(), kind: DocumentKind, sha256: z.string().optional(),
    /** Heading paths to depth 3, from the index outline (src/main/ingest/outline.ts). */
    sections: z.array(z.string()) })),
  scenarios: z.array(z.object({
    scenarioId: Id, title: z.string(), status: z.enum(['draft','ready','archived']), threatFamily: z.string().optional(),
    exercisedAt: IsoDateTime.optional(),                        // see "Exercise date" below
    coreCapabilities: z.array(CoreCapabilityId),               // Objective.coreCapabilities (#421)
    planSections: z.array(PlanSectionRef),                      // overview.coreSectionsTested ∪ msel[].citations
    ratings: z.object({ met: z.number().int(), partial: z.number().int(), notMet: z.number().int(), notObserved: z.number().int() }).optional(),  // #421 observations
    aarPresent: z.boolean(),
  })),
})
```

`CoreCapabilityId` is defined by #421 in `src/shared/core-capabilities.ts` (the 32 FEMA Core Capabilities as snake_case ids with labels and mission areas). Until #421 lands, this spec's branch carries the file with the same export so neither blocks the other.

**Exercise date.** `exercisedAt` is, in order: the latest `endedAt` among `scenarios/<id>/live/<sessionId>/session.json` (#417, `LiveSession`); else the latest `delivered[].at` in `facilitator.json` when at least one row was delivered; else absent (the scenario was built but not run).

**Capabilities and ratings.** `coreCapabilities` comes from `scenario.evaluation.objectiveCapabilities[].capability` (#421); `ratings` counts the `Observation.rating` values in `scenarios/<id>/evaluation.json` plus the observations in the live log, by the latest observation per criterion.

### Project side

`project.json` gains `program: { id: Id, path: string }` (optional, `src/shared/schemas/project.ts`). `project:update` accepts `program: ... | null`. The project home shows the program name with "Open program" or "Link to a program".

### Main process — `src/main/program/`

| File            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.ts`      | `createProgram(parentDir, name)`, `openProgram(path)`, `loadProgram(root)`, `programPaths(root)`, `updateProgram(root, mutate)` (serialized per program, emits `program:changed`), `.lock.json` presence, `.gitignore`. Mirrors `src/main/project/store.ts`.                                                                                                                                                                                                   |
| `guard.ts`      | `requireProgram(path)`: the path must be the active program or in `settings.program.recent` and contain `program.json`. Every handler starts with it. Paths from JSON go through `safeJoin`.                                                                                                                                                                                                                                                                   |
| `actions.ts`    | `listActions`, `getAction`, `saveAction(root, action, baseRevision)` (CONFLICT on stale), `changeStatus`, `bulkUpdate`, `revisionOf(json)`.                                                                                                                                                                                                                                                                                                                    |
| `schedule.ts`   | read/write `schedule.json`; `markCompletedFromSnapshots()` (FR-9).                                                                                                                                                                                                                                                                                                                                                                                             |
| `links.ts`      | link/unlink a project; `resolveProjectPath(link, programRoot)` (relative → absolute → recent-projects by id).                                                                                                                                                                                                                                                                                                                                                  |
| `snapshot.ts`   | `takeSnapshot(programRoot, link)`: reads `project.json`, each `scenario.json` (`evaluation.objectiveCapabilities`, `overview.coreSectionsTested`, `msel[].citations`), `facilitator.json`, `live/*/session.json` (#417), `evaluation.json` and the live log's observations (#421), `aar.json` (#419), the index outline for section lists; writes `projects/<projectId>.json`. Marks `reachable: false` and keeps the old snapshot when the folder is missing. |
| `import-aar.ts` | `previewAarImport(programRoot, projectPath, scenarioId)` → items with "new / already imported / changed since import"; `applyAarImport(..., selections)` → writes actions and `imports/<id>.json`.                                                                                                                                                                                                                                                             |
| `propose.ts`    | pure `proposeNextExercise(program, schedule, snapshots, actions, now)` (also exported from `src/shared/program/propose.ts` so the renderer can preview without IPC round trips).                                                                                                                                                                                                                                                                               |
| `export.ts`     | IP table DOCX (`docx` npm, reusing `table()` from `src/main/export/docx.ts`), IPP DOCX, CSVs, PDF through `src/main/render/window.ts` `renderPdf` with a new `templates/export/program-*.html`. Runs as a job kind `program-export`.                                                                                                                                                                                                                           |

`src/main/ipc/handlers/program.ts` (new) owns the channels below; `src/shared/schemas/job.ts` `JobKind` gains `program-export` and `program-snapshot`.

### IPC — `src/shared/ipc/program.ts` (new; merged in `ipc/index.ts`)

```ts
const R = z.object({ programPath: z.string().min(1) })
export const programChannels = {
  'program:create': channel(
    z.object({
      parentDir: z.string(),
      name: z.string().min(1).max(120),
      orgName: z.string().default(''),
      startYear: z.number().int(),
      years: z.number().int().min(1).max(5).default(3),
    }),
    OpenProgram,
  ),
  'program:open': channel(R, OpenProgram), // sets settings.program.activePath
  'program:get': channel(R, OpenProgram), // { path, program, schedule, lock?: { host, user, at } }
  'program:close': channel(z.void(), z.void()),
  'program:update': channel(
    R.extend({
      patch: patchOf(Program.pick({ name, orgName, cycle, priorities })),
      baseUpdatedAt: IsoDateTime.optional(),
    }),
    OpenProgram,
  ),
  'program:link-project': channel(R.extend({ projectPath: z.string() }), OpenProgram),
  'program:unlink-project': channel(R.extend({ projectId: SafeId }), OpenProgram),
  'program:refresh': channel(
    R.extend({ projectIds: z.array(SafeId).optional() }),
    z.object({ jobId: SafeId }),
  ), // snapshots
  'program:snapshots': channel(R, z.array(ProjectSnapshot)),
  'program:actions-list': channel(
    R.extend({ filter: ActionFilter.optional() }),
    z.array(CorrectiveActionView),
  ), // view = action + revision
  'program:action-get': channel(R.extend({ id: SafeId }), CorrectiveActionView),
  'program:action-save': channel(
    R.extend({ action: CorrectiveAction, baseRevision: z.string().optional() }),
    CorrectiveActionView,
  ), // CONFLICT → details { theirs }
  'program:action-status': channel(
    R.extend({
      ids: z.array(SafeId).min(1),
      to: CorrectiveActionStatus,
      note: z.string().default(''),
      verification: CorrectiveActionVerification.optional(),
    }),
    z.array(CorrectiveActionView),
  ),
  'program:action-delete': channel(R.extend({ id: SafeId }), z.void()),
  'program:schedule-save': channel(
    R.extend({ schedule: Schedule, baseRevision: z.string().optional() }),
    Schedule,
  ),
  'program:import-aar-preview': channel(
    R.extend({ projectPath: z.string(), scenarioId: SafeId }),
    AarImportPreview,
  ),
  'program:import-aar': channel(
    R.extend({ projectPath: z.string(), scenarioId: SafeId, items: z.array(AarImportSelection) }),
    AarImport,
  ),
  'program:propose': channel(R, ExerciseProposal),
  'program:export': channel(
    R.extend({
      outDir: z.string(),
      targets: z
        .array(z.enum(['ip_docx', 'ip_pdf', 'ip_csv', 'ipp_docx', 'ipp_pdf', 'ipp_csv', 'zip']))
        .min(1),
    }),
    z.object({ jobId: SafeId }),
  ),
}
```

Push event `program:changed { path, what: 'program'|'actions'|'schedule'|'snapshots' }` is added to `events` in `ipc/index.ts`. `settings:update` accepts `program: { activePath?: string | null }`; `AppSettings` gains `program: { activePath?: string, recent: RecentProgram[] }`.

`AarImportPreview` lists `{ aarItemId, areaForImprovement, proposed: Partial<CorrectiveAction>, state: 'new'|'imported'|'changed', existingId? }`; `AarImportSelection` is `{ aarItemId, include: boolean, overrides: patchOf(CorrectiveAction) }`.

### Interface used from #419

`scenarios/<id>/aar.json` (`Aar` in `src/shared/schemas/aar.ts`, spec 0419) is read as is: `capabilities[]` (`CapabilityAnalysis.capability` gives the Core Capability) → `areasForImprovement[]` (`Finding { id, title, analysisMd, citations, recommendation, correctiveActions }`) → `CorrectiveAction { id, action, element, ownerRole?, ownerOrganization, poc, startDate?, dueDate?, status }`. The import maps `action` → `title` (first sentence) and `description`, `Finding.title` + `analysisMd` → `areaForImprovement`, `Finding.citations` → `planSections` (with the document sha256 from `project.json`), `element` → `element`, `poc` → `owner.name`, `ownerOrganization` → `owner.organization`, `status` `done` → `completed`, and `exerciseDate` → `source.exerciseDate`. `aarItemId = <finding.id>/<ca.id>`; both ids are ULIDs #419 keeps stable across regenerations (locked items keep their id). The one addition asked of #419: `Aar.capabilities[].areasForImprovement[].correctiveActions[].programActionId?: Id`, written back by the import so the AAR page can show "tracked in program as CA-0007".

### Proposal algorithm (`src/shared/program/propose.ts`)

Pure, seedless, explained. For each Core Capability and each plan section seen in any snapshot:

```
score = 3 × openActions (open/in_progress, weighted 1.5 when overdue)
      + 2 × priorityWeight (1 when a cycle priority names it and no completed exercise in the cycle addressed it)
      + yearsSinceLastExercised (capped at the cycle length; never-exercised = cycle length + 1)
      + 1 when a planned exercise in the current or next quarter already names it (keeps the schedule coherent)
```

Output: `ExerciseProposal { capabilities: [{ id, score, reasons: string[] }], planSections: [...], correctiveActionIds: string[], suggestedConstraints: string[] }`. `suggestedConstraints` are sentences the Scenarios page can drop into `ScenarioBrief.constraints` ("Must test EOP § 6.4 Public Information (last exercised 2023-04; 2 open corrective actions)"). The model never sees the program data unless the user starts a scenario from the proposal.

### Renderer — `src/renderer/src/routes/program/`

Routes (global scope, nav label "Program", order 5, icon `program`):

- `/program` — overview: name, cycle, linked projects, open-action counts, "Propose next exercise". Shows the empty state with Create / Open when no program is active.
- `/program/actions` — corrective actions table; `/program/actions/:id` — editor drawer.
- `/program/schedule` — IPP: year × quarter grid plus a list view.
- `/program/import/:projectKey/:scenarioId` — AAR import review (also reachable from a scenario's AAR tab, #419).

State: `src/renderer/src/state/program.ts` (Zustand: active path, filters). Queries through `useIpcQuery`.

```
┌ Program ─────────────────────────────────────────────────────────────────────┐
│ Summit County Airport Exercise Program         Cycle 2026–2028   [Settings]  │
│ Folder: /Volumes/EM-Share/Exercise Program.asprogram   Also open by: EOC-PC2 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Corrective actions   Open 14   In progress 6   Overdue 3   Verified 9        │
│ Projects (3)  NCIA Cyber TTX ✓   Water Utility 2025 ✓   Transit (unreachable)│
│                                               [Link project…] [Refresh]       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Propose next exercise                                                        │
│  1. Public Information and Warning      score 9.5                            │
│     • 2 open actions (CA-0007 overdue)  • last exercised 2024-03             │
│  2. ASP § 6.4 Vendor remote access      score 7                              │
│     • never exercised  • priority P-2 (TSA directive)                        │
│  [Start a scenario from this proposal]  [Copy constraints]                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌ Corrective actions ────────────────────────── [Import from AAR/IP ▾] [New] [CSV] ┐
│ Filter: Status [Open ▾]  Capability [All ▾]  Owner [All ▾]  Project [All ▾]       │
├────┬──────────────────────────────┬──────────────────┬─────────┬──────────┬────────┤
│ ID │ Corrective action            │ Capability       │ Owner   │ Due      │ Status │
├────┼──────────────────────────────┼──────────────────┼─────────┼──────────┼────────┤
│0007│ Add PIO approval chain to    │ Public Info &    │ J. Ruiz │ 2026-03-31│ Open ⚠ │
│    │ EOP § 6.4                    │ Warning          │ (PIO)   │ overdue  │        │
│0012│ 24/7 vendor VPN cut-off      │ Cybersecurity    │ IT Dir. │ 2026-06-30│ In prog│
│    │ procedure (ASP § 6.4)        │                  │         │          │        │
└────┴──────────────────────────────┴──────────────────┴─────────┴──────────┴────────┘
 Drawer (CA-0007): Title · Description · Area for improvement (from AAR) · Capabilities
 · Plan sections [EOP › 6.4 Public Information p.41] · Owner · Due · Priority
 · Status [Open ▾] note… · History (3) · Verifications (0) · Redlines (1, #431)
```

```
┌ IPP schedule 2026–2028 ───────────────────────────────── [Priorities] [Add exercise] ┐
│          Q1            Q2             Q3              Q4                             │
│ 2026  ▣ Seminar:     ▣ TTX: FIDS     ▢ Drill: PACS   ▢ Functional: EOC activation   │
│       Cyber basics     (done 04-12)    fail-over       (P-1, P-3; verifies CA-0012)  │
│ 2027  ▢ Workshop …   ▢ TTX …          ▢ Drill …       ▢ Full-scale …                │
│ 2028  ▢ …                                                                           │
└─────────────────────────────────────────────────────────────────────────────────────┘
 ▣ completed  ▢ planned/scheduled   Click a cell → PlannedExercise form (type, when, priorities,
 capabilities, plan sections, actions to verify, linked scenario)
```

### Scenario integration

- Scenarios page "New scenario" gets "From program proposal" when a program is active and the project is linked: pre-fills `brief.constraints` from `suggestedConstraints` and records `brief.programProposal: { at, correctiveActionIds }` (new optional field in `ScenarioBrief`) so the exercise can be matched back.
- The AAR tab (#419) gets "Send corrective actions to program".

### Migration of existing projects

- `project.json` only gains an optional `program` key; `PROJECT_FORMAT_VERSION` stays 1. Older builds keep the key (ADR-0016).
- No existing data moves. A user who wants history can import the AAR/IP of each past scenario one by one; the import preview handles scenarios whose `aar.json` was written before `id`s were stable by hashing the corrective-action text as the item id.
- `settings.json` gains `program` with defaults; nothing to migrate.

ADR: `docs/adr/0043-program-folder.md` (program folder outside projects, one file per action, advisory lock, snapshots).

## Security and privacy

- Threat: a crafted `program.json` points `projects[].path` at an arbitrary folder. Mitigation: a project is read only when it is a known project (`isKnownProject`, `src/main/lib/project-registry.ts`) or sits under the program folder's parent and contains `project.json`; otherwise the link shows "unreachable — open it once to confirm".
- Threat: ids in file names. All ids are `SafeId`; every path goes through `safeJoin(programRoot, …)`.
- Threat: shared storage symlink pointing outside. Reads use `safeJoinReal`.
- Personal data: owner name, organization and email are stored in the program folder only, shown in the UI and exports, never written to logs or `provider-calls.jsonl`. "Start a scenario from this proposal" sends only the constraint sentences (capability names, section headings, action ids) to the model, never owner fields; the dialog says so.
- Nothing leaves the computer: no catalog, no update check, no network in any program channel.
- Lock file contains host name and OS user name; the user can turn it off in program settings (`lock: false`) if that is a concern on their share.

## Testing

- Unit (`src/shared/schemas/program.test.ts`, `src/main/program/*.test.ts`): schema round trips and refusal of a newer format; status transitions (note required for deferred/cancelled, verification required for verified); revision conflict; link path resolution (relative, absolute, by id); snapshot from a fixture project (`examples/` project) including `exercisedAt` derivation from sessions then facilitator state; import preview states new/imported/changed and idempotent re-import; `proposeNextExercise` ranking on three fixtures (overdue action wins; never-exercised beats recently exercised; priority tie-break) with the reasons text asserted.
- Export: IP DOCX has the HSEEP columns (parse the produced DOCX with `mammoth` as the ingest parser does); CSV columns and quoting.
- Handlers (`src/main/ipc/handlers/program.test.ts`): `requireProgram` refuses unknown paths; CONFLICT payload carries `theirs`.
- Renderer (`happy-dom`): actions table sorting and filtering, status dialog validation, schedule grid cell → form, empty state without a program.
- e2e (`e2e/program.spec.ts`): create program → link example project → import AAR (fixture `aar.json` written into the example scenario) → change status → export CSV → relaunch and see the program re-open; a second window-less launch with another `TTX_USER_DATA` reads the same program folder and sees the lock notice.
- Packaged smoke: `e2e/packaged.spec.ts` gains "Program nav item present, create program in temp dir".
- a11y (`e2e/a11y.spec.ts`): axe on `/program`, `/program/actions`, `/program/schedule`.

## Tasks

1. **Schemas and core-capability stub** — `src/shared/schemas/program.ts`, `src/shared/schemas/index.ts`, `src/shared/core-capabilities.ts` (only if #421 has not merged; identical export), `src/shared/schemas/project.ts` (`program` field), `src/shared/schemas/settings.ts` (`program`), `src/shared/schemas/job.ts` (job kinds), tests.
2. **Program store, guard, settings** — `src/main/program/store.ts`, `guard.ts`, `links.ts`, `src/main/settings/store.ts` (active program), `src/shared/ipc/program.ts` (create/open/get/close/update/link/unlink), `src/main/ipc/handlers/program.ts`, `src/shared/ipc/index.ts` (merge + `program:changed`), tests.
3. **Corrective actions store and channels** — `src/main/program/actions.ts`, handlers for list/get/save/status/delete with revision conflicts, `docs/05-DATA-MODEL.md` program section, tests.
4. **Snapshots** — `src/main/program/snapshot.ts` (+ `src/main/ingest/outline.ts` export for heading lists), `program:refresh` job, `program:snapshots`, a refresh on `live:session-end` (#417, `src/main/live/`) for the linked project, tests with the example projects.
5. **AAR import** — `src/main/program/import-aar.ts`, `program:import-aar-preview`, `program:import-aar`, `imports/` records, tests; the `programActionId` write-back on #419's `CorrectiveAction` in `src/shared/schemas/aar.ts`.
6. **Schedule and proposal** — `src/main/program/schedule.ts`, `src/shared/program/propose.ts`, `program:schedule-save`, `program:propose`, `ScenarioBrief.programProposal`, tests.
7. **Renderer: program overview and actions** — `src/renderer/src/routes/program/{index.ts,ProgramPage.tsx,ActionsPage.tsx,ActionDrawer.tsx,StatusDialog.tsx,program.css}`, `src/renderer/src/state/program.ts`, `components/nav-icons.tsx` (`program` icon), component tests.
8. **Renderer: schedule, import review, project linking** — `routes/program/{SchedulePage.tsx,PlannedExerciseForm.tsx,ImportAarPage.tsx}`, `routes/project-home/ProgramLink.tsx` (link/unlink on the project home), Scenarios "From program proposal" (`routes/scenarios/ScenariosPage.tsx`), tests.
9. **Exports** — `src/main/program/export.ts`, `templates/export/program-ip.html`, `templates/export/program-ipp.html`, `program:export` job, tests that parse the DOCX/CSV.
10. **e2e, docs, ADR** — `e2e/program.spec.ts`, `e2e/a11y.spec.ts`, `docs/guides/program.md` with screenshots, `docs/adr/NNNN-program-folder.md`, README feature list, this spec updated to match.

## Open questions

1. **Default location when the user has no shared drive.** Recommendation: offer `<defaultProjectsDir>/<Org> Exercise Program.asprogram` as the pre-filled path in the Create dialog; never create it without the dialog.
2. **CSV import of corrective actions from spreadsheets agencies already keep.** Recommendation: defer to a follow-up issue; ship CSV export first so the columns are fixed before an importer reads them.
3. **Should "verified" require a drill from #431 or accept a manual observation?** Recommendation: accept both (`method: 'exercise' | 'review'` with a note naming where it was observed); the OIG finding is about actions never checked at all, and demanding a formal drill would push users back to "completed" as the end state.
4. **One active program or many?** Recommendation: one active program with a recent list; a user with two agencies switches. Multiple simultaneous programs complicate every project-side hint for a rare case.
5. **Lock file on synced folders (OneDrive, Dropbox) causes sync noise.** Recommendation: write it only while the Program screens are open, delete on close and app quit (via the quit guard, `src/main/lib/quit-guard.ts`), and make it a program setting.

## As built

Differences from the design above, with the reason:

- **No jobs for refresh and export.** `program:refresh` returns when the snapshots are written and
  `program:export` returns `{ files }`; both finish in well under a second for the sizes in NFR-4,
  and PDF goes through the render pool already. `JobKind` is unchanged.
- **`ProgramAction`, not `CorrectiveAction`.** `schemas/aar.ts` already exports `CorrectiveAction`
  (the AAR's item); both are re-exported from `schemas/index.ts`. The AAR's item gained
  `programActionId`, written back by the import (best effort).
- **Action numbers.** `program.json` holds `nextActionNumber`; an action has `number` ("CA-0007")
  and a ULID-like id for the file name. Numbers are never reused.
- **List response.** `program:actions-list` returns `{ actions, problems }`: a file that fails
  validation is listed as a problem, not hidden. `program:action-bulk` (owner, due date, priority
  for several actions) is new. `program:get` also returns `reachable` and `projectPaths`.
- **Status, history and verifications change only through `program:action-status`;** an edit
  through `program:action-save` keeps the stored ones.
- **Snapshots** use the document's stored heading preview (`headingsPreview`) for sections, so
  `src/main/ingest/outline.ts` was not needed, and count observations from `evaluation.json`
  only (live-log observations arrive with the live evaluation work).
- **Table.** Sortable real table, rendered in pages of 200 rows with "Show more" instead of
  virtual windowing; filtering narrows it. 2,000 actions render without noticeable delay.
- **PDF and DOCX** are built in code from the same row builders (`export.ts`); no
  `templates/export/program-*.html` files. CSV cells that start with a formula character are
  neutralized.
- **Lock.** Our own lock records the foreign lock it replaced (`previous`), so both apps keep
  showing "Also open by"; a lock older than 24 hours is ignored. `lock: false` in the program's
  settings turns it off.
- **Open questions** took the recommendations: pre-filled default location is the projects
  folder (dialog is always shown), CSV import deferred, `verified` accepts a manual observation,
  one active program with a recent list, lock only while the program is open.
- The "From program proposal" entry point is "Start a scenario from this proposal" on the
  overview; it opens the Generate brief with the constraints and records `brief.programProposal`.
  The scenario page shows no separate proposal button.
