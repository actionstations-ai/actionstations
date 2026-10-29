# Spec 0435: Translation and accessible player material

Issue: #435 · Milestone: 0.9.0 · Status: Draft · Depends on: #432 (text rendition of injects) · Related: #420 (HSEEP document set), #422 (surveys), #411 (player web page), ADR-0007 (structured output), ADR-0012 (inject stages)

## Summary

A scenario can carry a second language for the material players see, Spanish first: the Player Briefing Packet, the Player Handouts and the text of injects handed to players, later the surveys of #422. The translation runs through the user's configured text provider, and nothing in a translated language is exported until a person has reviewed it (or the export is stamped as unreviewed). Player packets also become screen-reader friendly (tagged PDFs with language, headings, real text for every inject image) and get a large-print variant.

## Current state (checked 2026-10-28)

- The renderer has no i18n layer: UI strings are English literals, `src/renderer/index.html` and `templates/export/layout.html` declare `lang="en"`, and `src/main/export/documents.ts` formats dates with `'en-US'`. Dates elsewhere use the OS locale through `toLocaleString(undefined, …)`.
- `project.json` has a "Brand and locale" section (city, region, colors), but no language field.
- Export PDFs are already printed with `generateTaggedPDF: true` and `generateDocumentOutline: true` (`src/main/export/pdf.ts`). Inject media PDFs (`renderPdf` in `src/main/render/window.ts`) are not tagged.
- Deck inject images carry `alt` text like "`tweet for inject I-07: <title>`" (`src/main/export/views.ts`), not the inject's words.
- There is no survey feature yet (#422).

## Requirements

### User stories

- As an exercise planner in a bilingual county, I want the player briefing and the injects players read in Spanish as well as English, so that Spanish-speaking staff and partners take part fully.
- As the planner, I want to review and correct every translated sentence before it is printed, so that no machine error reaches players.
- As a player who uses a screen reader, I want the briefing packet and injects as accessible PDFs, so that I can read the same material as everyone else.
- As a player with low vision, I want a large-print packet, so that I can read it without magnification.
- As a controller, I want my handbook to stay in English unless I ask, so that translation costs no time on material players never see.

### Functional requirements

**Languages and scope**

- **FR-1** A scenario has `languages.player`: a list of extra player languages, initially at most one, from `SupportedLanguage` (`es` only in this release). English stays the source language of every scenario.
- **FR-2** Translatable player material: the Player Briefing Packet (`documents.briefing`), the Player Handouts (`documents.handouts`), and every inject whose MSEL row goes to players (any delivery mode except controller-only rows: rows whose recipients are all controller/SimCell roles are skipped). Controller material (MSEL, deck notes, handbook, controller handouts, SimCell scripts) is translated only when the user ticks **Also translate controller material** (FR-12). Surveys join the set when #422 lands.
- **FR-3** For an inject, only human-language string fields are translated. A field is kept verbatim when its JSON Schema has `enum`, `const`, `pattern`, `format`, a non-string type, or `"x-translate": false`; templates mark identifiers, handles, codes, phone numbers, URLs, times and proper names this way. Ajv runs with `strict: false` (`src/main/render/templates.ts`), so the annotation needs no schema change for existing templates, and the pack checker already ignores unknown keywords.
- **FR-4** Template chrome (static labels such as "What should I do?" or "Reply") is translated through an optional `labels/es.json` file in the template folder and a new `t` helper (`{{t 'what_to_do'}}`) that falls back to the English text written in the call (`{{t 'what_to_do' 'What should I do?'}}`). Templates without Spanish labels render Spanish field text inside English chrome; the review screen lists them so a planner can decide.

**Translation and review**

- **FR-5** **Translate** on the scenario's new **Languages** panel starts a background job (`translate:run`) that translates every item in scope through the text provider routed to the new task `translate` (falls back to the `draft` route when unset). It uses structured output (ADR-0007): for documents, Markdown in → Markdown out with headings, lists and tables preserved; for injects, a JSON object with exactly the translatable keys of FR-3.
- **FR-6** The prompt `prompts/translate.md` (a new stage the app ships, so packs and users can override it) tells the model to translate for a Spanish-speaking US audience (`es-US`), keep names of people, organizations, places, systems and codes unchanged, keep numbers, times and units, translate the exercise marking only through the glossary (default "EXERCISE" → "EJERCICIO", see Open question 3), and never add content. A project glossary (FR-8) is passed as a list of fixed term pairs.
- **FR-7** Every translated item stores the source hash it was made from and a status: `machine` (fresh from the model), `reviewed` (a person accepted it), `stale` (the English source changed after translation, detected by hash like `src/main/generate/inject-stale.ts`). Editing the translation sets `reviewed`.
- **FR-8** The **Languages** panel lists every item with its status, opens a side-by-side review editor (English on the left read-only, Spanish on the right editable, per field for injects, per section for documents), and offers **Accept**, **Accept all in this document**, **Retranslate** (one item) and a project glossary editor (`project.glossary.es`: term → translation, at most 500 entries) whose terms are checked: a translation that does not use a glossary term where the source has it is flagged.
- **FR-9** Translated inject media are rendered from the same template with the translated fields, `lang="es"` on the template root, and labels from `labels/es.json`, stored as separate assets with `lang: 'es'` in their provenance. AI-generated photographic images are reused, not regenerated. Text-bearing media stay template-rendered (Project rules 5).

**Export**

- **FR-10** The Export screen gets **Player material language**: English, Spanish, or Both. Spanish files go to `players/es/` in the ZIP and carry `-es` in their names (`naming.ts`); "Both" also writes the English set as today. The `players/` allow-list in `src/main/export/zip.ts` grows to include the language folders, and `assertPlayersOnly` still refuses any controller file.
- **FR-11** Export of a language with items in `machine` or `stale` status is refused with a list of the items, unless the user ticks **Export unreviewed translation**, which prints "Traducción automática sin revisar / Unreviewed machine translation" in the footer of every affected page.
- **FR-12** Optional controller translation: the handbook and controller handouts in Spanish, same review rules, output to `facilitator/es/`.
- **FR-13** Export documents use the export strings file of the target language (`templates/export/strings/es.json`: "Player Briefing Packet", "From", "To", "Page", dates) and format dates and times in that locale (`Intl.DateTimeFormat('es-US')`).

**Accessibility**

- **FR-14** Every exported player PDF (both languages) is tagged and sets: `lang` on `<html>` (Chromium writes it as the PDF's `/Lang`), a `<title>` (PDF Title), one `h1` and a heading order without gaps, table headers with `scope`, lists as lists, and decorative images with `alt=""`.
- **FR-15** Inject images in player material get the inject's text rendition (#432 FR-13) as real text: a visually hidden block after the image in the regular packet (so a screen reader reads the words, not a description of a picture), and visible text in the large-print variant. The `alt` attribute is a short label ("Social media post from @RiverbendWater, 10:42").
- **FR-16** Inject media PDFs rendered for players (`renderPdf`) are printed with `generateTaggedPDF: true` and the template's text as tagged content, with `lang` set.
- **FR-17** **Large print**: an Export option writes `*-large-print.pdf` for the briefing, handouts and player injects: Letter, single column, body 18 pt minimum and headings 24 pt or more, sans-serif (the bundled UI font), line height 1.5, left aligned, no text set in images (inject images are shown full width and followed by their text rendition at 18 pt), high-contrast colors, no background images. Implemented as a `large-print` CSS layer in `templates/export/print.css`, not a separate template set.
- **FR-18** Right-to-left languages are not supported in this release; `SupportedLanguage` stays left-to-right only.

### Non-functional requirements

- **NFR-1** Cost: translation uses the user's configured provider, local by default (LM Studio, Ollama); no translation API or account is added (Project rules 1, 4).
- **NFR-2** Privacy: text goes only to the provider the user routed `translate` to; the Languages panel names it before **Translate** runs. With a cloud provider, the same warning as other cloud stages applies (#433 preview/redaction when it lands).
- **NFR-3** Accessibility: WCAG 2.2 AA for the new screens (review editor fully keyboard operable, both columns labelled with their language via `lang` attributes so screen readers switch voices); exported PDFs pass the veraPDF PDF/UA-1 profile with no errors other than ones listed as known Chromium limitations in the guide; the large-print variant follows APH / ACB large-print guidance (18 pt minimum).
- **NFR-4** Performance: translation of a 40-inject scenario with a local 30B model finishes within the time of the `inject_text` stage for the same scenario; the job is resumable like other generation jobs.
- **NFR-5** Quality: a `LIVE=1` test translates the reference example and checks glossary use, untouched codes and field coverage.

### Out of scope

- Translating the app's own UI (no i18n framework in the renderer for now).
- Right-to-left scripts, CJK fonts, languages other than Spanish (the data model allows them later).
- Spanish speech for audio injects (depends on TTS voices; a later issue).
- Translating source documents or retrieval in Spanish.
- Spanish versions of FEMA ICS forms (players' blank ICS 201/203 stay English).

## Design

### Data model

`src/shared/schemas/scenario.ts`:

```ts
export const SupportedLanguage = z.enum(['es'])
export const TranslationStatus = z.enum(['machine', 'reviewed', 'stale'])

export const DocTranslation = z.object({
  path: RelPath,                 // documents/briefing.es.md
  sourceHash: z.string(),
  status: TranslationStatus,
  updatedAt: IsoDateTime,
})

// Scenario gains (optional, so older files parse; ADR-0016):
languages: z.object({
  player: z.array(SupportedLanguage).max(1).default([]),
  controller: z.boolean().default(false),
}).default({ player: [], controller: false }),
translations: z.record(SupportedLanguage, z.object({
  documents: z.record(z.enum(['briefing', 'handouts', 'handbook', 'controller_handouts']), DocTranslation).default({}),
})).default({}),
```

`src/shared/schemas/inject.ts` (Inject is a loose object):

```ts
export const InjectTranslation = z.object({
  title: z.string(),
  fields: z.record(z.string(), z.unknown()), // only translatable keys
  sourceHash: z.string(),
  status: TranslationStatus,
  assets: z.array(MediaAsset).default([]), // translated renders
  updatedAt: IsoDateTime,
})
// Inject gains: translations: z.record(SupportedLanguage, InjectTranslation).default({})
```

`src/shared/schemas/project.ts`: `glossary: z.record(SupportedLanguage, z.array(z.object({ term: z.string().max(200), translation: z.string().max(200) })).max(500)).default({})`.

`src/shared/schemas/provider.ts`: `'translate'` added to `PROVIDER_TASKS`; routing resolution falls back to `draft`.

`src/main/render/templates.ts` `TemplateMeta`: no change; `labels/<lang>.json` is an optional file read beside `template.html` (allowed `.json` under `templates/<type>/` in packs).

### Main process

- `src/main/translate/scope.ts`: which items are in scope (FR-2), with the controller-only row rule.
- `src/main/translate/fields.ts`: translatable keys from a template schema (FR-3); merges translated keys back over the source fields.
- `src/main/translate/job.ts`: the `translate:run` job (jobs manager, resumable), one provider call per document section and per inject; validates inject output against the schema with Ajv before storing.
- `src/main/translate/stale.ts`: source hashes and stale marking, run on scenario and inject saves.
- `src/main/translate/glossary.ts`: glossary check.
- `prompts/translate.md` with frontmatter; registered as a stage in `src/shared/schemas/scenario.ts` `STAGES` (so pack prompt overrides apply) but not run by the main generation pipeline.
- Render: `src/main/render/compose.ts` gains the `t` helper and a `lang` input; `labels/<lang>.json` loaded with the template (size cap 64 KB, flat string map, checked by `checkTemplateFiles`).
- Export: `src/main/export/documents.ts` takes a `lang`, loads `templates/export/strings/<lang>.json`, formats dates per locale, sets `<html lang>`; `views.ts` adds the text rendition to inject figures; `naming.ts` adds `-es` and `-large-print`; `zip.ts` allow-list per language; `src/main/render/window.ts` `renderPdf` adds `generateTaggedPDF`.
- Large print: `templates/export/print.css` `.large-print` layer and a `largePrint` flag on the document model.

### IPC (`src/shared/ipc/translate.ts`)

| Channel                   | Purpose                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `translate:status`        | items in scope with status, for one scenario and language                           |
| `translate:run`           | start the job (all, or listed item ids; `retranslate: true` ignores reviewed items) |
| `translate:save-item`     | save an edited translation (sets `reviewed`)                                        |
| `translate:accept`        | mark items reviewed                                                                 |
| `translate:set-languages` | scenario `languages`                                                                |
| `project:glossary:set`    | glossary for one language                                                           |

`export:run` gains `playerLanguages: ('en' \| 'es')[]`, `largePrint: boolean`, `allowUnreviewed: boolean`, `controllerLanguages`.

### Renderer

- `src/renderer/src/routes/scenarios/LanguagesPanel.tsx` (list, statuses, Translate, provider name).
- `src/renderer/src/editors/translation/TranslationEditor.tsx` (side by side, per field / per section, `lang` attributes, keyboard shortcuts for Accept and next item).
- `src/renderer/src/routes/project-home/GlossaryEditor.tsx` beside the vocabulary editor.
- `src/renderer/src/routes/export/`: language, large-print and unreviewed options.

### Templates

- Built-in templates get `"x-translate": false` on identifier fields (handles, ids, codes, phone numbers) and `labels/es.json` for player-facing paper and notice types first: `boil_water_notice` (which already carries the EPA Spanish line), `incident_alert_notification`, `reunification_notice`, `press_release`, `memo`, `official_letter`, `text_message`, `email`, `rider_service_alert`, `downtime_notice`, `cap_alert` (#432, fills its `infoEs` block).
- `docs/guides/templates.md`: "Translation" section (`x-translate`, `labels/<lang>.json`, the `t` helper).

### Feasibility of tagged PDFs from Chromium

Chromium's `printToPDF({ generateTaggedPDF: true })` (Electron 45 in this repo) builds the structure tree from the accessibility tree: headings, paragraphs, lists, tables, figures with alt text and the document language. Known gaps to confirm with veraPDF during task 7: running headers and footers may not be marked as artifacts, and CSS-generated content is not tagged. The spec does not depend on full PDF/UA conformance; the acceptance bar is NFR-3 plus a manual NVDA and VoiceOver read-through of the reference packet, and the guide lists any gaps found.

## Security and privacy

- Text sent for translation goes only to the routed provider; documents and injects are already sent to the same provider during generation, so the exposure does not grow, but the Languages panel states the destination before each run.
- Model output is untrusted: inject translations are validated against the template schema; document translations are Markdown rendered with the existing escaping export pipeline (no raw HTML).
- `labels/<lang>.json` in pack templates is data only: a flat map of strings, size-capped, rendered escaped.
- Controller material never lands in `players/`; the allow-list test covers language folders.

## Testing

- Unit: translatable-key selection (enum, pattern, format, `x-translate`), merge back, scope rules (controller-only rows skipped), stale detection, glossary check, `t` helper fallback, export strings and date formatting for `es`, file naming, ZIP allow-list with `players/es/`, unreviewed refusal and footer stamp, large-print CSS class applied.
- Mock provider: `src/main/providers/mock/` returns deterministic "translations" (prefix `[es] `) so the job, editor and export run offline in CI.
- Template goldens: Spanish variants of the templates with `labels/es.json` (`preview.es.json` alongside `preview.json`, rendered by `pnpm test:templates`).
- e2e (`e2e/translation.spec.ts`): set Spanish, translate with the mock provider, refuse export with unreviewed items, accept all, export Both, check `players/es/` contents, open the PDF text layer and assert `lang` and the inject text are present.
- Accessibility: a script `scripts/check-pdf-accessibility.mjs` runs veraPDF (PDF/UA-1 profile) when installed and skips with a notice otherwise (like gitleaks in local CI); manual screen-reader checklist in the guide.
- Live (`LIVE=1 pnpm test -- tests/live/translate.live.test.ts`): translate the example scenario with LM Studio; check field coverage, codes untouched, glossary terms used.

## Tasks

1. **Schemas.** `SupportedLanguage`, `TranslationStatus`, scenario `languages`/`translations`, `InjectTranslation`, project `glossary`, `translate` task with draft fallback (`src/shared/schemas/{scenario,inject,project,provider}.ts`, `src/main/providers/resolve.ts`); schema tests.
2. **Translation core.** `src/main/translate/{scope,fields,stale,glossary,job}.ts`, `prompts/translate.md`, mock provider support, `src/shared/ipc/translate.ts`, `src/main/ipc/handlers/translate.ts`; unit tests.
3. **Review UI.** `LanguagesPanel.tsx`, `TranslationEditor.tsx`, `GlossaryEditor.tsx`; component tests.
4. **Template translation.** `t` helper and `lang` in `src/main/render/compose.ts`; `labels/<lang>.json` loading and checking (`src/main/render/templates.ts`, `src/main/packs/template-check.ts`); `x-translate` and `labels/es.json` for the first templates; Spanish goldens; templates guide section.
5. **Spanish export.** `templates/export/strings/{en,es}.json`, `documents.ts` language and dates, `naming.ts`, `zip.ts`, `run.ts`, export IPC and screen options, unreviewed refusal and stamp.
6. **Accessible packets.** Text rendition in `views.ts` and `deck.html`/`briefing.html` figures, `lang`/title/headings audit of `templates/export/*`, tagged `renderPdf` in `src/main/render/window.ts`, `scripts/check-pdf-accessibility.mjs`.
7. **Large print.** `.large-print` layer in `templates/export/print.css`, `largePrint` flag, naming; veraPDF and screen-reader pass recorded in the guide.
8. **Docs.** `docs/guides/translation-and-accessibility.md` (workflow, review rule, large print, known PDF gaps), Getting started export section, ADR "Player-language translation with mandatory review", CHANGELOG.

## Open questions

1. **Block unreviewed exports, or only stamp them?** Recommendation: block by default with the explicit "Export unreviewed translation" override and footer stamp (FR-11). A wrong instruction in a public-health or evacuation inject is the failure this feature must not cause.
2. **Which Spanish?** Recommendation: `es-US` (neutral US Spanish as used by FEMA and NWS Spanish products); a project setting for other variants later.
3. **Exercise marking in Spanish.** Recommendation: "EJERCICIO" for exercise markings, matching FEMA's Spanish usage; put it in the glossary defaults so planners can change it. Verify against FEMA Spanish exercise materials before release.
4. **Translate controller material at all in this release?** Recommendation: ship the option (FR-12) but leave it off by default; it reuses the same pipeline and costs little to build.
5. **Large print for controller material?** Recommendation: player material only in this release; controllers rarely need it, and the CSS layer makes adding it a one-line change.
