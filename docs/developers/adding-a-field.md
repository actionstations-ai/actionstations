# Adding a professional field

This guide is for developers who add a new field (flood response, epidemiology, spill response and the like) to Action Stations. It follows the toolkit framework as it is on `main`: the schema in `src/shared/toolkits/schema.ts`, the registries in `src/main/toolkits/`, and the ten fields that already use them. Flooding (`src/main/toolkits/flooding/`, `packs/toolkits/flooding.json`) and epidemiology (`src/main/toolkits/epidemiology/`, `packs/toolkits/epidemiology.json`) are the worked examples. The design is in [spec 0448](../specs/0448-toolkits.md), whose requirement FR-16 this guide answers. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) first, and see [Toolkits](../guides/toolkits.md) for how users see the result.

A field is delivered as data plus a small amount of registered code. Packs are data only, so anything that needs a program (a figure kind, a data connector, a generator, a metric, a lint rule) is app code that the toolkit names by id.

## 1. Decide: domain, toolkit or both

| Piece   | What it describes                                                                                       | File                       |
| ------- | ------------------------------------------------------------------------------------------------------- | -------------------------- |
| Domain  | The organization being exercised: its roles, systems, outside parties, threat families, inject types.   | `packs/domains/<id>.json`  |
| Toolkit | Expertise in a field that any organization can use: products, figures, data, decisions, metrics, rules. | `packs/toolkits/<id>.json` |

Ask two questions.

- **Would an organization in another domain need this expertise during an incident?** A county, a water utility, a farm and a school all act on a river forecast, so flooding is a toolkit. If yes, make a toolkit.
- **Does the field have its own organization, roles and incident types to exercise?** Flood response managers do, so flooding also has a domain. If yes, make a domain.

Flooding and epidemiology are both. A field with only a domain (a new kind of organization that borrows existing toolkits) needs the domain file, the dossier and the suggestions in step 12. A toolkit with no domain (media environment, spill and plume) lists the domains it suits in `appliesTo.domains` and is proposed to them.

The toolkit id is a lowercase slug (`ToolkitId`: `^[a-z][a-z0-9_]{0,63}$`) and is also the file name. Use the same slug for the domain when you make both.

## 2. Write the research dossier

Copy [`docs/research/domains/TEMPLATE.md`](../research/domains/TEMPLATE.md) to `docs/research/domains/<id>.md` and fill every section before writing code. The dossier is where you decide what the field needs, mark what you checked against a primary source and what you did not, and note each data source's terms. The pack's content (glossary, product conventions, realism rules, thresholds) must trace back to it. Dossiers to model on are [flooding](../research/domains/flooding.md) and [epidemiology](../research/domains/epidemiology.md); [the fields catalog](../research/fields-catalog.md) shows where your field sits among the others.

## 3. Pack files

A field's pieces map to these files. The mapping is checked at build time, so a missing or doubled item fails the build.

| File                            | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `packs/domains/<id>.json`       | The domain profile (`DomainProfile` in `src/shared/domains/schema.ts`).  |
| `packs/toolkits/<id>.json`      | The toolkit (`ToolkitSchema` in `src/shared/toolkits/schema.ts`).        |
| `templates/injects/<type>/`     | One folder per inject type the field adds (step 4).                      |
| `packs/bundled.json`            | The pack entry that maps the files above into a bundled pack.            |
| `packs/readmes/<name>.md`       | The pack's README; `<name>` is the pack id without `ai.actionstations.`. |
| `packs/documents/manifest.json` | The reference documents and the field's library pack (step 3.4).         |

### 3.1 The toolkit file

`packs/toolkits/flooding.json` shows every part. The fields of `ToolkitSchema`:

- `appliesTo.keywords` and `appliesTo.domains`: when the toolkit is proposed (lower-case brief words; domain ids it suits). `suggestToolkits` in `src/shared/toolkits/compose.ts` reads them.
- `injectTypes`: ids of the templates the toolkit adds, which ship in the same pack.
- `figureKinds`, `connectors`, `lintRules` and each `metrics[].id`: ids of registered code. `unknownCapabilityWarnings` in `src/main/toolkits/capabilities.ts` returns one sentence for every id the app has no code for. At load time that is a warning; your wiring test (step 14) asserts there are none.
- `metrics[]`: `{ id, label, config, groundTruth?, series? }`. `groundTruth` and `series` are case dataset ids that your generator writes (step 7).
- `decisionForms[]`: the structured decisions players make (step 10).
- `outsideParties`, `advisorRoles`, and `knowledge` (`glossary`, `productConventions`, `realismRules`): what the generator is told. `toolkitKnowledge` caps the total at `KNOWLEDGE_PER_TOOLKIT_CAP` and reports truncated lines; keep the field under the cap without cutting (`flooding/pack.test.ts` asserts it).
- `documents[]`: references to documents in the field's library pack, each `{ packId, documentId, title }`.
- `capabilities[]` and `exerciseTags[]`: FEMA Core Capability notes and program exercises (epidemiology uses both for the public health program exercises). Optional.

### 3.2 The domain file

`packs/domains/<id>.json` follows `DomainProfile`. The parts that connect a domain to the framework:

- `injectTypes`: the types that fit best, offered first.
- `threatFamilies`: ids the domain can exercise; the first is the default. Built-in ids are in `THREAT_FAMILY_IDS`.
- `addedThreatFamilies`: new families the domain defines (step 11).
- `suggestedToolkits`: toolkit ids proposed for this domain (step 12). `src/main/toolkits/scenario.ts` reads it.

### 3.3 The bundled pack entry

Add an entry to `packs/bundled.json` (schema `BundledMap`; see [packs-format.md](../packs-format.md#packsbundledjson)). The id is `ai.actionstations.<name>`.

- Flooding is one pack, `ai.actionstations.flooding`, with `contents.domains`, `contents.toolkits` and the six `contents.templates` it adds.
- Epidemiology is two packs: `ai.actionstations.toolkit-epidemiology` (the toolkit and its seven templates) and `ai.actionstations.epidemiology` (the domain). Split them when the toolkit should be used and updated apart from the domain.
- Every template is mapped to exactly one pack.

Put the README at `packs/readmes/<name>.md` (`packs/readmes/flooding.md`, `packs/readmes/toolkit-epidemiology.md`); `scripts/build-bundled-packs.mjs` fails when a README names no pack. Check the mapping with `node scripts/build-bundled-packs.mjs`. The same check runs in `src/main/ipc/handlers/packs-bundled.test.ts`.

### 3.4 Reference documents and the library pack

Documents live in a catalog-only library pack, `ai.actionstations.<id>-library`, defined in `packs/documents/manifest.json` (schema `DocumentsManifest`; field table in [packs-format.md](../packs-format.md#reference-documents-and-library-packs)).

1. Add `libraries.<id>-library` with `name`, `summary`, `domain` and `version`.
2. Add one `documents[]` entry per document with `pack`, `slug`, `file`, `title`, `publisher`, `edition`, `url`, `landing`, `license` and `basis`. Only public-domain documents go in: `license` is `LicenseRef-US-Government-Work` (US federal works, 17 U.S.C. section 105) or `CC0-1.0`, and `basis` says why. Verify the licence yourself on the publisher's page: a file on an agency site can still be a contractor's copyrighted work or carry a third-party notice. Copyrighted references go in `links[]` with a `reason`, and are never bundled.
3. Pin the bytes. `node scripts/fetch-documents.mjs --only <slug,...> --pin` downloads into `.cache/documents/` and records `sha256`, `size` and `pinned`. Later runs refuse any file whose hash differs; `--repin <slug>` accepts a new edition after you have checked it, and the library `version` goes up.
4. Build the library: `node scripts/build-library-packs.mjs --only <id>-library`.
5. Reference each document from the toolkit's `documents[]` with `packId` `ai.actionstations.<id>-library` and the document `slug` as `documentId`. Flooding lists `nws-manual-10-950` and `nws-instruction-10-922` this way.

## 4. Templates and goldens

Each product the field adds (a flood forecast discussion, an exposure notice) is an inject type with a template folder, `templates/injects/<type>/`, holding `meta.json`, `schema.json`, `preview.json`, `template.html`, `style.css` and `__golden__/<variant>.png`. The folder contract, helpers and golden workflow are in the [template authoring guide](../guides/templates.md). For a field, note these points.

- **The taxonomy block is in `meta.json`.** `templates/injects/nws_hydrologic_product/meta.json` carries `taxonomy.category`, `render` and `defaultDelivery`, so a pack template needs no edit to `src/shared/taxonomy.ts`. `flooding/pack.test.ts` fails when a toolkit's inject type has no template folder or no `taxonomy` block.
- **Project rule 5 applies.** Text that players must read (a warning, a notice, a board) renders from the template as HTML, never as AI-drawn pixels. AI images are for scenes.
- **A golden for every variant.** Run `pnpm build:app && pnpm test:templates`, inspect `.tmp/golden-diff/<type>--<variant>.actual.png` at full size, then copy it into `__golden__/`. Never regenerate a golden to turn a test green without reading the diff.
- **Reuse before adding.** The flooding domain reuses `nws_weather_warning`, `cap_alert` and `ics_213_general_message`; add a new type only for a product the field really has.

## 5. Figure kinds

A figure is a pure function from data to an SVG, a plain-language summary and a data table. The contract is `FigureKind` in `src/main/render/figures/types.ts`: `kind`, a zod `schema`, a pure `render(data, options)` returning `{ svg, summary, table? }`, and an optional `defaultHeight`. The same data must give byte-identical output: no random ids, dates or locale-dependent formatting (use the helpers in `svg.ts` and `axis.ts`).

1. Put the field's kinds in their own folder: `src/main/render/figures/flood/` (`hydrograph.ts`, `gauge-summary.ts`, `river-profile.ts`, `rain-stage.ts`) or `src/main/render/figures/epi/`.
2. The folder's `index.ts` calls `registerFigureKind` for each kind (see `flood/index.ts`). `registerFigureKind` in `registry.ts` throws when a different kind object already uses the id, so ids are global. Prefix them with the field unless the kind is meant to be shared; `hydrograph` is shared with the weather toolkit on purpose.
3. Import the folder from `src/main/render/figures/index.ts`, one import line per field (`import './flood'`). Nothing else loads it.
4. Add the kind ids to the toolkit's `figureKinds`.
5. For a preview, add a variant to `templates/injects/figure/meta.json` (it lists `hydrograph`, `flood_gauge_summary`, `river_profile` and `rain_stage`) with its golden.
6. Test it: `src/main/render/figures/flood/flood.test.ts` checks that the kinds register beside the generic ones, that the SVG is accessible and identical twice, that the table and summary agree with the drawing, and that bad data is refused.

Figures reach an inject through `fields.figures.<name>` as `{ kind, data }`. `computeFigures` in `figures/index.ts` renders them and throws a `VALIDATION` error naming the figure when the data is wrong, so nothing half-drawn ships. Every figure carries its numbers as text (summary and table) so it works for screen readers and in print.

## 6. Case-data connectors

A connector fetches a real past event from one public archive. The contract is `Connector` in `src/main/toolkits/connectors/registry.ts`: `id`, `label`, `source`, `terms`, `hosts`, a pure `estimate(query)` and `fetch(query, ctx)`.

- **Fixed hosts.** `hosts` is a list of https hostnames written in the connector file. They never come from pack data, the renderer or the query. `registerConnector` validates them and `ctx.get` refuses any other host. `nwps.ts` uses `api.water.noaa.gov`.
- **Estimate, then fetch.** `estimate()` makes no network call; it tells the user what each dataset costs before they agree. `fetch()` runs only after consent and reads through `ctx.get`, which counts bytes against the scenario's limit.
- **No keys and no personal data.** Query only for the user's chosen place and period (project rule 3).
- **Say what you changed.** Return `modified` when you cropped or resampled and `citation` for the source. The framework adds provenance (historical origin, retrieval date, terms). Historical data is never altered without saying so.
- **Pin the service.** `nwps.ts` is pinned to API v1, so a change at the service is a change in the file. Parse responses with a zod schema (`z.looseObject`, so a new field does not break it) and handle the service's own missing-value codes (`MISSING = -900` in `nwps.ts`).
- **Register it.** Flooding's connectors are in `BUILTIN` in `src/main/toolkits/connectors/index.ts`, registered by `registerBuiltinConnectors()`. Epidemiology's `cdcNwss` and `cdcNndss` are registered in `epidemiology/register.ts` with `hasConnector` and `registerConnector`. Both ways are idempotent. Add the ids to the toolkit's `connectors`.
- **Test it twice.** A unit test replays recorded responses from `src/main/toolkits/connectors/__fixtures__/` (`flood-connectors.test.ts`, `cdc.test.ts`). An opt-in live test runs only with `LIVE=1` (`flood-connectors.live.test.ts` uses `describe.skipIf(!live)`). Record fixtures from real responses and keep them small.

## 7. Simulated generators

When no archive can give the exercise what it needs (a forecast that changes, an outbreak, a plume), write a generator. The contract is `SimulatedGenerator` in `src/main/case-data/generators.ts`: an `id`, a `label`, a zod `params` schema and a pure, deterministic `generate(params)` returning datasets. Use simple parametric code, not numerical models.

- **Labelled simulated.** The framework writes the provenance: origin is always `simulated`, with the generator id and no retrieval date. Put "simulated" in every dataset label as well: `riverEventGenerator` labels its output "stage, simulated" and its extent "simulated illustration (not a hazard map)". Simulated data is never shown as historical.
- **Datasets that metrics read.** A `GeneratedDataset` with `shape: 'ground-truth'` holds events (`GroundTruthEvent`: `id`, `time`, `kind`, `area`, `attrs`); one with `shape: 'modeled-series'` holds `ModeledSeries` zone series that threshold metrics read. `validateData` rejects data that does not fit. Flooding writes zone series (`flooding/threshold-series.ts`) and flash flood reports; epidemiology writes events for contacts, dispensing sites and curves (`epidemiology/simulate/`).
- **Register it.** `registerGenerator` throws on a duplicate id. Either guard it, as `flooding/index.ts` does with `once`, or list the module in `src/main/toolkits/generator-modules.ts`, the one place that makes generators register wherever case data is generated (epidemiology's `register-generators.ts` is listed there and guards itself).
- **Test it.** The same parameters give the same data, the output validates, and the labels say simulated (`flooding/simulate.test.ts`, `ems/ems-simulation.test.ts`).

## 8. Metrics

A metric is app code: an id, a title, a zod `configSchema` and a pure `compute(inputs, config)`; see `Metric` in `src/main/evaluation/metrics/types.ts`. A toolkit names metrics and supplies configuration; it cannot add one.

- **Reuse a generic metric when it fits.** Flooding adds no metric code. It configures `threshold_timing` four times (different `actionKind`, `clearanceMin` and `series`) and `decision_timing` once.
- **Otherwise write one.** Put the file in `src/main/evaluation/metrics/` (epidemiology adds `contact-reach.ts`, `dispensing-throughput.ts` and `curve-accuracy.ts`) and register it with `registerMetric(metric, pick)` from `registry.ts`. `pick` chooses what the metric reads from `MetricInputBag` (`events`, `decisions`, `series`, `datasets`, and others). Epidemiology registers its three in `registerEpidemiologyMetrics()`; the clinical and EMS metrics register at the bottom of `registry.ts`. Ids are global, and `registerMetric` throws when a different metric uses an id.
- **Show inputs and caveats**, not a bare score. Do not assume a national target; the designer sets it (contact reach does this).
- **Match the generator.** The metric's `groundTruth` or `series` in the toolkit must name a dataset your generator writes. Decisions arrive as `MetricDecision` with the decision form id as `kind`, so the form ids you choose in step 10 are part of the metric's contract.

## 9. Field lint rules

A lint rule is a format check on one inject type's fields. `FieldLintRule` in `src/main/toolkits/field-lint.ts` has an `id`, the `injectTypes` it reads and `check(fields)`, which returns `{ path, message }` issues. The issues join the content issues that the inject text stage sends back to the model in its repair round, and appear as warnings on the inject.

1. Put the pure checks in `src/main/toolkits/<id>/lint.ts` (`lintStageUnits`, `lintFlashFloodWarning`) and test them on their own.
2. Wrap them as rules and call `registerFieldLintRule` in `register-lint.ts`. `flooding/register-lint.ts` registers `flood.stage_units` and `flood.flash_tags`; `epidemiology/register-lint.ts` registers three.
3. Add one import line to `src/main/toolkits/lint-rules.ts`, the only place that loads the module.
4. List the rule ids in the toolkit's `lintRules`.

A rule reports nothing when the structured field it needs is absent. `fieldLintIssues` swallows a thrown error, so a bug in a rule hides instead of failing; test rules directly. `registerFieldLintRule` throws when a different rule uses an id, so prefix ids with the field.

## 10. Decision forms

Decision forms are defined in the toolkit's `decisionForms` as data (`DecisionForm` and `DecisionField`; field kinds `text`, `number`, `choice`, `time`, `area`). `installToolkitDecisionForms()` in `src/main/toolkits/decision-forms.ts` is called once from `src/main/index.ts` and installs `toolkitDecisionForms` as the provider for `provideDecisionForms`. For the scenario's toolkits it converts the forms with `liveFormsOf`, so the same forms reach live play and Facilitate with no per-field code. Your job is to get the data right.

- The form `id` becomes the decision `kind` that metrics read. Flooding's metrics read `close_road`, `order_evacuation`, `order_resources` and `move_assets`; epidemiology's read the option ids `reached`, `unreachable` and `open`. A metric and its form are one contract: change one and you change the other.
- A `choice` needs at least two choices. Option ids are slugs of the labels, so keep labels stable.
- An `area` field with `draw: true` can be drawn on a map. With no `areas` listed, `caseAreaNames` offers the zones of the scenario's modeled series, or the case area label.
- Test that every form converts and passes the live `DecisionForm` schema (the "decision forms" tests in both wiring tests).

## 11. Threat families

If the field brings new kinds of incident, add them to the domain's `addedThreatFamilies` (`AddedThreatFamilies` in `src/shared/domains/schema.ts`). Each family has an `id`, `label`, `description`, `keywords`, a `phaseArc` (flooding gives each family four phases with a goal and beats) and a `lint` block. Rules:

- Ids are unique within the list and may not be a built-in `THREAT_FAMILY_IDS` id; the schema refines this.
- Ids must not collide with another installed pack: `src/main/packs/conflicts.ts` reports a `threat family <id>` conflict.
- Put the field in the id (`flood_river`, `foodborne_outbreak`) and list the family in the domain's `threatFamilies` so it can be chosen. The first listed is the default.
- Other domains can then list the added ids in their own `threatFamilies`.

## 12. Suggested toolkits on other domains

Domains that would use the new toolkit should propose it. Do both of these:

- add the toolkit id to `suggestedToolkits` in each such `packs/domains/<id>.json` (this is the domain's own list);
- add the domain ids to the toolkit's `appliesTo.domains` (this is what `suggestToolkits` matches against the brief).

Flooding's `appliesTo.domains` names 17 domains. List only domains that really use the field, and say so in the dossier's reuse section.

### The media_environment rule

Every bundled domain except `generic` must appear in `packs/toolkits/media_environment.json` under `appliesTo.domains` and must list `media_environment` in its own `suggestedToolkits`. `src/shared/toolkits/media-environment.test.ts` checks both for every file in `packs/domains/`. When you add a domain, edit both files in the same change or that test fails. A typical list is `["flooding", "weather", "media_environment"]`.

## 13. One register function per field, called from the main process

Each field exposes one function for everything it owns that is not registered by loading a module: `registerFloodingToolkit()` in `src/main/toolkits/flooding/index.ts` (connectors and generators) and `registerEpidemiologyToolkit()` in `src/main/toolkits/epidemiology/register.ts` (metrics and connectors; generators load through `generator-modules.ts`). Call it once at startup in `src/main/index.ts`, beside the others. The function must be:

- **Idempotent.** Startup and tests may both call it. Guard each registration (`hasConnector`, `generatorIds().includes`); `registerMetric` and `registerFigureKind` accept the same object twice.
- **Registration only.** No network and no file reads.

Three things register by import instead: figure kinds (`render/figures/index.ts`), lint rules (`toolkits/lint-rules.ts`) and generators listed in `toolkits/generator-modules.ts`. If you forget the import line the toolkit still loads and nothing complains, except the wiring test below.

## 14. Tests every field should have

Use `src/main/toolkits/flooding/wiring.test.ts` and `src/main/toolkits/epidemiology/wiring.test.ts` as models. They mock `electron` and set `process.env.TTX_RESOURCES = resolve('.')`; copy that setup.

| Test                     | What it proves                                                                                                                                   | Model                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Wiring: capabilities     | `unknownCapabilityWarnings(toolkit)` is empty, so every figure kind, connector, metric and lint rule the toolkit names has code. Register twice. | both wiring tests                                                              |
| Wiring: decision forms   | `liveFormsOf([toolkit])` gives forms that pass the live `DecisionForm` schema, with the option ids the metrics read.                             | both wiring tests                                                              |
| Wiring: lint rules       | `fieldLintIssues(type, fields)` flags what it should and accepts the correct case and the absent field.                                          | both wiring tests                                                              |
| Wiring: metrics and data | Run the generator with `runGenerator`, read its datasets with `readModeledSeries` or `readGroundTruth`, and run `runMetric` on decisions.        | flooding wiring test                                                           |
| Pack content             | The toolkit and domain parse; every inject type has a template folder with a taxonomy block; knowledge fits the cap; added families have arcs.   | `flooding/pack.test.ts`, `epidemiology/pack.test.ts`                           |
| Domain and toolkit agree | The domain's `suggestedToolkits` names the toolkit and its default threat family is the field's.                                                 | `flooding/pack.test.ts`                                                        |
| Figures                  | Registered, accessible, deterministic, summary and table present, bad data refused.                                                              | `render/figures/flood/flood.test.ts`, `render/figures/epi/epi-figures.test.ts` |
| Generators               | Deterministic, labelled simulated, datasets validate.                                                                                            | `flooding/simulate.test.ts`, `epidemiology/register.test.ts`                   |
| Connectors               | Recorded fixtures, plus an opt-in `LIVE=1` test.                                                                                                 | `connectors/flood-connectors.test.ts`, `flood-connectors.live.test.ts`         |
| Lint functions           | The pure checks, apart from the rules that wrap them.                                                                                            | `flooding/lint.test.ts`, `epidemiology/lint.test.ts`                           |
| Template goldens         | Each template and variant has an approved PNG.                                                                                                   | `pnpm test:templates`                                                          |
| Bundled pack mapping     | Every file maps to exactly one pack and each pack validates.                                                                                     | `src/main/ipc/handlers/packs-bundled.test.ts`                                  |

Run `pnpm ci:local` before opening the pull request. It includes lint, the type check, unit tests, the document checks and the template goldens.

## 15. Names to check for collisions

Most registries throw on a duplicate id, but some collisions show up only at merge time, and a few not at all. Before you start, search `main` and the open pull requests for each name.

- **Inject type and template ids.** Template folders in `templates/injects/` share one namespace with the built-in types in `src/shared/taxonomy.ts` (`INJECT_TYPE_IDS`) and with every other pack. `meta.json` `type` must equal the folder name. Name the product exactly (`nws_hydrologic_product`).
- **Figure kinds, metrics, lint rules, connectors, generators.** Each has one global registry: `registerFigureKind`, `registerMetric`, `registerFieldLintRule`, `registerConnector` and `registerGenerator` all throw on a second, different registration. Connector and generator ids must also match `^[a-z0-9][a-z0-9-]{0,63}$`.
- **Decision form ids.** Forms become decision kinds. Two toolkits that define `escalate` with different meanings feed one metric different things when both are on.
- **Threat family ids.** Not a built-in id and not another pack's.
- **Pack ids, README names and library slugs.** `ai.actionstations.<name>`, `packs/readmes/<name>.md` and `<id>-library` must agree.
- **File names in shared folders.** `src/main/evaluation/metrics/`, `src/main/render/figures/`, `src/main/toolkits/connectors/` and `connectors/__fixtures__/` are flat. Give files names that say their field or source (`nwps-gauge-eadm7.json`, `cdc-nwss-ohio.json`). Two branches that each add `common.ts` or `utils.ts` to a shared folder conflict at merge. Keep field-only helpers in the field's own folder (`flood/common.ts`).
- **ADR numbers.** Spec files are named for their issue (`0448-toolkits.md`), so they do not collide. ADR numbers are taken by hand, and two branches can pick the same one. Take the next free number above the highest in `docs/adr/` on a fresh `origin/main` (`ls docs/adr | tail`), check open pull requests, and check again just before merging. Write an ADR only for an architectural decision (template: `docs/adr/0000-template.md`); flooding's is `0081-flooding-data.md` and epidemiology's is `0082-epidemiology-simulation.md`.
- **Shared data files.** `packs/domains/*.json`, `packs/toolkits/media_environment.json` and `packs/bundled.json` are edited by every field. Keep your edit to your own lines and rebase before you push.

## 16. Checklist

Copy this into the issue or pull request.

**Decide and research**

- [ ] Domain, toolkit or both decided, and the slug chosen.
- [ ] Dossier written from `docs/research/domains/TEMPLATE.md`, with claims marked verified or not.
- [ ] Names checked for collisions (step 15).

**Pack files**

- [ ] `packs/toolkits/<id>.json` parses and its knowledge fits the cap.
- [ ] `packs/domains/<id>.json` parses, sets `suggestedToolkits`, and gives added threat families phase arcs.
- [ ] `packs/bundled.json` entry and `packs/readmes/<name>.md` added; `node scripts/build-bundled-packs.mjs` passes.
- [ ] Library pack in `packs/documents/manifest.json`: licence verified for each document, sha256 pinned, library `version` set.
- [ ] Domain added to `media_environment.json` `appliesTo.domains` and lists `media_environment`.
- [ ] Domains that benefit list the toolkit in `suggestedToolkits`; the toolkit lists them in `appliesTo.domains`.

**Templates and figures**

- [ ] Template folder per inject type with `taxonomy` in `meta.json`, schema, preview and a reviewed golden for every variant.
- [ ] Critical text is template text, not image pixels.
- [ ] Figure kinds registered in the field folder, imported in `figures/index.ts`, and tested.

**Data, metrics and rules**

- [ ] Connectors: fixed hosts, `estimate` and `fetch`, fixtures, a `LIVE=1` test, registered.
- [ ] Generators: labelled simulated, deterministic, with the ground-truth and modeled-series datasets the metrics read.
- [ ] Metrics registered (or generic ones configured), and the toolkit's `groundTruth` and `series` ids exist in the generator output.
- [ ] Lint rules registered, imported in `lint-rules.ts`, and listed in the toolkit.
- [ ] Decision forms valid as live forms, with ids that match what the metrics read.

**Wiring**

- [ ] One idempotent `register<Field>Toolkit()` called from `src/main/index.ts`.
- [ ] Wiring test: no unknown capabilities, forms convert, lint rules fire, metrics run on generator output.

**Docs and release**

- [ ] User guide `docs/guides/<field>.md`, linked from [Toolkits](../guides/toolkits.md) and the README guide table, with no internal references.
- [ ] CHANGELOG entry.
- [ ] `pnpm format:check`, `node scripts/check-doc-links.mjs`, `node scripts/check-user-docs.mjs` and `pnpm ci:local` pass.
