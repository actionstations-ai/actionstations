# Spec 0432: Real-world inject formats and exports to EOC platforms

Issue: #432 · Milestone: 0.9.0 · Status: Implemented (see Implementation notes) · Depends on: #420 (Excel MSEL in the HSEEP column layout) · Related: #435 (Spanish CAP info blocks), #411/#412 (live play delivery), ADR-0008 (template rendering), ADR-0018 (packs)

## Summary

Injects can take the exact shape of the messages agencies handle in a real incident: CAP 1.2 alerts (as an IPAWS origination tool shows them and as XML), EAS broadcasts with their SAME header, FAA NOTAMs, the ICS 213 General Message and National Weather Service text products. Every one is rendered from an HTML template, so the text a player reads is exact. The MSEL also exports to formats other exercise platforms import: Conducttr's documented MEL CSV, and a WebEOC / SimulationDeck hand-off package (no public import format exists for those, so it is a mapped CSV/XLSX plus per-inject text and media, marked unverified).

## Requirements

### User stories

- As an emergency manager, I want an inject that looks like the CAP alert my alerting software shows before I press Send, so that players practice reviewing and approving the message they would really send.
- As a PIO trainer, I want the EAS crawl and the SAME header the public and broadcasters would see, so that players can check what went out against what was intended.
- As an airport operations lead, I want NOTAMs in the format pilots and dispatchers read today, so that the inject is credible to aviation staff.
- As an exercise director at an agency that runs WebEOC with SimulationDeck, I want to design the exercise in Action Stations and load the MSEL into the platform we already pay for, so that I don't retype 60 injects.
- As a Conducttr user, I want a file Conducttr's **Import MEL** accepts, so that the scenario runs there.

### Functional requirements

**Templates**

- **FR-1** New template `cap_alert` (variants `review`, `xml`). `review` is the summary screen an IPAWS alert-origination tool shows before sending: status, message type, scope, event, urgency / severity / certainty, sender name, effective and expiry times, area description and codes, headline, description, instruction, the WEA 90- and 360-character texts with live character counts, and the EAS/WEA/NWEM channels selected. `xml` is the same alert as CAP 1.2 XML in a monospace viewer. Both are generated from the same fields.
- **FR-2** `cap_alert` fields follow CAP 1.2 (OASIS Standard, 2010) and the IPAWS profile: `status` is one of `Exercise`, `Test` (never `Actual`, see FR-14); `msgType` `Alert`, `Update`, `Cancel`; `scope` `Public`; `category` from `Geo, Met, Safety, Security, Rescue, Fire, Health, Env, Transport, Infra, CBRNE, Other`; `urgency` `Immediate, Expected, Future, Past, Unknown`; `severity` `Extreme, Severe, Moderate, Minor, Unknown`; `certainty` `Observed, Likely, Possible, Unlikely, Unknown`; `responseType` from `Shelter, Evacuate, Prepare, Execute, Avoid, Monitor, Assess, AllClear, None`; `sent`/`effective`/`expires` as `YYYY-MM-DDThh:mm:ss±hh:mm` (CAP forbids `Z`); IPAWS parameters `EAS-ORG` (`CIV` for civil authorities), SAME `eventCode` (three letters, from the 47 CFR 11.31(e) list), `CMAMtext` (≤ 90 characters), `CMAMlongtext` (≤ 360 characters); `area.areaDesc` and `geocode` `SAME` values (six digits, `PSSCCC`). The schema enforces lengths and enums so the model cannot produce an invalid alert.
- **FR-3** `cap_alert` supports a second `info` block in Spanish (`language` `es-US`) as IPAWS does for Spanish WEA. The `review` variant shows both; the `xml` variant writes both `info` blocks. Filling the Spanish block is part of #435; this spec only reserves the fields (`infoEs`).
- **FR-4** New template `eas_broadcast` (variants `tv_crawl`, `decoder_log`). `tv_crawl`: a 1280×720 TV frame with the full-screen or crawl text a station's EAS equipment generates ("A CIVIL AUTHORITY HAS ISSUED A … FOR THE FOLLOWING COUNTIES…"), over a solid slate or an optional AI image slot (`program_still`, photographic only, the text is never in the image). `decoder_log`: the printout or web log of an EAS decoder: received time, the raw header `ZCZC-ORG-EEE-PSSCCC+TTTT-JJJHHMM-LLLLLLLL-`, the decoded fields and the `NNNN` end-of-message line. The header is built by code from fields (originator, event, up to 31 location codes, purge time `+HHMM`, issue time `JJJHHMM` in UTC, station id of 8 characters with `/` for call-sign dashes), not written by the model.
- **FR-5** `notam` (existing) gets version 2: the `text` variant is checked against the current FAA domestic format (NOTAM Management Service, cut over in spring 2026, domestic format unchanged), and a third variant `icao` renders the ICAO format (Q) line and A)–G) items for international or future use. The FAA has said it will adopt the ICAO format but has not set a date (FAA NMS FAQ; AOPA reports late 2027 to 2028), so `text` stays the default.
- **FR-6** `nws_weather_warning` (existing) gets version 2 with a `product` enum covering the short-fuse warnings it renders today plus the follow-ups and watches tabletop exercises need: Severe Weather Statement / Flash Flood Statement (VTEC actions `CON`, `EXT`, `CAN`, `EXP`), Special Weather Statement (no VTEC), and Watch county notification. The VTEC string (`/O.NEW.KXXX.FF.W.0012.YYMMDDTHHMMZ-YYMMDDTHHMMZ/`) and UGC line are built by code from fields and checked against NWSI 10-1703; product layout follows NWSI 10-511 and its examples. Offices stay real NWS offices; counties come from the scenario.
- **FR-7** `ics_213_general_message` (existing) is checked block by block against the FEMA ICS Forms Booklet (FEMA 502-2) and the current fillable ICS 213: block numbers, labels and the reply section. Any difference is fixed and the template version bumped. If a field is added beyond FEMA's, the form is labelled as adapted, as the booklet requires.
- **FR-8** Every new or changed template ships `schema.json`, `preview.json`, `meta.json` with a `taxonomy` entry in `src/shared/taxonomy.ts` (category `operational`, render `template`), goldens per variant, and an exercise marking. Preview data uses fictional organizations and people with real geography, real NWS offices and real FAA identifiers (memory rule: fictional orgs, real places).

**Exports**

- **FR-9** New export targets in `EXPORT_TARGETS` (`src/shared/ipc/export.ts`): `conducttr_csv`, `eoc_package`, `cap_xml`. They appear on the Export screen under a new group "For other platforms".
- **FR-10** `conducttr_csv` writes `<Title>-S<n>-conducttr-mel.csv` with the columns of Conducttr's core MEL import template in this order: `Day, Serial, Number, Time, From, Faction, To, To type, Team, Method, Subject, Message, Timestamp, Expected Action, Expected Action Title, Expected Action ImageURL`. Mapping:

  | Conducttr column           | From Action Stations                                                                                             |
  | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | `Day`                      | scenario title (one tab)                                                                                         |
  | `Serial`                   | phase name                                                                                                       |
  | `Number`                   | MSEL row id (`I-07`); Conducttr ignores it on import                                                             |
  | `Time`                     | row `time` (H:MM since STARTEX) as `HH:mm:ss`                                                                    |
  | `From`                     | row `from`                                                                                                       |
  | `Faction`                  | empty                                                                                                            |
  | `To`, `To type`            | `All` / empty when the row goes to everyone; otherwise one CSV row per recipient role name, `To type` `Position` |
  | `Team`                     | empty                                                                                                            |
  | `Method`                   | channel from the inject type (table in Design); unknown types `Email`                                            |
  | `Subject`                  | inject title                                                                                                     |
  | `Message`                  | the inject's text rendition (FR-13)                                                                              |
  | `Timestamp`                | empty                                                                                                            |
  | `Expected Action`          | row `expectedAction`                                                                                             |
  | `Expected Action Title`    | purpose tag and objective ids                                                                                    |
  | `Expected Action ImageURL` | empty (Conducttr needs media it already hosts)                                                                   |

  A companion `conducttr-media.csv` lists `Number, file` for every rendered image, audio and video file, copied into `conducttr-media/`, so the controller can upload them and paste the URLs. The column list was taken from Conducttr's public help page (Import Master Events List from Excel file, read 2026-10-28) and is marked "verified against documentation, not against a live import" until a Conducttr user confirms it.

- **FR-11** `eoc_package` writes a folder `<Title>-S<n>-eoc/` with: `msel.xlsx` and `msel.csv` in the HSEEP column layout from #420 (time, inject #, from, to, method, inject, expected action, objective/capability, notes) plus `media file` and `channel` columns; `injects/<row id>-<slug>.txt` with each inject's text rendition; `media/` with rendered PNG/PDF/audio/video named by row id; `README.txt` explaining how to load them. The README says that WebEOC's Simulator and SimulationDeck publish no file import format, that Juvare loads MSELs on request and that WebEOC's Board Data Manager imports XLSX/CSV into boards an administrator configures. The `channel` column groups injects by SimulationDeck's channels (broadcast TV news, online newspaper, social media, radio, blogs, video) so a controller can post them there. The package is marked **unverified** in the UI and the README.
- **FR-12** `cap_xml` writes `cap/<row id>.xml` for every `cap_alert` inject: a CAP 1.2 document in namespace `urn:oasis:names:tc:emergency:cap:1.2`, with `status` `Exercise` (or `Test`), `<note>` "EXERCISE – NOT A REAL ALERT", and the headline prefixed with "EXERCISE". It validates against the CAP 1.2 XSD shipped as a test fixture. Intended for agencies whose alerting software can import CAP into a practice or training environment.
- **FR-13** Text rendition: a function per template renders the inject's fields as plain text in reading order (for EOC platforms, Conducttr messages, screen readers in #435 and the alt text of deck images). Templates without a dedicated function fall back to a generic "Label: value" list built from `schema.json` titles and field order.
- **FR-14** No export, template or schema can produce a CAP message with `status` `Actual`, an EAS header without the exercise marking in the visible text, or a NOTAM without the exercise marking. The marking is part of the template layout, not a removable field.

### Non-functional requirements

- **NFR-1** Cost: no paid service, no vendor SDK or account; CSV/XLSX through the existing `exceljs` dependency; XML written by a small escaping writer (no new dependency).
- **NFR-2** Privacy: exports are local files; nothing is sent to WebEOC, Conducttr or IPAWS (Project rules 3).
- **NFR-3** Accessibility: new templates meet the template guide's contrast rules; the EAS crawl uses the high-contrast colors broadcasters use and a minimum 28 px text at 1280×720; the CSV and XLSX have header rows and no merged cells.
- **NFR-4** Exactness: every visible character of a CAP, EAS, NOTAM, NWS or ICS 213 inject comes from a field or from code, never from image generation (Project rules 5). The code-built strings (SAME header, VTEC, UGC, CAP times) have unit tests with examples from the cited sources.
- **NFR-5** Platforms: CSV in UTF-8 with BOM (Excel on Windows), CRLF line ends, RFC 4180 quoting.

### Out of scope

- Sending anything to a live system: IPAWS-OPEN, an EAS encoder, WebEOC's API, Conducttr's API.
- Conducttr's extended template columns (questions, social metrics, website hacking); a later issue can add them.
- Importing MSELs from these platforms.
- Non-US formats (Canada's NAAD/CAP-CP, EU-Alert); the CAP template's structure allows them later through packs.

## Design

### Templates (`templates/injects/`, in the core bundled pack)

| Type                      | Status       | Size             | Variants                  | Code-built strings          |
| ------------------------- | ------------ | ---------------- | ------------------------- | --------------------------- |
| `cap_alert`               | new          | 900 × auto       | `review`, `xml`           | CAP times, XML body         |
| `eas_broadcast`           | new          | 1280 × 720       | `tv_crawl`, `decoder_log` | SAME header, crawl sentence |
| `notam`                   | v2           | 900 × auto       | `text`, `tfr`, `icao`     | Q line (ICAO)               |
| `nws_weather_warning`     | v2           | 760 × auto       | (product enum)            | VTEC, UGC, issuance line    |
| `ics_213_general_message` | v2 if needed | 816 × 1056 paper | `default`, `blank`        | none                        |

Code-built strings cannot be computed inside a template (helpers are the app's fixed list, and pack templates may not add any). They are computed in main before rendering by a **derived fields** step: `src/main/render/derived/` with one module per type (`cap.ts`, `same.ts`, `vtec.ts`, `notam-q.ts`), registered by inject type in `src/main/render/derived/index.ts`. `compose.ts` merges the result under `derived.*` (never overwriting `fields`), so templates write `{{derived.sameHeader}}`. Derived values are deterministic and covered by the goldens. A pack template of the same type gets the same `derived` data.

`schema.json` for `cap_alert` uses enums for every CAP code list, `maxLength` 90 / 360 for the WEA texts and anchored patterns that pass the pack regex rule (`^[0-9]{6}$` for SAME location codes, `^[A-Z]{3}$` for event codes). The SAME event code list (47 CFR 11.31(e)) lives in `src/shared/alerting/same-events.ts` and feeds both the schema's enum (generated into `schema.json` by a script and checked by a test) and the EAS crawl wording ("TORNADO WARNING", "CIVIL EMERGENCY MESSAGE", "EVACUATION IMMEDIATE").

Station ids: EAS participant call signs are real businesses, so preview data and the generation prompt use an obviously simulated id (`EXERCISE` padded to eight characters, or a fictional call sign the scenario names); the `inject_text` prompt section for these types says so.

### Text rendition (`src/main/export/text-rendition.ts`)

`injectText(inject, template): string`. Per-type renderers for the types above and for `email`, `tweet`, `text_message`, `news_article`, `press_release`, `radio_call`, `phone_call`; the generic fallback for the rest. Used by FR-10, FR-11, and later by #435 (accessible deck) and `src/main/export/views.ts` (deck image `alt`, which today is "`<format> for inject <id>: <title>`").

### Channel map (`src/main/export/platforms/channels.ts`)

One table from taxonomy type to a neutral channel (`email`, `social_micro`, `social_post`, `messaging`, `news_web`, `tv`, `radio`, `phone`, `notification`, `log`, `ticket`, `document`) and from neutral channel to each platform's name (Conducttr `Method`: `Email`, `MicroBlog`, `GoSocial`, `Msngr`, `Websites / News`, `TV`, `Walkie-talkie`, `Phone Call`, `Notification`, `Log`, `Help Desk`; SimulationDeck: broadcast TV news, online newspaper, social media, radio, blogs, video). Pack types without a mapping use their taxonomy category's default.

### Export modules (`src/main/export/platforms/`)

- `conducttr.ts`: rows → CSV (shared `csv.ts` writer: RFC 4180, BOM, CRLF).
- `eoc-package.ts`: reuses the #420 workbook builder for `msel.xlsx`, adds the two columns, writes the folder and `README.txt`.
- `cap-xml.ts`: builds CAP XML from `cap_alert` fields plus `derived` values with an escaping writer.
- `src/main/export/run.ts`: the three targets in `ORDER` after `media` (they reuse the media files); `planTargets` adds `media` when any of them is selected. They are not part of `ZIP_NEEDS`; when selected together with `zip`, their output goes under `facilitator/platforms/` (never `players/`, checked by `assertPlayersOnly`).
- Renderer: `src/renderer/src/routes/export/` gets the "For other platforms" group with one line each on what the file is for and, for `eoc_package`, the "unverified format" note.

### Migrations

Existing injects of `notam`, `nws_weather_warning` and `ics_213_general_message` keep rendering: v2 schemas only add optional fields and enum values. Project copies of these templates (`templates/injects/<type>/` in a project) are not changed; the Templates screen offers the newer version as it does for pack updates.

## Security and privacy

- **Exercise messages leaking into real alerting.** The highest risk in this feature. Mitigations: `status` enum without `Actual`; mandatory exercise marking in headline, note and every visible variant; CAP XML files named and commented as exercise; the README and export screen say to load them only into a training or test environment. A unit test parses every exported CAP file and fails on `Actual` or a missing marking.
- **CSV injection** in Excel (cells starting with `=`, `+`, `-`, `@`): the CSV/XLSX writers prefix such cells with `'`. Note that a SAME header starts with `ZCZC` and VTEC with `/`, which are safe; a `-` leading cell is escaped.
- **XML injection**: all CAP values are escaped; no DOCTYPE, no entities, no processing instructions beyond the XML declaration.
- Templates stay inside the render sandbox (ADR-0008, #301); new templates pass `checkTemplateFiles`.
- Nothing leaves the computer.

## Testing

- Unit: `same.test.ts` (header from fields, 31-code limit, call-sign slash rule, JJJHHMM in UTC across a year boundary, purge time rounding), `vtec.test.ts` (examples from NWSI 10-1703), `cap.test.ts` (time format without `Z`, enums, 90/360 limits, Spanish block), `notam-q.test.ts`, `channels.test.ts` (every built-in taxonomy type has a channel), `conducttr.test.ts` (exact header row, quoting, recipients split, time formatting), `eoc-package.test.ts` (files present, README, unverified flag), `cap-xml.test.ts` (validates against the CAP 1.2 XSD fixture in `tests/fixtures/cap/`, refuses `Actual`), `text-rendition.test.ts`, CSV formula escaping.
- Template goldens: `pnpm test:templates` for every variant of the five templates; schema files pass the pack regex rule (`schema-regex.test.ts` already covers built-ins).
- Generation: mock-provider run producing a `cap_alert` and an `eas_broadcast` inject that validate against their schemas.
- e2e (`e2e/export-platforms.spec.ts`): export the three targets for an example scenario; files exist; ZIP keeps them out of `players/`.
- Manual verification task (task 8): import the Conducttr CSV into a Conducttr trial and record the result in the spec.

## Tasks

1. **Derived fields step.** `src/main/render/derived/{index,same,vtec,cap,notam-q}.ts` with tests; merge in `src/main/render/compose.ts`; `docs/guides/templates.md` section "Derived values".
2. **`cap_alert` template.** `templates/injects/cap_alert/*`, `src/shared/alerting/same-events.ts`, `src/shared/taxonomy.ts`, `packs/bundled.json` mapping, goldens, `prompts/inject_text.md` guidance for alerting types.
3. **`eas_broadcast` template.** `templates/injects/eas_broadcast/*`, taxonomy, goldens.
4. **NOTAM, NWS and ICS 213 v2.** `templates/injects/{notam,nws_weather_warning,ics_213_general_message}/*`, goldens, `docs/03-INJECT-TAXONOMY.md`.
5. **Text rendition and channel map.** `src/main/export/text-rendition.ts`, `src/main/export/platforms/channels.ts`; deck image `alt` in `src/main/export/views.ts` uses the rendition.
6. **Conducttr CSV.** `src/main/export/platforms/{csv,conducttr}.ts`, `src/shared/ipc/export.ts`, `src/main/export/run.ts`, Export screen group.
7. **EOC package and CAP XML.** `src/main/export/platforms/{eoc-package,cap-xml}.ts` (after #420 lands its workbook builder), `tests/fixtures/cap/CAP-v1.2.xsd`, e2e spec.
8. **Docs and verification.** `docs/guides/getting-started.md` export section ("For other platforms"), a new `docs/guides/eoc-platforms.md` (what each file is, how to load it, what is verified), ADR for derived fields, CHANGELOG; record the Conducttr import check.

## Open questions

1. **WebEOC / SimulationDeck format.** No public import format was found: Juvare's docs describe Simulator managing the MSEL and Board Data Manager importing XLSX/CSV into configured boards; a SimulationDeck brochure says MSELs can be uploaded and Juvare staff can load them. Recommendation: ship the HSEEP-layout package marked unverified, and ask an agency running WebEOC for a sample Simulator or SimulationDeck MSEL template; add a dedicated mapping when one arrives.
2. **Where do derived fields live long term?** Recommendation: in main (`src/main/render/derived/`) keyed by type, as above. Letting packs supply derivation code would break the "no scripts in packs" rule.
3. **Should `cap_xml` exist at all,** given the leak risk? Recommendation: yes, with the guards in FR-12/FR-14; agencies practising with IPAWS training environments need CAP files, and producing them by hand invites copying a real alert.
4. **NOTAM default format after the FAA moves to ICAO.** Recommendation: keep `text` (domestic) as default now and switch the default in the release after the FAA publishes its ICAO transition date.

## Sources

- OASIS, Common Alerting Protocol Version 1.2 (2010): <https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html>
- OASIS, CAP v1.2 USA IPAWS Profile v1.0: <https://docs.oasis-open.org/emergency/cap/v1.2/ipaws-profile/v1.0/cap-v1.2-ipaws-profile-v1.0.html>
- NWS, CAP v1.2 guide (EAS-ORG, CMAMtext): <https://www.weather.gov/media/alert/CAP_v12_guide_03-07-2017.pdf>
- NWS, CAP support for 360-character and Spanish WEA: <https://www.weather.gov/documentation/tb-alerts-CAP-Supporting-360-Character-and-Spanish-WEA>
- 47 CFR 11.31, EAS protocol: <https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-11/subpart-B/section-11.31>
- NWSI 10-1703, VTEC: <https://www.weather.gov/media/directives/010_pdfs/pd01017003curr.pdf>
- NWSI 10-511, WFO severe weather products: <https://www.weather.gov/media/directives/010_pdfs/pd01005011curr.pdf>
- FAA, NOTAM Management Service FAQ: <https://www.faa.gov/about/initiatives/notam/faqs>
- AOPA, FAA begins testing new NOTAM system (2025): <https://aopa.org/news-and-media/all-news/2025/october/09/faa-begins-testing-new-notam-system>
- FEMA, NIMS ICS Forms Booklet (FEMA 502-2): <https://training.fema.gov/emiweb/is/icsresource/assets/nims%20ics%20forms%20booklet.v3.pdf>
- Conducttr, Import Master Events List (MEL) from Excel file: <https://helpdocs.conducttr.com/feature-documentation/designing-and-running/master-events-list/import-master-events-list-mel-from-excel-file>
- Juvare, WebEOC Nexus standard plug-ins (Simulator): <https://docs.juvare.com/webeoc-onnexa/help/get-started/standard-plug-ins.htm>
- Juvare, Board Data Manager: <https://docs.juvare.com/webeoc-onnexa/plug-ins/board-data-manager.htm>
- Juvare, SimulationDeck add-on board: <https://docs.juvare.com/ucp-onuniu/board-list/board-simulationdeck.htm>

## Implementation notes

Where the code differs from the text above:

- CAP XML is checked in tests by a structural check (namespace, element order, enums, exercise marking), not against the XSD; no XML schema validator is a dependency (ADR-0046). `tests/fixtures/cap/` is therefore not used.
- The SAME enum in the schemas is generated once from `src/shared/alerting/same-events.ts` and checked by a unit test; there is no generator script. The list has 55 codes, not 47.
- Platform files are written to `platforms/` of the export folder (`platforms/<Title>-S<n>-eoc/`, `platforms/cap/`), so the ZIP puts them in `facilitator/platforms/` without special handling.
- Structured fields (`vtecInfo`, `ugcInfo`, `issuedAt`, `untilAt`, `timeZone`) were added to `nws_weather_warning`; the typed `vtec`, `ugc`, `issued` and `until` lines still render when they are absent. `product` is an enum that includes every name the version 1 preview used.
- `ics_213_general_message` matched the FEMA 502-2 blocks and labels; only the version and the schema description changed. The deck image `alt` still uses the old text; moving it to the text rendition is left for #435.
- Excel cells use the existing leading-space neutralizer of `xlsx.ts`; CSV cells use a leading apostrophe.
- Task 8's Conducttr trial import has not been done.
