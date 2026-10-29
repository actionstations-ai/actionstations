# Spec 0433: Preview and redact what goes to cloud models

Issue: #433 · Milestone: 0.7.0 · Status: Implemented (ADR-0031) · Depends on: none · Related: #423, #427

## Summary

Before any request leaves the computer for a cloud provider, Action Stations shows exactly what it
would send: which plan excerpts (document, section, page), what generated text, to which host and
model. The user approves, and can turn on automatic redaction of people's names, phone numbers,
email addresses and street addresses. Redacted values are replaced with stable placeholders, the
placeholders in the model's reply are mapped back to the real values on this computer, and the
mapping itself is never sent. Local providers are unaffected.

## Requirements

### User stories

- As a cautious emergency manager, I want to see the plan excerpts that would go to a cloud model
  before they go, so that I can decide whether that is acceptable.
- As a user of a cloud model, I want names, phone numbers, emails and addresses replaced before
  sending and restored in the result, so that the exercise reads normally and the vendor never
  sees them.
- As a security reviewer, I want a record of every cloud send (when, where, which sections, how
  much was redacted) without the text itself, so that I can audit use.
- As a local-only user, I want none of this in my way.

### Functional requirements

**Which calls are cloud calls**

- **FR-1** A provider is **remote** when its kind is `anthropic`, or its `baseUrl` host is not a
  loopback address (`127.0.0.0/8`, `::1`, `localhost`). LAN hosts (`192.168.x.x`, `*.local`) are
  remote unless the user marks the provider **On my network, treat as local** (a per-provider
  option `options.network: 'local' | 'remote'`, shown in `ProviderDialog.tsx`, defaulting from the
  host). The rule lives in one function, `isRemoteProvider(config)`, used for text, embedding and
  media providers alike, so any future adapter (an OpenAI-compatible cloud endpoint, OpenRouter,
  a remote Ollama or ComfyUI) is covered without adapter changes.
- **FR-2** Every text request to a remote provider passes through the **outbound gate** before the
  adapter's `chat` runs. The gate wraps the `TextProvider` returned by `resolveTextProvider` and
  `textProviderFor` in `src/main/providers/resolve.ts`, so every stage (`runStage` in
  `src/main/generate/stage.ts`, used by ideation, every pipeline stage, inject text, media briefs,
  critique, and the #423 verification prompts) is covered by one code path. The Providers page
  "Test" chat sends a fixed sentence with no project content and is exempt.
- **FR-3** Embedding requests to a remote provider (embedding mode `provider`, `EmbeddingSettings`
  in `src/shared/schemas/settings.ts`) and media requests to a remote media provider (image and
  video prompts, TTS voice lines) pass through the same gate for **preview and approval only**.
  Redaction is not applied to them: embeddings of redacted text degrade retrieval for good, and
  audio or images cannot be mapped back. The preview says so.

**Preview and approval**

- **FR-4** The gate builds an **outbound manifest** for each request: provider label, host, model,
  task, stage and item; the plan excerpts (document title, heading path, page, chunk id, character
  count, the text as it will be sent); the other parts (system prompt, scenario state, facility
  facts, user instructions, earlier turns of a repair round) with sizes and text; redaction counts
  per category; total characters and an estimated token count.
- **FR-5** Excerpts are identified from metadata, not by parsing the prompt: `runStage` attaches
  the retrieved chunks to the request (`ChatRequest.outbound`, FR-15). A request with no metadata
  (a future caller) is previewed as one block of text.
- **FR-6** Review policy, per project with a global default:
  - `new-excerpts` (default): ask before the first remote request of a job, and again whenever a
    request would send an excerpt not yet approved in that job. Generated text and prompts that
    contain no new excerpts go without asking once the job has an approval.
  - `every-request`: ask before every remote request.
  - `per-job`: ask once per job, showing the first request and the routing for the rest.
  - `off`: never ask; the send log (FR-12) still records everything. Choosing `off` needs a
    confirmation that names the provider.
- **FR-7** Asking pauses the job in place: the job's record shows "Waiting for your approval" in
  the jobs tray and the scenario page, a notification appears, and the approval dialog opens when
  the user selects it. The dialog shows the manifest with redacted values highlighted, and these
  actions:
  - **Send** (this request only),
  - **Send and approve these documents for this job** (excerpts from the same documents stop
    prompting until the job ends),
  - **Change redaction** (opens FR-9 settings, recomputes the preview),
  - **Cancel job**.
    Excerpts are listed by document with a count, collapsed, so a 16-excerpt request fits a screen.
- **FR-8** An approval is bound to the exact outbound bytes: the gate hashes the final request
  body pieces (system, messages, cacheable context) after redaction, and sends only if the hash
  matches the approved one. Any difference (for example a repair round) is a new request under the
  policy.

**Redaction**

- **FR-9** Redaction settings, per project with a global default: on/off per category
  (`person`, `phone`, `email`, `address`), plus **Always redact** terms (for example a staff
  member's nickname or a private business) and **Never redact** terms (for example the
  organization's name, the city). Defaults when a project first routes a task to a remote
  provider: all four categories on.
- **FR-10** Detection is deterministic: the same text with the same settings always yields the same
  spans. Detectors run in a fixed order, longest match wins on overlap, Never-redact terms are
  removed last:
  - `email`: RFC 5322 practical pattern.
  - `phone`: NANP and E.164 forms with separators, extensions (`x123`), and phone numbers listed in
    `facility-facts.md` under the phones category. Times, dates, section numbers ("13.6.2"),
    ICS form numbers and IP addresses are excluded by tests.
  - `address`: house number + street name + street suffix from a bundled suffix list (USPS
    Publication 28 suffixes, public domain), optional unit, optional city/state/ZIP; PO boxes.
  - `person`: (a) a title or rank followed by one or two capitalized words ("Chief Dana Ruiz",
    "Dr. Okafor", "Sgt. Lee"); (b) a given name from a bundled list (US Social Security
    Administration baby-name data, top 5,000, public domain) followed by a capitalized surname;
    (c) the name column in contact tables (a "Name" header in a Markdown table from ingest);
    (d) Always-redact terms. Words in the project's role titles, agency names (facility facts),
    brand aliases, document short names and the Never list are not names.
- **FR-11** Each detected value becomes a placeholder `[[CATEGORY_XXXX]]`, where `XXXX` is four
  base32 characters of HMAC-SHA256(project redaction key, category + normalized value). The same
  value gets the same placeholder in every request of every job in that project, so the model sees
  a consistent cast across stages and prompt caching still works. A collision between two values
  adds a fifth character to the later one, in sorted order.
- **FR-12** The project redaction key is 32 random bytes created on first use and stored with
  `safeStorage` beside the API keys (`src/main/secrets`), keyed by project id. It never goes in the
  project folder and is never sent. Without the key (another computer), new placeholders are
  generated; this only changes placeholder spellings.
- **FR-13** Reversal: the reply's `text` and parsed `json` (every string, deep) are scanned for
  placeholders, tolerant of the forms models produce (`[[PERSON_7F3K]]`, `[PERSON_7F3K]`,
  `PERSON_7F3K`, any case), and each is replaced with its original value from the request's
  mapping. The mapping covers every placeholder the project has issued in this app session, so a
  placeholder carried over from an earlier stage's output is also restored. A placeholder with no
  mapping (invented by the model) is left in place and reported as warning `REDACTION_UNKNOWN`
  with the row or inject. Streamed tokens in the live log show placeholders (the log shows what
  the model saw); the saved result is reversed.
- **FR-14** The mapping lives in main-process memory only, for the app session. It is never
  written to disk, never logged, never put in job records, never sent to the renderer except
  per-value inside the preview dialog, and never part of any request body.

**Request metadata**

- **FR-15** `ChatRequest` (`src/main/providers/types.ts`) gains an optional `outbound` field:
  `{ jobId, projectPath, stage, itemId?, excerpts: { chunkId, documentId, documentTitle,
headingPath, page?, text }[] }`. Adapters ignore it; the gate reads it and strips it before
  calling the adapter.

**Record**

- **FR-16** Every remote request appends one line to `<project>/cloud-sends.jsonl`: time, provider
  id and label, host, model, task, stage, item, document ids and heading paths of the excerpts,
  character counts per part, redaction counts per category, approval (`asked`, `job-approval`,
  `document-approval`, `policy-off`), and the request hash. No prompt text, no values, no mapping.
  The project page gets a **Sent to cloud** view listing these lines with filters.
- **FR-17** The Providers page and the routing table (`RoutingTable.tsx`) mark remote providers
  with "Cloud: sends excerpts to <host>", and a project whose routing includes a remote text
  provider shows its review policy and redaction state on the project page.

### Non-functional requirements

- **NFR-1** Cost: no new service or dependency with a fee; detection is local code and bundled
  public-domain word lists (Project rules 1).
- **NFR-2** Privacy: this feature adds no network call. It makes every existing remote call
  visible and consented first, as Project rules 3 asks: "say what is sent and where".
- **NFR-3** Accessibility: the approval dialog is a modal with a focus trap, a heading, a
  description naming the host, and redacted spans marked with text ("[name]") as well as colour;
  all actions keyboard-reachable; WCAG 2.2 AA contrast.
- **NFR-4** Performance: redaction plus manifest building adds under 50 ms to a 40,000-character
  request.
- **NFR-5** Determinism and tests: detectors and placeholder generation are pure functions of
  (text, settings, key) and are covered by table tests.
- **NFR-6** Local providers: no gate work at all when `isRemoteProvider` is false (a pass-through
  wrapper is not created).

### Out of scope

- Machine-learning named-entity recognition (possible later behind the same detector interface).
- Removing individual excerpts from a request in the dialog (open question 2).
- Redaction for local providers.
- Redacting document text at ingest.

## Design

### Modules

```
src/main/providers/outbound/
  remote.ts        isRemoteProvider(config)
  gate.ts          wrapText(provider, config) / wrapEmbedding / wrapMedia
  manifest.ts      buildManifest(request, redaction) → OutboundManifest
  detect/
    email.ts phone.ts address.ts person.ts terms.ts
    lists/given-names.txt  lists/street-suffixes.txt   (public domain, sources in a README)
  redact.ts        redact(text, settings, key, context) → { text, spans, mapping }
  reverse.ts       reverseText / reverseDeep(json, mapping) → { value, unknown[] }
  approvals.ts     pending approvals per job, job/document approvals, hash binding
  send-log.ts      append to <project>/cloud-sends.jsonl
```

`gate.ts` flow for `chat(req)`:

1. Read the effective privacy settings for `req.outbound.projectPath` (project over global).
2. Redact `system`, `cacheableContext` and every message `content`; leave the `json.schema`
   descriptions untouched (they are app text). Keep the mapping.
3. Build the manifest; decide by policy whether to ask. If asking: register a pending approval,
   set the job's `awaiting` field, emit `outbound:approval-needed`, and await the decision (abort
   on job cancel via `req.signal`).
4. Check the approved hash, strip `outbound`, call the wrapped adapter, reverse the response
   (`text`, `json`), append the send log line, return.

The gate never changes `temperature`, `json`, `maxTokens`, `stop` or the model.

### Data model

`src/shared/schemas/privacy.ts`:

```ts
export const RedactionCategory = z.enum(['person', 'phone', 'email', 'address'])
export const ReviewPolicy = z.enum(['new-excerpts', 'every-request', 'per-job', 'off'])
export const PrivacySettings = z.object({
  review: ReviewPolicy.default('new-excerpts'),
  redact: z.partialRecord(RedactionCategory, z.boolean()).default({}),
  alwaysRedact: z.array(z.string().min(2).max(200)).max(500).default([]),
  neverRedact: z.array(z.string().min(2).max(200)).max(500).default([]),
})
export const OutboundExcerpt = z.object({
  chunkId: z.number().int(),
  documentId: Id,
  documentTitle: z.string(),
  headingPath: z.string(),
  page: z.number().int().optional(),
  chars: z.number().int(),
  text: z.string(),
})
export const OutboundManifest = z.object({
  requestId: z.string(),
  jobId: z.string().optional(),
  providerLabel: z.string(),
  host: z.string(),
  model: z.string(),
  task: z.string(),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  excerpts: z.array(OutboundExcerpt),
  parts: z.array(z.object({ name: z.string(), chars: z.number().int(), text: z.string() })),
  redactions: z.partialRecord(RedactionCategory, z.number().int()),
  spans: z.array(
    z.object({
      part: z.string(),
      start: z.number().int(),
      end: z.number().int(),
      category: RedactionCategory,
      placeholder: z.string(),
    }),
  ),
  estimatedTokens: z.number().int(),
  redactable: z.boolean(), // false for embed / media
})
export const CloudSendEntry = z.object({
  at: IsoDateTime,
  providerId: z.string(),
  providerLabel: z.string(),
  host: z.string(),
  model: z.string(),
  task: z.string(),
  stage: z.string().optional(),
  itemId: z.string().optional(),
  excerpts: z.array(z.object({ documentId: Id, headingPath: z.string() })),
  chars: z.record(z.string(), z.number().int()),
  redactions: z.partialRecord(RedactionCategory, z.number().int()),
  approval: z.enum(['asked', 'job-approval', 'document-approval', 'policy-off']),
  requestHash: z.string(),
})
```

- `AppSettings` gains `privacy: PrivacySettings.default({})`; `Project` (loose) gains
  `privacy: PrivacySettings.partial().optional()`.
- `Job` gains `awaiting: z.object({ kind: z.literal('cloud-approval'), requestId: z.string() })
.optional()`. The status stays `running`; an optional field (not a new `JobStatus` value) keeps
  `jobs.json` readable by older builds. A job awaiting approval at quit is shown as interrupted on
  the next start, like any running job (#54).
- The manifest sent to the renderer includes the original values of highlighted spans so the user
  can see what is being hidden; this is local IPC only.

### IPC (`src/shared/ipc/privacy.ts`)

| Channel                     | Request                                                              | Response                                                                                      |
| --------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `privacy:get`               | `{ projectPath? }`                                                   | `{ global: PrivacySettings, project?: Partial<PrivacySettings>, effective: PrivacySettings }` |
| `privacy:set`               | `{ projectPath?, settings }`                                         | same as get                                                                                   |
| `privacy:pending`           | `{ jobId? }`                                                         | `OutboundManifest[]`                                                                          |
| `privacy:decide`            | `{ requestId, decision: 'send' \| 'approve-documents' \| 'cancel' }` | `void`                                                                                        |
| `privacy:preview-redaction` | `{ projectPath, text }`                                              | `{ text, spans }` (settings screen sample)                                                    |
| `privacy:sends`             | `{ projectPath, limit?, before? }`                                   | `CloudSendEntry[]`                                                                            |

Event: `outbound:approval-needed` with `{ requestId, jobId, providerLabel, host }`.

### UI

- `src/renderer/src/components/OutboundApprovalDialog.tsx`: FR-7 dialog. Header "Send to
  Anthropic (api.anthropic.com), model …?". Sections: Plan excerpts (grouped by document,
  expandable to the text with redactions highlighted), Other content (expandable), Redaction
  summary, actions.
- `src/renderer/src/components/JobsTray.tsx` and `jobs-tray-model.ts`: "Waiting for your
  approval" state with a **Review** button.
- `src/renderer/src/routes/settings/`: a **Privacy** section for the global defaults.
- `src/renderer/src/routes/project-home/ProjectSettingsForm.tsx`: project overrides, the term
  lists (add from the dialog with "Never redact this" / "Also redact this"), and a sample text box
  that shows live redaction (`privacy:preview-redaction`).
- `src/renderer/src/routes/project-home/CloudSends.tsx`: FR-16 list.
- `src/renderer/src/routes/providers/ProviderCard.tsx`, `ProviderDialog.tsx`,
  `RoutingTable.tsx`: Cloud marker, LAN option (FR-1, FR-17).
- `docs/guides/providers/anthropic.md` and a new `docs/guides/privacy.md` explain what is sent,
  the policies, the limits of pattern-based redaction, and the send log.

### Prompts

No prompt files change. The gate prepends one line to the system prompt of a redacted request:
"Some names, phone numbers, emails and addresses are replaced with placeholders like
[[PERSON_7F3K]]. Use the placeholders exactly as written wherever you refer to them; never invent
new ones." This line is app text, so it is not itself redacted.

## Security and privacy

| Threat                                                            | Mitigation                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A remote call bypasses the gate                                   | Wrapping happens in `resolve.ts`, the only place text providers are built for callers; an ESLint rule (with the existing adapter import rule) forbids importing `createTextProvider` or adapter modules outside `src/main/providers/`. A test enumerates `providerTaskSupport()` kinds and asserts a remote config always gets the wrapper. |
| Request changed after approval                                    | Hash binding (FR-8).                                                                                                                                                                                                                                                                                                                        |
| Mapping leaks                                                     | Memory only (FR-14); a test serializes every request body the mock-remote adapter receives and asserts no original value and no mapping key appears; `call-log.ts` and `cloud-sends.jsonl` carry no text.                                                                                                                                   |
| Redaction misses a value                                          | Stated plainly in the dialog ("Pattern-based: review the highlighted text"); the preview shows the unredacted text around each span so misses are visible; Always-redact list fixes repeat misses.                                                                                                                                          |
| Placeholder guessing                                              | 20 bits of a keyed HMAC; values cannot be recovered from placeholders without the key, which stays in `safeStorage`.                                                                                                                                                                                                                        |
| Prompt injection in a plan asking the model to output the mapping | The mapping is never in the request, so the model cannot output it.                                                                                                                                                                                                                                                                         |
| LAN host treated as local by mistake                              | Remote by default; "treat as local" is an explicit per-provider choice shown on the card.                                                                                                                                                                                                                                                   |
| Renderer compromise reads values                                  | The renderer already displays the project's documents; preview values add nothing new.                                                                                                                                                                                                                                                      |

What leaves the computer: only requests to providers the user configured, after approval under the
chosen policy, with the redactions shown.

## Testing

- **Unit**: `remote.test.ts` (loopback forms, IPv6, `localhost`, LAN default, override);
  detector table tests with positive and negative cases per category, including section numbers,
  times, IPs, ICS form numbers, role titles and agency names that must not match;
  `redact.test.ts` (determinism across calls, same placeholder across categories and requests,
  collision handling, Never/Always lists); `reverse.test.ts` (all tolerant forms, deep JSON,
  unknown placeholder report, no partial-word replacement); `approvals.test.ts` (each policy,
  document approval, hash mismatch, cancel during wait).
- **Gate contract**: with a `mock` provider configured as remote (`options.network: 'remote'`), a
  full `runStage` call: request seen by the adapter is redacted, result is reversed, send log line
  written, no mapping in any captured body.
- **Integration**: engine test (mock remote) generates a scenario from the city-water example
  documents with redaction on; asserts the saved scenario contains original names and no
  placeholders, and `cloud-sends.jsonl` has one line per stage call.
- **E2E** (`e2e/cloud-preview.spec.ts`): route `draft` to a mock remote provider, start
  generation, approval dialog appears, approve documents for the job, job completes; cancel path
  cancels the job; axe check on the dialog. `e2e/net-recorder.cjs` asserts no connection other
  than the mock endpoint.
- **Live** (`LIVE=1`): an Anthropic call with redaction on returns a reversed result for a short
  fixed prompt containing a fictional name and phone number.

## Tasks

1. Remote detection and settings: `src/main/providers/outbound/remote.ts`,
   `src/shared/schemas/privacy.ts`, `AppSettings.privacy`, `Project.privacy`, schema tests,
   provider LAN option in `ProviderDialog.tsx` / `ProviderCard.tsx`, Cloud marker in
   `RoutingTable.tsx`.
2. Detectors and redaction: `outbound/detect/*`, bundled lists with source notes,
   `redact.ts`, `reverse.ts`, project redaction key in `src/main/secrets/index.ts`; table tests.
3. Request metadata: `ChatRequest.outbound` in `src/main/providers/types.ts`; `runStage` in
   `src/main/generate/stage.ts` fills it from `retrieved` and `ctx.jobId`; tests.
4. Gate and approvals: `outbound/gate.ts`, `approvals.ts`, `manifest.ts`, wrapping in
   `src/main/providers/resolve.ts` (text, embedding, media), `Job.awaiting` in
   `src/shared/schemas/job.ts` and `src/main/jobs/manager.ts`; gate contract tests; ESLint rule in
   `eslint.config.js`.
5. Send log: `outbound/send-log.ts`, `privacy:sends`; tests.
6. IPC: `src/shared/ipc/privacy.ts`, `src/shared/ipc/index.ts`,
   `src/main/ipc/handlers/privacy.ts`, `outbound:approval-needed` event; handler tests.
7. Approval UI: `OutboundApprovalDialog.tsx`, jobs tray state, notification; component tests;
   `e2e/cloud-preview.spec.ts`.
8. Settings UI: Privacy section in settings, project overrides and term lists in
   `ProjectSettingsForm.tsx`, sample redaction box, `CloudSends.tsx`; tests.
9. Docs: `docs/guides/privacy.md`, `docs/guides/providers/anthropic.md`,
   `docs/02-ARCHITECTURE.md` (Providers and Security sections), `docs/05-DATA-MODEL.md`
   (`cloud-sends.jsonl`, privacy settings), ADR for "one outbound gate at provider resolution with
   keyed deterministic placeholders", CHANGELOG.

## Implementation notes

Where the code differs from or adds to the design above, and why:

- **Job context.** Besides `ChatRequest.outbound` (filled by `runStage`, now also carrying `task`),
  the job manager runs every job inside an `AsyncLocalStorage` scope (`src/main/jobs/scope.ts`).
  Embedding and media requests carry no metadata, so the gate reads the job and project from that
  scope.
- **Approval scopes** are per job and provider (an approval for one host never covers another).
  Outside a job (a search on the Search page), one scope per project and provider lasts for the app
  session.
- **Hash binding is two-sided.** The manifest carries `requestHash`; `privacy:decide` must echo
  it (`CONFLICT` otherwise), and the gate re-hashes the exact body it hands to the adapter.
- **Settings changes while waiting.** `privacy:set` rebuilds every waiting request of that project
  (all, for the global settings) and asks again. A second event, `outbound:approval-settled`,
  tells the renderer to drop a request that was answered, rebuilt or cancelled.
- **Schemas.** `Project.privacy` is `ProjectPrivacy` (every field optional, no defaults) instead of
  `PrivacySettings.partial()`, so a project stores only what it overrides. The manifest also has
  `kind`, `providerId`, `projectPath`, `review`, `totalChars` and `createdAt`; spans carry
  `original` (local IPC only). `CloudSendEntry` adds `kind` and `jobId`. Chat parts are named
  `system`, `cacheableContext` and `message:<i>:<role>`.
- **Turning review off** needs `confirmOff: true` on `privacy:set`; the screen asks first and names
  the cloud providers.
- **Exempt paths** (fixed sample text, no project content): the Providers page **Test**, the voice
  sample, the Workflows page test renders, and the embedders' one-time dimension probe. They use
  `connectionTestTextProvider` / `connectionTestMediaProvider` in `resolve.ts`.
- **Embeddings (open question 5).** One approval per job: the first batch is shown (its texts), the
  rest go under `job-approval`. The dialog lists texts, not documents, because embedding batches
  carry no document metadata.
- **Unknown placeholders** are reported as a `REDACTION_UNKNOWN` warning in the job log with the
  stage and item, not yet as a scenario warning.
- **Send log** lines are written just before the adapter call, so a request that fails after
  leaving the computer is still recorded.
- **Detection additions.** Later mentions of a detected surname on its own are redacted too. The
  Name column is recognised under `Name`, `Full name`, `Contact name`, `Person`, `Staff name`, `POC`
  and `Point of contact` headers only, and a cell must read as a name. `General` and `Major` are
  not titles (too often ordinary words).
- **UI placement.** Project overrides, the sample box and the send log are on a project page,
  **Cloud and privacy** (Advanced section), with a summary card on the project home page, rather
  than inside `ProjectSettingsForm.tsx`.
- **Live test** runs only with `LIVE=1` and `LIVE_ANTHROPIC_KEY`, since it is a paid call.

### Changes after the security review of PR #454

- **Project files only tighten.** A project's choices made in the app are stored in
  `AppSettings.projectPrivacy[projectId]` (userData) and may relax the defaults. `Project.privacy`
  in project.json is applied only to make things stricter (a stricter review policy, categories
  turned on, extra Always-redact terms); its Never list and any relaxation are ignored. Saving
  writes the stricter part back to project.json so it travels. Opening an example drops
  `privacy`; exporting an example leaves out `privacy` and `cloud-sends.jsonl`.
- **Known values first.** `redactText` replaces every value the project has already redacted
  (case- and spacing-insensitive, phones by digits, longest first) before the detectors run, so a
  value restored into a reply is never re-sent in the clear by a repair round or a later stage.
- **New content asks under `new-excerpts`.** Besides excerpts, every line of a request outside
  the excerpts (the prompt, earlier outputs, facility facts) is fingerprinted; a line never
  approved in the job makes the request new. Lines inside excerpts from approved documents and
  the `<documents>` framing do not. In practice each stage of a generation asks once. Embedding
  batches keep one approval per job (open question 5).
- **Media prompts are redacted** with plain stand-ins ("a staff member", "a phone number"), not
  placeholders, since images and audio cannot be changed back. A video's input image is hashed
  by its bytes and shown in the dialog (`OutboundManifest.images`).
- **Request scope for IPC.** The dispatcher runs every handler whose request has a `projectPath`
  in that project's request scope (`jobs/scope.ts`), so a search embedding or a test render uses
  that project's settings, approvals and send log. The gate uses a scope path only for a project
  the user opened.
- **Treat as local** is offered only for private addresses (RFC 1918, 169.254/16, fc00::/7,
  fe80::/10) and `.local`, `.lan`, `.home.arpa`, `.internal` names, and is bound to the host it was
  granted for (`options.localHost`); `providers:upsert` refuses anything else.
- **Ollama `-cloud` models** are cloud requests to ollama.com; a local Ollama keeps a pass-through
  wrapper that gates only those models (`isRemoteRequest`).
- **Connection tests.** An ESLint rule limits the ungated `connectionTest*` providers to the
  Providers and Workflows handlers. A cloud voice test and a cloud ComfyUI test render go through
  the gate (they can carry typed text); the fixed-sentence text test is logged with approval
  `connection-test`.
- **Send log** `requestHash` is an HMAC with the project's redaction key. The gate compares the
  hash of the exact body it sends with the approved hash.
- **Name column** cells under a Name header are names without the given-name list check.

## Open questions

1. **Default review policy.** Recommendation: `new-excerpts`. `every-request` is tiring in a
   40-call generation; `per-job` hides later excerpts, which the issue asks to show.
2. **Let the user remove an excerpt in the dialog?** It means re-rendering the prompt without that
   chunk inside `runStage`. Recommendation: not in 0.7.0; ship "Cancel job" and the Never-send
   document flag in a follow-up issue.
3. **Redaction on by default for a cloud project?** Recommendation: yes, all four categories, with
   the dialog showing the effect; users who find it intrusive turn categories off.
4. **Where the send log lives.** Project folder (travels with the project, visible to whoever gets
   the folder) or `<userData>`. Recommendation: project folder; it holds section headings only and
   answers "what did we send about this project".
5. **Remote embeddings.** Approving every embedding batch during ingest is noisy. Recommendation:
   one approval per ingest job listing the documents, then `job-approval` for its batches.
