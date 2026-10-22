# 05 — Data Model

Zod schemas in `src/shared/schemas/` are canonical; this is the human-readable sketch. All IDs are ULIDs unless noted. Times inside a scenario are exercise-clock strings `"H:MM"` plus an optional wall-clock `"09:15"` for narrative.

```ts
// project.json
Project {
  id, name, orgName, orgType: 'airport'|'hospital'|'utility'|'campus'|'generic'|string,
  createdAt, updatedAt, appVersion,
  brand: { logoPath?, primaryColor?, city?, region?, aliases: Record<string,string> }, // e.g. airlineNames
  defaultRoles: Role[],
  providerRouting: Record<ProviderTask, ProviderRef>,   // 'ideate'|'draft'|'critique'|'embed'|'image'|'video'|'audio'
  promptOverrides: string[],                            // filenames in prompts/
  documents: DocumentMeta[],                            // denormalized index
  scenarios: ScenarioMeta[]
}

DocumentMeta { id, title, filename, kind: 'plan'|'policy'|'map'|'form'|'course'|'prior_exercise'|'other',
  pages, ingestedAt, status: 'pending'|'ok'|'error', tags[], headingsPreview[] }

Role { id, name, abbreviation, team, description, standingOrders: string[] }   // "Ops Director (IC)" …

// scenarios/<id>/scenario.json
Scenario {
  id, projectId, title, subtitle?, version, status: 'draft'|'ready'|'archived',
  brief: { userPrompt, audience, durationHours, learningObjectives[], constraints[] },
  overview: { theme, threat, operationalImpact, coreSectionsTested: Citation[] },
  objectives: Objective[],                 // { id, text, metricRef? }
  roles: Role[],
  phases: Phase[],
  msel: MselRow[],                          // ordered
  documents: { handbook: MdRef, briefing: MdRef, rubric: Rubric, hotwash: HotWash },
  simcellScripts: SimcellScript[],
  provenance: StageRun[]                    // what provider/prompt produced each part
}

Phase { id, index, title, goal, startTime, endTime }

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
  generalNotes
}

// One generation job per scenario: while it runs, scenarios:save / scenarios:doc-save for that
// scenario return CONFLICT; editors keep unsaved edits and retry after job:done.

// scenarios/<id>/injects/<injectId>.json
Inject {
  id, mselRowId, type: InjectType, title,
  deliveryMode: 'hand_to_role'|'display_main_screen'|'play_audio'|'read_aloud',
  fields: Record<string, unknown>,          // validated by templates/injects/<type>/schema.json
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
| `settings.json` | `AppSettings`: recent projects, provider configs (no keys), default routing, embedding mode, UI theme |
| `secrets.json` | `{ [providerId]: base64(safeStorage.encryptString(apiKey)) }` — ciphertext only, mode 0600 |
| `prompts/<name>.md` | Global prompt overrides (project overrides live in `<project>/prompts/`) |
| `models/` | Downloaded local embedding models (only via the explicit download action) |
| `provider-calls.jsonl` | One line per model call: provider, model, tokens, cost, duration — no prompt text, no keys |
| `jobs.json` | Persisted job records so interrupted generation shows as resumable |
