# 05 — Data Model

Zod schemas in `src/shared/schemas/` are canonical; this is the human-readable sketch. All IDs are ULIDs unless noted. Times inside a scenario are exercise-clock strings `"H:MM"` plus an optional wall-clock `"09:15"` for narrative.

```ts
// project.json
Project {
  id, name, orgName,
  orgType: 'airport'|'transit'|'water_dam'|'water_utility'|'energy_utility'|'healthcare'|'campus'
         |'stadium_venue'|'port_maritime'|'municipal'|'industrial'|'unmanned_systems'|'k12_schools'
         |'commercial_facilities'|'food_agriculture'|'telecom'|'data_center_it'|'financial_services'
         |'generic'|string,
         // selects the domain profile (src/shared/domains, ADR-0014); 'hospital', 'utility' and other
         // aliases resolve to a profile; unknown values are the generic profile
  domainProfileOverrides?: Partial<DomainProfile>,   // per-project edits; a field replaces the built-in one
         // (factCategories is written whole by the facts editor, #180; project:update refuses unsafe
         // noun / genericNoun / context regexes and re-extracts facility facts when it changes)
  domainProfileSnapshot?: { profile: DomainProfile, packId, version, packName? },
         // a pack domain copied in when chosen (ADR-0018, #263); resolveProfile uses it before
         // the registry, then applies the overrides; refreshed only by "Update profile from pack"
  createdAt, updatedAt, appVersion,
  brand: { logoPath?, primaryColor?, city?, region?, aliases: Record<string,string> }, // e.g. airlineNames
  defaultRoles: Role[],
  providerRouting: Record<ProviderTask, ProviderRef>,   // 'ideate'|'draft'|'critique'|'embed'|'image'|'video'|'audio'
  promptOverrides: string[],                            // filenames in prompts/
  documents: DocumentMeta[],                            // denormalized index
  scenarios: ScenarioMeta[],
  privacy?: { review?, redact?, alwaysRedact?, neverRedact? } // overrides of AppSettings.privacy (#433)
}

// packs.json (ADR-0018): pack items this project copied into its own layer on first use
ProjectPacks { copies: [{ kind: 'templates'|'workflows'|'documents'|'domains'|'examples', id,
  packId, version, packName?, copiedAt, files: [{ path /* project-relative */, sha256 }] }] }
  // a file whose sha256 differs shows the copy as "edited"; updating a copy is explicit

DocumentMeta { id, title, filename, kind: 'plan'|'policy'|'map'|'form'|'course'|'prior_exercise'|'other',
  pages, ingestedAt, status: 'pending'|'parsing'|'embedding'|'ok'|'error', tags[], headingsPreview[] }
  // A busy status with no live ingest job (app exit mid-import) becomes 'error' with
  // "Import interrupted — retry" when the project opens or documents are listed (#309).

Role { id, name, abbreviation, team, description, standingOrders: string[] }   // "Ops Director (IC)" …

// .example.json (#169) — only in a project opened from an example (examples:open writes it):
ExampleMarker { slug, title, notice, domainProfile,
  packId?, packVersion?, packName? }   // the app shows `notice` as a banner; pack* set for a pack example (#266)
// examples/<slug>/example.json (shipped, read-only) — ExampleManifest in src/shared/ipc/examples.ts:
ExampleManifest { id, title, domainProfile, summary, fictional: true, notice,
  scenarios: [{ id, title, threatFamily, summary }] }   // examples/<slug>/project/ is the project

// facility-facts.md (#143) — Markdown, not JSON: the identifiers generation treats as real.
// Written after every ingest / re-index / document removal (and on first use) from
// documents/*/text.md. One "## <Label>" section per category with a
// "<!-- category: <id> -->" line, then one "- <entry>" bullet per identifier (gate ranges
// such as "A1–A8" allowed). Default categories: runways, taxiways, gates, concourses (airport)
// + locations, assets, hosts, networks, phones, agencies (all org types); a section the user
// adds becomes a category (shown to the model; linted once defined, below). The marker
// "<!-- ttx:facility-facts v1 auto-hash=<sha256 of the sections> -->" tells an unedited file
// from an edited one: an edited file is never overwritten — the new extraction goes to
// facility-facts.generated.md — and the generator reads facility-facts.md, so user edits
// (removals included) win. IPC: project:facility-facts (read: the markdown plus categories
// with the current extraction, per-entry sources and a lint flag, a revision hash and the
// history count), project:facility-facts-save ({ path, revision?, categories: [{ id, label,
// entries }] } — entries trimmed, blanks dropped, de-duplicated; a stale revision is CONFLICT;
// the marker keeps the extraction's hash, so saved facts read as edited unless they equal
// it), project:facility-facts-reset. Save and reset first copy the previous file to
// .cache/facility-facts-history/<timestamp>.md (last 20 kept). scenarios:lint includes
// FACILITY_UNKNOWN_ID against this file (#155).
// Category ids (#350): the id in "<!-- category: <id> -->" is the key a definition in
// domainProfileOverrides.factCategories is matched by, exactly. Profile ids use underscores
// ("pump_stations"); a section added in the editor (or a heading without an id line) gets a
// hyphenated slug of its label ("pump-stations"). FactCategory.id accepts both shapes
// (/^[a-z0-9][a-z0-9_-]{0,63}$/), so a user category is defined under its file id and no file
// or project.json is migrated or renamed. project:facility-facts marks such a category
// `definable` (no profile or built-in definition, valid id); the facts editor's
// "Define for lint" appends its definition to the override list, "Remove the lint
// definition" drops it. Ids with capitals (a hand-written id line) are not definable.

// scenarios/<id>/scenario.json
Scenario {
  id, projectId, title, subtitle?, version, status: 'draft'|'ready'|'archived',
  brief: { userPrompt, audience, durationHours, learningObjectives[], constraints[],
           threatFamily?: 'cyber'|'physical_security'|'cyber_physical'|'uas_drone'|'insider'
                         |'natural_hazard'|'infrastructure_failure'|'mass_gathering' },  // settled at creation (ADR-0014)
  overview: { theme, threat, operationalImpact, coreSectionsTested: Citation[] },
  objectives: Objective[],                 // { id, text, metricRef? }
  roles: Role[],
  phases: Phase[],
  msel: MselRow[],                          // ordered
  documents: { handbook: MdRef, briefing: MdRef, rubric: Rubric, hotwash: HotWash },
  evaluation: Evaluation,                   // #421: objectives → Core Capabilities, EEGs; empty before the eeg stage ran
  simcellScripts: SimcellScript[],
  conduct?: ConductDetails,                 // exercise details for the HSEEP documents (#420); read via conductOf()
  sitman?: SitMan,                          // Situation Manual modules (stage `sitman`, #420)
  provenance: StageRun[],                   // what provider/prompt produced each part
  grounding?: ScenarioGrounding             // source-check labels per item (#423)
  seams: ScenarioSeam[]                     // plan seams tested (#427); [] when none
}

// Plan seams (#427): brief.seamIds (max 3, PlanFinding ids) are snapshotted into Scenario.seams
// when the phase plan runs: { id, slot, slotLabel, kind, confirmed, a, b?, values?, missingTarget?,
// phaseId? }. MselRow.seamId names the seam a row tests; a row an older build saved without it is
// re-linked when it cites both passages. ScenarioIdea.seamIds lists the seams an idea targets;
// HotWash questions built for a seam carry seamId and rowIds.

// Exercise evaluation (#421; src/shared/schemas/evaluation.ts, src/shared/core-capabilities.ts).
// The 32 FEMA Core Capabilities ship as static data (id, name, mission areas, definition).
Evaluation {
  objectiveCapabilities: { objectiveId, capability: CoreCapabilityId, why }[],
  eegs: Eeg[]
}
Eeg { capability: CoreCapabilityId, target /* HSEEP capability target */, objectiveRefs[], criticalTasks: CriticalTask[] }
CriticalTask {
  id,                                        // "T-03"; locked tasks keep their id across re-runs
  capability: CoreCapabilityId, task, citation: Citation,   // the plan section the task comes from (required)
  expectedBy?: roleId, timing?,              // "within 30 minutes", as the plan states it
  rowIds[], objectiveRefs[], locked          // rows where an evaluator should look for it
}
// The live evaluator form (#416) consumes { id, capability, task, citation, expectedBy? }; later
// specs add fields and never rename or remove those.
RowCriterion { id /* taskId or "<rowId>:expected" */, rowId, text, taskId?, capability?, citation? }
// derived by src/main/generate/eeg-criteria.ts (evaluation:criteria), never stored: a row's linked
// tasks, else its expected action as one criterion (control cards excepted)

// scenarios/<id>/evaluation.json — observations recorded outside live play (Facilitate screen,
// paper EEGs typed up). Live-play observations (#416) arrive in the session log; #419 reads both.
EvaluationRecord { formatVersion: 1, observations: Observation[], updatedAt }   // loose (ADR-0016)
Observation {
  id, at, exerciseTime?, rowId?, taskId?, criterionId?,
  rating: 'met'|'partial'|'not_met'|'not_observed',    // HSEEP's four values; counts, never a score
  note, evaluator? /* free label, "Evaluator 2"; never a person's name by default */,
  source: 'facilitate'|'paper'|'live'
}

Phase { id, index, title, goal, startTime, endTime }

ConductDetails {                             // never generated, never sent to a provider (#420)
  exerciseName, exerciseType: 'tabletop', dates: ISODate[], startTime?, endTime?, sponsor,
  participatingOrganizations[], director: { name?, organization?, phone?, email? },
  site, room, observersAllowed, marking,     // default "EXERCISE — FOR TRAINING USE"
  communications: { channel, purpose, detail }[], safetyNotes, securityNotes,
  acronyms: { term, meaning }[]
}

SitMan {
  assumptions[], artificialities[],
  modules: { phaseId, narrativeMd, keyIssues[],
             discussionQuestions: { text, roleIds[], objectiveRef?, citations: Citation[] }[] }[]
}

MselRow {
  id,                                        // "I-07", "I-07b"
  phaseId, time, wallClock?, from, toRoleIds[], event, expectedAction,
  purposeTag: PurposeTag, injectId?,        // null for STARTEX/ENDEX/TIME_JUMP rows without a deck page
  locked: boolean
}
// Renaming a row id (inline edit or "Renumber IDs") also rewrites the matching
// Inject.mselRowId, so injects stay attached to their row; "Renumber IDs" also updates rubric links.

// scenarios/<id>/idea.json — the ScenarioIdea the scenario was developed from (absent otherwise)

// scenarios/<id>/facilitator.json — facilitator mode session state
FacilitatorState {
  elapsedMin, runningSince?,                 // exercise clock: minutes when last paused/started + wall-clock anchor
  delivered: Record<rowId, { at, exerciseTime }>,
  notes: Record<rowId, string>,              // per-inject hot wash notes
  generalNotes,
  hotwash: { id, kind: 'strength'|'improvement'|'other', text, objectiveRef?, rowId?, at }[],  // 3-Up / 3-Down items (#419)
  decisions: { id, at, exerciseTime?, rowId?, text, byRole? /* role id, never a name */ }[]      // decision log (#419)
}

// One generation job per scenario: while it runs, scenarios:save / scenarios:doc-save for that
// scenario return CONFLICT; editors keep unsaved edits and retry after job:done.

// scenarios/<id>/injects/<injectId>.json
Inject {
  id, mselRowId, type: InjectType, title,
  deliveryMode: 'hand_to_role'|'display_main_screen'|'play_audio'|'read_aloud',
  fields: Record<string, unknown>,          // validated by templates/injects/<type>/schema.json
  variant?: string,                         // template variant; the template's first when absent
  instructorNote?, citations: Citation[],
  assets: MediaAsset[],
  versions: { at, by: 'user'|'ai', snapshot }[],
  locked: boolean
}

MediaAsset {
  id, kind: 'image'|'video'|'audio'|'pdf', path, posterPath?, width?, height?, durationSec?,
  provenance: { provider, model?, workflowHash?, prompt?, seed?, templateVersion?, createdAt }
}

Citation { documentId, documentTitle, headingPath, page?, quote? }

Rubric { metrics: { id, name, points, fail, pass, excellence, linkedInjectIds[] }[] }
HotWash { method: '3up3down'|string, questions: { text, objectiveRef? }[] }
SimcellScript { rolePlayed, trigger, hardQuestions[], concessions[] }

StageRun { stage, startedAt, finishedAt, providerRef, promptRef, promptHash, inputTokens?, outputTokens?, costUsd?, status, error? }
```

## Live sessions (`scenarios/<id>/live/<sessionId>/`, #407, #417)

The folder name is the protocol's 128-bit `SessionId` (validated before it becomes a path segment). `session.json` is `LiveSession` (`src/shared/schemas/live.ts`): `id, scenarioId, name, startedAt, endedAt?, connection { kind: 'lan', address, tls, port? } | { kind: 'relay' } | { kind: 'self-hosted', url }, joinUrlPublic` (never the key fragment), `attribution: 'role' | 'named', protocolVersion, lastIndex`. `log.jsonl` is one `SessionLogEntry` per line in spec 0417's format (`i, at, ex?, kind, actor { kind, clientRef?, seat?, evaluator?, displayName? }, ref?, data, env? { from, seq, index? }`), append-only, at most 64 KiB per line. Messages are `message` (text, `blobIds`, `replyTo?`, `preExercise?`; the actor is the seat's `clientRef` and role, or the controller with its `persona`), `message.handled`, `message.star` (`on`) and `message.pinned` (who, text); attachments are saved under `live/<sessionId>/attachments/<blobId>.<ext>` and referenced by id. The writer refuses entries that carry `clientId`, `joinToken`, `resumeToken`, `key`, roots, private keys, invite URLs or addresses anywhere, strips `displayName` in a `role` session, and writes `env.from` as the salted `clientRef`, never the raw client id. Keys are never in this folder (they are in `userData/live/sessions/`). Inject delivery (#412) writes `inject.release { releaseId, mselRowId, injectId, targets, deliveryMode, blobIds, textSha256, expectsResponse }`, `inject.receipt { releaseId, status, deviceAt }` with the seat in `actor` (`delivered`, `read`, `actioned`) and `inject.retract { releaseId }`; a receipt from a seat the release was not for is an `anomaly`. #417 adds `attachments/`, `staged/`, `blobs.json` and the `summary` in `session.json`.

## Surveys (`scenarios/<id>/surveys/`, #422)

Schemas in `src/shared/schemas/survey.ts`. Each survey is `<surveyId>.json`; its responses are `<surveyId>.responses.jsonl`, one `SurveyResponse` per line, append-only (a line with an id already stored replaces the earlier one when read; a line cut short by a crash is skipped). Duplicating a scenario copies the definitions, never the responses. `scenario.json` exports carry the definitions only. Older builds ignore the folder.

```ts
Survey {                                   // loose: unknown keys survive a save
  formatVersion: 1, id, title,
  kind: 'participant_feedback'|'knowledge_check'|'confidence'|'facilitator_debrief'|'evaluator_debrief'|'custom',
  timing: 'pre'|'post'|'during'|'any', edition?: 'before'|'after', pairId?,   // before/after editions link to each other
  introMd, askRoleGroup: false, roleGroups: string[],                         // team names only, never single roles
  sections: { id, title, introMd, questions: SurveyQuestion[] }[],
  templateId?, templateVersion?, status: 'draft'|'ready'|'archived', createdAt, updatedAt
}
SurveyQuestion =                          // all: { id, text, help, required }
  | { type: 'rating', min: 1, max: 5, lowLabel, highLabel, pointLabels?: string[5] }
  | { type: 'choice', multiple, options: { id, text }[2..12], correctOptionId?, allowOther, citation? }
  | { type: 'text', long, maxLength }
  | { type: 'confidence', statement, pairKey, edition, objectiveRef?, capability?, citation? }
SurveyResponse {                           // strict: no name, device, address or user agent can be stored
  id, surveyId, deliveryId?, channel: 'live'|'qr'|'paper'|'manual',
  at /* rounded to the minute */, roleGroup?, answers: Record<questionId, 1..5 | optionId[] | string>,
  otherText: Record<questionId, string>
}
SurveySummary {                            // summarizeSurvey(), src/main/surveys/summarize.ts
  surveyId, title, kind, edition?, responses, byChannel, byRoleGroup, minResponses, suppressed,
  questions: { questionId, text, type, n, suppressed, mean?, median?, distribution?: number[5],
               choices?: { optionId, text, count, correct? }[], shareCorrect?, otherTexts?, texts?, citation? }[],
  pairs: { pairKey, statement, objectiveRef?, capability?, before?, after?, delta?, nBefore, nAfter }[],
  knowledge: { questionId, text, shareBefore?, shareAfter?, nBefore, nAfter, citation? }[]
}
```

Before/after editions keep the same questions: saving one copies its sections into the other. Templates ship in `surveys/templates/<templateId>.json` (app resources). `AppSettings.surveys.minResponses` (default 3) is the anonymity threshold: below it, results show counts only. The AAR draft (#419) reads `scenarioSurveySummaries()` from `src/main/surveys/results.ts` and cites survey evidence as `survey:<surveyId>:<questionId>`.

## Source check and plan conflicts (#423)

`Scenario.grounding.items` maps an item key (`row:I-07`, `inject:<id>`, `overview:<n>`) to a `GroundingResult` (`src/shared/schemas/grounding.ts`):

```
GroundingResult {
  label: grounded | review | unsupported | none,   // the automatic check
  reason,                                           // one plain sentence
  fingerprint,                                      // claim text + citations + cited text
  claims: [{ text, chunkId?, headingPath?, overlap, similarity?, matched[], missing[], conflicting[{ term, passage }] }],
  model?: { label, at, providerId, model, quotes[{ claim, quote }], discarded },
  override?: { label, note?, at },                  // the user's label, until the fingerprint changes
  at, version                                       // checker version; a bump recomputes
}
```

The label shown is `override ?? model ?? label`. Results are kept at scenario level, not on `MselRow` or `Inject`, so an older build that strips unknown row keys loses nothing. Idea labels are in `ideas.json` under `grounding` (keys `idea:<id>`).

`<project>/plan-conflicts.json` (`src/shared/schemas/plan-conflicts.ts`): `{ formatVersion: 1, checkedAt, documents[{ id, sha256 }], stats?{ candidates, sent, skipped }, findings: PlanFinding[] }`. A finding is a `contradiction` (slot, slot label, subject, passages `a` and `b` with document, heading path, page, chunk id and the statement's text, the two values, the model verdict and its quotes) or a `dangling_reference` (passage `a` and the missing target), with `status` open / dismissed / confirmed / outdated and an optional note. Its id is sha256 of the slot and both spans (16 hex), so a re-run keeps decisions for unchanged passages.
## After-Action Report / Improvement Plan (`scenarios/<id>/aar.json`, #419)

Schemas in `src/shared/schemas/aar.ts` (ADR-0035). `aar.json` is the structured report; `documents/aar.md` is rendered from it in the HSEEP 2020 layout with `<!-- section:name -->` markers (`overview`, `summary`, `ratings`, `findings`, `ip`, `participants`, `feedback`, `acronyms`). The structured editor re-renders the table sections on save and leaves the prose sections (`summary`, `findings`, `feedback`) as a person edited them. History: `history/aar-json.jsonl` for the data, `history/aar.jsonl` for the document.

```ts
Aar {                                       // loose (ADR-0016)
  formatVersion: 1, createdAt, updatedAt, exerciseDate?,
  executiveSummaryMd, participantFeedbackMd,
  sourcesUsed: ('facilitator'|'evaluation'|'live'|'surveys')[],   // what the record held when drafted
  liveSessionId?,
  capabilities: CapabilityAnalysis[],
  participatingOrganizations: string[],     // Appendix B; organizations only, seeded from conduct
  acronyms: { term, meaning }[],            // Appendix D, on top of the built-in HSEEP terms
  provenance: StageRun[]
}
CapabilityAnalysis {
  capability: CoreCapabilityId,
  rating?: 'P'|'S'|'M'|'U',                 // confirmed by a person; the only one that prints
  proposedRating?, ratingRationale,         // the model's proposal; absent without evidence
  observationCounts: { met, partial, not_met, not_observed },
  objectiveRefs[], strengths: Finding[], areasForImprovement: Finding[]
}
Finding { id, title, analysisMd, citations: Citation[], evidence: EvidenceRef[] /* ≥ 1 */,
  objectiveRefs[], recommendation, correctiveActions: CorrectiveAction[], locked }
CorrectiveAction { id, action, element: 'planning'|'organization'|'equipment'|'training'|'exercises',
  ownerRole? /* proposed */, ownerOrganization, poc, startDate?, dueDate? /* typed by a person */,
  status: 'open'|'in_progress'|'done', locked }
EvidenceRef = 'note:<rowId>' | 'note:general' | 'obs:<id>' | 'hw:<id>' | 'dec:<id>' | 'vote:<id>'
            | 'msg:<id>' | 'survey:<surveyId>[:<questionId>]' | 'log:<index>'

// The exercise record the draft is built from (never stored; aar:record returns it):
ExerciseRecord { sources: { facilitator, evaluation, live, surveys }, liveSessionId?, delivered[],
  notes[], hotwash[], decisions[], observations: Observation[], votes[], messages[], messageCounts[],
  surveys: SurveySummary[], warnings[] }   // every item carries its EvidenceRef; role labels, no names
```

Sources: `facilitator.json`, `evaluation.json`, `live/<sessionId>/log.jsonl` (spec 0417; read by `src/main/aar/sources/live-log.ts`, the most recent ended session unless one is chosen; `displayName` is never read) and the survey store. A missing source is a gap the report states, not an error.

## Exercise program (`<Name>.asprogram/`, #424, ADR-0043)

A folder the user chooses, outside every project, for corrective actions across exercises and
the multi-year IPP schedule. Schemas in `src/shared/schemas/program.ts`; every file is validated
on read (it may be on shared storage) and loose, so a newer build's keys survive a save.

```
<Name>.asprogram/
  program.json                      Program: id, name, orgName, cycle { startYear, years }, priorities[],
                                    projects[] { projectId, name, path (POSIX-relative to the folder's
                                    parent, else absolute), linkedAt }, nextActionNumber, lock
  schedule.json                     Schedule: exercises[] PlannedExercise (type, year+quarter or date,
                                    status, priorityIds, coreCapabilities, planSections,
                                    correctiveActionIds, projectId/scenarioId, completedAt)
  corrective-actions/<id>.json      ProgramAction: number ("CA-0007"), title, description,
                                    areaForImprovement, coreCapabilities, element, planSections,
                                    owner { name, organization, email }, dueDate, startDate, priority,
                                    status, history[], source { kind, project, scenario, aarItemId },
                                    verifications[]
  imports/<id>.json                 AarImport: one per import run; per item aarItemId, the action it
                                    became, a hash of the AAR text (idempotent re-import)
  projects/<projectId>.json         ProjectSnapshot: scenarios (status, exercisedAt, capabilities,
                                    plan sections, ratings, aarPresent) and the document inventory
  exports/                          default output folder, ignored by the folder's .gitignore
  .lock.json                        advisory presence: host, user, time (ignored after 24 hours)
```

Status lifecycle: `open → in_progress → completed → verified`, plus `deferred` and `cancelled`.
A note is required for `deferred` and `cancelled`; `verified` requires a verification
(`drill`, `exercise` or `review`). Status, history and verifications change only through
`program:action-status`. A save carries the revision (sha256 of the file's text) it was edited
from; a stale one fails with `CONFLICT` and `details.theirs`. `project.json` gains an optional
`program: { id, path }` and `ScenarioBrief` an optional `programProposal`; the AAR
`CorrectiveAction` gains `programActionId`. `settings.json` gains `program: { activePath, recent }`.

## Cloud privacy (#433, ADR-0031)

```ts
// AppSettings.privacy (global defaults) and Project.privacy (per-field overrides)
PrivacySettings {
  review: 'new-excerpts' | 'new-content' | 'every-request' | 'per-job' | 'off', // default 'new-excerpts'
  redact: Partial<Record<'person'|'phone'|'email'|'address', boolean>>, // a missing category is on
  alwaysRedact: string[], neverRedact: string[]                    // terms, 2-200 chars, max 500
}

// <project>/cloud-sends.jsonl — one line per cloud request; never text, values or placeholders
CloudSendEntry { at, providerId, providerLabel, host, model, kind: 'chat'|'embed'|'media', task,
  stage?, itemId?, jobId?, excerpts: { documentId, headingPath }[],
  chars: Record<partName, number>, redactions: Partial<Record<category, number>>,
  approval: 'asked'|'job-approval'|'document-approval'|'policy-off', requestHash /* sha256 */ }

// Job.awaiting?: { kind: 'cloud-approval', requestId } while a job waits for the user;
// the status stays 'running'. Dropped when an interrupted job is restored.
```

The approval dialog receives an `OutboundManifest` (`src/shared/schemas/privacy.ts`) over local IPC only: the request as it will be sent, plus the original value of each redacted span. The placeholder mapping itself stays in main-process memory.

## SQLite (index.sqlite, rebuildable)

```sql
documents(id TEXT PK, title, kind, path, pages, ingested_at)
chunks(id INTEGER PK, doc_id, heading_path, page, ord, text, token_count)
chunks_fts USING fts5(text, heading_path, content='chunks', content_rowid='id')
chunk_vec USING vec0(chunk_id INTEGER PK, embedding float[384])
jobs(id TEXT PK, kind, status, progress REAL, payload JSON, result JSON, error, created_at, updated_at)
provider_calls(id, scenario_id, stage, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, at)
```

## Prompt file format (`prompts/*.md`)

```markdown
---
name: msel_phase
stage: msel_phase
version: 3
outputSchema: MselPhaseOutput
retrieval:
  queries: ["manual procedures when {{systems}} fail", "notification requirements for {{threatType}}", "authority to shut down {{systems}}"]
  k: 12
variables: [project, scenario, phase, roles, taxonomy, retrieved]
---
You are an exercise designer following HSEEP...
{{#each retrieved}}[{{documentTitle}} › {{headingPath}} p.{{page}}] {{text}}{{/each}}
...
```

## Export manifest (`scenario.md` header)

Front matter with scenario id, version, generated-at, provider summary, and a checksum list for all media so a distribution ZIP can be verified.

## App-level files (`<userData>/`, never in a project)

| File | Contents |
|---|---|
| `settings.json` | `AppSettings`: recent projects, provider configs (no keys), default routing, embedding mode, UI theme, pack catalog URLs (`packs.catalogs`) |
| `secrets.json` | `{ [providerId]: base64(safeStorage.encryptString(apiKey)) }` — ciphertext only, mode 0600. Also `redaction:<key>` entries: each project's 32-byte redaction key, filed under a hash of the project id and folder path (#433) |
| `cloud-sends.jsonl` | Send log for cloud requests made outside a project (#433); same lines as the project file |
| `redaction/<key>.bin` | Values each project has redacted (#433), AES-256-GCM with a key derived from the project's redaction key; `<key>` hashes the project id and folder path |
| `prompts/<name>.md` | Global prompt overrides (project overrides live in `<project>/prompts/`) |
| `models/` | Downloaded local embedding models (only via the explicit download action) |
| `provider-calls.jsonl` | One line per model call: provider, model, tokens, cost, duration — no prompt text, no keys |
| `jobs.json` | Persisted job records so interrupted generation shows as resumable |
| `packs/<id>/<version>/` | Installed packs, verified against their `pack.json` hashes, read-only (ADR-0018) |
| `packs/registry.json` | `PackRegistry`: installed packs with version, enabled, source (file / url / catalog), archive and content sha256, item list (see docs/packs-format.md "Installed packs") |
| `packs/.staging/` | Downloads and extractions in progress; emptied at every startup |
| `templates/injects/<type>/` | User inject templates, the layer between project and pack templates (ADR-0018) |
| `live/sessions/<sessionId>.json` | A running live session's secrets (ADR-0027; written by #407–#410): staff root per epoch, controller signing and ECDH keys as JWK, last `seq`; `safeStorage` ciphertext only, deleted at `session.end`. Never in a project folder |
| `live/lan.log` (+ `.1`–`.3`) | The LAN session server's connection log (#407, ADR-0032): time, event, remote address, client id, close code; fixed fields, never a frame, a query string or a key. Rotated at 5 MB × 3 |
