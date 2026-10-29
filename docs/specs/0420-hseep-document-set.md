# Spec 0420: Complete HSEEP document set and Excel MSEL

Issue: #420 · Milestone: 0.6.0 · Status: Implemented · Depends on: #421 (Core Capabilities and EEGs) · Related: #419 (AAR/IP), #422 (surveys)

## Summary

The export gains the documents HSEEP 2020 expects, in their expected section order: the Exercise Plan (ExPlan), the Situation Manual (SitMan) and a Controller/Evaluator Handbook laid out the HSEEP way, each as PDF and Word, plus the MSEL as an Excel workbook in the common HSEEP column layout. Most of the content already exists in the scenario; this spec gives it the shape reviewers recognise and adds the few pieces that are missing (exercise details, assumptions and artificialities, module discussion questions).

## Requirements

### User stories

- As an emergency manager, I want an ExPlan and a SitMan I can file with a grant or accreditation package without re-formatting, so the exercise counts.
- As a planner, I want the MSEL in Excel with the columns my team already uses, so I can sort, filter, annotate and hand it to controllers.
- As a facilitator, I want a C/E Handbook with controller and evaluator instructions in the HSEEP order and the EEGs attached, so a visiting evaluator finds things where they expect them.
- As an exercise designer, I want to fill in exercise details once (dates, sponsor, participating organizations, point of contact, site) and have every document read them.
- As an exercise designer, I want the player edition of the SitMan to withhold the modules players have not reached, because our exercises are inject-driven and the briefing says players must not learn the threat from a packet.

### Functional requirements

- **FR-1** **Exercise details** (`scenario.conduct`): exercise name as filed, exercise type (always "Tabletop Exercise" in 0.6.0), planned date(s), start and end time, sponsor organization, participating organizations, exercise director / point of contact (name, organization, phone, email as the designer enters them), site and room, observers allowed, exercise identification marking (default "EXERCISE — FOR TRAINING USE"), communications plan lines (channel, purpose), safety and security notes, acronyms. Edited in a form on the Scenario page; every HSEEP document reads these fields; blank fields print a fill-in line, never an invented value.
- **FR-2** **ExPlan** (PDF, DOCX) with the HSEEP 2020 sections: Exercise Overview (name, dates, scope, mission areas, Core Capabilities, objectives, threat or hazard, scenario summary, sponsor, participating organizations, POC); General Information (exercise objectives and Core Capabilities table; participant roles and responsibilities: players, controllers, SimCell, evaluators, observers, facilitator; exercise assumptions and artificialities); Exercise Logistics (safety, fire and real emergencies, site access, security, observers and media, communications plan, exercise identification); Post-Exercise and Evaluation Activities (hot wash, controller/evaluator debrief, Participant Feedback Form, After-Action Meeting, AAR/IP); Participant Information and Guidance (exercise rules, player instructions before / during / after); Appendix A Exercise Schedule (from phases and the time jumps); Appendix B Exercise Participants (organizations); Appendix C Communications Plan; Appendix D Acronyms. The ExPlan contains the threat or hazard at the level of the overview's theme and no inject detail, so it may be handed to players before the exercise.
- **FR-3** **SitMan** (PDF, DOCX): Exercise Overview; General Information (objectives and capabilities table, participant roles, exercise structure "N modules", exercise guidelines, assumptions and artificialities, exercise evaluation note); one **Module per phase** with a narrative written as players experience it (the phase goal and beats recast as a situation update, with the module's time window), key issues, and 3–6 **discussion questions per module** addressed to roles and tied to objectives, each citing the plan section it probes; Appendix A Exercise Schedule; Appendix B Participants; Appendix C Acronyms. Two editions: the **facilitator edition** (all modules) and the **player edition** (Module 1 in full; later modules show title, time window and discussion questions only, with the narrative withheld). The player edition goes into players/ in the distribution ZIP only when the designer ticks it in the export options.
- **FR-4** **C/E Handbook** re-laid out to the HSEEP 2020 Controller and Evaluator Handbook order: Exercise Overview; General Information (controller and evaluator roles; exercise structure; exercise conduct: safety, security, communications, player instructions, the "REAL WORLD" convention); Controller Instructions (before, during, after; the MSEL as the controller's script; SimCell scripts; delivering injects; managing time); Evaluator Instructions (EEGs and critical tasks, observation keys, rating scale, data collection, hot wash and C/E debrief, feeding the AAR/IP); Appendix A Exercise Schedule; Appendix B MSEL summary (time, id, from, to, inject, expected action, capability); Appendix C EEGs (#421); Appendix D Communications Directory (from the communications plan); Appendix E Acronyms. The existing rubric, hot wash guide and SimCell scripts keep their place under the matching headings; `documents/handbook.md` is not re-written, the export assembles around it.
- **FR-5** **Excel MSEL** (`.xlsx`, written with `exceljs`, already a dependency used by `src/main/ingest/parsers/xlsx.ts`): sheet "MSEL" with one row per MSEL row and the columns, in order: Inject # · Phase / Module · Scenario Time (H:MM) · Wall Clock · Event Type (Inject / Contextual / Control card) · From · To · Delivery Method · Inject Description · Expected Player Action · Objective(s) · Core Capability(ies) · Critical Task(s) · Purpose · Format · Media File · Controller Notes · Delivered At (blank) · Notes (blank). Header row bold, frozen, autofilter on; wrap text on the long columns; widths set; phase rows coloured as bands; control cards (STARTEX, TIME_JUMP, ENDEX) in italics. Further sheets: "Overview" (exercise details, theme, threat, impact, plan sections tested), "Objectives" (objective, Core Capabilities, linked critical tasks), "Roles" (role, abbreviation, team, description), "Legend" (purpose tags with meanings, delivery methods, event types). The workbook has no formulas or macros.
- **FR-6** Delivery Method is derived by code from the row's `format` and the inject's `deliveryMode` (phone, radio, email, social media, document/handout, visual on main screen, audio, verbal/facilitator) through a table in `src/shared/taxonomy.ts` (`InjectTypeInfo.deliveryMethod`), with "Verbal" as the fallback.
- **FR-7** New export targets `explan_pdf`, `sitman_pdf`, `msel_xlsx`; the `docx` target writes every document (ExPlan, SitMan facilitator edition, C/E Handbook, Player Briefing, EEG packet, AAR when present); `exercise_plan_pdf` ("Exercise Plan" bundle, the existing cover plus all documents) adds the ExPlan and SitMan after the cover. The Export page groups targets under "HSEEP set" and "Classroom set" so the five existing documents stay a one-click choice.
- **FR-8** Distribution ZIP: facilitator/ gets everything; players/ gets the Player Briefing Packet, blank forms, player handouts, the ExPlan, and the SitMan player edition when enabled. The players/ allow-list (`zip.ts playerFileNames`) is extended by exactly those names and the assertion stays.
- **FR-9** A new stage `sitman` drafts the module narratives, key issues, discussion questions and the assumptions and artificialities list. It runs on demand from the Scenario page ("Generate SitMan modules") and inside the pipeline after `hotwash`; with no run yet the SitMan exports with the phase goal as narrative and "Discussion questions not generated yet". Discussion questions cite plan sections through citation keys like every stage.
- **FR-10** The exported document set is checked by a deterministic **completeness report** shown on the Export page before export and written as `export-report.md` into the export folder: which HSEEP sections are complete, which print fill-in lines (missing exercise details), which documents have no generated content yet (no EEGs, no SitMan modules, no AAR).

### Non-functional requirements

- **NFR-1** Cost: one additional model call per scenario (`sitman`); the Excel writer and the ExPlan are deterministic. No CI additions (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: exercise details (names, phone, email of the POC) live in `scenario.json` only, are never sent to a provider (the `sitman` stage does not receive `conduct`), and appear only in exported documents (Project rules 3).
- **NFR-3** Accessibility: PDFs keep real headings and table headers (`<th scope>`); the workbook has a header row and no merged cells in data areas; WCAG 2.2 AA in the details form.
- **NFR-4** Performance: the full set for a 28-row scenario exports in under 60 s on a laptop (one render window per PDF, sequential); the XLSX writes in under a second.

### Out of scope

- Operations-based exercise documents (Exercise Evaluation Plan, Extent of Play Agreement, Controller staff instructions with safety officer roles).
- Importing an existing Excel MSEL (a separate 0.7.0 issue; this spec fixes the column layout that import would read).
- Branding beyond the existing logo and colour (letterheads, cover art).

## Design

### Exercise details (`src/shared/schemas/scenario.ts`)

```ts
export const ConductDetails = z.object({
  exerciseName: z.string().default(''), // as filed; defaults to the scenario title in exports
  exerciseType: z.literal('tabletop').default('tabletop'),
  dates: z.array(z.string()).default([]), // ISO dates
  startTime: WallClock.optional(),
  endTime: WallClock.optional(),
  sponsor: z.string().default(''),
  participatingOrganizations: z.array(z.string()).default([]),
  director: z
    .object({ name: z.string(), organization: z.string(), phone: z.string(), email: z.string() })
    .partial()
    .default({}),
  site: z.string().default(''),
  room: z.string().default(''),
  observersAllowed: z.boolean().default(false),
  marking: z.string().default('EXERCISE — FOR TRAINING USE'),
  communications: z
    .array(z.object({ channel: z.string(), purpose: z.string(), detail: z.string().default('') }))
    .default([]),
  safetyNotes: z.string().default(''),
  securityNotes: z.string().default(''),
  acronyms: z.array(z.object({ term: z.string(), meaning: z.string() })).default([]),
})
// Scenario: conduct: ConductDetails.default({})
```

Acronyms are seeded by code from the domain profile and the documents' short names (TIRP, AEP, ASP, AODB…) the first time the form opens; the designer edits the list.

### SitMan content (`scenario.sitman`)

```ts
export const SitManModule = z.object({
  phaseId: Id,
  narrativeMd: z.string(),
  keyIssues: z.array(z.string()).default([]),
  discussionQuestions: z
    .array(
      z.object({
        text: z.string(),
        roleIds: z.array(Id).default([]),
        objectiveRef: z.string().optional(),
        citations: z.array(Citation).default([]),
      }),
    )
    .default([]),
})
export const SitMan = z.object({
  assumptions: z.array(z.string()).default([]),
  artificialities: z.array(z.string()).default([]),
  modules: z.array(SitManModule).default([]),
})
// Scenario: sitman: SitMan.optional()
```

`schemas/generation.ts`:

```ts
export const SitManOutput = z.object({
  assumptions: z.array(z.string()).min(3),
  artificialities: z.array(z.string()).min(2),
  modules: z
    .array(
      z.object({
        phase: z.number().int(), // 1-based phase number
        narrativeMd: z.string(),
        keyIssues: z.array(z.string()).min(2).max(6),
        discussionQuestions: z
          .array(
            z.object({
              text: z.string(),
              roleKeys: z.array(z.string()),
              objectiveRef: z.string().optional(),
              citations: z.array(CitationKey),
            }),
          )
          .min(3)
          .max(6),
      }),
    )
    .min(1),
})
```

`prompts/sitman.md`: `stage: sitman`, `outputSchema: SitManOutput`, `task: draft`, `temperature 0.5`, `maxTokens 5000`, retrieval queries per phase goal plus `'{{threat.keyCoordination}}'`, `k: 8`; variables `project, domain, threat, scenario, roles, phases, objectives, doctrine, retrieved, instructions`. Rules: the narrative is what players know at the module's start (the injects up to that time, not the cause); key issues are the decisions the module forces; discussion questions are addressed to roles ("Operations: …"), probe one objective each, and point to the plan section that answers them, by key in the JSON; assumptions and artificialities follow HSEEP wording adapted to this room (time jumps, SimCell plays the outside world, systems named as in the plans). The mapper `applySitMan` (`mappers.ts`) resolves phase numbers, role keys and citation keys; `stepSitMan` in `engine.ts` runs after `hotwash`; `STAGES` gains `'sitman'`.

### Export model and views

- `ExportModel` (`export/model.ts`) gains `conduct`, `sitman`, `evaluation` (from #421), `aar` (from #419) and `completeness: CompletenessReport`.
- `src/main/export/hseep.ts`: `explanView(model)`, `sitmanView(model, edition: 'facilitator' | 'player')`, `handbookHseepView(model)`, `scheduleRows(model)` (phases, time jumps and ENDEX as a schedule table with wall clock), `participantRows`, `acronymRows`, `exerciseOverviewFacts` (shared by all three documents and by the AAR), `assumptionsOrDefault` (HSEEP's standard list when the `sitman` stage has not run).
- Templates `templates/export/explan.html`, `sitman.html`, `handbook-hseep.html` (the existing `handbook.html` becomes the classroom handbook; the HSEEP one wraps `documents/handbook.md` sections by marker into the HSEEP order using `upsertSection` markers from `generate/docs.ts`: `overview` → Exercise Overview, `room` and `rules` → Controller Instructions, `rubric` and `hotwash` → Evaluator Instructions, SimCell scripts → Controller Instructions). `documents.ts buildDocumentHtml` gains `explan`, `sitman`, `sitman_player`, `handbook_hseep`; the "Exercise Plan" bundle order becomes cover, ExPlan, SitMan, C/E Handbook (HSEEP), MSEL, deck, EEGs, Player Briefing.
- `docx.ts`: `explanDocx`, `sitmanDocx(edition)`, `handbookHseepDocx`, reusing `markdownBlocks`, `table`, `titleBlocks`. Headings use `HeadingLevel` so Word's navigation pane shows the HSEEP sections.

### Excel MSEL (`src/main/export/xlsx.ts`)

```ts
export const MSEL_COLUMNS = [
  { key: 'id', header: 'Inject #', width: 10 },
  { key: 'phase', header: 'Phase / Module', width: 22 },
  { key: 'time', header: 'Scenario Time', width: 12 },
  { key: 'wallClock', header: 'Wall Clock', width: 11 },
  { key: 'eventType', header: 'Event Type', width: 13 },
  { key: 'from', header: 'From', width: 18 },
  { key: 'to', header: 'To', width: 18 },
  { key: 'method', header: 'Delivery Method', width: 16 },
  { key: 'event', header: 'Inject Description', width: 60, wrap: true },
  { key: 'expected', header: 'Expected Player Action', width: 48, wrap: true },
  { key: 'objectives', header: 'Objective(s)', width: 24, wrap: true },
  { key: 'capabilities', header: 'Core Capability(ies)', width: 26, wrap: true },
  { key: 'tasks', header: 'Critical Task(s)', width: 16 },
  { key: 'purpose', header: 'Purpose', width: 16 },
  { key: 'format', header: 'Format', width: 16 },
  { key: 'media', header: 'Media File', width: 30 },
  { key: 'controllerNotes', header: 'Controller Notes', width: 40, wrap: true },
  { key: 'deliveredAt', header: 'Delivered At', width: 12 },
  { key: 'notes', header: 'Notes', width: 30 },
] as const
export async function mselWorkbook(model: ExportModel): Promise<Buffer> // exceljs Workbook → xlsx buffer
export async function tableWorkbook(sheets: SheetSpec[]): Promise<Buffer> // shared with #419's Improvement Plan tracker
```

Objectives per row come from the critical tasks linked to the row (#421) and, failing that, from the rubric metrics that link the row; capabilities likewise. Controller Notes is the inject's `instructorNote`. Media File is the planned export name (`planMediaFiles`). The writer sets `workbook.creator` to the organization and no personal metadata. `rowCode`-style escaping is not needed: cells are typed strings and exceljs escapes XML. Cells that begin with `=`, `+`, `-` or `@` are prefixed with a space so a spreadsheet never interprets model text as a formula.

### Export plumbing

- `src/shared/ipc/export.ts`: `EXPORT_TARGETS` adds `explan_pdf`, `sitman_pdf`, `msel_xlsx`; `export:run` gains `options: { sitmanPlayerEdition?: boolean }`; `export:preview-html` `doc` enum adds `explan`, `sitman`, `sitman_player`, `handbook_hseep`; new `export:completeness` → `CompletenessReport` (`{ documents: [{ doc, ready: boolean, missing: string[] }], detailsMissing: string[] }`).
- `naming.ts`: `explan`, `sitman`, `sitmanPlayer`, `handbookHseep`, `mselXlsx`, their `Docx` twins; `zip.ts playerFileNames` adds `explan` and `sitmanPlayer`; `run.ts ORDER` places `msel_xlsx` after `media` and the new PDFs after `exercise_plan_pdf`.
- Renderer `routes/export/targets.ts`: `HSEEP_TARGETS` group with hints; `ExportPage.tsx` shows the completeness report with links to the Scenario page sections that fill the gaps; `PREVIEW_DOCS` adds the new documents.

### Scenario page

- `routes/scenarios/ScenarioSections.tsx`: "Exercise details" form (`editors/docs/structured/ConductDetailsEditor.tsx`) and "SitMan modules" structured editor (`SitManEditor.tsx`: narrative Markdown per module, key issues list, discussion questions with role chips, objective select and citation chips; Regenerate for stage `sitman`). `owners.ts PART_STAGE.sitman = 'sitman'`.
- `readiness.ts`: "Generate SitMan modules" when `sitman` is absent on a ready scenario; "Add exercise details" when `conduct.dates` is empty and an HSEEP export is attempted.

### Migration of existing projects

`conduct` defaults to empty and `sitman` is optional: existing scenario.json files load unchanged, no format version bump, and an older build keeps the keys (#208). Old `facilitator.json` and injects are untouched. Existing export folders are not rewritten; a re-export adds the new files beside the old ones under the same `<Title>-S<n>-<tag>` folder. The example projects get `sitman` content and placeholder-free `conduct` fields where fictional values exist (dates left blank).

## Security and privacy

Exercise details hold a point of contact's name, phone and email. They are stored in `scenario.json` inside the project folder, never logged, never included in prompt variables (the `sitman` stage's variables exclude `conduct`), and appear only in exported documents the user writes to a folder they chose. The Excel writer neutralises formula-leading cells (model text can begin with `=`), writes no external links and no macros. Templates render through the existing sandboxed print window with no network; Handlebars escaping stays on for every field. The players/ allow-list keeps controller material out of the player folder, including the facilitator edition of the SitMan.

## Testing

- Unit: `export/hseep.test.ts` (section order and headings for ExPlan, SitMan both editions, HSEEP handbook; fill-in lines for blank details; player edition withholds narrative after module 1; schedule rows from phases and time jumps), `export/xlsx.test.ts` (re-read the buffer with exceljs: headers, row count equals MSEL rows, frozen pane and autofilter set, a cell starting with `=` is prefixed, control cards italic, no formulas), `mappers.test.ts` for `applySitMan`, `naming.test.ts`, `zip.test.ts` (ExPlan and player SitMan allowed in players/, facilitator SitMan refused), `targets.test.ts`, `completeness.test.ts`.
- Golden / fixture: `tests/content/hseep-scenario-3.test.ts` exports the Scenario 3 fixture (with hand-written `conduct` and `sitman` fixtures in `tests/fixtures/export/scenario-3.conduct.json` and `.sitman.json`) and compares the SitMan module text with `reference/scenario-3/msel.md` phase goals (each module names its phase goal) and checks that the Excel rows equal `reference/scenario-3/msel.md` table rows in id, time and from/to; the ExPlan text must not contain any inject event text (players may read it).
- Export pipeline: `documents.test.ts` and `docx.test.ts` extended for the new documents; `run.test.ts` for the new targets and the `sitmanPlayerEdition` option.
- E2E: `e2e/export.spec.ts` selects the HSEEP set, exports, and checks the five new files exist and the XLSX opens (parsed with exceljs in the test); `e2e/doc-editors.spec.ts` fills the exercise details form and sees them in the ExPlan preview.
- Packaged smoke: `e2e/packaged.spec.ts` adds one XLSX export to confirm exceljs ships in the asar.
- Live (`LIVE=1`): `tests/live/pipeline.live.test.ts` runs the `sitman` stage on the sample run and writes the SitMan for review beside `reference/scenario-3/`.

## Tasks

1. **Exercise details and SitMan schemas.** `src/shared/schemas/scenario.ts` (`ConductDetails`, `SitMan`, `'sitman'` stage), `schemas/generation.ts` (`SitManOutput`), `taxonomy.ts` (`deliveryMethod` per inject type), tests, `docs/05-DATA-MODEL.md`.
2. **SitMan stage.** `prompts/sitman.md`, `generate/mappers.ts applySitMan`, `engine.ts stepSitMan`, mock fixture, `engine.test.ts`, `docs/guides/prompts.md`.
3. **Scenario page editors.** `editors/docs/structured/ConductDetailsEditor.tsx`, `SitManEditor.tsx`, `owners.ts`, `ScenarioSections.tsx`, `readiness.ts`, component tests, `e2e/doc-editors.spec.ts`.
4. **Excel MSEL.** `src/main/export/xlsx.ts`, `naming.ts`, `run.ts`, `src/shared/ipc/export.ts` (`msel_xlsx`), `routes/export/targets.ts`, `xlsx.test.ts`, `e2e/export.spec.ts`, ADR `docs/adr/NNNN-excel-export-with-exceljs.md` at the next free number when the work lands (0024 is taken by live play).
5. **ExPlan and SitMan documents.** `templates/export/explan.html`, `sitman.html`, `src/main/export/hseep.ts`, `model.ts`, `documents.ts`, `docx.ts` (`explanDocx`, `sitmanDocx`), `zip.ts` allow-list, `export:run` option, tests.
6. **HSEEP C/E Handbook layout and bundle order.** `templates/export/handbook-hseep.html`, `hseep.ts handbookHseepView`, `documents.ts` (bundle order, EEG appendix from #421), `docx.ts handbookHseepDocx`, tests; `docs/04-TABLETOP-METHODOLOGY.md` §2 table gains the HSEEP set.
7. **Completeness report and Export page.** `src/main/export/completeness.ts`, `export:completeness` channel and handler, `ExportPage.tsx` (HSEEP group, report, player-edition checkbox), `export-report.md` in `run.ts`, tests.
8. **Fixtures, examples, docs.** `tests/fixtures/export/scenario-3.{conduct,sitman}.json`, `tests/content/hseep-scenario-3.test.ts`, example projects regenerated with `sitman`, `docs/guides/getting-started.md` export section, `README.md` feature list.

## Implementation notes (where the code differs from the design above)

- `scenario.conduct` is `ConductDetails.optional()` and read through `conductOf(scenario)`, which fills the defaults. Same result as `.default({})` for readers, but older scenario files are not rewritten with a block of empty fields on their next save.
- The three HSEEP documents are built as block lists in `src/main/export/hseep/` (`explan.ts`, `sitman.ts`, `handbook.ts`, shared parts in `common.ts`) and rendered by one template, `templates/export/hseep.html`, and one Word writer, `hseep/docx.ts`, so PDF and Word always carry the same sections (ADR-0030). There is no separate `explan.html`, `sitman.html` or `handbook-hseep.html`.
- A fourth HSEEP target, `handbook_hseep_pdf`, writes the HSEEP-layout C/E Handbook on its own; otherwise it existed only inside the Exercise Plan bundle. All four HSEEP targets are selected by default and pulled in by the ZIP.
- EEG content (#421) is read from `scenario.evaluation` through `src/main/export/evaluation.ts` (`evaluationOf()`): Core Capabilities per objective, EEG critical tasks (with timing) and their MSEL rows, the Met / Partial / Not met / Not observed rating scale, and mission areas from the capabilities that are not common to all five areas. A scenario without guides prints fill-in lines and "not prepared yet" notes, and the rating scale falls back to HSEEP's P/S/M/U. The Exercise Plan bundle adds the EEG packet before the briefing when guides exist.
- Delivery Method values: Phone, Radio, Email, Social media, Document / handout, Visual (main screen), Audio, Verbal / facilitator (`DELIVERY_METHODS` in `taxonomy.ts`; per type `deliveryMethod`, else a per-category default; `deliveryMethodFor()`).
- Event Type: control cards are STARTEX, TIME_JUMP and ENDEX rows; a row with no expected action is Contextual; the rest are Injects.
- Acronyms are not seeded automatically: the form has **Add standard acronyms** (HSEEP terms plus role abbreviations), and the documents print that same list while the designer's list is empty.
- `readiness.ts` is unchanged: the completeness report on the Export page (with its link to the Exercise details tab) carries the "add exercise details" and "generate SitMan modules" prompts, and an existing scenario without a `sitman` run shows the stage as the next step of **Continue**.
- The example projects are not regenerated with `sitman` content in this change (follow-up); they export with phase goals as narrative.

## Open questions

1. **Does the SitMan player edition belong in players/ by default?** Recommendation: off by default. HSEEP hands players the whole SitMan, but Action Stations exercises are inject-driven and the briefing promises players will not learn the threat from a packet. The designer turns it on for a discussion-style delivery.
2. **Should the C/E Handbook switch to the HSEEP layout everywhere, or stay a separate document?** Recommendation: keep both. The classroom handbook (current layout, matches `reference/scenario-3/`) stays the default for `handbook_pdf`; the HSEEP layout is part of the HSEEP set and the Exercise Plan bundle. One source (`documents/handbook.md`) feeds both.
3. **One sheet or one sheet per phase in the workbook?** Recommendation: one "MSEL" sheet with a Phase column and coloured bands; controllers sort and filter one table, and a per-phase split breaks sorting by time across time jumps.
4. **Do we embed exercise details in `scenario.json` or a separate `conduct.json`?** Recommendation: `scenario.json` under `conduct`; it is small, versioned with the scenario's history, and the export model already loads the scenario. The AAR (#419) reads the same block for its Exercise Overview.
