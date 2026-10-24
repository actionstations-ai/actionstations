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
  domainProfileSnapshot?: { profile: DomainProfile, packId, version, packName? },
         // a pack domain copied in when chosen (ADR-0018, #263); resolveProfile uses it before
         // the registry, then applies the overrides; refreshed only by "Update profile from pack"
  createdAt, updatedAt, appVersion,
  brand: { logoPath?, primaryColor?, city?, region?, aliases: Record<string,string> }, // e.g. airlineNames
  defaultRoles: Role[],
  providerRouting: Record<ProviderTask, ProviderRef>,   // 'ideate'|'draft'|'critique'|'embed'|'image'|'video'|'audio'
  promptOverrides: string[],                            // filenames in prompts/
  documents: DocumentMeta[],                            // denormalized index
  scenarios: ScenarioMeta[]
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
// adds becomes a category (shown to the model, not linted). The marker
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
| `secrets.json` | `{ [providerId]: base64(safeStorage.encryptString(apiKey)) }` — ciphertext only, mode 0600 |
| `prompts/<name>.md` | Global prompt overrides (project overrides live in `<project>/prompts/`) |
| `models/` | Downloaded local embedding models (only via the explicit download action) |
| `provider-calls.jsonl` | One line per model call: provider, model, tokens, cost, duration — no prompt text, no keys |
| `jobs.json` | Persisted job records so interrupted generation shows as resumable |
| `packs/<id>/<version>/` | Installed packs, verified against their `pack.json` hashes, read-only (ADR-0018) |
| `packs/registry.json` | `PackRegistry`: installed packs with version, enabled, source (file / url / catalog), archive and content sha256, item list (see docs/packs-format.md "Installed packs") |
| `packs/.staging/` | Downloads and extractions in progress; emptied at every startup |
| `templates/injects/<type>/` | User inject templates, the layer between project and pack templates (ADR-0018) |
