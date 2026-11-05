# Spec 0448: Toolkits — shared field expertise any scenario can use

Issue: #648 (epic) · Milestone: Backlog · Status: Draft · Related: #647 (meteorology, spec 0449), spec 0436 (maps), spec 0439 (hazard data), ADR-0014 (domain profiles), ADR-0018 (packs), ADR-0008 (template rendering)

## Summary

Expertise becomes a set of **toolkits** that any exercise can use, separate from the **domain** that describes the organization being exercised. A toolkit bundles what a field knows: its products and inject templates, data-driven figures (charts, plots, instrument displays, map overlays), connectors to public data that can replay a real past event, outside parties, reference documents, evaluation metrics, structured decisions players can make, and the knowledge the generator needs to write it correctly. Meteorology is the first field (spec 0449): a forecast-office domain plus a weather toolkit. Because toolkits compose, an airport exercise can use the weather toolkit's observations and aviation advisories, a farming exercise can use the flood toolkit's river forecasts and inundation maps, and each new field adds to what every other field can draw on.

## Requirements

### User stories

- As an airport exercise designer, I want METARs, TAFs and a thunderstorm moving toward the field in my scenario, without building a meteorology exercise.
- As an agricultural cooperative's planner, I want a flood scenario with river forecasts, gauge readings and an inundation map of our fields.
- As a meteorology instructor, I want to replay a real past outbreak, with the radar, soundings and storm reports of that day, at exercise speed.
- As a facilitator, I want each field's decisions scored the way that field scores them (warning lead time, evacuation timing, ground stop timing), in the after-action report.
- As the owner adding the next field, I want a checklist and a framework so a new field is mostly research and content, not new plumbing.

### Functional requirements

**Toolkits and composition**

- **FR-1 Toolkit definition.** A toolkit is pack content (`toolkits/<id>.json`, schema `ToolkitSchema`) with: id, name, description; `appliesTo` (hazard and threat keywords, domain ids); inject types and templates it adds; figure kinds and data connectors it uses (by id; their code ships in the app); outside parties; optional advisor roles a domain can add (for example "Meteorologist liaison"); document references (library packs); evaluation metrics (by id, with configuration); structured decision forms (FR-14); generator knowledge (glossary, product conventions, realism rules, as prompt fragments); lint rules (format checks such as VTEC or METAR syntax, from a fixed set of rule kinds). Packs stay data only (ADR-0018): anything that needs code is a built-in capability the toolkit names.
- **FR-2 Composition.** A project and each scenario carry a list of toolkits. A domain profile lists **suggested toolkits** (an airport suggests weather; agriculture suggests weather and flooding). When a scenario brief mentions a hazard a toolkit applies to, the generator proposes adding it, with a one-line reason; the user confirms. **Scenario settings → Toolkits** shows what is on, what each adds, and lets the user turn toolkits on or off.
- **FR-3 Generation.** The prompts of every stage receive the knowledge of the scenario's toolkits (capped like other context), inject type choices include the toolkits' types, outside parties include theirs, and the controller handbook lists the toolkits used and their data sources.

**Data-driven figures**

- **FR-4 Figure render path.** Besides template and AI image, an inject can be a **figure**: an image drawn by app code from data (a chart, an instrument display, a map with overlays). Figures are exact and reproducible, are never AI pixels (project rule 5), and are rendered through the same pipeline as templates (PNG for decks, embedded in PDFs and packets). A template can embed a figure (`{{{figures.radar}}}`) next to its text.
- **FR-5 Accessible figures.** Every figure produces a text summary (what it shows and the key values) used as alt text and in the screen-reader packet, and, where it is a chart, a data table available beside it.
- **FR-6 Built-in figure kinds.** Generic kinds every field can use: time series (one or more series, thresholds, annotations), bar and stacked bar, gauge and dial, status board (rows of colored states), table, annotated timeline, and map with overlays (FR-10). Field kinds come with their toolkits (weather: radar display, sounding, satellite, meteogram, model panel; flooding: hydrograph, inundation map).

**Case data and replay**

- **FR-7 Case data.** A scenario can carry **case data**: datasets indexed by time (series, geographic features, rasters, text products, reports), stored in the scenario folder with provenance for each dataset (source, retrieval date, license or terms, and whether it is **historical** or **simulated**). Injects reference case data by dataset and time, resolved when the inject renders.
- **FR-8 Replay of public data.** A toolkit's connectors can find and fetch a real past event by date and place (for weather: radar, soundings, storm reports, outlooks, hurricane advisories). The fetch happens once, with the user's consent and a size estimate, and the scenario then works offline. Data is labeled historical and dated wherever it appears; the generator is told it is history so it does not present it as current.
- **FR-9 Exercise time and case time.** The scenario maps exercise time to case time (a start offset, a speed factor, and the scenario's time jumps), so an inject at 1:15 into the exercise shows the case data of the matching moment. The facilitator view shows both clocks.
- **FR-10 Simulated data.** When there is no real event, a toolkit can generate consistent simulated case data from parameters (for example a storm track and intensity), labeled simulated everywhere it appears.

**Maps**

- **FR-11 Map overlays.** Maps draw case data: polygons (warning areas, watch boxes, outlook areas, flood extents), lines and tracks, cones and swaths, points (reports, gauges, assets), and rasters with a color scale (radar, model fields), with a legend and a time slider. The same overlays render into figure images and exports. Place areas already in the map data are drawn too.

**Decisions and evaluation**

- **FR-12 Evaluation metrics.** A toolkit names metrics from a built-in set and configures them; the evaluation and the after-action report show their results with the inputs used. The first built-in metrics: **decision timing** (lead time of a decision against a ground-truth event, with hit, miss and false-alarm counts, configurable windows and areas), **threshold timing** (an action taken before a modeled quantity crossed a threshold, such as evacuation start before tropical-storm-force winds), and **message consistency** (whether partners' messages agree on key facts, scored by the evaluator with the generator's help).
- **FR-13 Ground truth.** Historical case data provides ground truth directly (storm reports, observed river crest); simulated case data has its own.
- **FR-14 Structured decisions.** A toolkit can define decision forms players fill in during live play or the facilitator records in Facilitate (fields, choices, an optional map area drawn or picked from a list, a time), such as "Issue a tornado warning", "Order an evacuation" or "Request a ground stop". Decisions go into the session log and feed the metrics.

**Fields as data**

- **FR-15 Extensible threat families.** Threat families become data that domains and toolkits can add to (today a fixed list), with the phase arcs and inject purpose mix they imply. Existing families keep their ids.
- **FR-16 Adding a field.** A developer guide and a dossier template list what a field needs (scope, roles, systems, products, doctrine, data sources, figures, evaluation, threat families, reuse by other domains, an example project) and how to deliver it as a domain, a toolkit, or both.

### Non-functional requirements

- **NFR-1 Cost:** data sources are free public archives; nothing paid; connectors fetch only on the user's request.
- **NFR-2 Privacy:** connectors call only the archives the user chose for that scenario, after consent, with no keys; nothing is sent about the user's plans. Exercises run offline after the fetch (project rule 3).
- **NFR-3 Accessibility:** figures have text summaries and data tables (FR-5); map overlays have legends and keyboard-reachable layer lists; color scales meet contrast guidance or carry patterns.
- **NFR-4 Size:** case data limits per scenario (default 500 MB, adjustable), with what each dataset costs shown before fetching; rasters are cropped to the scenario's area and times.
- **NFR-5 Integrity:** historical data is never altered without saying so (NOAA's open data terms ask that modified data not be presented as original); simulated data is never presented as historical.

### Out of scope

- Running numerical models (weather or hydraulic) inside the app; simulated data uses simple parametric generators.
- Live data during an exercise (a session uses the case data fetched before it).
- Pack-provided code: figure kinds, connectors, metrics and lint rule kinds are app code; packs configure them.

## Design

- **Schema:** `src/shared/toolkits/schema.ts` (zod), `ToolkitSchema`; pack loader content type `toolkits`; registry like domains (`src/main/toolkits/registry.ts`). Project and scenario files gain `toolkits: string[]` (forward compatible, ADR-0016).
- **Figures:** `src/main/render/figures/<kind>.ts`, pure functions `(data, options) → { svg, summary, table? }`, using small charting helpers (d3-scale and d3-shape, MIT); rasters drawn to a canvas in the render window. Template context gains `figures`, computed in main beside `derived`.
- **Case data:** `scenarios/<id>/case/` with `manifest.json` (datasets, provenance, time mapping) and data files (GeoJSON, JSON series, PNG/WebP rasters with georeference, text). Inject fields reference `{ dataset, time | offset }`.
- **Connectors:** `src/main/toolkits/connectors/<id>.ts`, each with `estimate()`, `fetch()` and a fixture-backed contract test; network access through the existing provider-network rules for public sources (no keys), recorded in the hazard-data style log.
- **Maps:** overlay layers in the map view and the snapshot renderer, driven by case data.
- **Metrics:** `src/main/evaluation/metrics/<id>.ts`; results stored with the session record and shown in Evaluation and the AAR.
- **Decisions:** form schemas in the toolkit; a new live-play frame type for a structured decision (signed, sealed to the controller like other player frames), and a Facilitate entry form.

## Security and privacy

- Connector downloads are size-limited, type-checked and written only inside the scenario folder; archive URLs are fixed per connector, not taken from pack data.
- Pack lint rules and figure options are data validated by schema; regexes follow the existing pack regex rule.
- Decision frames carry no new personal data; the attribution setting applies as for votes.

## Testing

Schema and composition tests; golden images for each figure kind (like template goldens); case data time-mapping tests; connector contract tests with recorded responses and opt-in live tests; map overlay snapshot tests; metric tests with worked examples (including the NWS-style contingency table); live-play tests for decision frames; an end-to-end example per toolkit.

## Tasks

1. **#649** Toolkit schema, pack content type, registry, project/scenario composition, suggestions from domains and briefs, prompt knowledge (FR-1–FR-3).
2. **#650** Figure render path, generic figure kinds, accessible summaries and data tables (FR-4–FR-6).
3. **#651** Case data: storage, provenance, time mapping, inject references, consent and offline cache (FR-7–FR-10).
4. **#652** Map overlays with time slider, legends and export (FR-11).
5. **#653** Evaluation metrics framework with decision timing, threshold timing and message consistency; ground truth; AAR integration (FR-12, FR-13).
6. **#654** Structured decisions in live play and Facilitate (FR-14).
7. **#655** Extensible threat families (FR-15).
8. **#656** "Adding a field" developer guide, dossier template, suggested toolkits for existing domains (FR-16).

## Open questions

- **Next fields.** Weather is first (spec 0449). Recommendation for the next toolkits, because many domains need them: flooding and hydrology (river gauges, forecasts, inundation maps), then aviation operations and wildfire.
