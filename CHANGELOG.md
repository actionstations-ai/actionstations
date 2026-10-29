# Changelog

All notable changes to Action Stations are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pull requests are referenced as `PR #NN`, issues
as `#NN`. Releasing: rename `[Unreleased]` to the new version with the release date, then run
`scripts/release.sh` (see `docs/RELEASING.md`).

## [Unreleased]

### Added

- Source check and plan conflicts (#423, ADR-0028). Every expected action, controller note, overview section and scenario idea that makes a claim about your plans gets a label, **Grounded**, **Needs review** or **Unsupported**, from a check of each sentence against the full text of the chunks it cites (roles, agencies, identifiers, deadlines, numbers, sections and plan actions must be there; a different deadline or number in the same statement makes it unsupported). The check runs on your computer, after generation and after each edit, and needs no model. Labels show in the MSEL grid (with a Source check bar listing the rows to check), the inject editor, the overview, the ideas and Scenario checks (unsupported items as checks, items to review as tips; nothing blocks). **Details** explains each label; **Mark grounded** / **Mark unsupported** set your own label; **Verify with model** asks the review model, whose answers count only when they quote the passage word for word. **Plan conflicts** on the Documents page finds statements in two of your plans, policies or forms that answer the same question differently (who approves releases, notification deadlines, phone numbers, activation levels, lead agencies) and references to annexes or plans the project does not have, saved to `plan-conflicts.json` with your decisions. The MSEL PDF can carry a Source check column (controller material only). See the [guide](docs/guides/grounding.md).
- Tip of the day on the Projects screen (#443): one short tip from a list shipped with the app (`src/shared/tips/tips.json`, 24 tips), with a link to the guide section that explains it, **Next tip**, **Hide** and **Turn off tips**, and a switch in **Settings → General**. Tips are bundled, so showing them makes no request; the guide opens on GitHub at the app's own version. A test fails when a tip links to a guide heading that does not exist.
- Opt-in update check (#442, ADR-0024). Off until you turn it on: the setup wizard asks once, existing users get the same question once on the Projects screen, and **Settings → Updates** has the switch and **Check now**. With the check on, the app asks GitHub's public releases API for the latest release at most once a day, sending only its name and version. A newer release shows a banner on Projects with the release notes, the installer for this computer and a link to the release page. The app never downloads or installs updates. Windows users of 0.5.0 are told to uninstall first.
- Surveys (#422): every scenario gets a **Surveys** page. Create the HSEEP Participant Feedback Form, a knowledge check and a confidence self-assessment (each as a before and an after edition with the same questions), a facilitator debrief, a controller/evaluator debrief or a blank survey, then edit it with rating, multiple-choice, free-text and confidence questions in sections. Print a survey as a fill-in PDF through the export path (participant forms also go into the distribution ZIP's `players/` folder; debriefs and results never do), type returned paper forms in one at a time, and see results computed on your computer: counts per channel, mean, median and a 1 to 5 distribution, choice counts and share correct, free text in no particular order, and before/after comparisons. Responses are anonymous by construction, and results show only counts until a threshold of responses (3 by default, in **Settings**) is reached. The results feed the AAR/IP draft (#419). Answering on phones and in live play comes with live play.
- Exercise Evaluation Guides and FEMA Core Capabilities (#421, ADR-0025). The 32 Core Capabilities of the National Preparedness Goal ship as data; a new `eeg` stage after the rubric maps each objective to one to three capabilities and writes one EEG per capability with three to eight critical tasks, each citing the plan section it comes from (a task whose citation does not resolve is dropped, and the stage refuses to run when no plan section is retrieved). Tasks name the role expected to perform them, the plan's timing and the MSEL rows where an evaluator should see them. The Scenario page gets an **Evaluation** tab to review and edit all of it (hand-written tasks pick a cited plan section and are kept on regenerate); Facilitate gets an **Evaluation** tab that rates each inject's criteria met / partial / not met / not observed with a note, stored in `scenarios/<id>/evaluation.json`, and the hot wash panel rolls the ratings up by objective and capability with each item's citation. New export: the **EEG packet** (PDF and DOCX, HSEEP 2020 layout, facilitator-only in the ZIP); the MSEL and deck print each row's task ids. A ready scenario without guides offers **Generate evaluation guides**, which runs the stage alone without touching the other documents. New checks: `EEG_CAPABILITY_MISSING`, `EEG_TASK_UNLINKED`, `EEG_ROW_UNCOVERED`, `EEG_TASK_UNCITED`, `EEG_CAPABILITY_UNKNOWN`.
- The live play protocol library, `src/shared/live/` (#406, ADR-0027): the versioned envelope and zod schemas for every message type, AES-256-GCM sealing with the header as AAD under two session keys (a players key every device holds and a staff key only controllers, evaluators and SimCell devices hold) plus per-message ECDH sealing of everything a device sends to the controller, ECDSA P-256 controller signatures, key-derived staff proofs in `join`, resume tokens that bind a client id to its device, invite links that carry the keys only in the URL fragment, join tokens, per-sender replay protection, key rotation that excludes kicked devices, sealed and chunked media blobs with caps per connection type, a `LiveClient` state machine and an in-memory session server for tests. WebCrypto everywhere it exists, with a lazily loaded pure-JavaScript fallback (`@noble/ciphers`, `@noble/curves`, `@noble/hashes`, MIT) for the player page in a non-secure context. No user-facing feature yet: the servers and the player page build on it (#407–#418).
- The HSEEP document set (#420): the Exercise Plan (ExPlan), the Situation Manual (SitMan) with one module per phase in facilitator and player editions, and the Controller/Evaluator Handbook in the HSEEP 2020 order, each as PDF and Word, plus the MSEL as an Excel workbook in the common HSEEP columns. The Export page groups them as the **HSEEP set**, lists what is still missing before you export, and writes the same list as `export-report.md`. The ExPlan, and the SitMan player edition when you ask for it, go into `players/` of the distribution ZIP.
- **Exercise details** tab on the scenario page (#420): dates, sponsor, participating organizations, point of contact, site, communications plan, safety and security notes, acronyms and the exercise marking. They stay in `scenario.json`, are never sent to a model, and blank ones print as lines to fill in.
- A `sitman` generation stage (#420) after the hot wash writes the SitMan modules (narrative, key issues, discussion questions citing plan sections) and the assumptions and artificialities. Existing scenarios get it on **Continue** or from the Exercise details tab.

### Fixed

- Installers never ship onnxruntime's CUDA or TensorRT providers (#401). A native Linux x64 build downloaded them (272 MB) although the app runs the CPU provider; `electron-builder.yml` leaves them out, the release workflow skips the download, and `package-smoke` fails if they appear.

## [0.5.1] - 2026-10-28

Highlights: the app has its final identity, `ai.actionstations.app`, and the project lives in the `actionstations-ai` GitHub organization. The installers are the first built and tested on GitHub-hosted macOS, Windows and Linux machines. If you installed 0.5.0 on Windows, uninstall it before installing 0.5.1. Your settings and projects stay.

### Changed

- Pack downloads in the official catalog come from the `packs` release of `actionstations-ai/packs` instead of actionstations.ai (#400). The catalog lists the new URLs and the app follows GitHub's download redirect, so 0.5.0 installs packs from there unchanged.
- Images, PDFs, Office files, fonts and media in the repository are stored with Git LFS (#399). Install Git LFS before cloning. History was not rewritten, so earlier tags and their source archives are unchanged.
- Release installers for macOS, Windows and Linux are built and smoke-tested on GitHub-hosted runners by `.github/workflows/release.yml` and uploaded to the draft release (#398, ADR-0023). GitHub Actions runs only where it is free (this public repository, standard runners, no artifacts or caches); `scripts/check-workflows.mjs` in local CI enforces it.
- The repositories moved to the `actionstations-ai` GitHub organization: the app is now `actionstations-ai/actionstations` (#394). Old `mdcrowley/actionstations` links redirect.
- The app id is now `ai.actionstations.app` (was `com.mdcrowley.actionstations`; dev builds `ai.actionstations.app.dev`) (#396). Windows treats an installer with a different app id as a different app, so a 0.5.0 install is not upgraded in place: uninstall it first. Settings and projects are unaffected (they follow the app name).

### Fixed

- The packaged smoke test runs on Windows: Playwright is started through Node, leftover processes are found with PowerShell, and text files are checked out with LF on every OS (#398).
- Builds include only the app's own output from `out/` (`main`, `preload`, `renderer`) (#392). They used to take everything in `out/` apart from the bundled packs, so library packs built in the same checkout went into `app.asar` (a 907 MB dmg, caught before 0.5.0 was published). `package-smoke` refuses any other `out/` entry.

## [0.5.0] - 2026-10-27

Highlights: smaller installers (Windows 290 MB, Linux 327 MB, macOS 325 MB) that carry only their
own platform's native code; PDF import and the built-in embedder working on Linux; a Windows
save error fixed; lint definitions for facility-fact categories in the editor; six more example
tabletops; new Scenario checks for defects found while building the examples; scene photos with
screens switched off for cyber-only outages; and a complete public-domain FFIEC library for
financial services. Windows and macOS installers are not code-signed yet.

### Added

#### Editors and saving

- Facility facts: **Edit lint definition** on each category the domain profile defines (#180) edits its noun, generic noun and context, identifier shape, Checked by lint and Complete list. Saving writes `domainProfileOverrides.factCategories` (the whole list) through `project:update`, which refuses invalid or catastrophic regexes (capturing groups, look-arounds, back-references, nested quantifiers, empty matches, over-long sources) and extracts the facts again (an edited `facility-facts.md` is kept; the extraction goes to `facility-facts.generated.md`); the Scenario check then re-runs.
- Facility facts: categories you add yourself (for example _Pump stations_) get **Define for lint** (#350), the same form, validation and save as the domain's categories. The definition is stored under the category's id from `facility-facts.md` as it is (`pump-stations`): fact category ids now accept hyphens as well as underscores, so existing files and `project.json` are read unchanged and nothing is renamed. **Remove the lint definition** takes it out again.

#### Examples

- The City of Millbrook Water example has three more tabletops (#171): ransomware on the business network reaching toward the control network, tampering at Orchard Standpipe with a precautionary advisory decision, and a transmission-main break during a telemetry outage. The Harwick UAS Operations Group example has three more (#173): ransomware on the mission data ten days before a client deadline, a rogue drone over a public event next door, and a flyaway toward the Class C boundary after a field firmware update. Each was generated with the #347 checks, reviewed and corrected by hand, and packaged within the example media budget.

#### Project

- README badges for installer downloads, stars and forks, and a Project stats section with a downloads-over-time chart and the star-history.com stars chart (#378). `pnpm stats` (`scripts/repo-stats.mjs`) records a dated snapshot in `docs/stats/history.json`, counts installers only, keeps a replaced file's earlier downloads, and redraws the chart in light and dark; `pnpm release` runs it.
- Financial services reference library 1.0.1 (#386): the five FFIEC documents that ffiec.gov serves only to browsers (Information Security, Business Continuity Management, Outsourcing Technology Services, Wholesale Payment Systems, Authentication and Access) are now in the pack, 37 documents in all. Information Security (September 2016) and Business Continuity Management (November 2019) are the same editions, re-pinned because ffiec.gov re-saved the PDFs in 2026; Outsourcing and Wholesale Payment Systems are pinned for the first time.

### Changed

#### Examples

- Four example tabletops have short titles like the others (#368): uas-operations _Ghost Flight at Birch Hollow_ → _Ghost Flight_, _Ten Days Before D-3_ → _Deadline Ransom_, _Lost Link Toward the Class C_ → _Lost Link_, and city-water _Cut Lock, Drifting Residual_ → _Cut Lock_. Only the title changed (scenario, example list, documents and the card text that prints it); subtitles, rows, injects and media are as before.

### Fixed

#### Generation and checks

- Examples: the chemical-rmp and city-water chem scenarios now state the same start time in their stored request and their cards (a night shift no longer appears in a 09:00 exercise), so the request-time tip no longer fires (#171).
- Checks for the defects the #347 checks missed on the 0.5.0 example drafts (#364), each with a fix hint and a plain-language message. `AUDIENCE_NOT_SEATED`: an audience entry in the brief that no player role plays (matched by a shared word in the role's name, abbreviation, key or team, or by the domain profile's role words), where `ROLES_EXCEED_AUDIENCE` only compared counts. `ENDEX_EARLY`: a row before the last that ends the exercise by its content ("ENDEX:", "the exercise is concluded", "the hot wash begins", an `endex_card`) under another tag. `OUTSIDE_AGENCY_DECIDES` also catches an agency that forbids or holds a return to service ("no return to service until the FBI issues a release"), orders or requires a response step ("DDAGW: you must issue the advisory within 30 minutes"), or takes over the incident, across more agencies (FBI, FAA and FSDO, USCG and the Captain of the Port, state drinking-water and health offices, primacy agencies); advice, requests, reporting deadlines and negations are still skipped. `DATE_DRIFT` now checks the STARTEX and time-jump cards: a weekday and a date on the same card that disagree ("Wednesday, 09:00, April 2, 2026"), more date forms ("April 2nd, 2026", "2 April 2026", "2026-04-02", "April 2, 2026 (Wednesday)"), and a STARTEX day other than the one date the request names. For drift from the brief: `BRIEF_IDS_MISSING` (the MSEL uses fewer than half of the four or more plan steps, systems and places the request names by id) and `BRIEF_THREAT_ADDED` (ransomware in the story when the request never mentions it). The revision pass after the critique rewrites rows flagged `ENDEX_EARLY` and `BRIEF_THREAT_ADDED`. The `objectives_roles` prompt now takes the brief's audience list as the player role list (one role per entry, in order, no default roles in their place), role capping keeps the roles that play an audience entry first, and `msel_phase`, `inject_text` and `critique` carry the matching rules (the critique now sees the request, the audience and the constraints, and checks drift from the brief and from the organization's plans).
- Examples: four stored briefs listed an audience entry their scenario never seats, which `AUDIENCE_NOT_SEATED` now flags (#364). The audience entry now names the seat the scenario plays, in `build.json`, the stored brief and the overview: county-elections ("Voter Registration and Mail Ballots" → "Election-Day Operations (Voter Registration and Mail Ballots)", the Deputy Director's seat), county-public-health ("Clinical Services and Medical Countermeasures" → "Environmental Health"), k12-district ("Student Services and Transportation" → "Law Enforcement (School Resource Officer)") and uas-operations _Ghost Flight_ ("Payload & Calibration" → "Client Liaison (Data Deliverables)").

- Fix: saving any domain profile override no longer stores empty `factCategories` and `rolePatterns` with it, which switched off the profile's facility-fact categories and role words for that project; projects saved that way drop those empty values when they load (non-empty overrides are kept) (#180).
- Checks and prompt rules for the defects found while building the 0.4.0 examples (#347). New Scenario check warnings, each with a fix hint: rows after an ENDEX in the middle are named one by one (`ENDEX_LAST`); `TIME_JUMP_REPEATED` (a second time jump in a phase, at the same time or with the same text); `START_TIME_MISMATCH` (the STARTEX clock is not the brief's start time) and `CLOCK_MISMATCH` (a time jump or end card states a clock its row time does not give); `DATE_DRIFT` (the day or date changes between rows without a time jump, or a weekday does not match its date); `OUTSIDE_AGENCY_DECIDES` (CISA, TSA, a regulator closing the incident or approving restoration); `RESTORE_TOO_FAST` (encrypted or compromised systems fully restored within the hour); `CONTACT_REAL_LOOKING` (email or web domains that are not `.example`, a real agency's or a public mail service's, 555 numbers outside 555-0100–0199, geographic numbers); `ROLES_EXCEED_AUDIENCE` (more than one role beyond the brief's audience) and `OUTSIDE_PARTY_ROLE` (a party the brief gives the SimCell seated as a player); `QUANTITY_OVER_LIMIT` (a quantity above a bound in a `## Limits` section of `facility-facts.md`, for example `Chlorine, largest container: 1 ton`). An info tip, `BRIEF_TIME_OUTSIDE`, notes a request whose times of day all fall outside the exercise window. The revision pass after the critique rewrites rows flagged by the row-level ones. The `msel_phase`, `inject_text`, `objectives_roles`, `scenario_overview` and `critique` prompts state the same rules, and `msel_phase` now receives the designer's request and constraints as binding for start time, day, places and threat.
- The critique no longer fails with an empty result when the model's context window is too small (#347): a reply without JSON is retried once with a shorter request (rows shortened, three plan sections); if that also has none, the step fails with an error that says the context is likely too small and how to load the model with a larger one. A stage that gets no JSON now says whether the reply was empty or cut off at the length limit.
- Packaging an example no longer treats story paths such as `/tmp/auto_cleaner.py` or `/home/ubuntu/…` in inject text as author paths (#347): only a user's home folder, the per-user temp folder and the author's own home, project and output folders count.
- Two older bundled examples corrected in place for the new checks (#347): the City Water time jump at 2:00 repeated the 1:00 one word for word, and the UAS Operations time jump at 3:00 said "It is now 3:00" instead of 12:00.

#### Media, templates and providers

- Scene photos of a power loss (outage, blackout, power failure, generators, emergency lighting) are dim and free of lit screens and signs (#162): the media brief gets `lighting: "dark"` (editable in the inject's media brief) and outage light words, and the default `sdxl-photo` workflow binds it through a new `lighting` binding source to a dark start latent (denoise 0.92) and a dark-ceiling area prompt over the top 40% of the frame (ComfyUI core nodes, no new models). Measured on the #141 brief with seeds 1001–1003: mean luma 87–116 with lit boards before, 29–40 with no lit screens after. Screens that are dark or blank with the power on (a cyber-only outage) keep the room's normal light: the screens are left out of the prompt and lit signage is in the negative prompt, but no lighting is set.
- Scene photos whose screens are dark or blank with the power on (a cyber-only outage) lose their large lit background boards and signs (#356): the media brief gets `lighting: "screens-off"` (a third value, editable in the inject's media brief), and `sdxl-photo` keeps the lit render and repaints only the saturated blue or amber signs it finds in the top 40% of the frame (stock ComfyUI mask nodes, denoise 0.55, same seed) as dark, unlit boards; pixels outside those signs, people included, are unchanged and no new models are needed. Measured on sample-run I-10 with seeds 1001–1006: the large lit boards are dark in 5 of 6 and faces are untouched in 6 of 6, but small far-off screens, pale-blue signs and white-lettered boards stay lit in every seed. Power-loss scenes render as before.
- Blank-screen scene photos with the power on can also use an optional sign detector (#356, ADR-0022): when ComfyUI has the [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) custom nodes and the Florence-2-large model (both MIT), `sdxl-photo` finds signs, screens and people by name in the top of the frame and repaints the signs it finds, never the people. Without them it renders exactly as before. Workflows can now mark nodes optional (`_meta.optional`, with `_meta.fallback` links): the app leaves out a group the server cannot run, the Workflows card shows **Optional, not installed** instead of a missing node, and pack review lists optional custom nodes apart from required ones. Measured on sample-run I-10, seeds 1001–1006: the FIDS board and board row (1005) and the signs over the shops (1003, 1004) are now dark too, faces are untouched in 6 of 6 and the room stays lit; small far-off screens, white-lettered black boards and a lit shop fascia still stay lit, and a screens-off image takes about 2 minutes instead of 45 s on Apple Silicon. Setup does not install the detector; the ComfyUI guide shows how.
- The optional sign detector now also runs when ComfyUI is started with `--gpu-only` (#356). Its masks no longer use `GrowMask`, which failed with tensors on the GPU. On Apple Silicon that flag puts Florence-2 on the GPU: a screens-off image takes 41–45 s instead of 115–135 s, with the same detections. The ComfyUI guide explains the flag and its side effects. Power-loss and colour-only renders are unchanged. Detector renders differ only at the edges of the repainted signs (square instead of rounded grow, 0.1–0.5% of pixels). Small far-off screens, white-lettered boards and lit shop fascias still stay lit; the approaches tried and not adopted are listed in `comfy/workflows/README.md`.
- Blank-screen scene photos with the power on can switch off far more screens and signs with an optional FLUX.2 [klein] 4B edit pass (#356, ADR-0022). When ComfyUI has `flux-2-klein-4b.safetensors`, `qwen_3_4b.safetensors` and `flux2-vae.safetensors` (all Apache-2.0, 16 GB together; core nodes only), `sdxl-photo` asks the model to power off every screen and illuminated sign in the lit render, keeps the lit render and takes from the edit only the boards it darkened, then repaints colour-matched signs the edit left lit, as before. People and faces stay the lit render's pixels. Without the files the render is the sign repaint, unchanged, and the sign detector is not run when the edit is used. Measured on sample-run I-10, seeds 1001–1006, against the detector: white-lettered boards, the whole FIDS board and more small screens are now dark; no face-box pixel changed in 6 of 6; 53–65 s per image on Apple Silicon (47–54 s with `--gpu-only`) instead of 107–134 s. Small far-off screens and some shop fronts still stay lit. Settings → Local tools offers the three files as an optional download (32 GB budget or more, GPU), and pack review counts the FLUX.2 nodes as core. Lit and power-loss renders are unchanged.

#### Platforms and builds

- Linux: importing a PDF no longer crashes the app (#373). pdfjs loads `@napi-rs/canvas`, which on Linux scans the system font folders when it is imported, and under Electron that scan stopped the whole process (SIGTRAP, no message). The scan is now switched off on Linux (`DISABLE_SYSTEM_FONTS_LOAD`); text extraction and OCR use pdfjs's own standard fonts. macOS and Windows are unchanged.
- Linux: the built-in ONNX embedder loads (#372). sharp's libvips ships in its own package with only a versioned `.so`, which electron-builder's smart unpack left inside `app.asar` where Linux cannot load it; `node_modules/@img/**` is now unpacked. `package-smoke` fails when any `.node`, `.so`, `.dylib` or `.dll` is still packed inside the archive.
- Windows: an import could fail with `EPERM` while saving `project.json` (#375). Windows refuses to replace a file another handle has open (a concurrent read, Defender, the search indexer); the temp-file rename now retries for about two seconds on `EPERM`, `EACCES` and `EBUSY`, as graceful-fs does, and the quit-time `jobs.json` flush does the same.
- The 0.4.0 Linux AppImage and Windows installer on the releases page were rebuilt with these fixes on 2026-10-27.
- Smaller installers (#382): each platform's build now ships only its own native packages (`@napi-rs/canvas`, sharp and libvips, `sqlite-vec`, the better-sqlite3 prebuild) and leaves out `onnxruntime-web`, which transformers.js's Node build never loads. Measured on 0.4.0 content: Windows 360 → 290 MB, Linux AppImage 473 → 327 MB, macOS dmg 360 → 325 MB. `package-smoke` fails when a build holds another platform's binaries.
- The packaged smoke test passes on Linux and Windows (#383): template goldens are macOS renders, and other platforms place glyphs and line heights about a pixel apart, so there it checks each preview's page size instead of its pixels.
- The README version badge shows the release being cut (#388). `release.sh` refreshed the badges before `pnpm version` bumped `package.json`, so the badge always showed the version before, and still said 0.1.0 after 0.4.0.

### Security

- Domain profiles in packs get the regex safety check from #180 (#351): every fact category noun, generic noun, context and custom pattern, every role pattern and the agency pattern must be a valid pattern without nested quantifiers, back-references, more than two open-ended repeats or empty matches (a custom pattern may use capturing groups and look-arounds and needs group 1). The install review lists a failing pattern as a pack problem with its field (`domains/<id>.json: factCategories.2.pattern: …`) and the pack is refused; a pack installed before this check that fails it is shown as broken at startup and not loaded; the bundled-pack build runs the same check. Three bundled patterns (K-12 reunification sites, data center clusters, food lot codes) were rewritten with bounded repeats to pass; they extract the same identifiers.
- `exceljs` now uses `uuid` 11.1.1 or later (pnpm override); `pnpm audit` reported GHSA-w5hq-g745-h8pq for its `uuid` 8, which the app did not reach because `exceljs` never passes a buffer (#358).

## [0.4.0] - 2026-10-24

The first release since 0.1.0. It carries the 0.2.0 (review fixes), 0.3.0 (packs) and 0.4.0
(domain packs) milestones, which were not released separately. Highlights: the app is now
**Action Stations**; everything the app ships (templates, prompts, workflows, domain profiles,
reference documents and examples) is a pack, with 25 domain packs included and public-domain
library packs to download; nine example tabletops; an optional local-tools setup that installs
LM Studio, Ollama or ComfyUI only if you choose to; and a guided workflow from documents to
export.

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
  people, airlines (Skyline Air, HWK Air, Lakeshore and others, with their own flight codes),
  private businesses (news outlets, the sports team and stadium in the phishing lure, regional
  utilities, national consumer brands in the facility, cargo carriers, banks) and the street
  addresses of real properties. Real: cities, counties, regions, geography and coordinates; city
  and county government agencies as outside parties and responders (Akron Fire Department,
  Summit County EMS), and airports run by local government as outside parties (a diversion to
  Cleveland Hopkins); products and vendors (Cisco, Lenel, Palo Alto…), sector organizations
  (WaterISAC, OHWARN, the Red Cross), federal and state agencies (the FBI Cleveland Field Office
  included) and real threat groups. Users' own projects can use any names (#278, #283, #335).
- Template schema examples and previews follow the rule (#278, #335); the shipped airport
  example does too: North Coast International Airport, its people, airlines, regional utility,
  concessions and cargo carriers are simulated, while its city (Akron), county (Summit County),
  the Akron fire and police departments and Summit County EMA are real again (#335). Its street
  address is simulated and kept off Cleveland Hopkins' address and ZIP. The affected inject
  cards are re-rendered and the phone-call clip is re-voiced. The water and UAS examples use
  fictional towns and are unchanged (#283, #335).
- `examples/simulated-names.json` is applied by `make-example` to imported documents, seed
  scenarios and seed documents, so rebuilding an example from `reference/` stays simulated, and
  `scripts/simulate-names.mjs` applies it to files in place. `tests/content/real-org-names.test.ts`
  checks templates, examples, prompts, domain profiles and the generation fixtures (#283). The
  map's flight-code rules no longer touch CISA advisory ids such as `AA22-103A` (#335).
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

#### Setup

- Optional local tools setup, or cloud APIs only (ADR-0021, #334). A new setup-wizard step, **Where models run**, also available in **Settings → Local tools**, offers **Cloud APIs only** (nothing detected, downloaded or installed), **Local tools** or **A mix**.
  - **Tool rows.** LM Studio, Ollama, ComfyUI and local voice (mlx-audio) each show what they do, their size and license, and a state:
    - **Detected**;
    - **Installed, not running**, with **Start**;
    - **Not installed**, with **Download and install**, **Open the download page** or **Skip**.
  - **Download and install** is a cancellable `tool-install` job:
    - it fetches only from the vendor's pinned https hosts and checks Ollama's published sha256;
    - before anything runs, it verifies the pinned publisher. macOS needs Team ID `D65G88RHWN` (LM Studio), `3MU9H2V9Y9` (Ollama) or `6FXBT88W8J` (Comfy Desktop), plus Gatekeeper. Windows needs Authenticode signer `Element Labs Inc.`, `Ollama Inc.` or `Drip Artificial Inc`;
    - macOS copies the app from the read-only disk image into Applications. Windows opens the vendor installer and leaves admin rights to UAC.
  - **Other platforms.** Linux is download-page only (Ollama gained a one-click install in #338). mlx-audio is guided: the row shows its exact command.
  - **Recommended models.** Models are picked by RAM, VRAM or Apple Silicon. Each is its own **Download** with its size, pulled through Ollama's API, `lms get`, or a sha256-pinned Hugging Face file into ComfyUI's checkpoint folder.
  - **Detect local services** also finds ComfyUI Desktop on `127.0.0.1:8000` when nothing answers on 8188.
  - **Under the hood.** IPC `setup:status`, `setup:install`, `setup:start`, `setup:open-page` and `setup:pull-model`. Settings gain `setup.mode` and `setup.skipped`.
- One-click Ollama on Linux, without sudo (ADR-0021, #338). **Download and install** fetches the latest release tarball for x64 or arm64 and requires its sha256 from Ollama's `sha256sum.txt`, which must agree with GitHub's digest. It unpacks the tarball into `~/.local/share/actionstations/tools/ollama` (or under `$XDG_DATA_HOME`) with a safe extractor: only `bin/ollama` and `lib/ollama/`, no path escapes, no links out, no special files. A system-wide Ollama is found first and preferred. The AMD ROCm (x64) or NVIDIA JetPack (arm64) add-on is offered, ticked, only when that hardware is found; CUDA is already in the main build. **Start** runs `ollama serve` on 127.0.0.1 as a process the app owns, with a **Stop** button and a log in `setup/logs/ollama.log`, and the app stops it on quit. New IPC `setup:stop`; `setup:install` takes optional `addons`.

#### Repository

- README header with the logo, a one-line description, a row of badges, quick links and a screenshot. The badges are SVG files that `pnpm badges` (local CI with `BADGES=1`; off by default, so feature branches never touch them) writes to `docs/badges/` with `scripts/make-badges.mjs` after a full green run (local CI, unit-test and e2e counts, version, license, Electron, platforms, no telemetry, local-first); no badge service and no GitHub Actions, since the repository is private. A run that measures the same values leaves the files untouched; `pnpm release` refreshes and commits them before the version bump. `SECURITY.md` (report vulnerabilities by email, never in a public issue), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SUPPORT.md`, issue-template contact links, and a 1280 × 640 social preview image (`docs/social-preview.png`, built by `scripts/make-social-preview.mjs`). The guide screenshots were retaken from the shipped airport example, so they show its simulated names (Skyline) and the Packs sidebar entry (#317); the inject deck shot was retaken for the restored real places (#Cleveland, Akron Fire Department) (#335).

#### Packs (specification)

- Packs design for 0.3.0: PRD FR-9, ADR-0018, `docs/packs-format.md` (`.aspack` archive with
  `pack.json`, catalog `index.json`) and the zod schemas `PackManifest` / `PackCatalog` with
  path, file-type, size and sha256 rules in `src/shared/schemas/pack.ts`; implementation
  tracked in epic #274.

#### Packs

- Example projects for six of the new domains (#332), each shipped in its bundled domain pack: **Teague Valley Chemical, Corbin Falls Works** (`chemical-rmp`, a chlor-alkali plant's RMP tabletop under 40 CFR 68.96(b)(2): a chlorine release at a rail spot while the SIS shows a valve closed), **Marston County Health Department** (`county-public-health`, a measles outbreak while vaccination and case data are altered), **Rook County Emergency Communications District** (`county-911`, telephony denial of service and CAD malware during a tornado warning), **Lisle County Board of Elections** (`county-elections`, altered voter records five days before an election), **Halverson Unified School District** (`k12-district`, ransomware with data theft during state testing, then a swatting call) and **Corwin Valley Gas** (`gas-distribution`, an overpressure risk in a low-pressure district with an unauthorized SCADA session). Each has simulated plans in `reference/<slug>/` written from the domain dossier and the library pack's public-domain documents, one scenario generated with the local stack, corrected by hand and verified in the built app.
- Reference documents (#325, ADR-0020): `packs/documents/manifest.json` pins the public-domain documents from the 25 domain dossiers by URL, sha256 and size, with each document's license and public-domain basis and each pack's link-only references. `scripts/fetch-documents.mjs` downloads them into the gitignored `.cache/documents/` with browser-like headers, retries rate limits, rejects bot pages, refuses any file whose sha256 differs, and lists what must be downloaded by hand (or dropped in `.cache/documents/inbox/`). The core pack now carries the cross-sector set (HSEEP 2020 doctrine and the HSEEP templates unpacked from their ZIP, NIMS, CPG 101 v3.1, the ICS forms booklet, NIST CSF 2.0, the CTEP package documents, the ransomware CTEP and similar) under `packs/documents/core/`. `scripts/build-library-packs.mjs` builds one catalog-only `ai.actionstations.<domain>-library` pack per domain into `out/library-packs/` with catalog entries, deterministic and validated with the app's reader; each README lists every document with publisher, date and source and the link-only references. CISA CTEP cover photos of unknown provenance are replaced with a blank image; legacy `.doc`/`.xls` files are left out and linked.
- Six new bundled domain packs written from the research dossiers (#322): **Freight railroads** (`freight_rail`), **Gas utilities and pipelines** (`gas_pipeline`), **Chemical facilities** (`chemical`), **Public health departments** (`public_health`), **911 and emergency communications** (`emergency_communications`) and **Election offices** (`elections`). Each has roles, IT/OT systems, fact categories with identifier shapes (subdivisions and control points, compressor stations and valves, vessels and CAS numbers, POD sites, talkgroups, precincts and drop boxes, …), outside parties, media channels, scene anchors, vocabulary, preferred inject types and threat families, plus a README naming the required plans, the reporting deadlines as checked on 2026-10-24 and the copyrighted references it does not bundle. The alias `gas` moved from the energy utility profile to `gas_pipeline`, and `chemical` from the industrial profile to `chemical`. A bundled pack's README comes from `packs/readmes/<name>.md` (the READMEs of the twelve existing domain packs from #323 now ship too); the build flags a readme that names no pack. The domain picker groups the new domains under Transportation, Utilities and industry, and Public and community. The test fixture pack that used `freight_rail` is now `heritage_rail` (`ai.actionstations.heritage-rail`).
- Six new bundled domain packs written from the research dossiers (#322): **K-12 schools** (`k12_schools`), **Commercial facilities** (`commercial_facilities`: retail, malls, hotels, casinos), **Food and agriculture** (`food_agriculture`), **Telecommunications** (`telecom`), **Data centers and IT services** (`data_center_it`) and **Financial services** (`financial_services`: community banks and credit unions). Each profile has the domain's roles, IT/OT systems, fact categories (schools and bus routes, hotel towers and casino pits, establishment numbers and elevators, CLLI codes, PSAPs and ASNs, data halls and UPS/CRAH units, branches, ATMs and routing numbers), outside parties, media, scene anchors and threat families, and each pack has a README (`packs/readmes/<pack>.md`) naming the plans, the reporting deadlines and the copyrighted references that are not bundled. The domain picker gets a **Communications, IT and finance** group. Aliases moved: `water` now resolves to Water utility (no longer Dam / water authority) and `school` to K-12 schools (no longer Campus).
- Built-in content ships as bundled packs, enabled by default (ADR-0020, #314): **Action Stations Core** (51 inject templates, the 12 prompts, the 2 default ComfyUI workflows and the generic domain; always on) and one pack per domain (Airports, Transit, Dams and water authorities, Water utilities, Energy utilities, Healthcare, Campuses, Stadiums and venues, Ports and maritime, Municipal government, Industrial and manufacturing, Unmanned systems) with its profile, the templates tagged for that domain only (FIDS board and BHS SCADA screen for airports) and its example. `packs/bundled.json` maps the repo's folders to packs; the domain profiles moved from `src/shared/domains/profiles/*.ts` to `packs/domains/<id>.json`; `scripts/build-bundled-packs.mjs` (in `pnpm build` and `build:check`) assembles, validates with the app's reader and fails on an unmapped or doubly mapped item, and the installer ships `app-resources/packs/` instead of the per-kind folders. The Packs screen has an **Included with the app** section with an Enabled switch and no Uninstall; turning a domain pack off removes its domain, templates, example and documents from the pickers and galleries, while projects that use them keep rendering and linting. Bundled items show **Included: <pack name>**; an installed pack may still replace a bundled template, prompt or workflow (the review says "Replaces Action Stations Core: tweet") but not a bundled domain id or pack id. The mechanism carries public-domain reference documents (US government works or CC0, 60 MB budget) for the domain packs that #313 adds.
- The thirteen domain profiles refreshed from the #313 research (#323): more of the roles and systems each kind of organization fields (for example the airport's Emergency Manager, ARFF Chief and Facilities; transit's Chief Safety Officer and TSA Cybersecurity Coordinator; the port's Cybersecurity Officer under the USCG cyber rule), current plans and reporting clocks in each description and in the outside parties and pressure examples (TSA SD 1582-21-01E 72-hour CISA report for rail transit, the USCG cyber rule's reports to the National Response Center, the CMS twice-yearly exercise rule that allows a tabletop, the FCC 30-minute PSAP outage notice, the HIPAA 60-day breach clock, CPG 101 v3.1), and the July 2026 SAFER SKIES Act authority of certified state and local law enforcement to mitigate drones in the airport, port, stadium and unmanned-systems profiles and in the UAS threat family's decision points. The energy profile now describes an electric utility and the campus profile a college or university. Each domain pack gets a README (`packs/readmes/<pack>.md`) that names its plans and deadlines and the copyrighted references it does not bundle.
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
- Fifteen inject templates proposed by the domain research (#324): alarm summary, public status page, ransomware leak-site post, security advisory, NWS warning, NOTAM / TFR, rider service alert, ICS 213 and ICS 214, chain of custody, regulatory incident report, lab result report, breach notification letter, system downtime notice and boil water notice. Cross-domain ones ship in Action Stations Core; the rider service alert ships in the transit pack.
- Nine more domain inject templates (#331): wire transfer / vendor bank change request, Safety Data Sheet excerpt, local emergency declaration and family reunification notice / card in Action Stations Core; track bulletin / track warrant (freight rail pack), USCG MSIB / Captain of the Port order (port and maritime pack), HL7 interface engine monitor (healthcare pack), UAS ground control station screen (unmanned systems pack) and election night results page (elections pack). The domain profiles now offer the #324 and #331 templates their dossiers call for (for example boil water notice for water utility, public health and municipal; NOTAM for airport, stadium and unmanned systems; downtime notice for healthcare, industrial and K-12).
- `preview.json` can give each variant its own sample data (`variants.<name>.fields`), so the goldens of the vendor security advisory and the planned downtime notice show fitting content (#331).
- The chain of custody form and the regulatory incident report print on several Letter pages when their lists are long: continuation sheets repeat the header, split tables say "(continued)", and every page says "Page n of N". New template helpers `rows` and `paginate` do the page split (#331).

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

- Checks and prompt rules for the defects found while building the 0.4.0 examples (#347). New Scenario check warnings, each with a fix hint: rows after an ENDEX in the middle are named one by one (`ENDEX_LAST`); `TIME_JUMP_REPEATED` (a second time jump in a phase, at the same time or with the same text); `START_TIME_MISMATCH` (the STARTEX clock is not the brief's start time) and `CLOCK_MISMATCH` (a time jump or end card states a clock its row time does not give); `DATE_DRIFT` (the day or date changes between rows without a time jump, or a weekday does not match its date); `OUTSIDE_AGENCY_DECIDES` (CISA, TSA, a regulator closing the incident or approving restoration); `RESTORE_TOO_FAST` (encrypted or compromised systems fully restored within the hour); `CONTACT_REAL_LOOKING` (email or web domains that are not `.example`, a real agency's or a public mail service's, 555 numbers outside 555-0100–0199, geographic numbers); `ROLES_EXCEED_AUDIENCE` (more than one role beyond the brief's audience) and `OUTSIDE_PARTY_ROLE` (a party the brief gives the SimCell seated as a player); `QUANTITY_OVER_LIMIT` (a quantity above a bound in a `## Limits` section of `facility-facts.md`, for example `Chlorine, largest container: 1 ton`). An info tip, `BRIEF_TIME_OUTSIDE`, notes a request whose times of day all fall outside the exercise window. The revision pass after the critique rewrites rows flagged by the row-level ones. The `msel_phase`, `inject_text`, `objectives_roles`, `scenario_overview` and `critique` prompts state the same rules, and `msel_phase` now receives the designer's request and constraints as binding for start time, day, places and threat.
- The critique no longer fails with an empty result when the model's context window is too small (#347): a reply without JSON is retried once with a shorter request (rows shortened, three plan sections); if that also has none, the step fails with an error that says the context is likely too small and how to load the model with a larger one. A stage that gets no JSON now says whether the reply was empty or cut off at the length limit.
- Packaging an example no longer treats story paths such as `/tmp/auto_cleaner.py` or `/home/ubuntu/…` in inject text as author paths (#347): only a user's home folder, the per-user temp folder and the author's own home, project and output folders count.
- Two older bundled examples corrected in place for the new checks (#347): the City Water time jump at 2:00 repeated the 1:00 one word for word, and the UAS Operations time jump at 3:00 said "It is now 3:00" instead of 12:00.
- Warnings no longer go stale after hand fixes (#342): a user save of an inject, or the relint of **Repair**, drops the "fields repaired to fit the template" warning (and the other field warnings) once the inject's fields validate; a review (critique) note whose row or inject changed after the review ran is marked stale. The Warnings tab now lists the review notes under **Review notes**, with the stale ones folded away under a count. New critique notes record a fingerprint of the row they cite; older notes are compared with the stored MSEL on save and with the inject's version history. The bundled examples were refreshed so their stored notes carry the marks.
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
