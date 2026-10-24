# Changelog

All notable changes to Action Stations are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pull requests are referenced as `PR #NN`, issues
as `#NN`. Releasing: rename `[Unreleased]` to the new version with the release date, then run
`scripts/release.sh` (see `docs/RELEASING.md`).

## [Unreleased]

### Changed

#### Name

- The app is now called **Action Stations** everywhere (machine name `actionstations`): package, installer names (`actionstations-<version>-…`), app id `com.mdcrowley.actionstations`, settings folder (`Action Stations` under Application Support, `%APPDATA%` or `~/.config`), default projects folder (`Documents/Action Stations`), documents, and the repository (`mdcrowley/actionstations`). On the first launch after updating, the old `Tabletop Generator` settings and projects folders are moved to the new names (copied when a move is not possible; the old folder is kept if the copy fails) and recent projects are updated. API keys that cannot be unlocked under the new name (keys saved before the in-app rename in #191) are set aside and the Providers page asks for them once. New projects are `<name>.asproj` folders; `.ttxproj` projects open as before, and double-clicking either opens it in the app on macOS (ADR-0019) (#277).

#### License

- Licensed under the PolyForm Internal Use License 1.0.0 (`LICENSE.md`), with commercial use, including consulting and facilitation for other organizations, reserved as described in `COMMERCIAL.md`; contributions are accepted under a contributor license agreement (`CLA.md`) (#254). An additional permission (`LICENSE-EDUCATION.md`) lets schools, colleges and universities and their faculty, staff and students use, install and share it for teaching, coursework, research and student exercises (#279).

#### Guided workflow and plain language

- Internal: the largest renderer components outside the MSEL editor and inject deck (inject editor, its toolbar and actions, facility facts, facilitator mode, list editors, provider form, document editor, domain picker, brief, export, ideas and a few dialogs) are split into smaller parts and hooks; no behavior change (#203).
- Generated MSELs follow the reference pace (#223): `msel_phase` asks for about six rows an hour, at most seven (20–28 rows for a 4-hour exercise, scaled by phase length), side injects included; a new `DENSITY_DENSE` info lint notes a phase above that.
- Project Overview opens on a "Get this exercise ready" checklist (documents → facility facts →
  generate → injects → media → export / facilitate) with live state per step, one primary Next
  button and the project's scenarios; project settings moved into a collapsed section below
  that remembers whether it was open (#226).
- Scenario page: a next-action bar ("Next: write 6 injects" → "Render media (0/6)" →
  "Export / Facilitate") above the tabs; the status badge now reflects the work done (Draft,
  Injects written, Media rendered, Ready) and lint errors keep a scenario from "Ready"; the
  Injects tab shows how many injects are missing (#227). New setting (Settings → Generation, off
  by default): write injects and render media automatically after generation (#227).
- Warnings tab and MSEL lint use plain-language headlines per check, keep the code and the
  checker's detail as secondary text, sort errors first and offer "Go to row" (opens the MSEL on
  that row) or "Open inject". A glossary popover explains MSEL, inject, STARTEX / ENDEX, SimCell,
  hot wash, time jump, PIO and lint where they first appear, plus a Glossary button on the
  Overview and scenario page. The facility facts "Checked by lint" badge is no longer red, and
  the Documents table hides the embedder model and chunk counts behind an Advanced detail (#229).
- Scenario page: the Stages list and Generation log moved below the tabs into a collapsed
  "Advanced information" section, which opens on its own while a generation runs (#189).

#### Navigation, onboarding and look

- Project sidebar grouped into **Build** (Overview, Documents, Facility facts, Generate, Scenarios, Facilitate) and a collapsible **Advanced** group (Search index, Prompt overrides, Provider routing) that remembers whether it is open; Providers now comes before Prompts, Templates and Workflows; project page titles match their nav labels; the sidebar fits a 1000 × 800 window (#230).
- One selection style in lists: selected items use a highlighter fill (no longer the error pink) with the accent bar, hover is a neutral tint, and the domain picker shows the current domain with a check (#236).
- Toasts appear at the bottom left of the content area so they never cover a primary action (#240).
- Projects with no projects yet: the empty state's primary button is **New project**; setup is the secondary action (#234).
- Facilitate: the header button is **Open presentation** or **Close presentation** depending on whether the presentation window is open (`facilitator:present-status` and the `facilitator:present-changed` event) (#235).
- In-app branding is now Action Stations: logo in the sidebar, comic-panel theme (newsprint light, navy-ink dark, Bangers page titles, ink outlines and hard shadows), window, page and menu-bar titles renamed (the settings folder keeps its name); new app icon from the logo; closing the main window now quits the app on macOS too; `scripts/dev-bundle.sh` builds a renamed Electron bundle for unpackaged runs; macOS overscroll bounce disabled (#191).

#### Editors and saving

- Long MSELs and inject decks stay responsive (#201): committing a cell edit re-renders only
  that row (about 1 of 304 rows instead of all of them on a 300-row MSEL; commit time measured
  at ~2–4 ms instead of ~90 ms in the test harness), deck cards re-render only when their own
  state changes, and lists of 150 or more rows or cards mount only what is near the viewport
  (new renderer dependency `@tanstack/react-virtual`). Keyboard navigation, "Go to row", drag to
  retime and screen-reader row positions (`aria-rowindex` / `aria-rowcount`) work the same.
- The MSEL editor, its rows and cell editors, and the inject deck are split into smaller
  components and hooks with no change in behavior (part of #203).
- MSEL saves send the `updatedAt` of the copy they were made from; main refuses a stale save with CONFLICT and the editor redoes it onto the newer scenario, so a save never overwrites fields written meanwhile by a job or another editor (#199).
- MSEL grid: From/To columns are wider and narrow columns (From, To, Tag, Format) break only between words; row IDs and times never split. The Warnings list keeps its row ID / code column on one line (#237).

#### Background jobs and repair

- Query refreshes follow what changed (#198): `project:changed` and `job:done` invalidate only
  the queries of that project, scenario and kind of data, at most once per 250 ms, instead of
  every cached query on every save (a 100-inject run no longer re-reads every inject per save).
- Background jobs are tracked in one store for the window (#197): export, import, index
  rebuild and idea jobs reattach after navigating away and back, with progress and Cancel, and
  the Export button stays disabled while that scenario's export runs.

#### Generation and checks

- Generated MSELs follow the reference pace (#223): `msel_phase` asks for about six rows an hour, at most seven (20–28 rows for a 4-hour exercise, scaled by phase length), side injects included; a new `DENSITY_DENSE` info lint notes a phase above that.

#### Documents and export

- Export page: the output folder defaults to `<project>/exports` (created on the first export)
  or the folder last chosen for that project; the folder, Export button and a readiness summary
  (events without injects, unrendered injects, lint errors) sit in a pinned action bar (#238).

#### Templates

- Released content follows one naming rule. Simulated: the exercising organization and its
  people, its city, county and local government, airlines (Skyline Air, HWK Air, Lakeshore and
  others, with their own flight codes), local businesses (news outlets, the sports team in the
  phishing lure, venues, regional utilities), national consumer brands in the facility and cargo
  carriers. Real: products and vendors (Cisco, Lenel, Palo Alto…), sector organizations
  (WaterISAC, OHWARN, the Red Cross), federal and state agencies (the FBI Cleveland Field Office
  included) and real threat groups. Users' own projects can use any names (#278, #283).
- Template schema examples and previews follow the rule (#278); the shipped airport example
  does too: its city, county, local departments, airlines, regional utility, concessions and
  cargo carriers are simulated, the affected inject cards are re-rendered and the phone-call
  clip is re-voiced. The water and UAS examples already complied (#283).
- `examples/simulated-names.json` is applied by `make-example` to imported documents, seed
  scenarios and seed documents, so rebuilding an example from `reference/` stays simulated, and
  `scripts/simulate-names.mjs` applies it to files in place. `tests/content/real-org-names.test.ts`
  checks templates, examples, prompts, domain profiles and the generation fixtures (#283).
- `make-example refresh --voices` re-voices edited injects that carry a voice clip with the local
  TTS; `package` keeps a clip that is already MP3 (#283).

#### Documentation

- README: the Documentation section lists every ADR (0001–0016), the `reference/` section
  covers scenarios 1–8, city-water and uas-ops, a new `examples/` section lists the shipped
  examples, and a note explains why the app says Action Stations while the package, installer
  and settings folder keep the Tabletop Generator name (#241).
- Getting started guide matches the current app: the Overview checklist, the scenario
  next-action bar and status badge, Advanced information with Stages and Repair, the Background
  jobs list with Resume / Dismiss, the quit confirmation, the export folder default and the
  system voice in Detect local services. Every guide screenshot was retaken from the built app,
  and `e2e/guide-screenshots.spec.ts` (`GUIDE_SHOTS=1`) retakes them (#242).

### Added

#### Repository

- README header with the logo, a one-line description, a row of badges, quick links and a screenshot. The badges are SVG files that `pnpm badges` (local CI with `BADGES=1`; off by default, so feature branches never touch them) writes to `docs/badges/` with `scripts/make-badges.mjs` after a full green run (local CI, unit-test and e2e counts, version, license, Electron, platforms, no telemetry, local-first); no badge service and no GitHub Actions, since the repository is private. A run that measures the same values leaves the files untouched; `pnpm release` refreshes and commits them before the version bump. `SECURITY.md` (report vulnerabilities by email, never in a public issue), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SUPPORT.md`, issue-template contact links, and a 1280 × 640 social preview image (`docs/social-preview.png`, built by `scripts/make-social-preview.mjs`). The guide screenshots were retaken from the shipped airport example, so they show its simulated names (Skyline, Lakeport) and the Packs sidebar entry (#317).

#### Packs (specification)

- Packs design for 0.3.0: PRD FR-9, ADR-0018, `docs/packs-format.md` (`.aspack` archive with
  `pack.json`, catalog `index.json`) and the zod schemas `PackManifest` / `PackCatalog` with
  path, file-type, size and sha256 rules in `src/shared/schemas/pack.ts`; implementation
  tracked in epic #274.

#### Packs

- **Update from pack** for project copies of templates and workflows (#310): with a project open, the Templates detail view and the selected workflow on the Workflows screen offer it next to the **Update available** badge. An unedited copy is replaced on click; an edited one asks first, explaining that the edits will be discarded. New IPC `comfy:workflows:updateFromPack` (`updateWorkflowFromPack` in `src/main/comfy/store.ts`, `copyPackItem` with `replaceEdited` only on confirmation); the Templates screen now calls `templates:updateFromPack`. The Workflows screen lists, edits and test-renders through the open project, so project workflows and copies of pack workflows appear there; the Defaults card still chooses from the app-wide workflows.
- Packs guide (#272): `docs/guides/packs.md` covers catalogs (none until you add one), installing from a catalog, a file or a URL, reading the review (licenses, custom ComfyUI nodes, what the hashes do and do not prove), update / disable / uninstall and the project copies with their badges, domain-scoped pack prompts, Export as pack and sharing by pull request, `pack-validate.mjs` with `--app-version`, and the security limits. README Packs section, links from the Templates and Prompts guides, `userData` layout including `packs/` in `docs/02-ARCHITECTURE.md`, and `docs/packs-format.md` brought in line with the schemas (path segment start, reserved names with extensions, per-field limits, the schema regex rule).
- Template security (#301), two independent layers. The template checker now works on structure: the Handlebars AST, a parse5 (WHATWG) parse of `template.html` with each expression as an inert placeholder (allowed only in text and quoted attribute values, never in tag or attribute names, end tags, comments or `<style>`; a block's branches must stay inside one element or attribute value; only plain `<!-- -->` comments), and CSS tokenized with escapes resolved (`@\69mport`, `u\72l(`) by `@csstools/css-tokenizer`; `<` is refused in CSS so `style.css` cannot close its `<style>`. The render and PDF windows now load only their own document plus data: URLs and files whose realpath is inside the job's roots (template folder, `templates/_shared`, the bound media files and logo; the project folder for export PDFs), refuse frames, popups and every navigation after the first load, and their CSP adds `frame-src`, `child-src`, `form-action` and `base-uri 'none'`. New direct dependencies: `parse5` 8.0.1, `@csstools/css-tokenizer` 4.0.2.
- Pack security fixes (#303): a catalog entry whose archive URL is on this computer or the local network (loopback, `localhost`, private and link-local addresses) is skipped unless the catalog itself is served from there, and a redirect from a remote host to any such address is refused, so a catalog on the internet cannot make Install send a request to ComfyUI, LM Studio or Ollama. The pack reader now requires a zip with exactly one reading: no prepended or appended bytes, no hidden bytes between entries, no overlapping or shared entries, one end record, an entry count that matches, local headers that repeat their central records (name, flags, method, sizes), no unicode-path renames; data descriptors are accepted. Entries are inflated with `node:zlib` from the region the scan proved, the deflate stream must use every compressed byte and give the declared size, so the compression-ratio limit cannot be evaded by borrowing another entry's size or by padding; jszip must list the same entries with the same sizes and CRC. Adversarial archives are built byte by byte at test time (`tests/fixtures/packs/raw-zip.ts`).
- Packs end to end (#273): `e2e/packs.spec.ts` runs install from a file through the review, the pack template badged and used in a project that still renders after the pack is uninstalled, a local catalog on 127.0.0.1 (add, refresh, install, update), zip-slip and `<script>` archives refused with nothing installed, an example opened from a pack, and Export as pack round-tripped through an install, each with its own data folder; every run fails if the app sends a request to a non-loopback host. `GUIDE_SHOTS=1` writes the Packs guide screenshots to `docs/guides/images/packs/`. The Templates domain filter now offers the domain profiles of installed packs, and the fixture pack's dispatch board template reads its values from `fields.*` like the built-in templates.
- Export as pack (#271): a wizard (`/packs/export`, also `PackExportDialog` for the Packs screen) builds an `.aspack` from your own content: user templates, global prompt overrides, user workflows with their bindings, and from one project its resolved domain profile under a new id, its documents (a license per document is required) and the project itself as an example (`fictional: true`, notice text required; copied through the example filter with provider ids, routing, credential fields, local paths, `index.sqlite` and `.cache` removed, and refused if a file still looks like it holds a key or a local path). Steps: items → metadata (id suggested as `io.github.<user>.<name>`, `minAppVersion` = the running app) → licenses (pack license chosen by the author with common choices offered and no default, independent of the app's license; a redistribution statement) → review → save → share. Main writes `pack.json` with hashes and sizes and a deterministic zip (sorted entries, fixed timestamp and mode), so the same content gives the same sha256; it runs `readPack` on the result and refuses to save a pack the reader refuses, showing its problems. The save dialog runs in main. The share step lists the pull-request steps for the site repository with the archive sha256 and opens the contribution page only on a click. IPC: `packs:exportSources`, `packs:exportCheck`, `packs:exportSave`, `packs:openContribution` (`src/shared/ipc/pack-export.ts`).
- One running instance per user-data folder (#297): opening an `.aspack` or a project folder while the app runs hands it to the open window and focuses it instead of starting a second app (Windows and Linux; macOS already used `open-file`).
- Template layers (#261): an inject type resolves from `<project>/templates/injects/<type>/`, then `userData/templates/injects/<type>/`, then enabled packs, then the built-in templates. Every non-built-in template passes the template checker when it is loaded; a refused one (a `<script>`, a remote URL…) is skipped for the next layer and listed by `templates:refused`. `templates:list` takes an optional `projectPath` and each template carries `source` (`project`, `user`, `pack`, `builtin`), its pack id, version and name, what it `replaces`, and for project copies of pack templates their state (edited, pack not installed, update available); the Templates screen and the inject type pickers show it as plain text. Pack and user templates of new types join the inject taxonomy from the `taxonomy` block of their `meta.json` (`templates:taxonomy`, event `templates:changed`), so generation, the MSEL format list and domain filtering see them. Creating, saving or rendering an inject of a pack template type copies the template into the project and records it in `packs.json`, so the project still renders it after the pack is uninstalled; `templates:updateFromPack` replaces the copy on request and refuses an edited copy unless confirmed. `pnpm test:templates --pack <folder>` renders a pack's `preview.json` files against the pack's own goldens.
- Prompt pack layer (#262): enabled packs' prompts sit between the global override and the shipped default (project > global > pack > default) and apply only to projects whose resolved domain (id, alias or the project's snapshot of a pack domain) the pack lists; a pack with no `domains` applies everywhere, including with no project. `PromptFile.source` and `PromptEntry.effectiveSource` gain `pack` with `packId`, `packVersion` and `packName`; `prompts:get` returns the `pack` layer and its raw text, `PromptEntry.hasPackLayer` says one applies. The Prompts screen labels it ("Pack: Freight Rail Operations") and Reset goes to the pack's version before the default. Pack prompts use the same YAML-only parser (`---js` refused).
- Domain profiles from packs (#263): the domain registry holds the built-in profiles plus those of enabled packs (built-in ids and aliases cannot be reused), the picker lists them under "From packs" with the pack's name, and `domains:list` serves them to the renderer. Choosing a pack domain copies the profile into `project.json` (`domainProfileSnapshot`), so the project lints, extracts facility facts and generates with it after the pack is updated or uninstalled (shown as "from <pack> (not installed)"); overrides apply on top. When the installed pack has another version, Project settings offers "Update profile from pack" with a field-by-field list of changes; nothing changes until it is pressed.
- Pack catalogs in **Settings → Pack catalogs**: none by default, one click adds the official catalog (`https://actionstations.ai/packs/index.json`), any https URL (http only on this computer) can be added or removed. Catalogs are fetched only on an explicit refresh (`packs:catalogRefresh`), never at startup or in the background: 5 MB cap counted on the bytes, timeout, redirects must stay on https, invalid entries skipped and counted, cached in `userData/packs/catalogs/` for offline display. `packs:download` streams an archive into `userData/packs/.staging/` as a cancellable job, capped at the entry's size (200 MB for Install from URL), and refuses a sha256 mismatch (#267).
- **Packs** screen (#268): Installed (version, source, Enabled switch, update available, broken and conflict states, details, uninstall with a note that projects keep their copies) and Browse (catalog entries with search and kind / domain / tag filters, install and update state; the Settings catalog editor when no catalog is added). Every install, update, Install from URL and Install from file goes through one review (contents by kind with what each replaces, pack and document licenses, custom ComfyUI nodes, archive sha256 and source, minAppVersion, conflicts; downgrades need a confirmation). An `.aspack` opened from Finder / Explorer (new file association), passed as a launch argument, or dropped on the window opens that review and never installs. Descriptions render as text-only Markdown.
- ComfyUI workflows from packs (#264): the workflow store looks ids up project > global > enabled packs > built-in; `WorkflowEntry` gains `source: 'pack'` with `packId`, `packVersion`, `packName`, `customNodes` (classes outside ComfyUI core) and, for a project copy of a pack workflow, `copy` (edited / pack missing / update available). Pack workflows are read-only (edited bindings go to `userData/comfy/overrides/packs/<packId>/`), `missingNodes` covers them, `defaults.json` is never changed by an install but a pack workflow can be chosen as a default, and imports never take a pack workflow's id. Rendering media for a project with a pack workflow copies `<id>.json` and the bindings in effect into `<project>/comfy/workflows/` and records them in `<project>/packs.json`, so the project still renders after the pack is uninstalled. The Workflows page labels pack workflows with their pack.
- Reference documents from packs (#265): **Documents → Add from pack…** lists the documents of the enabled packs (title, source, license, pack; ones already in the project are marked) through `packs:documents`, and `packs:importDocuments` copies the chosen files out of `userData/packs` (only files listed in `pack.json`, realpath-checked) into the project through the normal ingest pipeline. The document keeps the pack's title, `source { packId, version, path, packName }` and `license` on `DocumentMeta`, shows a plain-text "From pack …" label in the list, and is recorded in `<project>/packs.json` (kind `documents`, id = `<packId>/<slug>`, so the same group slug from two packs imports side by side; `ProjectPackCopy.id` now allows 200 characters). The copy is the project's own: updating or uninstalling the pack changes nothing.
- Pack installer (#260): `packs:inspect` returns the review (items and what they replace, licenses, custom nodes, archive sha256, conflicts, and whether Install is an install, reinstall, update or downgrade), `packs:install` verifies and installs into `userData/packs/<id>/<version>/` (read-only, one version per pack, `registry.json` written atomically, nothing left behind on failure, downloaded archives deleted afterwards), plus `packs:list`, `packs:setEnabled`, `packs:uninstall`, `packs:verify` and `packs:updates` (from the cached catalogs, no network). A pack whose templates, prompts, workflows or domains (ids or aliases) an enabled pack already provides installs disabled and names that pack; documents and examples never conflict. At startup leftover staging files are deleted, each pack is re-checked (a damaged one is shown as broken and not loaded) and the enabled packs' domains are registered; a damaged or missing `registry.json` is rebuilt from the pack folders (entries disabled, source unknown) and unlisted folders are removed only after a clean read. Catalogs offer a prerelease to a pack installed at a prerelease, or to a pack that is not installed and has no stable version. Main-process layer API for the pack-aware loaders: `enabledPacks`, `packById`, `onPacksChanged`, `packItemPath` and friends in `src/main/packs/layers.ts`, and the `packs:changed` event.
- Examples from packs (#266): **Projects → Examples** and the setup wizard list the examples of enabled packs next to the built-in ones, each labelled with its pack, version and license, and refresh when packs change. `examples:list` items carry `packId`, `packVersion`, `packName` and `packLicense`; `examples:open` takes `{ slug, packId? }` and copies from `userData/packs/<id>/<version>/examples/<slug>/project` through the same filter as built-in examples (no symlinks, no derived data), making the copied files writable. The `.example.json` marker records `packId`, `packVersion` and `packName`, and the example banner names the pack. An example on a pack domain gets the profile snapshot, so the copy still opens after the pack is uninstalled. A built-in and a pack example may share a slug.
- Provenance badges (#269): one `ProvenanceBadge` (`src/renderer/src/components/ProvenanceBadge.tsx`, data and text helpers in `src/renderer/src/lib/provenance.ts`) replaces the plain-text pack labels on the Templates screen and the inject type pickers (the inject editor's Type field and the MSEL format list), the Prompts screen, the ComfyUI workflows list, the domain profile picker and Project settings, the Documents list, the examples gallery and the example banner. It reads "Pack: <name> <version>" for an item served from a pack and "From <name> <version>" for a project copy, with "edited", "not installed" and "Update available" chips; every state is a word with an icon, and the accessible name spells out the pack and every state. `documents:list` items now carry `copy` (edited / pack missing / update available, checked per document against `<project>/packs.json`) and `examples:marker` carries `packState` (pack missing / update available).
- `node scripts/pack-validate.mjs` validates `.aspack` files with the app's own reader under plain Node (no Electron): one line per problem with the path inside the pack, exit code 0 or 1. `--catalog-entry --url <base>` prints the catalog entry as JSON, and `--catalog <index.json>` validates a whole catalog strictly with `PackCatalog`. The reader is bundled with Vite into `node_modules/.cache/pack-validate/` on first use (#259).
- The pack reader requires an example's `example.json` `id` to equal its folder name (#259).
- Pack reader and validator in main (`src/main/packs/`): `readPack` verifies an `.aspack` (central directory scanned from the raw bytes so encrypted entries, symbolic links, unsafe or duplicate names and case collisions are refused by name; bytes counted while inflating against the per-file, total and compression-ratio limits; archive entries equal `files[]` with matching sha256 and size; per-kind content checks with the app's own schemas) and returns item summaries for the review screen; `extractPack` writes to a staging folder through `safeJoin` with a `realpath` re-check and removes it on any error; `checkTemplateFiles` refuses templates with script, event handlers, remote URLs, CSS `@import`/`expression(`, triple-stash or partials. Fixture archives for every refusal are built at test time (`tests/fixtures/packs/build.ts`) (#258).

#### Editors and saving

- Confirm before quitting or closing the window with unsaved work (#196): main asks the renderer (with a timeout, so a hung page never blocks quitting), which saves pending autosaves first and reports inject drafts, edits parked during generation and editors whose save was refused or failed; a native dialog offers "Quit and discard" or "Cancel".
- Inject deck cards show a **Draft** badge when the inject has unsaved edits, and the scenario page notes how many injects have an unsaved draft (#202).

#### Background jobs and repair

- Jobs tray in the sidebar (#197): every running background job with progress, Cancel and a
  link to its screen; jobs interrupted by an app exit get Resume or Dismiss. Running imports
  on the Documents page have **Cancel import**.
- Resume / Dismiss for interrupted jobs (#195): the inject deck, inject editor, generation log
  and jobs tray offer **Resume** (continues from the last checkpoint, `jobs:resume`) when main
  can resume the job and **Dismiss** otherwise; **Continue from failure** also shows for a
  stage an exit left "running", and starting new work on the scenario clears the old record.
- **Repair this scenario** under the scenario page's Advanced information (#200), with a
  confirm dialog (AI stills only when ticked), job banner and progress in the generation log.
- The Stages list shows the reported cost of remote-provider runs next to the tokens, and the
  scenario total (#218).
- Repair a finished scenario in place (#185, ADR-0015): `generate:repair` applies the current
  MSEL repairs and lints, runs the revision pass only for rows still flagged, writes injects
  only for rows whose text changed or that have none, and re-renders only stale cards and
  missing AI stills; everything else stays byte-identical. `make-example.mjs repair` uses it
  for the bundled examples, which were repaired this way.

#### Generation and checks

- Organization-name check for injects (#221): a name that starts like the organization's but is not the project name, `orgName` or `brand.aliases.org` ("North Coast Regional Airport") goes back to the model in the repair round, and becomes an inject warning if it survives.

#### Media, templates and providers

- Project logo: **Logo** in project settings copies a PNG, JPEG or WebP (2 MB max, type
  checked from the bytes) into `<project>/brand/` and sets `brand.logoPath`; templates read it as
  `brand.logo`. Memo, press release, SITREP, own-organization letters (`letterhead.fromProject`)
  and the Exercise Plan cover show it (#217).
- `tiktok_video_card` template: a portrait (9:16) short-video still with a poster image slot,
  on-screen text sticker, caption, sound line and counts as real text; rows of that type no
  longer fall back to a tweet. New `clock` template helper (#216).
- System-voice TTS provider (ADR-0009 fallback): offline speech through macOS `say`, Windows SAPI
  or `espeak-ng` / `espeak`, offered by **Detect local services** only when installed and routable
  to the Audio task; output takes the usual post-FX and MP3 path. ADR-0009 marked amended by
  ADR-0010; README provider table corrected (ComfyUI ships no audio workflow) (#215).

#### Documents and export

- Player handouts and controller materials (#224): two optional scenario document kinds
  (`handouts`, `controller_handouts`), listed in the Documents tab and exported as
  Player Handouts (also in the ZIP's `players/`) and Controller Materials (`facilitator/` only)
  PDFs. The airport example ships the scenario 1, 2, 4–8 reference cards, evidence packets,
  Countdown's action menu and clue cards, plus an MSEL document and hot wash guide for every
  scenario, seeded from `reference/scenario-N/`.

#### Bundled examples

- Each bundled example ships one short voice clip (MP3, inside the 6 MB budget) (#219).
- `make-example.mjs refresh` records hand corrections to an example and re-renders their cards
  with no model reachable; `verify` now fails on any lint warning other than CRITIQUE notes,
  and `tests/scripts/example-content.test.ts` re-runs the content checks on every shipped
  inject (#220).

### Fixed

- Simulated names: the name check and `scripts/simulate-names.mjs` now treat JSON escapes (`\n`, `\t`) as word breaks, which had let "Delta Regional" after a line break and "DL 1245" through; national soda brands in the help-desk template and the airport example are simulated; the names map can no longer rewrite itself (#283).
- Prompt files are YAML-only: a `---js` (or other non-YAML) frontmatter fence is refused on line 1 and never evaluated, so a prompt arriving with a shared project or a pack can't run code in the app (#257).
- A document left at pending, parsing or embedding by an app exit during its import is shown as an error, "Import interrupted — retry", with **Retry**, when the project opens or its documents are listed; a document a running import still covers keeps its status. The rename migration (#277) now also points `jobs.json` job records at `Documents/Action Stations`, and installs that were already migrated are caught up on the next start (#309).

#### Packs

- Template `schema.json` files from packs, the user folder and projects may only use simple
  `pattern`s (anchored with `^`, single-character atoms, at most one variable repeat, as every
  built-in uses) and no `patternProperties` or `format`, so model output cannot stall the app on
  a backtracking regex; the pack reader and template loading refuse other schemas with the JSON
  pointer of the keyword (#302).
- `<project>/packs.json` record paths must sit in their item's folder (`templates/injects/<type>/`,
  `comfy/workflows/<id>.json`, `documents/<docId>/`) and copy-on-use never reads, writes or removes
  through a symlink; a project whose `templates/` or `templates/injects/` folder is a symlink has
  no project template layer (#302).

#### Guided workflow and plain language

- The "narrates a player decision" lint matches role names as whole words, so "IC" no longer matches inside "RPIC", and its quote keeps the space after the role name (no more "ICcannot") (#251).
- Re-running an MSEL phase, the phase plan or the critique (or repairing the MSEL) now marks the injects of rows whose event, expected action or format changed, or that were removed, as stale, so "Write all injects" writes them again; injects whose row is gone are left out of the export as they are from the deck (#207).
- The critique and hot wash steps write their documents only after the step's checkpoint: a failed or cancelled step leaves `overview.md`, the handbook and the hot wash as they were (#209).
- An END_GAME or ENDEX inject never gets a glitch template variant (the recovery board shows normal); a bare-number gate in a flight context ("AC 444 at Gate 14") is checked against the concourse gates when the facts number gates per concourse (#222).
- Symlinks in a shared project can no longer pull files from outside it: export media and
  posters, the export's file check, ingest of `text.md` and originals, and template slot images
  resolve the real path and refuse links that leave the project; duplicating a project skips
  symlinks (#205).
- `render:inject` answers CONFLICT while a generation job owns the scenario, like every other
  scenario and inject write; a handler test covers all of them (#206).
- An older build no longer deletes fields a newer one wrote: project.json, scenario.json,
  inject and document meta files keep unknown keys, and scenario.json has a `formatVersion`
  (missing means 1, newer is refused) (#208, ADR-0016).
- A document whose parse never finishes fails after a per-file timeout (two minutes plus one
  per 10 MB, at most 30) instead of holding an ingest slot (#210).
- Provider requests follow redirects only within the same origin, so an API key header never
  reaches another host; a 409 on a POST is no longer retried (#211).
- The local embedding model downloads from a pinned Hugging Face commit and every file is
  checked against its sha256 (#212).
- Export writes each scenario into its own folder and ZIP (`<Title>-S<n>-<id tag>`), and the
  ZIP holds only the files from that run (#213).
- Opening a project again while its index rebuild runs reuses that rebuild instead of starting
  a second reset (#214).
- Scenario Warnings tab count now comes from the same live lint as the tab body, so it no
  longer says "Warnings (0)" above a list of warnings (#228).

#### Navigation, onboarding and look

- Chat-model pickers never default to an embedding model: Ollama models are classified by their reported capabilities (with a wider name fallback: minilm, bge, e5, gte, mxbai, arctic-embed…), LM Studio embedding models by type, the largest chat model is the default, and "N chat models" counts only chat models (#225).
- Prompts opens on the first prompt of the first stage group instead of an item off-screen (#231).
- Scenarios list and idea cards no longer indented by the browser's list padding (#232).
- Old "Tabletop Generator" wording in the example copy dialog and the DOCX creator metadata now reads Action Stations / "your Documents folder" (the folder on disk is unchanged) (#233).
- Link-styled buttons are no longer underlined (#234).

#### Editors and saving

- The MSEL editor saves a pending edit when it is left (tab, route, scenario switch) instead of dropping it; refused during generation, the edit is parked and taken back when the MSEL opens again (#193).
- Facilitator: a failed save keeps the changes unsaved and is retried; a failure in the save made on leaving the page shows a toast (#204).

#### Background jobs and repair

- After a restart, an interrupted inject or media job no longer locks the inject deck (#194):
  it shows "Interrupted" with Resume / Dismiss instead of a frozen progress banner, Write all
  and Render all stay usable, and dismissing (cancelling) a restored job now sends `job:done`.

#### Generation and checks

- Re-running an MSEL phase, the phase plan or the critique (or repairing the MSEL) now marks the injects of rows whose event, expected action or format changed, or that were removed, as stale, so "Write all injects" writes them again; injects whose row is gone are left out of the export as they are from the deck (#207).
- The critique and hot wash steps write their documents only after the step's checkpoint: a failed or cancelled step leaves `overview.md`, the handbook and the hot wash as they were (#209).
- An END_GAME or ENDEX inject never gets a glitch template variant (the recovery board shows normal); a bare-number gate in a flight context ("AC 444 at Gate 14") is checked against the concourse gates when the facts number gates per concourse (#222).
- Lint false positives found on the bundled examples (#185): a named site with a leading
  article ("The Lakeshore Flight Area"), a rogue device the row itself calls unknown ("No
  record of GCS-12 in fleet", "No GCS-12 exists") in the MSEL and inject checks, and a
  truncated recipient key ("as" for ASO).
- Inject generation records every skipped or failed MSEL row on the scenario (an `inject_text`
  run keyed by the row, an `INJECT_TEXT_FAILED` warning); a reply with no valid JSON gets one
  fresh call, and a control card the model still fails on is built from its MSEL row; a failed
  media brief keeps the inject text (#166).
- Inject fields with an out-of-range enum value (a radio call's `background: "outdoor"`) are
  repaired to the template's default or first value with an `INJECT_FIELDS_REPAIRED`
  warning, and the media job reports fields the template still refuses as
  `INJECT_RENDER_INVALID` in the inject editor (#175).
- Facility lint false positives (#165): broad profile nouns (Unit, Gate, Zone, Station, Section,
  Route) are checked only in matching context and never after a responder or access word, so a
  dam's patrol "Unit 4" is no longer a generating unit; a near-miss name such as "Confluence
  Park Station" is reported as "did you mean Confluence Station?".
- Injects that carry a player's own decision ("This is the DOM. I have made the decision…")
  are caught from the event text whatever `from` says (`INJECT_PLAYER_VOICE`) and re-sourced
  by the MSEL revision pass (#164).
- Phases no longer overfill (#167): the mix completion pass stays within the phase's max row
  count and rewrites spare NOISE / PRESSURE rows before adding new ones, and a first call that
  writes too many rows is trimmed to the max, lowest-value rows first, with every role and
  tag still covered.
- Structural MSEL problems are repaired before a scenario is marked ready: rows outside their
  phase are re-timed, ENDEX is kept last and single, exact-duplicate rows are dropped, roles
  are capped at the audience list, and the remaining structural lints (near-duplicates,
  unknown facility identifiers, rows after ENDEX) go through one more revision round (#174).

#### Media, templates and providers

- Inject media (#177): a generated still is kept when the template step fails and the job log
  names the failing step; over-long strings and pattern violations (a 19-character tweet
  handle) and undeclared nested keys are repaired before validation; the model can choose a
  template variant (`variant`, e.g. `scada_hmi` `water_chemical`); the domain's scene anchor
  follows the model's image prompt instead of being prepended to it.

#### Documents and export

- Export writes each scenario into its own folder and ZIP (`<Title>-S<n>-<id tag>`), and the
  ZIP holds only the files from that run (#213).

#### Security and robustness

- Symlinks in a shared project can no longer pull files from outside it: export media and
  posters, the export's file check, ingest of `text.md` and originals, and template slot images
  resolve the real path and refuse links that leave the project; duplicating a project skips
  symlinks (#205).
- `render:inject` answers CONFLICT while a generation job owns the scenario, like every other
  scenario and inject write; a handler test covers all of them (#206).
- An older build no longer deletes fields a newer one wrote: project.json, scenario.json,
  inject and document meta files keep unknown keys, and scenario.json has a `formatVersion`
  (missing means 1, newer is refused) (#208, ADR-0016).
- A document whose parse never finishes fails after a per-file timeout (two minutes plus one
  per 10 MB, at most 30) instead of holding an ingest slot (#210).
- Provider requests follow redirects only within the same origin, so an API key header never
  reaches another host; a 409 on a POST is no longer retried (#211).
- The local embedding model downloads from a pinned Hugging Face commit and every file is
  checked against its sha256 (#212).
- Opening a project again while its index rebuild runs reuses that rebuild instead of starting
  a second reset (#214).
- Quitting while template previews render no longer hangs (#170): on quit the render-window pool cancels queued and in-flight renders and destroys its windows instead of opening new ones.

#### Bundled examples

- Bundled examples carry no lint warnings (#220): city-water phase 1 reaches the Security &
  Emergency Manager and the state regulator liaison, UAS I-10 narrates no player decision and
  I-12 comes from the FSDO instead of the ASO, Flight to Nowhere I-02a/I-07 no longer carry
  template example values and I-11 frames Gate C4 as the bad data's gate.
- Airport example organization names: North Coast International Airport (NCIA) and the North
  Coast Regional Airport Authority (NCRAA) throughout the inject fields (#221).
- Flight to Nowhere fidelity (#222): the I-15 ENDEX board shows the normal "UA 1245 Chicago ON
  TIME" recovery, the I-02 ticket is the FIDS ticket (its own number, FIDS feed CI, no
  vending-machine notes), and I-10b is a phone call in the fixture and the example.
- Countdown's STARTEX card and inject dates match the MSEL's Tuesday (#239).

## [0.1.0] - 2026-10-22

### Added

- Domain profiles (#156, PR #168, ADR-0014): generation is domain-neutral. 13 built-in
  profiles (airport, transit, dam, water utility, energy, healthcare, campus, venue, port,
  municipal, industrial, unmanned systems, generic) set vocabulary, facility-fact
  categories, systems, roles, outside parties and photo settings; 8 threat families
  (cyber, physical security, cyber-physical, UAS / drone, insider, natural hazard,
  infrastructure failure, mass gathering) set the phase arc, decision points and lint
  rules. All default prompts neutralized; six generic templates (`info_display_board`,
  `scada_hmi`, `uas_detection_alert`, `avl_fleet_map`, `incident_alert_notification`,
  `field_report`); transit and dam reference sets.
- Domain picker in project setup, the setup wizard and project settings with per-project
  vocabulary overrides; threat-family choice on the Generate brief with a suggested
  default; domain filter in the template gallery; bundled example projects on the Projects
  screen and in onboarding (#169, PR #172).
- UAS organization pack (#157, PR #176): `reference/uas-ops/` (flight operations and safety
  manual, emergency response plan, information security plan, site and airspace sheet) and
  `examples/uas-operations/` — the "Ghost Flight at Birch Hollow" GNSS spoofing / command
  hijack tabletop; `scripts/make-example.mjs` builds, packages and verifies examples.
- In-app facility facts editor and project embedding status (#155, #160, PR #163).
- Accessibility and error-UX pass: WCAG AA contrast check, keyboard and screen-reader
  fixes, axe checks in e2e (#49, PR #159).
- City water pack (#158): `reference/city-water/` — the simulated City of Millbrook
  Department of Water & Sewer (AWIA-style Emergency Response Plan, OT / cybersecurity plan
  and incident response playbook, SCADA system description with tag and setpoint limits,
  public communications plan with advisory templates, system map / asset sheet, public
  sources); `examples/city-water/` — the "pH on the Edge" chemical-feed setpoint tampering
  tabletop generated from those documents and reviewed; `scada_hmi` template variants
  `water_chemical` and `water_distribution` and a tile layout fix; the example builder
  (`scripts/make-example.mjs`, #157) gains exported, unit-tested packaging functions, a
  leak check for author paths and secrets, and skips edit history; `DOMAINS=water`,
  `PROJECT_DIR` and `EXPORT_DIR` for `e2e/domains-acceptance.spec.ts`. The remaining three
  Millbrook tabletops are tracked in #171.
- Installers: macOS dmg (arm64), Windows NSIS (x64) and Linux AppImage (x64) with the app
  icon, version and architecture in every artifact name; `scripts/release.sh` (dry run by
  default) and `scripts/package-smoke.mjs`, which tests the packaged app (#50).
- Facilitator mode: exercise clock, inject timeline, second-display presentation and hot
  wash notes (#45, PR #122).
- MSEL grid editor with inline editing, drag-to-retime, bulk time shift, control cards and
  lint (#38, #82, PR #119).
- First-run setup wizard with local service detection and test buttons, linked from
  Settings and the empty Projects screen (#48, PR #118, PR #120).
- Editing: document and structured editors with regenerate-section (#40, PR #116).
- M3 acceptance test: regenerate the Scenario 3 inject deck against live local models
  (#36, PR #112).
- Inject generation stages: inject text, media brief and media render jobs, plus the
  injects/library IPC (#34, PR #111).
- ComfyUI adapter, default image/video/audio workflows with a binding editor, and audio
  post-processing (#32, #33, #35, PR #99).
- Inject templates: social, news and internal-comms (PR #101); technical, operational and
  voice-transcript (PR #96); documents, forms and facilitator control cards (PR #95) (#31).
- Template render core: template contract, composer and offscreen PNG/PDF rendering (PR #89),
  a render window pool, `render:inject`, golden-image tests and the template gallery
  (PR #93) (#30).
- Generation pipeline engine with stages, default prompts v1 and persisted, resumable jobs
  (#25, PR #88).
- Text provider adapters: Anthropic, OpenAI-compatible (LM Studio and others) and Ollama
  (#18, #19, #20, PR #78).
- Scenario store with the Scenarios and Generate screens and a read-only MSEL view
  (#28, PR #76).
- Provider settings screen, task routing and API keys kept in the OS keychain through
  Electron `safeStorage` (#21, #22, PR #74).
- Prompt library loader with per-project overrides and a prompt editor (#23, PR #73).
- Hybrid retrieval (SQLite FTS5 + sqlite-vec) with optional local ONNX embeddings
  (#13, #14, PR #68).
- Document parsers (PDF, DOCX, PPTX, XLSX, HTML, Markdown, text, images with OCR), a
  section-aware chunker and the ingest pipeline (#11, #12, PR #63).
- Documents screen and a debug search panel (#15, PR #59).
- Project store, Projects page, project overview and settings (#10, PR #56).
- Electron + React + TypeScript scaffold, typed IPC contracts and local CI (#2, PR #53).
- Architecture decision records in `docs/adr/` and the app README (#8, PR #52).

### Changed

- Packaged builds ship only `out/` and production dependencies; template goldens, test
  fixtures and package test suites are excluded, and native binaries for other operating
  systems are dropped from each installer (#50, PR #94).
- Vitest runs without its file-system module cache so glob-discovered handlers and adapters
  are always found (PR #80).
- Test files are kept out of handler and adapter discovery (#57, PR #58).

### Fixed

- Injects stay linked to their MSEL rows when rows are renamed (#121, PR #123).
- Template capture is deterministic: resizes settle before capture and `UnknownVizError`
  is retried (#30, PR #97, PR #100).
- Generation pipeline review fixes (#90, PR #98).
- Phase names in the stage timeline and log; document section markers hidden (#28, PR #92).
- Distinct project navigation labels and workflow order (#28, PR #77).
- CommonJS-safe `wavefile` import; the built app is launched in local CI (#61, PR #62).
- pdf.js fonts and tesseract data are unpacked from `app.asar` (#64, PR #67).

### Security

- Electron fuses set on packaged builds: `RunAsNode`, `NODE_OPTIONS` and `--inspect` are
  disabled; cookie encryption, `OnlyLoadAppFromAsar` and embedded asar integrity
  validation are enabled (#55). `GrantFileProtocolExtraPrivileges` is off: the renderer
  loads from a custom `app://` protocol (#117, ADR-0013).
