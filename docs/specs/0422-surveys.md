# Spec 0422: Surveys: builder, templates, delivery and results

Issue: #422 · Milestone: 0.6.0 · Status: In progress (tasks 1–4, 6, 7 and the AAR feed of 8 built; see Implementation notes) · Depends on: — · Related: #417 (live session log; message types `survey.open`, `survey.response`, `survey.close`), #419 (AAR/IP), #420 (HSEEP document set), #421 (EEGs)

## Summary

Scenarios get surveys: a builder with rating, multiple-choice, free-text and confidence-scale questions; templates for the HSEEP Participant Feedback Form, a pre/post knowledge check, a before/after confidence self-assessment and facilitator and evaluator debriefs; delivery through live play, as a printable PDF, or by QR code on a phone after the exercise; results summarized on the computer and fed into the AAR/IP. Responses are anonymous by design.

## Requirements

### User stories

- As a facilitator, I want the HSEEP Participant Feedback Form ready to hand out or send after ENDEX, so the exercise meets HSEEP's feedback requirement without a paper template.
- As an instructor, I want a knowledge check before and after the exercise, generated from our plans, so I can show what the session taught.
- As an emergency manager, I want a confidence self-assessment before and after, per objective, because the change in confidence is the readiness signal our leadership asks for.
- As a facilitator, I want participants to answer on their phones by scanning a code on the screen, without accounts and without the responses leaving the room's network.
- As a facilitator, I want paper responses typed in afterwards to land in the same results as live ones.
- As a participant, I want to know nothing I answer can be traced to me.

### Functional requirements

- **FR-1** **Question types**: `rating` (1–5 scale with labelled ends and optional per-point labels; the HSEEP form uses Strongly Disagree … Strongly Agree), `choice` (single or multiple, with an optional "Other" text), `text` (short or long), `confidence` (1–5 "Not at all confident … Very confident" bound to a statement, with a `pairKey` so a before and an after question are compared). Questions can be marked required and grouped under section headings with an introduction.
- **FR-2** **Templates** shipped as app resources and instantiated per scenario: HSEEP Participant Feedback Form (Part I assessment statements on a 1–5 agreement scale — structure and organization, plausible and realistic scenario, facilitator knowledge and focus, exercise materials, appropriate participation for my role; Part II free text — what would you change, strengths and areas for improvement of the organization's plans, policies and procedures; Part III — issues observed and suggested corrective actions); Pre/Post Knowledge Check (generated per scenario, FR-4); Confidence Self-Assessment, before and after editions (one statement per objective and per Core Capability exercised, FR-4); Facilitator Debrief (what worked in facilitation, inject timing, time jumps, room setup, SimCell difficulty, what to change); Controller/Evaluator Debrief (HSEEP C/E debrief: observation coverage per EEG, data collection problems, inject delivery issues, key issues for the AAR). Templates are JSON validated by the `Survey` schema; wording of the HSEEP form follows the public-domain FEMA template.
- **FR-3** **Builder**: a Surveys section per scenario: create from a template or blank, edit title, intro, timing (`pre`, `post`, `during`, `any`), sections and questions (add, reorder, delete, required, type-specific options), preview as the participant sees it, duplicate, archive. Every edit is saved to the scenario folder.
- **FR-4** **Scenario-specific generation**: the knowledge check and the confidence statements are drafted by a new stage `survey_items` from the objectives, the EEG critical tasks (#421) and retrieved plan sections. Knowledge-check items are multiple choice with one correct answer, three plausible distractors and a citation to the section that answers it; confidence statements are one sentence each ("I could lead the switch to manual boarding announcements per TIRP 13.7"). The designer reviews and edits before delivery. Items cite only retrieved sections; a dropped citation drops the item (`CITATION_DROPPED`).
- **FR-5** **Delivery, live play**: opening a survey in a live session sends the protocol's `survey.open` (0406: `surveyId`, `title`, `intro`, `questions` of kind `scale` / `single` / `multi` / `text` with `options`, `min`, `max`, `required`; `anonymous`; `targets`; `closesAt?`); player pages (0411, `src/player/features/surveys/`) render it and send `survey.response` (`answers: [{ questionId, value }]`); `survey.close` stops accepting answers. This spec's question types map onto the wire kinds (`rating` and `confidence` → `scale` 1–5, `choice` → `single` or `multi`, `text` → `text`); the wire `surveyId` is a per-opening delivery id the live module maps back to the survey (`SurveyResponse.deliveryId`); `correctOptionId` and citations are stripped before anything is sent. The session log (0417) records every response; the live module also mirrors each response into the survey's response file, so results are identical whether they came from live play or paper.
- **FR-6** **Delivery, printable**: each survey exports as a PDF form (one per participant, fill-in boxes, page footer with the exercise marking) through `templates/export/survey.html`. A "Enter paper responses" view types them in one response at a time; entered responses are stored with `channel: 'paper'`.
- **FR-7** **Delivery, QR code**: a survey on phones is a live session on **This computer** (0411) with the survey open: the room join QR (0411, also on the presentation window) gets participants to the player page, and the survey appears as the only open item. After an exercise that was not run live, the facilitator starts a session in a **survey only** mode (a start option this spec asks 0411 to provide: every joiner gets a participant seat with no role and the player page shows surveys only); responses mirror into the response file with `channel: 'qr'`. Nothing listens on the network until the facilitator presses Start and the listener stops when the session ends (0418). Without the live module (not available on this build, or the facilitator declines) the UI offers the printable PDF.
- **FR-8** **Anonymity**: a response stores no name, device, address or user agent; only the survey id, delivery id, channel, timestamp rounded to the minute, optional self-selected role group (when the survey asks for it), and answers. Before/after pairing is by `pairKey` on the question, aggregated, never by respondent. Results and per-question breakdowns are shown only when at least `minResponses` (default 3, project setting) answers exist; free-text answers are listed without order or timestamp.
- **FR-9** **Results**: per survey, response count by channel; per rating and confidence question mean, median and a 1–5 distribution; per choice question counts and percentages; free text listed; for paired confidence questions the before and after means and the difference; for the knowledge check the share correct per item before and after and the sections most missed, with their citations. Results export as a PDF summary and as a sheet in the Excel writer (#420); summaries feed the exercise record (#419) through `summarizeSurvey()`.
- **FR-10** **Facilitate integration**: the Facilitate screen's side panel gains a Surveys tab listing the scenario's surveys with Open (live / QR), Print and Close actions and the live response count; a post-exercise checklist ("Hot wash · Participant feedback · C/E debrief · Draft AAR") appears after ENDEX.
- **FR-11** Surveys travel with the scenario on duplicate (definitions, not responses) and are included in the scenario's `scenario.json` export; response files never go into players/.

### Non-functional requirements

- **NFR-1** Cost: one model call per scenario for `survey_items`, run on demand; everything else is deterministic. No CI additions (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: responses stay in the project folder; the phone page is the live-play player page, served only by the transport the facilitator started, with session content end-to-end encrypted (0406) and no listener at rest (0418) (Project rules 3). No analytics, no external fonts, no third-party scripts on the phone page.
- **NFR-3** Accessibility: the phone page and the builder meet WCAG 2.2 AA: rating scales are radio groups with visible labels, 44 px touch targets, works without JavaScript errors on current iOS Safari and Android Chrome, respects prefers-color-scheme. Printable forms use real headings and fill-in boxes with labels.
- **NFR-4** Offline and platforms: everything works with no internet; the QR flow needs only a shared Wi-Fi; the printable path works everywhere.

### Out of scope

- Identified responses, respondent lists, reminders or e-mail delivery.
- Hosting surveys on actionstations.ai or any remote service.
- Statistical tests beyond mean, median, distribution and paired difference; weighting; cross-tabulation by role beyond the optional self-selected role group.
- Surveys at the project level across scenarios (a follow-up once there is more than one exercise per project in the field).

## Design

### Schemas (`src/shared/schemas/survey.ts`, exported from `schemas/index.ts`)

```ts
const Base = {
  id: Id,
  text: z.string().min(1),
  help: z.string().default(''),
  required: z.boolean().default(false),
}
export const SurveyQuestion = z.discriminatedUnion('type', [
  z.object({
    ...Base,
    type: z.literal('rating'),
    min: z.literal(1),
    max: z.literal(5),
    lowLabel: z.string().default('Strongly disagree'),
    highLabel: z.string().default('Strongly agree'),
    pointLabels: z.array(z.string()).length(5).optional(),
  }),
  z.object({
    ...Base,
    type: z.literal('choice'),
    multiple: z.boolean().default(false),
    options: z.array(z.object({ id: Id, text: z.string() })).min(2),
    correctOptionId: Id.optional(), // knowledge check
    allowOther: z.boolean().default(false),
    citation: Citation.optional(),
  }),
  z.object({
    ...Base,
    type: z.literal('text'),
    long: z.boolean().default(true),
    maxLength: z.number().int().default(2000),
  }),
  z.object({
    ...Base,
    type: z.literal('confidence'),
    statement: z.string(),
    pairKey: z.string(),
    edition: z.enum(['before', 'after']),
    objectiveRef: z.string().optional(),
    capability: CoreCapabilityId.optional(),
    citation: Citation.optional(),
  }),
])

export const SurveySection = z.object({
  id: Id,
  title: z.string().default(''),
  introMd: z.string().default(''),
  questions: z.array(SurveyQuestion).default([]),
})

export const SURVEY_KINDS = [
  'participant_feedback',
  'knowledge_check',
  'confidence',
  'facilitator_debrief',
  'evaluator_debrief',
  'custom',
] as const
export const Survey = z.looseObject({
  formatVersion: z.number().int().default(1),
  id: Id,
  title: z.string().min(1),
  kind: z.enum(SURVEY_KINDS).default('custom'),
  timing: z.enum(['pre', 'post', 'during', 'any']).default('post'),
  edition: z.enum(['before', 'after']).optional(), // confidence / knowledge check pairs
  pairId: Id.optional(), // the other edition's survey id
  introMd: z.string().default(''),
  askRoleGroup: z.boolean().default(false), // optional self-selected role group
  sections: z.array(SurveySection).default([]),
  templateId: z.string().optional(),
  templateVersion: z.number().int().optional(),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})

export const SurveyAnswer = z.union([z.number().int().min(1).max(5), z.array(Id), z.string()])
export const SurveyResponse = z.object({
  id: Id,
  surveyId: Id,
  deliveryId: Id.optional(),
  channel: z.enum(['live', 'qr', 'paper', 'manual']),
  at: IsoDateTime, // rounded to the minute before storing
  roleGroup: z.string().max(60).optional(),
  answers: z.record(Id, SurveyAnswer), // question id → answer
  otherText: z.record(Id, z.string()).default({}),
})

export const SurveySummary = z.object({
  surveyId: Id,
  title: z.string(),
  kind: z.enum(SURVEY_KINDS),
  responses: z.number().int(),
  byChannel: z.record(z.string(), z.number().int()),
  questions: z.array(
    z.object({
      questionId: Id,
      text: z.string(),
      type: z.string(),
      n: z.number().int(),
      mean: z.number().optional(),
      median: z.number().optional(),
      distribution: z.array(z.number().int()).optional(), // counts for 1..5
      choices: z
        .array(
          z.object({
            optionId: Id,
            text: z.string(),
            count: z.number().int(),
            correct: z.boolean().optional(),
          }),
        )
        .optional(),
      shareCorrect: z.number().optional(),
      texts: z.array(z.string()).optional(), // shuffled, when n >= minResponses
    }),
  ),
  pairs: z
    .array(
      z.object({
        pairKey: z.string(),
        statement: z.string(),
        before: z.number().optional(),
        after: z.number().optional(),
        delta: z.number().optional(),
        nBefore: z.number().int(),
        nAfter: z.number().int(),
      }),
    )
    .default([]),
  suppressed: z.boolean(), // n < minResponses: per-question detail hidden
})
```

### Storage

- `scenarios/<id>/surveys/<surveyId>.json` — the `Survey`.
- `scenarios/<id>/surveys/<surveyId>.responses.jsonl` — one `SurveyResponse` per line, append-only (`src/main/surveys/store.ts`: `listSurveys`, `readSurvey`, `writeSurvey`, `appendResponse`, `readResponses`); live-play responses are also mirrored here by the live adapter so one file is the source of truth for results. The `scenarioLayout` helper gains `surveys` and `survey(id)`, `surveyResponses(id)`.
- Templates: `surveys/templates/<templateId>.json` in the app resources (`resourcePath('surveys', 'templates')`), loaded by `src/main/surveys/templates.ts` and validated at startup in tests. Template ids: `hseep-participant-feedback`, `knowledge-check`, `confidence-before`, `confidence-after`, `facilitator-debrief`, `evaluator-debrief`.
- `minResponses` lives in `AppSettings.surveys.minResponses` (`schemas/settings.ts`, default 3).

### Generation (`survey_items` stage)

`schemas/generation.ts`:

```ts
export const SurveyItemsOutput = z.object({
  knowledgeCheck: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
        citation: CitationKey,
        objectiveRef: z.string().optional(),
      }),
    )
    .min(5)
    .max(12),
  confidence: z
    .array(
      z.object({
        statement: z.string(),
        objectiveRef: z.string().optional(),
        capability: CoreCapabilityId.optional(),
        citation: CitationKey.optional(),
      }),
    )
    .min(4)
    .max(10),
})
```

`prompts/survey_items.md`: `stage: survey_items`, `outputSchema: SurveyItemsOutput`, `task: draft`, `temperature 0.4`, `maxTokens 3000`, retrieval queries from the objectives and EEG task citations, `k: 8`; variables `project, domain, threat, scenario, objectives, eegs, roles, doctrine, retrieved, instructions`. Rules: questions test what the plans say, not trivia about the scenario; one defensible correct answer per item; distractors plausible to a practitioner; statements in the first person, one capability each; cite by key in the JSON only; nothing that identifies a person. `STAGES` gains `'survey_items'`; it runs on demand (`generate:rerun-stage` with stage `survey_items`), not in the pipeline. `src/main/surveys/from-items.ts` turns the output into the knowledge-check survey (before and after editions share question ids so the share-correct comparison works) and the two confidence surveys (`pairKey` per statement).

### IPC (`src/shared/ipc/surveys.ts`, handler `ipc/handlers/surveys.ts`)

`surveys:list`, `surveys:get`, `surveys:save` (CONFLICT on stale `baseUpdatedAt`), `surveys:delete`, `surveys:from-template { templateId }`, `surveys:templates` → template metadata, `surveys:generate-items` → `{ jobId }` (runs `survey_items` and writes the three surveys), `surveys:responses` → `SurveyResponse[]` (facilitator view), `surveys:add-response` (paper/manual entry), `surveys:summary` → `SurveySummary`, `surveys:open-live { surveyId, closesAt? }` → `{ deliveryId }` and `surveys:close-live { surveyId }` (both require a running session and delegate to the live feature module below), and the push event `surveys:response-added { surveyId, count }`. The live session lifecycle itself (`live:session-start` with the survey-only option, join QR, end) is 0411's.

### Live and QR delivery

`src/main/live/surveys.ts` is the surveys feature module in 0418's `src/main/live/` layout. It never touches a transport: `toWireSurvey(survey, deliveryId)` builds the `survey.open` payload (type mapping from FR-5, correct answers and citations stripped, `anonymous: true`), `fromWireResponse(msg, deliveryId)` validates an incoming `survey.response` against the survey (unknown question ids ignored, scale values clamped to 1–5, `at` rounded to the minute, `channel: 'qr'`) and `appendResponse` mirrors it into the response file exactly once per message id (the log stays the source of truth; replay after a crash rebuilds the mirror). The player side lives in `src/player/features/surveys/` (0411 layout): a `SurveyScreen` that renders the wire survey, keeps a draft in the player's IndexedDB outbox and sends when the participant submits. The join QR comes from 0411 (`qrcode`, already its dependency); the presentation window's join view (0411) is what the facilitator shows for QR delivery. `src/shared/survey-layout.ts` holds the pure helpers both sides use: question ordering, required-answer validation, answer coercion, the wire type mapping.

### Results (`src/main/surveys/summarize.ts`)

Pure function `summarizeSurvey(survey, responses, pairSurvey?, pairResponses?, minResponses) → SurveySummary`: counts per channel; rating/confidence mean, median and distribution; choice counts and `shareCorrect`; texts shuffled with a seeded shuffle from the survey id (stable between views, not chronological); pairs by `pairKey` across the before/after surveys; `suppressed` when `n < minResponses`. Used by the renderer's results view, the PDF summary, the Excel sheet and the AAR record (#419 `sources/surveys.ts`).

### Renderer

- `routes/surveys/` (new feature folder): `SurveysPage.tsx` at `/p/:projectKey/scenarios/:scenarioId/surveys` (list, create from template, generate items, status), `SurveyEditor.tsx` (sections and questions, drag to reorder with keyboard alternative, type-specific option editors, preview toggle), `SurveyResults.tsx` (summary cards, bar distributions drawn with plain SVG and tokens from `styles/tokens.css`, before/after table, knowledge check per item with citation chips, free text list, "Enter paper responses" form), `SurveyDeliveryDialog.tsx` (Live / QR / Print), `SurveyPreview.tsx` (read-only rendering of a survey as participants see it, built from the same `src/shared/survey-layout.ts` helpers as the player's `SurveyScreen`, so the renderer never imports from the player bundle) and `PaperEntryForm.tsx` (one response at a time).
- Facilitate: `routes/facilitate/SurveysTab.tsx` in `SidePanel`, and the post-ENDEX checklist in `FacilitateParts.tsx`.
- Scenario page: "Surveys" section summary with counts and a link.

### Export

- `templates/export/survey.html` (printable form: title, intro, marking, sections, questions with 1–5 boxes, option boxes, lined text areas, "Return to the facilitator" footer) and `survey-results.html` (summary). `src/main/export/surveys.ts`: `surveyFormView`, `surveyResultsView`. New targets `surveys_pdf` (every ready participant-facing survey as a form in players/ and facilitator/; debrief forms in facilitator/ only) and `survey_results_pdf` (facilitator/ only, when any responses exist). `docx` adds the Participant Feedback Form as DOCX (HSEEP ships it as Word). `naming.ts`: `surveyForm(surveyId)`, `surveyResults`; `zip.ts playerFileNames` allows the participant survey forms by name (never results or debriefs). The Excel writer (#420) gains a "Survey results" sheet when results exist.

### Migration of existing projects

New folder and files only; no change to `scenario.json`, `facilitator.json` or the formats. Older builds ignore `scenarios/<id>/surveys/`. `AppSettings.surveys` defaults in. Duplicating a scenario copies `surveys/*.json` and not the `.responses.jsonl` files. Example projects ship the HSEEP Participant Feedback Form instantiated and the two confidence surveys generated, no responses.

## Security and privacy

Responses are anonymous by construction: the schema has no identity fields, timestamps are rounded to the minute, text answers are shown shuffled and only above the response threshold, and the live feature module drops the sender's seat and any display name before mirroring (a `named` session, 0418, still yields anonymous survey responses). The phone page is the live-play player page: served only while a session the facilitator started is running, content end-to-end encrypted (0406), size limits and per-client rate limits applied by the protocol layer, nothing bound at rest (0418). `fromWireResponse` validates with zod, ignores unknown question ids and accepts one response per client per delivery (a second submission replaces the first by message id, never adds). Response files are append-only JSONL written with the atomic helpers; the facilitator can delete a survey's responses explicitly. Nothing leaves the computer except the `survey_items` prompt to the configured text provider and, during a live session, the encrypted session traffic 0410 describes to the facilitator before Start.

## Testing

- Unit: `schemas/survey.test.ts` (every template file parses; knowledge-check options need a `correctOptionId`), `surveys/summarize.test.ts` (means, medians, distributions, pairing by `pairKey`, suppression under the threshold, shuffle stability, share correct), `surveys/store.test.ts` (append, read, duplicate copies definitions only), `surveys/from-items.test.ts` (shared ids across editions; dropped citations drop items), `live/surveys.test.ts` (wire mapping both ways against the 0406 schemas in `src/shared/live/schemas/`, correct answers and citations stripped, unknown question ids ignored, one mirror per message id, replay idempotent, sender identity dropped), `shared/survey-layout.test.ts`, `surveys/templates.test.ts` (ids, versions), handler tests, `export/surveys.test.ts`, `zip.test.ts` (forms allowed in players/, results and debriefs refused), component tests for `SurveyPreview`, `PaperEntryForm` and the player's `SurveyScreen` (keyboard-only completion, required enforcement, role group optional).
- Golden / fixture: `tests/content/surveys-scenario-3.test.ts` builds the confidence and knowledge-check surveys from the Scenario 3 fixture with a mock `SurveyItemsOutput` fixture that cites TIRP 13.6 and 13.7 and ASP 6.4, asserts every citation heading exists in `reference/ncia/`, and compares the printable form text with `tests/fixtures/surveys/scenario-3.feedback-form.md` (golden). The HSEEP template's Part I statements are compared with the FEMA Participant Feedback Form wording in `packs/documents/core/hseep-templates/Participant-Feedback-Form_Conduct.docx` by a one-time review noted in the fixture header, not by a test that parses the docx.
- E2E: `e2e/surveys.spec.ts` (mock provider): create the feedback form from the template, add a question, export `surveys_pdf`, enter three paper responses, see the summary; generate items and check the two confidence surveys exist with paired statements; then with `e2e/live/helpers.ts` (0418: `startSession`, `openPlayers`) start a survey-only session, open two phone-sized players, answer the feedback form on each, see the count reach 2 (details still suppressed below 3), end the session and confirm the listener is gone; confirm the results PDF is in facilitator/ only.
- Packaged smoke: `e2e/packaged.spec.ts` renders one survey form PDF.
- Live (`LIVE=1`): `tests/live/surveys.live.test.ts` runs `survey_items` through LM Studio on the sample run and writes the surveys for review.

## Tasks

1. **Schemas, templates and store.** `src/shared/schemas/survey.ts`, `schemas/index.ts`, `schemas/settings.ts` (`surveys.minResponses`), `surveys/templates/*.json` (six templates), `src/main/surveys/templates.ts`, `surveys/store.ts`, `scenario/layout.ts`, `scenario/manage.ts` (duplicate), tests, `docs/05-DATA-MODEL.md`.
2. **Summaries.** `src/main/surveys/summarize.ts`, tests; `docs/guides/methodology.md` gains "Participant feedback and confidence".
3. **IPC and handlers.** `src/shared/ipc/surveys.ts`, `ipc/index.ts` (channels and `surveys:response-added` event), `ipc/handlers/surveys.ts`, tests.
4. **Builder and results UI.** `src/shared/survey-layout.ts`, `routes/surveys/{index.ts,SurveysPage,SurveyEditor,SurveyResults,SurveyDeliveryDialog,SurveyPreview,PaperEntryForm}.tsx`, `surveys.css`, Scenario page section, component tests, `e2e/surveys.spec.ts` (builder and paper entry parts).
5. **Scenario-specific items.** `prompts/survey_items.md`, `schemas/generation.ts` (`SurveyItemsOutput`), `schemas/scenario.ts` (`'survey_items'` stage), `src/main/surveys/from-items.ts`, `generate/engine.ts` (on-demand step), mock fixture, tests, `docs/guides/prompts.md`.
6. **Printable forms and results export.** `templates/export/survey.html`, `survey-results.html`, `src/main/export/surveys.ts`, `documents.ts`, `docx.ts` (feedback form), `naming.ts`, `run.ts`, `zip.ts`, `src/shared/ipc/export.ts` (`surveys_pdf`, `survey_results_pdf`), `routes/export/targets.ts`, Excel sheet hook (#420), tests.
7. **Live and QR delivery.** After 0411 and 0417 tasks 1–2 have landed: `src/main/live/surveys.ts` (wire mapping, mirroring, replay), `src/player/features/surveys/SurveyScreen.tsx` and its outbox use, `surveys:open-live` / `surveys:close-live` handlers, the survey-only start option in `live:session-start` (coordinated with 0411), `routes/facilitate/SurveysTab.tsx`, `FacilitateParts.tsx` checklist, tests, `e2e/surveys.spec.ts` (live part using `e2e/live/helpers.ts`), a short ADR `docs/adr/NNNN-surveys-anonymous-by-construction.md` at the next free number (0024 is taken by live play).
8. **AAR feed, fixtures and docs.** `src/main/aar/sources/surveys.ts` (#419) consumes `summarizeSurvey`; `tests/content/surveys-scenario-3.test.ts`, `tests/fixtures/surveys/`; example projects get the feedback form and confidence surveys; `README.md` feature list; `docs/guides/getting-started.md` "After the exercise".

## Implementation notes (first PR)

Built: schemas, templates, store, summaries, IPC, the builder / preview / results / paper-entry UI, printable forms and the results PDF through the export path, the Settings threshold, the AAR feed and the live-delivery seam. Where the code differs from the design above, and why:

- **Schema additions.** `Survey.roleGroups` holds the team names offered when `askRoleGroup` is on (filled from the scenario's role teams; editable). `SurveyResponse` is a strict object, so a request carrying any identity field is refused rather than trimmed; `deliveryId` is a base64url string (0406 `Base64Url22`), not a `SafeId`. `SurveyResponseInput` is the paper/manual request shape. `SurveySummary` gains `edition`, `byRoleGroup` (only when asked and above the threshold), `minResponses`, per-question `suppressed`, `otherTexts` and `citation`, and a `knowledge[]` list (share correct per item before and after, with its citation) instead of mixing shares into `pairs`. Until #421 lands `CoreCapabilityId`, `capability` is a free snake_case id (`SurveyCapabilityId`).
- **Threshold per question too.** A question answered fewer than `minResponses` times shows only its count even when the survey as a whole is above the threshold, and a before or after mean needs that side to reach it.
- **Paired editions.** The knowledge-check and confidence templates create both editions at once (`surveys:from-template` returns `{ surveys }`); saving one edition copies its sections into the other (`src/main/surveys/pairs.ts`). Without the `survey_items` stage, the confidence template seeds one statement per scenario objective deterministically (`statementsFromObjectives`), and the knowledge check starts empty for the designer to fill.
- **IPC.** Added `surveys:duplicate` and `surveys:delete-responses` (remove a mistyped paper form, or all responses); `surveys:add-response` returns `{ responseId, count }` so the form can offer "Remove the last entry". The push event is the existing `project:changed` with `what: 'surveys'` instead of a new `surveys:response-added`, so the renderer's targeted invalidation covers it.
- **Exercise record.** `scenarioSurveySummaries()` and `surveyEvidenceRef()` live in `src/main/surveys/results.ts`; #419's `aar/sources/surveys.ts` calls them. A before/after pair reports its comparison once, on the after edition.
- **Export.** `surveys_pdf` prints every survey marked **ready**, or the ones named in `export:run { surveyIds }` (the Deliver dialog's **Print form**). Forms go to `surveys/` in the export folder; `zip.ts` allows participant forms in `players/` by name and refuses debriefs and `Survey-Results.pdf`. The ZIP pulls in both survey targets. `scenario.json` carries the survey definitions.
- **ADR.** The anonymity decision is recorded now, in [ADR-0026](../adr/0026-surveys-anonymous-by-construction.md), since the paper path already depends on it.
- **Live seam.** `src/main/surveys/wire.ts` holds `toWireSurvey` and `fromWireResponse` with local zod copies of the 0406 payloads (no transport, no sender parameter), until `src/main/live/` exists; the live work moves or imports them.

## Implementation notes (live delivery)

- **Module.** `src/main/live/surveys.ts` (`LiveSurveys`) wraps `wire.ts`: `open` sends one `survey.open` per target, `onResponse` checks the sender's seat against the targets, maps the payload with `fromWireResponse`, logs it and appends it to the response file; `close` and `closeAll` (session end) log the close. IPC: `surveys:open-live`, `surveys:close-live`, `surveys:live-status` (spec names), and `surveyOnly` on `live:session-start`.
- **Anonymity.** The log entry is `{ kind: 'survey.response', actor: { kind: 'client' }, ref: { surveyId: deliveryId }, data: { responseId, answers } }`: no `clientRef`, seat or name. A device's second answer reuses its response id (replace); that map is memory only. A cap of 5000 answers per opening.
- **Survey-only session.** `Seats` gets `surveyOnly`: the only seat is "Participant" (the observer seat), `welcome.features` has only `surveys` on, `session.json` records `surveyOnly`, and responses are tagged `channel: 'qr'`. The player preselects the single seat and opens on More.
- **Scale labels.** `survey.open` has no label fields, so `toWireSurvey` appends "(1 = low label, 5 = high label)" to rating and confidence questions.
- **Player.** `src/player/features/surveys/` (`SurveysScreen`, `SurveyForm`, `SurveyBanner`, pure helpers); answers go through the outbox as `survey.response`. A draft that has not been sent is not kept across a reload (the spec's draft-in-outbox is dropped; sent answers are queued).
- **Facilitate.** `SurveySend` (Live tab section and the Deliver dialog) with `use-live-surveys`. The post-ENDEX checklist (`PostExerciseChecklist`) appears above the side panel once an ENDEX row is delivered: hot wash, participant feedback and the after-action report, each marked Done or To do in words (#494).
- **Replay.** `survey-replay.ts` puts back every logged `survey.response` the response file lacks, by response id, when a session is resumed or closed as ended (#494).
- **Not built.** Electron e2e for the Deliver dialog (the harness e2e `e2e/live/surveys.spec.ts` covers the player side with four devices).

Not built yet (follow-ups): task 5 (`survey_items` generation), the Participant Feedback Form as DOCX and the Excel "Survey results" sheet (#420), the Scenario 3 golden fixture test, and surveys in the example projects.

## Open questions

1. **Does this spec need its own QR encoder?** Recommendation: no. 0411 adds `qrcode` for the join code and the join QR is the survey QR; this spec adds no dependency.
2. **Should QR delivery work without a live session, through a small server of its own?** Recommendation: no second server. A survey-only live session (FR-7) keeps the "no listener at rest" rule, the encrypted protocol and the e2e loopback guard in one place. If live play slips past 0.6.0, QR delivery slips with it and the printable path ships first; tasks 1–6 do not depend on live play.
3. **Response threshold default.** Recommendation: 3, as a project-independent app setting, shown in the results view ("Details hidden until 3 responses") so a facilitator understands why a two-person room sees only counts.
4. **Where does the knowledge check's answer key go?** Recommendation: facilitator/ only, as a page appended to the results PDF and as the "Survey results" sheet; the player form never prints the key and `toWireSurvey` strips `correctOptionId` before anything reaches a device.
5. **Role group question.** Recommendation: off by default; when a designer turns it on the options are the scenario's teams, not roles, so a one-person role cannot be identified.
