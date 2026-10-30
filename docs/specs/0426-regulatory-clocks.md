# Spec 0426: Regulatory clocks and compliance mapping

Issue: #426 · Milestone: 0.7.0 · Status: Partly implemented (see Implementation notes) · Depends on: — · Related: #417 (session log), #419 (AAR/IP draft), #420 (Excel MSEL), #421 (Core Capabilities, EEGs), #416 (evaluator observations), #428 (controller tools)

## Summary

Facilitate shows countdown clocks for the reporting deadlines that apply to the exercising
organization, such as SEC Form 8-K Item 1.05, CIRCIA, TSA directives, HIPAA, GDPR, NIS2 and
DORA. An inject starts a clock, or the facilitator starts one by hand. The facilitator
records when players filed, and the AAR states which deadlines were met. Regulations and
framework controls (NIST CSF 2.0, NIS2 Article 21, DORA) are pack data, not code. A coverage
matrix export lists the controls each MSEL row exercised, with the evidence for each.

## Requirements

### User stories

- As a facilitator of a cyber exercise, I want a CIRCIA 72-hour clock to start when the
  "ransomware confirmed" inject is delivered, so that players feel the reporting pressure
  and I can see whether they would have met it.
- As an exercise planner at a public company, I want an SEC 8-K clock that starts only when
  players decide the incident is material, so that the exercise tests the materiality call.
- As a CISO, I want a coverage matrix of which NIST CSF 2.0 subcategories the exercise
  exercised, so that I can show the board and auditors what we tested.
- As a pack author in the EU, I want to add my national NIS2 transposition deadlines as
  data, so that I do not have to wait for an app release.

### Functional requirements

- **FR-1** Two new pack content kinds: `regulations/<id>.json` (reporting obligations with one
  or more clocks) and `frameworks/<id>.json` (control catalogs with mapping rules). Schemas
  `Regulation` and `Framework` live in `src/shared/schemas/compliance.ts`. Packs that carry them
  declare `formatVersion: 2` (Design §2).
- **FR-2** `DomainProfile` gains optional `regulations: string[]` and `frameworks: string[]`, the
  ids that apply to the domain by default. Older apps drop the unknown keys (`z.object`), so
  existing packs and projects keep working.
- **FR-3** Per project, **Settings › Compliance** lists the regulations and frameworks the
  profile suggests, plus any others from installed packs. Each can be switched on or off
  (stored in `project.json` `compliance`). Each regulation shows its status (in force,
  proposed, guidance), its source link and the date its values were last checked. For a
  `proposed` regulation, the UI states that the deadline is from a proposed rule.
- **FR-4** A regulation defines **triggers** (named events such as "became aware",
  "materiality determined", "classified as major") and **clocks**. A clock's deadline is a
  duration (`hours`, `calendar_days`, `business_days`, `months`) from a trigger or from another
  clock's completion. It can also be the earliest of several such terms (DORA: 4 h after
  classification, but no later than 24 h after awareness).
- **FR-5** Business days use a calendar named in the regulation: `us_federal` (weekends and
  US federal holidays, observed rule), `weekdays`, or `none`. The app computes US federal
  holidays by rule (no network) in `src/shared/compliance/calendars.ts`. Other calendars can
  be added later as data (Open question 3).
- **FR-6** Triggers fire in three ways:
  (a) An MSEL row carries `triggers: [{ regulationId, triggerId }]`, and delivering the row in
  Facilitate fires them at the delivery's scenario time.
  (b) The facilitator fires a trigger by hand from the clocks panel ("Players determined
  materiality at 10:40").
  (c) With live play (#418), a controller can fire a trigger from a player message.
- **FR-7** Facilitate shows a **Clocks** strip under `ExerciseClock`. Each running clock shows
  the regulation, the filing, the scenario-time deadline (date, weekday, time), the time
  left in scenario time and a status (`running`, `due soon` at 25 % left, `overdue`, `met`,
  `missed`, `waived`). Completing a clock ("Filed at…") can start dependent clocks.
- **FR-8** Clocks run on **scenario time**: the scenario's start date and `startWallClock` plus
  the exercise clock. Time jumps that move the exercise clock move the clocks with it. When
  the scenario has no start date, the app reads it from the STARTEX card (the date parser
  behind the `DATE_DRIFT` lint). Failing that, it uses the next Monday, and a visible note
  says business days assume that date.
- **FR-9** The presentation window can show selected clocks ("Show on screen"), off by
  default. The room sees "CIRCIA report due in 61 h 12 m", never the facilitator's notes.
- **FR-10** Every trigger, completion and waiver is written to `facilitator.json` and to the
  session log (#417) as `compliance.trigger` / `compliance.clock` entries.
- **FR-11** A framework defines its control hierarchy (for example function › category ›
  subcategory) and **mapping rules**. Each rule matches on purpose tag, inject type, threat
  family, regulation trigger and keywords (in the row event or expected action) and gives
  control ids. Rules run when the MSEL is generated or edited and suggest
  `MselRow.controls`. The user accepts or removes the suggestions in the MSEL editor.
  Accepted ones are stored, and manual additions are allowed.
- **FR-12** Optional model-assisted mapping: **Suggest controls** runs the `critique` text task
  with a `ComplianceMapOutput` JSON schema over the rows and the enabled control list. The
  results are shown as suggestions, never stored automatically. The button names the routed
  provider. A cloud provider shows what is sent (#433 when available).
- **FR-13** Evidence levels per control, in order: `planned` (a row maps to it), `delivered` (that
  row was delivered in Facilitate), `observed` (a note, quote (#425), evaluator observation
  (#416) or met clock references the row or control). A met clock is evidence for the controls
  its regulation lists in `controls`. A missed clock is shown as a gap.
- **FR-14** Coverage matrix export: new targets `coverage_xlsx` and `coverage_csv` in
  `EXPORT_TARGETS`. The Markdown and DOCX scenario exports also gain a "Compliance coverage"
  section. Columns: framework, hierarchy path, control id, title, rows (ids), evidence level,
  evidence references, and the regulatory clocks with deadline, filed time and result. There
  is one sheet per framework, plus a "Clocks" sheet.
- **FR-15** The AAR draft (#419) receives clock results and the coverage summary as inputs with
  cite keys (`K<n>` for clocks, `F<n>` for controls).
- **FR-16** Bundled data (core pack, `packs/regulations/`, `packs/frameworks/`) ships the
  regulations in Design §5 and the NIST CSF 2.0, NIS2 Article 21 and DORA catalogs. Each
  record has `source`, `citation`, `status` and `verifiedOn`. A unit test fails when
  `verifiedOn` is older than 12 months, so each release re-checks the deadlines.

### Non-functional requirements

- **NFR-1** Cost: no service. All data is in packs. NIST CSF 2.0 is a US Government work. EU
  legislation text may be reused under Commission Decision 2011/833/EU, and the catalogs carry
  ids, titles and short summaries, not the full legal text (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: nothing leaves the computer. FR-12 calls only the provider the user routed
  `critique` to, and only on click (Project rules 3).
- **NFR-3** Accessibility: WCAG 2.2 AA. Clock status uses text and icon, not color alone.
  Countdown updates are not announced every second. The live region announces only status
  changes (due soon, overdue, met). The room display uses at least 48 px numerals and AA
  contrast in light and dark themes.
- **NFR-4** Correctness: clock math is pure and deterministic (`src/shared/compliance/clock.ts`),
  with table-driven tests for every bundled regulation, DST changes and holidays. A clock
  computed in the renderer and in export gives the same deadline.
- **NFR-5** Not legal advice: every regulation card and export carries the line "Exercise aid,
  not legal advice. Check the current rule and your counsel." Regulations with
  `status: 'proposed'` are labeled in the panel and in exports.

### Out of scope

- Filling or submitting real regulatory forms (`regulatory_report_form` stays a template for
  injects).
- Determining whether a regulation applies to an organization; the user switches it on.
- Bundled state breach-notification laws (packs may add them; Open question 2).
- ISO 27001, SOC 2, PCI DSS and other licensed catalogs (copyright; Open question 4).

## Design

### 1. Schemas (`src/shared/schemas/compliance.ts`)

```ts
export const DurationUnit = z.enum(['minutes', 'hours', 'calendar_days', 'business_days', 'months'])
export const ClockTerm = z.object({
  from: z.string(), // trigger id, or "clock:<clockId>" (that clock's completion)
  amount: z.number().positive().max(10_000),
  unit: DurationUnit,
})
export const RegulationClock = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string(), // "Initial notification"
  recipient: z.string(), // "CISA", "SEC (EDGAR)", "Competent authority / CSIRT"
  /** Due at the earliest of these terms (a single term in most regulations). */
  dueAt: z.array(ClockTerm).min(1).max(4),
  /** Plain text the facilitator sees, e.g. "Without undue delay and where feasible within…". */
  rule: z.string().max(600),
  /** Templates whose injects suit the filing (e.g. regulatory_report_form). */
  injectTypes: z.array(z.string()).default([]),
})
export const Regulation = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string(), // "SEC Form 8-K Item 1.05"
  jurisdiction: z.string(), // "US", "EU", "US-CA"
  authority: z.string(),
  citation: z.string(), // "17 CFR 229.106; Form 8-K Item 1.05"
  sources: z.array(z.object({ title: z.string(), url: HttpUrl })).min(1),
  status: z.enum(['in_force', 'proposed', 'guidance', 'superseded']),
  statusNote: z.string().max(1000).default(''),
  verifiedOn: IsoDate,
  calendar: z.enum(['us_federal', 'weekdays', 'none']).default('none'),
  triggers: z.array(z.object({ id: Id, label: z.string(), hint: z.string().default('') })).min(1),
  clocks: z.array(RegulationClock).min(1).max(8),
  /** Framework controls a met clock is evidence for: "nist_csf_2:RS.CO-03". */
  controls: z.array(z.string()).default([]),
  appliesTo: z
    .object({ threatFamilies: z.array(ThreatFamilyId).default([]), note: z.string().default('') })
    .default({}),
})
export const Control = z.object({
  id: z.string().max(40), // "RS.CO-02", "21.2.b", "Art.19"
  parent: z.string().optional(), // hierarchy: "RS.CO" → "RS"
  title: z.string().max(300),
  summary: z.string().max(1000).default(''),
})
export const MappingRule = z.object({
  controls: z.array(z.string()).min(1),
  purposeTags: z.array(PurposeTag).default([]),
  injectTypes: z.array(z.string()).default([]),
  threatFamilies: z.array(ThreatFamilyId).default([]),
  triggers: z.array(z.string()).default([]), // "<regulationId>:<triggerId>"
  keywords: z.array(z.string().max(60)).max(30).default([]), // plain words, no regex (lowercase match)
})
export const Framework = z.object({
  id,
  label,
  version: z.string(),
  publisher: z.string(),
  license: z.string(), // SPDX or LicenseRef
  sources,
  verifiedOn,
  levels: z.array(z.string()).min(1).max(4), // ["Function","Category","Subcategory"]
  controls: z.array(Control).min(1).max(2000),
  rules: z.array(MappingRule).max(500).default([]),
})
```

Keywords are plain lowercase words, not regex, so pack data cannot add a backtracking pattern
(the domain regex rule in `docs/packs-format.md` stays the only regex surface).

Scenario and facilitator additions:

```ts
// src/shared/schemas/scenario.ts
ScenarioBrief.startDate: IsoDate.optional()                         // narrative date of STARTEX
MselRow.triggers: z.array(z.object({ regulationId, triggerId })).default([])
MselRow.controls: z.array(z.string()).default([])                   // accepted "<frameworkId>:<controlId>"
MselRow.controlSuggestions: z.array(z.object({ ref: z.string(), by: z.enum(['rule','model']) })).default([])

// src/shared/ipc/facilitator.ts, FacilitatorState (becomes z.looseObject, ADR-0016)
compliance: z.object({
  fired: z.array(z.object({ id: SafeId, regulationId, triggerId, scenarioAt: IsoDateTime,
                            exerciseMin: z.number(), by: z.enum(['row','manual','live']), rowId: z.string().optional(),
                            note: z.string().default('') })).default([]),
  clocks: z.record(z.string(), z.object({          // key "<regulationId>:<clockId>"
            status: z.enum(['met','missed','waived']), at: IsoDateTime.optional(), note: z.string().default('') })).default({}),
  onScreen: z.array(z.string()).default([]),
}).default({})

// src/shared/schemas/project.ts, Project (looseObject)
compliance: z.object({ regulations: z.record(z.string(), z.boolean()).default({}),
                       frameworks: z.record(z.string(), z.boolean()).default({}) }).optional()
```

`FacilitatorState` changes from `z.object` to `z.looseObject`. Live play and #428 add keys to it
too, and a key one build does not know must survive a save by another build. Each feature adds
one optional top-level key and does not touch the others.

### 2. Pack format

- `PACK_KINDS` gains `regulations` and `frameworks` (flat, `<id>.json`, id `^[a-z][a-z0-9_]*$`,
  1 MB per file cap for frameworks).
- `PACK_FORMAT_VERSION` becomes 2. The reader accepts 1 and 2. A version-1 manifest that lists
  the new kinds is refused, and an app that only knows 1 refuses version 2 with the existing
  "this pack needs a newer version of the app" message. That message is clearer than the
  "unknown contents key" error an old app would otherwise show. `scripts/build-bundled-packs.mjs`
  writes version 2 only for packs that contain the new kinds.
- `docs/packs-format.md` gets the new folders, ids, the per-kind content checks (zod parse,
  every `MappingRule.controls`/`Regulation.controls` reference resolves, every `ClockTerm.from`
  names a trigger or an earlier clock with no cycles) and two example blocks parsed by
  `pack.test.ts`.
- Bundled sources: `packs/regulations/*.json` and `packs/frameworks/*.json`, mapped to
  `ai.actionstations.core` in `packs/bundled.json`. Domain profiles in `packs/domains/*.json` list
  the defaults: for example `airport` lists `tsa_aviation_cyber` and `circia`, `healthcare`
  lists `hipaa_breach` and `circia`, `financial_services` lists `sec_8k_105`, and `generic`
  lists none.
- Registry: `src/main/packs/state.ts` registers regulations and frameworks the way it registers
  domains. Layer precedence is the same: project > user > installed > bundled. A project that
  uses one copies it into `<project>/compliance/<kind>/<id>.json` and records it in `packs.json`
  (ADR-0018 copies), so a shared project keeps its deadlines.

### 3. Clock engine (`src/shared/compliance/`)

```
calendars.ts   usFederalHolidays(year) (fixed + nth-weekday rules, Sat→Fri / Sun→Mon observed),
               isBusinessDay(date, calendar)
clock.ts       deadline(reg, clockId, fired, completions, tz) → { dueAt, termUsed } | { waiting: [...] }
               status(dueAt, now, completion) → 'waiting'|'running'|'due_soon'|'overdue'|'met'|'missed'|'waived'
scenario-time.ts scenarioNow(brief, startDateFallback, clockMinutes) → Date (floating local time, no TZ)
```

- Scenario times are floating local times, with no time zone stored. The organization's local
  time is the narrative. DST is ignored on purpose: an exercise does not cross a real DST
  change, and the test table pins that behavior.
- `business_days`: a deadline of N business days lands at the same time of day on the Nth
  business day after the trigger date. Example: 4 business days from Thursday 10:40 is the next
  Wednesday 10:40 with no holiday. With a Monday federal holiday in between, it is Thursday
  10:40. The `rule` text tells the facilitator to read the regulation for end-of-day filing
  conventions.
- `months`: calendar month addition, clamped to the month's last day.

### 4. Main and IPC

- `src/shared/ipc/compliance.ts` (new domain file), handlers `src/main/ipc/handlers/compliance.ts`:
  - `compliance:list` `{ projectPath }` → enabled and available regulations and frameworks, with provenance (pack id/version, as in `ProvenanceBadge`)
  - `compliance:set` `{ projectPath, regulations?, frameworks? }` → project `compliance`
  - `compliance:suggest-rules` `{ projectPath, scenarioId }` → `MselRow.controlSuggestions` recomputed (pure rules, `src/main/compliance/rules.ts`)
  - `compliance:suggest-model` `{ projectPath, scenarioId, rowIds? }` → `{ jobId }` (job kind `compliance-map`, `critique` task, `ComplianceMapOutput` in `schemas/generation.ts`)
  - `compliance:coverage` `{ projectPath, scenarioId }` → `CoverageReport` (used by the panel, the export and #419)
- Firing and completing clocks is a `FacilitatorState` update through the existing
  `facilitator:state-save` path (renderer reducers in `routes/facilitate/compliance.ts`). No
  extra channel is needed.
- Generation: after each `msel_phase` step the pipeline runs the rules (no model call) and
  stores suggestions. `prompts/msel_phase.md` gets one optional variable, `regulations`, a short
  list of enabled triggers, so the model can place a trigger row ("Legal confirms
  materiality"). It writes `triggers` on that row. The output schema `MselPhaseOutput` gains
  `triggers` (optional).
- Export: `src/main/export/coverage.ts` builds the `CoverageReport` into sheets with `exceljs`
  (already a dependency) and CSV. `views.ts` adds the Markdown/DOCX section. `run.ts` wires the
  two new targets.

### 5. Bundled regulations (values checked 2026-10-28)

| id                   | Clock(s)                                                                                                                                                                                                | Trigger                                                                                                     | Status                                                                                                                                                                                                                                     | Sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sec_8k_105`         | File Form 8-K Item 1.05 within **4 business days** (`us_federal`)                                                                                                                                       | Materiality determined (the determination itself must be made "without unreasonable delay" after discovery) | in force (since 2023-12-18; smaller reporting companies 2024-06-15). The Attorney General may delay disclosure for national security / public safety                                                                                       | [SEC fact sheet, Release 33-11216](https://www.sec.gov/files/33-11216-fact-sheet.pdf)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `circia`             | Covered cyber incident report **72 h**; ransom payment report **24 h**                                                                                                                                  | Reasonably believes a covered incident occurred; ransom paid                                                | **proposed**. Final rule not published as of 2026-10-28. CISA missed the October 2025 statutory date and later targets; secondary reporting says it went to OMB review in October 2026. Values are from the April 2024 NPRM and may change | [CIRCIA NPRM, 89 FR 23644](https://www.federalregister.gov/documents/2024/04/04/2024-06526/cyber-incident-reporting-for-critical-infrastructure-act-circia-reporting-requirements); [Federal News Network, July 2026](https://federalnewsnetwork.com/cybersecurity/2026/07/circia-other-big-cyber-rules-expected-to-get-finalized-this-fall/); [Hunton, Sept 2026 target](https://www.hunton.com/privacy-and-cybersecurity-law-blog/cisa-plans-to-finalize-cyber-incident-reporting-regulations-in-september-2026) |
| `tsa_aviation_cyber` | Report to CISA **24 h**                                                                                                                                                                                 | Cybersecurity incident identified                                                                           | in force via the 2022 airport security program amendment and aircraft operator directives. The texts are partly sensitive security information; the value is from published summaries. **Uncertain:** check the current amendment          | [Airport amendment summary (2022)](https://www.convergint.com/wp-content/uploads/2022/10/TSA-Amendment-2022.pdf); [The Record](https://therecord.media/experts-push-back-on-tsas-24-hour-cybersecurity-incident-reporting-rule-for-aviation-industry/)                                                                                                                                                                                                                                                             |
| `tsa_rail_cyber`     | Report to CISA **24 h**; supplemental information within 24 h of it becoming available                                                                                                                  | Incident identified                                                                                         | in force via SD 1580-21-01 / 1582-21-01 series (the 01C versions ran to 2025-10-24). A 2026 OMB notice cites an SD 1580-26-02 series. **Uncertain:** check the current version                                                             | [SD 1580-21-01C](https://tsa.gov/sites/default/files/security_directive_1580-21-01c_and_memo_508c.pdf); [SD 1582-21-01C](https://tsa.gov/sites/default/files/security_directive_1582-21-01c_and_memo_508c.pdf)                                                                                                                                                                                                                                                                                                     |
| `tsa_pipeline_cyber` | Report to CISA **24 h** (the first 2021 directive said 12 h)                                                                                                                                            | Incident identified                                                                                         | in force via SD Pipeline-2021-01 series (reported 01G effective 2026-01-16). **Uncertain:** check the current version                                                                                                                      | [CRS IN12006](https://www.everycrsreport.com/reports/IN12006.html); [TSA surface NPRM, 89 FR 88488](https://www.govinfo.gov/content/pkg/FR-2024-11-07/html/2024-24704.htm)                                                                                                                                                                                                                                                                                                                                         |
| `hipaa_breach`       | Individuals: **60 calendar days**. HHS: within 60 days if ≥ 500 people, else within 60 days of year end. Media: 60 days if > 500 residents of a state                                                   | Breach discovered (first day known, or would have been known with reasonable diligence)                     | in force                                                                                                                                                                                                                                   | [45 CFR 164.404](https://www.law.cornell.edu/cfr/text/45/164.404), [164.406](https://www.law.cornell.edu/cfr/text/45/164.406), [164.408](https://www.law.cornell.edu/cfr/text/45/164.408)                                                                                                                                                                                                                                                                                                                          |
| `gdpr_art33`         | Supervisory authority: **72 h** "where feasible", without undue delay. Data subjects (Art. 34): without undue delay, no fixed hours                                                                     | Controller became aware                                                                                     | in force                                                                                                                                                                                                                                   | [GDPR Art. 33](https://eur-lex.europa.eu/eli/reg/2016/679/oj) ([text](https://gdpr-info.eu/art-33-gdpr/))                                                                                                                                                                                                                                                                                                                                                                                                          |
| `nis2_art23`         | Early warning **24 h**; incident notification **72 h**; final report **1 month** after the notification                                                                                                 | Became aware of a significant incident                                                                      | in force (directive). National transpositions may shorten deadlines (for example trust service providers 24 h), so packs per member state can override                                                                                     | [Directive (EU) 2022/2555 Art. 23](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `dora_art19`         | Initial **4 h** after classification as major, and no later than **24 h** after awareness; intermediate **72 h** after the initial notification; final **1 month** after the latest intermediate report | Aware; classified as major                                                                                  | in force (since 2025-01-17). **Uncertain:** secondary sources differ on the intermediate and final anchors. Check the adopted RTS on reporting time limits                                                                                 | [Regulation (EU) 2022/2554 Art. 19](https://eur-lex.europa.eu/eli/reg/2022/2554/oj); [Bank of Latvia summary](https://www.bank.lv/en/operational-areas/supervision/ict-security-and-cyber-risks/incident-reporting)                                                                                                                                                                                                                                                                                                |

Candidates for pack authors, not bundled in 0.7.0 until verified: NERC CIP-008 (energy,
1 hour after determination of a reportable incident), NYDFS 23 NYCRR 500.17 (72 h), and
state breach laws (Open question 2).

Frameworks bundled: `nist_csf_2` (CSF 2.0: 6 functions, 22 categories, 106 subcategories,
from the NIST CPRT JSON export, public domain;
[CSF 2.0 reference tool](https://csrc.nist.gov/projects/cprt)), `nis2_art21` (the ten
measures in Art. 21(2)(a)–(j) plus Art. 23 reporting), `dora` (the chapters as categories:
ICT risk management Arts. 5–16, incident management Arts. 17–23, resilience testing Arts. 24–27,
third-party risk Arts. 28–44, information sharing Art. 45). Each has mapping rules for the
purpose tags. For example, `DECISION_POINT` + cyber maps to `RS.MA`/`RS.CO`, `CLUE` maps to
`DE.AE`, `MISINFORMATION`/`PRESSURE` maps to `RS.CO`, a trigger of any regulation maps to
`RS.CO-02` / NIS2 `23` / DORA `Art.19`, and `TECH_HURDLE` with recovery keywords maps to `RC.RP`.

### 6. UI

Facilitate clocks strip (under `ExerciseClock`, collapsed to one line when none run):

```
┌ Regulatory clocks ────────────────────────────── [+ Fire trigger ▾] ┐
│ CIRCIA (proposed) · Incident report → CISA                          │
│   Due Fri 14 Mar 09:12 · 61 h 12 m left · running   [Filed…] [⋯]    │
│ SEC 8-K 1.05 · waiting for "Materiality determined"  [Fire now]     │
│ DORA · Initial notification · Due Thu 13 Mar 13:40 · OVERDUE 0 h 20 m│
│                                        [Show on screen ☐]           │
└─────────────────────────────────────────────────────────────────────┘
```

`[⋯]` opens: mark met at a time, mark missed, waive (note required), undo. The MSEL editor
row drawer gains "Starts clocks" (regulation › trigger pickers) and "Controls" (chips: accepted
are solid, suggestions dashed with ✓/✕, `+` opens a searchable control picker). Settings ›
Compliance shows the FR-3 lists with status badges and source links.

Coverage preview (scenario page › Compliance tab, same data as the export):

```
NIST CSF 2.0          planned  delivered  observed
RS.CO-02 Incidents…     I-07      I-07      ✓ note I-07, clock CIRCIA met
DE.AE-02 Potentially…   I-03      —         —
…                        Gaps: 12 controls in enabled categories have no row
```

## Security and privacy

- Pack data is untrusted. It is parsed with zod with caps on every list and string. Keywords
  are plain words, there are no regexes, and URLs must be `http(s)`. They render as text and
  open in the system browser through the existing external-link guard.
- FR-12 sends row text and control titles to the routed `critique` provider. It is never
  automatic, the provider is named on the button, and the #433 preview applies.
- No regulator is contacted, nothing is filed and no network call is made.
- Legal-advice disclaimer (NFR-5) on the panel, settings and every export.

## Testing

- **Unit:** `calendars.test.ts` (US federal holidays 2024–2030 against a fixed table, including
  Juneteenth and observed Saturday/Sunday holidays). `clock.test.ts`, table-driven per bundled
  regulation: 8-K over a holiday weekend, DORA earliest-of terms, NIS2 chained clock,
  `months` clamping, a clock that waits for its trigger. Scenario time from the STARTEX date
  fallback. The rules engine on fixture rows. The schema cross-checks (cycle, dangling
  references). The `verifiedOn` freshness test (FR-16).
- **Pack:** `pack.test.ts` parses the new doc examples. The reader refuses a v1 manifest with new
  kinds, and refuses v2 on a simulated v1 app. `build-bundled-packs` maps every
  regulation/framework to exactly one pack.
- **Component:** clocks strip states and keyboard operation, MSEL row drawer chips.
- **Export:** `coverage.test.ts` snapshot of CSV, and XLSX sheet names, headers and row counts read back with `exceljs`.
- **e2e:** open the airport example, enable CIRCIA, deliver the trigger row, check the clock
  deadline text, mark it met, export `coverage_xlsx`, assert the file and the "Clocks" sheet.

## Tasks

1. **Schemas and engine.** `src/shared/schemas/compliance.ts`, `src/shared/compliance/{calendars,clock,scenario-time}.ts`
   with tests, plus `ScenarioBrief.startDate`, `MselRow.triggers/controls/controlSuggestions` in
   `src/shared/schemas/scenario.ts`, and `FacilitatorState` → `looseObject` + `compliance` in
   `src/shared/ipc/facilitator.ts`.
2. **Pack format v2.** `src/shared/schemas/pack.ts` (`PACK_KINDS`, `PACK_FORMAT_VERSION`, item ids,
   extensions), `src/main/packs/reader.ts` content checks, `src/main/packs/state.ts` registry,
   project copies in `src/main/packs/project-copies.ts`, `scripts/build-bundled-packs.mjs`,
   `docs/packs-format.md`, ADR `docs/adr/00NN-compliance-packs.md`.
3. **Bundled data.** `packs/regulations/*.json` (Design §5 with sources), `packs/frameworks/{nist_csf_2,nis2_art21,dora}.json`
   (a script `scripts/import-csf.mjs` converts the CPRT JSON once, and its output is committed),
   `packs/bundled.json`, domain defaults in `packs/domains/*.json`.
4. **Project settings and IPC.** `src/shared/ipc/compliance.ts`, `src/main/ipc/handlers/compliance.ts`,
   `src/main/compliance/rules.ts`, `Project.compliance` in `src/shared/schemas/project.ts`,
   Settings › Compliance in `routes/settings/`.
5. **Facilitate clocks.** `routes/facilitate/{compliance.ts,RegulatoryClocks.tsx}`, row-delivery
   hook in `use-delivery-actions.ts`, presentation overlay in `routes/present/`, session log
   entries (with #417).
6. **MSEL mapping UI and generation hook.** MSEL editor row drawer (`routes/scenarios/`),
   rules after `msel_phase` in `src/main/generate/`, `prompts/msel_phase.md` `regulations` variable,
   `MselPhaseOutput.triggers`, the optional `compliance-map` job with `ComplianceMapOutput`.
7. **Coverage export and AAR input.** `src/main/export/coverage.ts`, `views.ts`, `run.ts`,
   `EXPORT_TARGETS` in `src/shared/ipc/export.ts`, the export screen checkboxes, the
   `compliance:coverage` hand-off to #419, and the guide `docs/guides/methodology.md` (compliance
   section).

## Implementation notes (first pull request)

Built: tasks 1 to 5 and 7 except where listed below, with the deviations below. The rest is
follow-up work tracked in its own issue.

Differences from the design above, and why:

- `MselRow.triggers`, `controls` and `controlSuggestions` are **optional** (absent = none) rather
  than `.default([])`: a defaulted field becomes required in the output type, which would change
  every place that builds a row in code, and an absent field reads the same.
- `FacilitatorState.compliance` is **optional** too (one optional top-level key per feature, as
  §1 says). A fired trigger stores `exerciseMin` (the clocks count from it, so a time jump or a
  later start-date change moves them correctly) and `scenarioAt` as a floating local date-time
  `YYYY-MM-DDTHH:MM` (`LocalDateTime`), not an `IsoDateTime` with an offset: scenario time has no
  time zone (§3). Completions store `exerciseMin` and `scenarioAt` the same way.
- A filing recorded after the deadline shows as **missed** (filed late).
- A clock that is due at the earliest of several terms uses the terms whose start is known; it
  waits only when none is known. The DORA initial notification therefore runs from awareness
  (24 h) and can only move earlier when the incident is classified as major (4 h).
- `Framework.shortLabel` (≤ 31 characters) names the framework's sheet in the workbook, since
  Excel sheet names are limited to 31 characters.
- Settings › Compliance lives in **Project settings** on the project Overview
  (`routes/project-home/ComplianceSettings.tsx`), because `routes/settings/` is the app-wide
  settings page and the switches are per project.
- Layer precedence is project copy > installed pack > bundled pack (there is no user layer for
  this data). Only items from an **installed** pack are copied into the project when switched
  on; bundled items are read from the app, so a corrected deadline in a release reaches every
  project (the rule bundled templates follow, ADR-0040).
- The coverage matrix lists **every leaf control** of each enabled framework (so gaps are
  visible), with "Accepted" or "Suggested" for its mapping. Mapping rules run when the coverage
  is built rather than being stored on the rows. `coverage_csv` writes two files, the matrix and
  the clocks. The Markdown export gains the "Compliance coverage" section; the Word documents do
  not yet.
- The MSEL editor gets **Row actions → Starts reporting clocks…** (a dialog), and the Facilitate
  timeline marks such rows "Starts a reporting clock". `ScenarioBrief.startDate` is set in the
  brief form of a new scenario.

Not built yet (follow-up issue):

- `compliance:suggest-rules` and the stored `controlSuggestions` after each `msel_phase` step,
  the MSEL editor's "Controls" chips (accept / remove / add), the `regulations` prompt variable
  and `MselPhaseOutput.triggers`, and the optional model-assisted mapping (`compliance:suggest-model`,
  `ComplianceMapOutput`, FR-12).
- Session log entries (`compliance.trigger`, `compliance.clock`) wait for the session log (#417);
  the AAR clock inputs (FR-15) are in since #498 as `clk:K<n>` evidence (started clocks with their result; the control coverage summary is not sent yet). `compliance:coverage` already returns the `K<n>` cite keys
  for clocks.
- Firing a trigger from a live-play message (FR-6c) waits for #418; the state is ready for it
  (`by: 'live'`).
- The coverage preview tab on the scenario page.

Follow-up (#499):

- **Controls chips (FR-11).** Row actions, **Controls...** opens a dialog: accepted controls (solid chips, remove), suggestions (dashed chips, accept or dismiss), and a searchable picker over the enabled frameworks. Suggestions come from the rules until the row's suggestions have been saved once; saving stores the remaining ones as `controlSuggestions`, so a dismissed suggestion stays dismissed in the editor. The coverage matrix still runs the rules itself, so a dismissed rule suggestion still counts as "Suggested" there.
- **Generation hook.** After each `msel_phase` step the rules of the enabled frameworks store `controlSuggestions` (`by: 'rule'`) on the phase's rows; model suggestions already on a row are kept. There is no `compliance:suggest-rules` channel: the editor runs the same rules from the frameworks `compliance:list` returns. The `regulations` prompt variable and `MselPhaseOutput.triggers` are built (next item).
- **Model-assisted mapping (FR-12).** Off unless the project switches on **Settings, Compliance, Let the model suggest controls** (`ProjectCompliance.modelMapping`, default false). Then the Controls dialog shows **Suggest controls with <provider>**, and says whether the provider is local. `compliance:suggest-model` runs stage `compliance_map` (prompt `prompts/compliance_map.md`, task `critique`, schema `ComplianceMapOutput`) for one row or all rows (25 per call, at most 150), drops references that are not controls of an enabled framework, and returns suggestions that the editor shows as dashed chips. Nothing is stored or accepted by the job.
- **Triggers in generation (#499).** `msel_phase` (prompt version 10) gets the `regulations` variable, one line per trigger of the enabled regulations (at most 24), and `MselRowOutput.triggers`. The mapper keeps a reference only if it names a listed trigger, at most two per row, and only when the row's event or expected action contains a word that starts like a word of the trigger's label (\"ransom\", \"material\") and the row is not a STARTEX, TIME_JUMP or ENDEX row. This check exists because the local model (qwen3-30b-a3b) attached triggers to the ENDEX row and to unrelated log and e-mail rows in a first run; with the check a recovery phase got none, which is the right answer for that phase. Each kept trigger adds a `TRIGGER_PROPOSED` info note so the designer confirms it under Row actions, Starts reporting clocks. `LIVE=1 pnpm test src/main/generate/triggers.live.test.ts` runs the check against LM Studio.
- **Word.** The classroom handbook DOCX ends with the Compliance coverage section, and the HSEEP Controller/Evaluator Handbook (PDF and DOCX) has **Appendix F: Compliance Coverage**, both only when a framework or regulation is switched on.

## Open questions

1. **CIRCIA while the rule is not final.** Ship it on by default for critical-infrastructure
   domains, or off? _Recommendation:_ on for the domains that list it, labeled "proposed rule".
   Exercising the expected 72 h/24 h clocks is the point of the feature, and the label avoids
   overstating it. Update the record when the final rule publishes (a pack update, no app
   release).
2. **State breach-notification laws.** _Recommendation:_ do not bundle them in 0.7.0. There are
   more than 50 laws with frequent amendments. Document the format and invite community packs
   (#441). Bundle none until someone can keep them current.
3. **Non-US business-day calendars** (EU member states, UK). _Recommendation:_ add a `holidays`
   array (ISO dates) to `Regulation` in a later format bump. For 0.7.0, EU regulations use
   hours and calendar months only, which is how NIS2 and DORA state them.
4. **ISO 27001 / SOC 2 / PCI DSS mapping.** These catalogs are copyrighted. _Recommendation:_
   support them only as user or pack data the user supplies (ids and the user's own titles),
   never bundled.
5. **Clocks on players' devices** (live play). _Recommendation:_ yes, read-only, behind the same
   "Show on screen" switch, sent as part of `clock.state` so devices need no extra message
   type.
