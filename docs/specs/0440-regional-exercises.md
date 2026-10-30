# Spec 0440: Regional exercises across organizations

Issue: #440 · Milestone: 0.9.0 · Status: Implemented (core) · Depends on: #406 (session protocol), #408 / #409 / #410 (connections), #413 (messages), #417 (session log) · Related: ADR-0018 (packs), `docs/packs-format.md`, #429 (SimCell assistant)

## Summary

Several organizations (for example an airport, the city around it and a hospital) plan one exercise together while each keeps its plans on its own computer. They exchange only exercise material: a shared frame (scenario, timeline, cross-organization roles) and each organization's slice of the MSEL with its injects and media, in signed exercise bundles. A lead organization merges the slices, everyone reviews the merged exercise, and all of them run it in one live session with each organization's controllers releasing their own injects.

## Requirements

### User stories

- As the lead planner at a city emergency management office, I want to set up a regional exercise and invite the airport and the hospital, so that we write one MSEL without sending each other our emergency plans.
- As the airport's planner, I want to generate my part of the MSEL from my own plans on my own computer and send only the rows and injects, so that our security-sensitive plans never leave the airport.
- As a planner, I want to see who wrote each row, to be unable to change rows I do not own, and to propose changes to them instead.
- As the lead planner, I want to see what changed in each slice since the last round and which rows conflict before I merge.
- As each organization's controller, I want to release my organization's injects to my players during the joint session and see the exercise-wide timeline.
- As a security officer, I want to verify who produced a bundle and that it was not altered, and to know exactly what my organization sends to the others.

### Functional requirements

**Setup**

- **FR-1** The lead organization (the **host**) turns a scenario into a regional exercise: it names the exercise, lists the participating organizations (name, short prefix such as `AIR`, `CITY`, `HOSP`) and exports a **frame bundle**.
- **FR-2** Each organization has a signing key pair created on first use (Ed25519). The public key and its fingerprint (shown as 8 groups of 4 hex characters) go into every bundle the organization exports. The private key never leaves the computer.
- **FR-3** A participant opens the frame bundle (File → Open, drag and drop, or opening an `.asexercise` file from Finder / Explorer; opening never applies anything). The review screen shows the host, its fingerprint, the participating organizations and what the frame contains. **Join** creates a new scenario in a project the participant picks (usually its own project with its own documents).
- **FR-4** On first import from an organization the app asks the user to compare the fingerprint with one received through another channel (phone, email, meeting) and pins the key on confirmation. A later bundle from the same organization signed by a different key is refused with a clear warning; the user can replace the pinned key only by an explicit "Key changed — I verified the new fingerprint" step.

**Frame and slices**

- **FR-5** The **frame** holds what everyone shares: title, overview (theme, threat, operational impact without plan citations), exercise-wide objectives plus objectives per organization, phases and times, the cross-organization role list (each role owned by one organization), shared rows (STARTEX, ENDEX, time jumps, phase changes) and the inject ids reserved for each organization. Only the host edits the frame.
- **FR-6** A **slice** is one organization's MSEL rows, their injects (fields, variant, rendered media, instructor notes), the roles it plays, and its proposals (FR-11). Each organization generates and edits its slice in its own app against its own documents, using the normal generation pipeline (`msel_phase`, `inject_text`, `inject_media_brief`, `media_render`) restricted to its own rows and roles.
- **FR-7** Row and inject ids are namespaced by the owner's prefix (`AIR-I-07`, `CITY-I-03`). Renumbering keeps the prefix (`src/main/scenario/inject-links.ts`).
- **FR-8** Each row and inject records its owner organization and a revision number that the owner increments on every change.

**What leaves an organization**

- **FR-9** A slice bundle contains only exercise material. The writer uses an allow-list of fields and files and refuses everything else: no `documents/`, no `index.sqlite`, no `facility-facts.md`, no prompts or prompt overrides, no provider settings, no `idea.json`, no history, no facilitator state, no secrets.
- **FR-10** Citations in shared rows and injects are reduced to document title and heading path by default; quotes and page numbers are included only when the owner turns on "Share plan quotes with partners" for the exercise. Instructor notes and expected actions are included, because the other controllers need them to run the exercise; the export review lists every field that cites the owner's plans so the owner can edit it before export.
- **FR-11** A row can be marked **private to my controllers**. Its content stays out of the bundle; partners receive a placeholder with time, owner, target roles and a one-line public description ("AIR internal escalation inject") so the shared timeline still makes sense. The owner's app holds the content and releases it in the live session.
- **FR-12** Before export, a review screen shows the files, the fields per row, the private rows and the placeholders, and the size. The export fails if the allow-list check (FR-9) finds anything else.

**Proposals, merge and conflicts**

- **FR-13** A planner cannot edit rows owned by another organization; the MSEL editor shows them read-only with an owner badge. **Propose change** records a proposal (row id, field, suggested value, reason) that travels in the proposer's next slice. The owner sees incoming proposals and accepts (applying the change to its own row) or declines with a note.
- **FR-14** The host imports slices. For each organization the merge review shows rows added, changed (field-level diff), removed, and private placeholders, against the last merged version.
- **FR-15** Conflicts the merge detects:
  - **Ownership:** a slice contains a row or inject owned by another organization or not reserved for it → that item is rejected.
  - **Stale frame:** the slice was built on an older frame version → shown as a warning with the frame changes since; the host can merge or ask the participant to update.
  - **Timing:** two rows target the same role (or a role of another organization) at the same exercise time, or a row lies outside its phase → warning.
  - **Dependency:** a row refers to another organization's row (by id in its event or expected action text, or a `dependsOn` link) that was removed or moved after it → warning.
  - **Duplicate id or revision regression:** a row with a lower revision than the merged one → rejected.
- **FR-16** Merging writes a new merged version (frame version + each slice's revision), and the host exports a **merged bundle** that every participant imports to see the full exercise (with private placeholders). Each import shows what changed since the last merged version.
- **FR-17** Rounds repeat until the host marks the exercise **Final**. A Final merged bundle is what all parties run.

**One live session**

- **FR-18** The host starts the live session through the connection chosen for the exercise (#410; usually the Action Stations relay or an organization's own server, since participants are in different places). The host's app is the session authority (#406).
- **FR-19** Each participating organization joins as a **co-controller** from its own desktop app. The host adds each organization's pinned public key to the session's signed controller roster. Players' clients accept a controller message when it is signed by a roster key and its scope is that organization's rows and roles (inject release, SimCell replies, votes the frame assigns to it). The host can still pause the clock and end the session for everyone.
- **FR-20** Each co-controller releases its own injects, including private rows, from its own app; the media comes from its local copy. Exercise-wide events (STARTEX, phase changes, time jumps, ENDEX) come from the host.
- **FR-21** Players of each organization join with that organization's invite link and see only their roles' inboxes and feeds (#411, #412). Messages between roles of different organizations go through the live messaging channels (#413); the frame lists which cross-organization channels exist.
- **FR-22** The host's session log records everything. At session end the host exports one **log slice per organization**: events for that organization's roles and rows, exercise-wide events, and messages in channels that organization took part in. The full log is shared only if all organizations agree (a per-exercise setting in the frame, default off).
- **FR-23** Each organization drafts its own AAR/IP from its log slice on its own computer.

**Fictional names**

- **FR-24** Example exercises, test fixtures and documentation use fictional organizations and people (repository naming rule); real cities, geography and public agencies are allowed. The app does not add or rename real organizations in a user's own exercise.

### Non-functional requirements

- **NFR-1** Cost: no server or service is needed to plan; bundles travel by whatever the organizations already use (email, shared drive, USB). The live session uses the free connections from #408 / #409 (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: plans, indexes and facility facts never leave the organization's computer; bundles carry only the allow-listed exercise material; the live session is end-to-end encrypted (#406). No network call is made for planning (Project rules 3).
- **NFR-3** Accessibility: WCAG 2.2 AA. Owner is shown as a text badge, not color alone; the diff view is a table with "added / changed / removed" words; fingerprint comparison is readable by screen readers in groups.
- **NFR-4** Limits: a bundle is at most 500 MB and 5,000 files, using the archive reader's limits and single-reading rules from `docs/packs-format.md`; up to 8 organizations per exercise; merge of 8 slices with 300 rows completes in under 5 s.
- **NFR-5** Offline: planning works entirely offline; only the live session needs a connection all parties can reach.
- **NFR-6** Platforms: macOS, Windows, Linux; bundles made on one platform open on the others.

### Out of scope

- Real-time co-editing of the MSEL.
- A central server that stores exercises.
- Sharing plan documents or retrieval results between organizations.
- Certificates or a public key infrastructure; trust is per-exercise key pinning with out-of-band fingerprint checks.

## Design

### Why a separate bundle format, not a pack

Packs (ADR-0018) install reusable content (templates, prompts, domains, documents, examples) into the app registry and are integrity-checked by hashes only: "Nothing is signed. A hash proves the bytes are the ones the catalog … described, not who made them." Exercise bundles belong to one scenario, are exchanged in rounds, and must prove who made them. This spec adds a sibling format, **`.asexercise`**, that reuses the pack archive rules and reader (`src/main/packs/zip.ts` single-reading checks, limits, path rules, deterministic writing with `zipTree` from `src/main/packs/archive.ts`) and adds a signature. It is never installed into `userData/packs/`. An ADR records this.

### Bundle layout

```
bundle.json                    manifest (below)
signature.json                 { alg: 'ed25519', publicKey (base64 SPKI DER), signature (base64) }
frame.json                     kind 'frame' and 'merged' only
slices/<ORG>.json              one per organization in 'slice' (one) and 'merged' (all)
media/<ORG>/<injectId>/<assetId>.<png|mp4|wav|mp3|pdf>
```

`bundle.json`:

```ts
export const ExerciseBundleManifest = z.object({
  format: z.literal('actionstations-exercise'),
  formatVersion: z.literal(1),
  kind: z.enum(['frame', 'slice', 'merged']),
  exerciseId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/), // ULID
  title: z.string().max(200),
  from: z.object({
    orgId: OrgId,
    name: z.string().max(120),
    prefix: OrgPrefix,
    fingerprint: z.string(),
  }),
  frameVersion: z.number().int().min(1),
  sliceRevisions: z.record(OrgId, z.number().int()).default({}),
  final: z.boolean().default(false),
  createdAt: z.string(),
  minAppVersion: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: Sha256, size: z.number().int() })),
})
```

The signature covers the canonical JSON of `bundle.json` (keys sorted, no whitespace; `src/main/regional/canonical.ts`), which in turn lists the sha256 of every other file. Verification order: archive rules → manifest schema → signature against the key in `signature.json` → that key equals the pinned key for `from.orgId` (or first-use pinning, FR-4) → every file's size and sha256 → per-file schema checks.

### Data model

New `src/shared/schemas/regional.ts`:

```ts
export const OrgId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/)
export const OrgPrefix = z.string().regex(/^[A-Z]{2,6}$/)

export const RegionalOrg = z.object({
  orgId: OrgId,
  name: z.string().max(120),
  prefix: OrgPrefix,
  fingerprint: z.string().optional(),
  publicKey: z.string().optional(),
  pinnedAt: z.string().optional(),
})

export const Proposal = z.object({
  id: SafeId,
  rowId: z.string(),
  field: z.string(),
  suggested: z.unknown(),
  reason: z.string().max(500),
  fromOrg: OrgId,
  status: z.enum(['open', 'accepted', 'declined']),
  note: z.string().optional(),
})

export const RegionalState = z.object({
  // scenarios/<id>/regional.json
  exerciseId: z.string(),
  role: z.enum(['host', 'participant']),
  thisOrg: OrgId,
  orgs: z.array(RegionalOrg).min(2).max(8),
  frameVersion: z.number().int(),
  final: z.boolean().default(false),
  received: z
    .record(OrgId, z.object({ revision: z.number().int(), sha256: Sha256, receivedAt: z.string() }))
    .default({}),
  merged: z.object({ version: z.string(), at: z.string() }).optional(),
  shareQuotes: z.boolean().default(false),
  shareFullLog: z.boolean().default(false),
  crossOrgChannels: z
    .array(z.object({ id: SafeId, label: z.string(), roleIds: z.array(z.string()) }))
    .default([]),
  proposals: z.array(Proposal).default([]),
})
```

Additions to existing schemas in `src/shared/schemas/scenario.ts` and `inject.ts` (all optional, so single-organization scenarios are unchanged):

- `MselRow.owner?: OrgId`, `MselRow.revision?: number`, `MselRow.visibility?: 'exercise' | 'owner_controllers'`, `MselRow.publicSummary?: string` (for placeholders), `MselRow.dependsOn?: string[]`.
- `Role.owner?: OrgId`.
- `Inject.owner?: OrgId`, `Inject.revision?: number`.
- `Scenario.regional?: { exerciseId: string }` pointing at `regional.json`.

Placeholders from other organizations' private rows are `MselRow` entries with `visibility: 'owner_controllers'`, no `injectId`, and `publicSummary` as the event text; they are read-only.

Keys: `userData/secrets.json` gains entries `org-key-<orgId>` holding the safeStorage-encrypted PKCS#8 private key, through `setSecret`/`getSecret` in `src/main/secrets/` (key generation refused when encryption is unavailable, like API keys). The public key and fingerprint are kept in `settings.json` under `regional.orgs[<orgId>]` (not secret). One organization identity per app install by default, chosen at first use (name, prefix); more can be added for consultants who plan for several organizations.

### Main process

New `src/main/regional/`:

| File           | Role                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys.ts`      | Ed25519 key generation (`crypto.generateKeyPairSync('ed25519')`), sign, verify, fingerprint (sha256 of SPKI DER, first 16 bytes in 8 groups)                               |
| `canonical.ts` | canonical JSON for signing                                                                                                                                                 |
| `pinning.ts`   | pinned keys per exercise in `regional.json`; first-use and key-change flows                                                                                                |
| `write.ts`     | builds frame, slice and merged bundles from the scenario with the field allow-list, citation reduction (FR-10), private placeholders (FR-11), deterministic zip, signature |
| `allowlist.ts` | the allow-list and `assertShareable(entries)`, which throws on any path or field not allowed (same idea as `assertPlayersOnly` in `src/main/export/zip.ts`)                |
| `read.ts`      | verification order above, using the pack archive reader's zip checks and limits                                                                                            |
| `merge.ts`     | pure merge: ownership, stale frame, timing, dependency and revision checks; returns a diff and conflict list                                                               |
| `apply.ts`     | writes the merged result into the scenario through `src/main/scenario/store.ts` (respects the one-job-per-scenario lock)                                                   |
| `proposals.ts` | create, carry, accept, decline                                                                                                                                             |
| `session.ts`   | builds the session's controller roster (host plus pinned org keys with scopes) and the per-organization log slices at session end (with #417's log format)                 |

Generation restriction (FR-6): `src/main/generate/engine.ts` accepts an `ownerFilter` so `msel_phase` and later stages only create and change rows and roles owned by `thisOrg`; rows of other organizations are passed to the prompt as read-only context (time, owner, target roles, event text; never their instructor notes when they came from a private placeholder).

### IPC

`src/shared/ipc/regional.ts`, handlers `src/main/ipc/handlers/regional.ts`. `S = { projectPath, scenarioId }`.

| Channel                                          | Request                                   | Response                                                                  |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| `regional:identity` / `regional:identity-create` | `void` / `{ name, prefix }`               | `{ orgId, name, prefix, fingerprint }`                                    |
| `regional:create`                                | `S & { title, orgs: { name, prefix }[] }` | `RegionalState` (host)                                                    |
| `regional:state`                                 | `S`                                       | `RegionalState`                                                           |
| `regional:export-review`                         | `S & { kind }`                            | the files, fields citing plans, private rows, size (FR-12)                |
| `regional:export`                                | `S & { kind }`                            | `{ path, sha256 }` (save dialog in main)                                  |
| `regional:inspect`                               | `{ path }`                                | verified manifest, signer, pin status, contents summary (no changes made) |
| `regional:pin`                                   | `{ path, confirmFingerprint }`            | pin result                                                                |
| `regional:join`                                  | `{ path, projectPath }`                   | `{ scenarioId }`                                                          |
| `regional:merge-preview`                         | `S & { paths: string[] }`                 | per-org diff and conflicts                                                |
| `regional:merge-apply`                           | `S & { accept: { orgId, revision }[] }`   | `RegionalState`                                                           |
| `regional:import-merged`                         | `S & { path }`                            | changes applied                                                           |
| `regional:propose` / `regional:proposal-resolve` | proposal fields / `{ id, accept, note? }` | `RegionalState`                                                           |
| `regional:finalize`                              | `S`                                       | `RegionalState`                                                           |

File association: `.asexercise` is added to `electron-builder.yml` file associations next to `.aspack`; the open-file handler that routes `.aspack` to the pack review (`src/main/packs/`) routes `.asexercise` to `regional:inspect`.

### Live session

This spec asks #406 for: a signed **controller roster** message from the host listing controller public keys with scopes (organization id, row-id prefix, role ids); player clients check each controller message's signature against the roster and its scope. Co-controller apps connect as controllers through the chosen connection (#410). Private-row injects are released by the owner's app, signed by the owner's key. The session log at the host records releases from all controllers; `session.ts` produces log slices (FR-22) as JSON and CSV matching #417's export.

### Renderer

- Scenario editor: a **Regional** tab (`src/renderer/src/routes/scenarios/RegionalTab.tsx`): organizations with fingerprints and pin status, rounds (frame version, received slices with revision, date and signature status), Export frame / slice / merged, Import, Finalize, sharing settings.
- MSEL editor: owner badge column; read-only rows for other owners; "Propose change"; "Private to my controllers" toggle with the public summary field.
- `RegionalReview.tsx`: bundle review (signer, fingerprint compare in groups, contents) used on open and on join.
- `MergeReview.tsx`: per-organization tables of added, changed and removed rows with field diffs; conflict list with links to rows; Accept per organization.
- Facilitate page: in a regional session, the timeline shows all organizations' rows with owner badges; Release is enabled only for this organization's rows; the controller dashboard (#417) filters by organization.

### Documentation

`docs/guides/regional-exercises.md` (new: roles, rounds, what is shared, fingerprint checks, running the session), `docs/exercise-bundle-format.md` (format reference, like `docs/packs-format.md`), `docs/05-DATA-MODEL.md`, ADR `docs/adr/NNNN-signed-exercise-bundles.md`.

## Security and privacy

| Threat                                                                      | Mitigation                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plans leak through a bundle                                                 | Field and path allow-list enforced at write (refuses to write) and at read (refuses unknown files); citation reduction; export review; unit tests that seed plan text, facility facts and document files into a scenario and assert none reaches the archive |
| Forged or altered bundle                                                    | Ed25519 signature over a manifest that hashes every file; pinned keys; key-change flow requires explicit confirmation of a new fingerprint                                                                                                                   |
| Malicious archive (zip bombs, path tricks, duplicate entries)               | Pack reader's single-reading rules, limits and path rules from `docs/packs-format.md`; media validated by type and size; JSON parsed with zod with string caps                                                                                               |
| A partner overwrites another organization's rows                            | Ownership check in merge; revision regression rejected; read-only rows in the editor                                                                                                                                                                         |
| A co-controller releases another organization's injects in the live session | Scoped roster; player clients reject out-of-scope controller messages                                                                                                                                                                                        |
| Prompt injection from partner text                                          | Partner rows enter prompts only as delimited, read-only data                                                                                                                                                                                                 |
| Log over-sharing                                                            | Per-organization log slices by default; full log only with the frame's `shareFullLog` set by the host after all agree                                                                                                                                        |
| Private key theft                                                           | safeStorage encryption; key never exported; "Revoke and rotate" creates a new key and tells partners to re-pin                                                                                                                                               |

No network call is made during planning. The live session uses only the connection the host chose (#410).

## Testing

- Unit: `keys.test.ts` (sign/verify, fingerprint format), `canonical.test.ts` (stable output), `allowlist.test.ts` (leak tests above), `write.test.ts` + `read.test.ts` (round trip; tampered file, tampered manifest, wrong key, unpinned key, key change), `merge.test.ts` (each conflict type, field diffs, placeholders), `proposals.test.ts`, `session.test.ts` (roster scopes; log slices contain only the right events).
- Schema tests for the new optional fields: a single-organization scenario parses and saves unchanged.
- Fixtures: a fictional three-organization exercise in `src/main/regional/fixtures/` (a fictional airport authority, a city emergency management office in a real city, a fictional regional hospital), following the naming rule.
- E2E: `e2e/regional.spec.ts` with two isolated data folders (`e2e/helpers.ts` `launch()` twice): host creates and exports a frame; participant joins, generates its slice with the mock provider, marks one row private, exports; host merges and sees the placeholder; a tampered slice is refused. A second spec runs a local-connection session (#407) with host and co-controller and checks a co-controller can release only its own rows.
- Packaged smoke: opening an `.asexercise` file from the OS goes to the review screen and applies nothing.

## Tasks

1. **Identity and keys.** `src/main/regional/keys.ts`, `canonical.ts`, `regional:identity*` channels, secrets entries, settings field, tests.
2. **Schemas.** `src/shared/schemas/regional.ts`, optional owner/revision/visibility fields in `scenario.ts` and `inject.ts`, schema tests, `docs/05-DATA-MODEL.md`.
3. **Bundle writer and allow-list.** `allowlist.ts`, `write.ts` (frame and slice), export review, `regional:export*`, leak tests, `docs/exercise-bundle-format.md`.
4. **Bundle reader, review and pinning.** `read.ts`, `pinning.ts`, `regional:inspect`, `regional:pin`, `regional:join`, `RegionalReview.tsx`, file association in `electron-builder.yml` and the open-file handler.
5. **Ownership in the editor and generation.** Owner badges and read-only rows in the MSEL editor, prefix-aware ids in `src/main/scenario/inject-links.ts`, `ownerFilter` in `src/main/generate/engine.ts`, private rows and placeholders.
6. **Merge.** `merge.ts`, `apply.ts`, `regional:merge-*`, merged bundle export and `regional:import-merged`, `MergeReview.tsx`, tests.
7. **Proposals.** `proposals.ts`, Propose change UI, incoming proposals list, tests.
8. **Regional tab and rounds.** `RegionalTab.tsx`, Finalize, sharing settings, `e2e/regional.spec.ts` (planning).
9. **Joint live session.** Controller roster in `src/shared/live/` (with #406), `session.ts`, co-controller connect and scoped release on the Facilitate page, per-organization log slices, e2e session spec.
10. **Docs and ADR.** `docs/guides/regional-exercises.md`, ADR for signed exercise bundles, links from `docs/packs-format.md`.

## Open questions

1. **New `.asexercise` format or a new pack kind?** Recommendation: new format reusing the pack archive reader. Packs are installed, unsigned, reusable content; exercise bundles are per-scenario, signed, exchanged in rounds. Mixing them would weaken the "hashes only" clarity of packs or put signing into every pack.
2. **Host as single merger or peer-to-peer merge?** Recommendation: host merges. One merged version per round avoids divergent copies, matches how a lead agency runs a regional exercise, and keeps conflict handling in one place.
3. **Should expected actions and instructor notes be shared by default?** Recommendation: yes, because partner controllers need them to run the session, with the export review listing every plan-citing field and the private-row option for anything sensitive.
4. **Full session log sharing.** Recommendation: per-organization slices by default; full log only by explicit host setting after all organizations agree, recorded in the frame so every party sees it.
5. **Key trust model.** Recommendation: per-exercise pinning with out-of-band fingerprint comparison; no certificate authority. It costs nothing and fits organizations that already talk by phone while planning.
6. **Signing for packs too?** Recommendation: not in this issue. If packs gain signing later, reuse `src/main/regional/keys.ts` and record it in a separate ADR.

## Implementation notes (as built)

- ADR-0062 (not NNNN). Organization ids are the lowercase prefix; paths use the prefix (`slices/AIR.json`). Rows and roles are reserved to an organization by their id prefix and owner, injects by their row.
- `from.liveKey` was added to the signed manifest so the host can list each partner's P-256 controller key in the roster; the Ed25519 bundle key cannot sign live messages.
- `regional:export`, `:inspect`, `:merge-*` and `:import-merged` take a file path chosen in the renderer's dialog; `regional:pin` and `:merge-apply` also take the scenario and (apply) the slice paths. The fingerprint is typed by the user, not ticked.
- Shared rows are the host's `START`, `END`, `TJ-*`, `PH-*` rows and rows with format `time_jump`.
- The host sends its signed `controller.roster` to every device when the session starts or resumes and to each device that joins later (`regional-roster.ts`); the Live tab lists the partners with their row prefixes and role counts, names organizations with no pinned live key, and **Send roster to devices** sends a newer revision (#494).
- Built (#517): the host mints a partner invite per roster organization (Live tab, shown once; staff link, server and a controller token that cannot end or kick), the partner pastes it on the Live tab, connects as a co-controller, releases its own rows to its own roles from this computer, and sees receipts by role forwarded by the host (`partner.receipt`). Roster entries carry explicit `permissions` (partners get `inject`, `message`, `vote`). Relay and self-hosted servers only: a LAN session has no second controller connection, so a partner on the host's Wi-Fi uses the relay.
- Not built yet: `ownerFilter` in the generation engine (user saves are guarded; generation can still rewrite a partner's rows), owner badges and read-only rows in the MSEL editor; the staged media of a partner's rows uploads at release time (no background staging) (the roster builder, per-organization log slices and the protocol scope checks exist).

- Staff seats and partner invites (#529): a partner invite carries the staff key, so a device cannot be told apart from the partner by key. Making an invite therefore closes new evaluator and SimCell seats (and helper decisions) until the host ticks "Open evaluator and SimCell helper seats again" on the Live tab. Devices already seated keep their seats. Giving partners a key that cannot prove staff seats is a possible later step.
