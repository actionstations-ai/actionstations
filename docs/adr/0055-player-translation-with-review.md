# ADR-0055: Player-language translation with mandatory review

Date: 2026-10-29 · Status: Accepted · Issue: #435

## Context

Players in a bilingual county need the briefing, handouts and the injects they read in Spanish. A machine translation of an evacuation or boil-water instruction that is wrong and printed is the failure this feature must not cause. Players who use a screen reader also need the same material as tagged PDFs, and players with low vision need a large-print copy. The app's own screens stay in English.

## Decision

- **Source and scope.** English is always the source. A scenario lists at most one extra player language (`languages.player`, Spanish `es` first). In scope: the Player Briefing Packet, the Player Handouts and every inject whose MSEL row reaches a player (rows whose recipients are all controllers or the SimCell, and clock rows, are skipped). Controller documents are translated only when `languages.controller` is on.
- **Translation runs through the text provider routed to the new task `translate`**, which falls back to the `draft` route when unset. The Languages tab names the provider (and whether it is a cloud one) before **Translate** runs. The prompt `prompts/translate.md` is a normal prompt layer, so packs and users can override it. Output is structured; a document is Markdown in and out, an inject is a JSON object with exactly its translatable fields.
- **What is translated in an inject** is decided by its template's JSON Schema: a string field is kept as written when it has `enum`, `const`, `pattern`, `format`, `"x-translate": false`, or a `maxLength` of 8 or less (initials and codes). The merge writes back only translatable positions, so a model that changes a handle or time has no effect, and the merged fields are validated against the template's schema before they are stored.
- **Review state** is `machine`, `reviewed` or `stale`. Staleness is not stored: the hash of the English source (title and translatable fields, or the document text) is compared when the status is read. A person's edit sets `reviewed`. **Accept all** never accepts a stale item.
- **Export refuses unreviewed Spanish** (not translated, machine or stale) and lists the items, in the IPC handler before the job starts and again in the export job. **Export unreviewed translation** overrides it and stamps every page footer "Traducción automática sin revisar / Unreviewed machine translation".
- **Translated pictures** are rendered from the same template with the translated fields, `lang="es"` and the template's `labels/es.json` (a flat string map, 64 KB at most, checked by the template checker, read through a `t` helper that falls back to the English written in the call). They are rendered when a Spanish export runs, not when the text is translated, so they always match the reviewed text; the assets are stored on the inject's translation with `provenance.lang`. AI photographs are reused.
- **Chrome of export documents** comes from `templates/export/strings/<lang>.json`, a map from the English string to its translation (so the English stays at the call site and a missing entry falls back to it), and dates use `Intl` with `es-US`.
- **Layout of the ZIP.** Spanish files are written to `<folder>/es/` with `-es` in the name, so the ZIP has `facilitator/es/` for everything and `players/es/` for the Spanish player set. The `players/` allow-list names each language folder's files; a controller file there still fails `assertPlayersOnly`. "Spanish" alone leaves the English briefing and handouts out of `players/`.
- **Accessibility.** Every export is printed with tagged PDF output, `lang` on `<html>`, a `<title>`, one `h1`, headings without gaps and table headers with `scope`. Inject media PDFs (`renderPdf`) are tagged and carry `lang` and the inject title. Each inject picture in the deck and in the new **Player injects** document is followed by its words as real text (`sr-only` in the regular packet, visible in large print); the `alt` stays a short label.
- **Large print** is a `.large-print` CSS layer on the same templates (sans-serif, 18 pt body, headings 24 pt or more, line height 1.5, left aligned, one column, high contrast, no background images, the blank ICS form left out), written as `-large-print.pdf` beside each player document in each language.

## Consequences

- A Spanish export costs a review. The override exists for a planner who has been told the risk; every page says so.
- A template author who adds a human-readable string with a short `maxLength` gets it left in English; the author marks codes with `x-translate: false` and translated chrome with `labels/<lang>.json`.
- Translated renders are written during export, so exporting changes the inject files (the translation's `assets`). English exports do not.
- The exercise marking uses the glossary default "EXERCISE" to "EJERCICIO", and the default running marking in Spanish documents is "EJERCICIO — PARA USO EN ENTRENAMIENTO". Both need confirming against FEMA Spanish exercise material before release; planners can change the glossary entry and the exercise details' marking.
- PDF/UA conformance depends on Chromium's tagged output. The acceptance bar is the manual screen-reader read-through and `scripts/check-pdf-accessibility.mjs` (veraPDF, when installed); gaps found are listed in the guide.
