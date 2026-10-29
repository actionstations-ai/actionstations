# Spec 0439: Optional live hazard data for scenarios

Issue: #439 · Milestone: 0.9.0 · Status: Draft · Depends on: — · Related: #21 (secrets), ADR-0014 (domain profiles), ADR-0016 (forward-compatible files)

## Summary

A user can, by choice, fetch recent public hazard information for the organization's location (weather alerts and forecast, recent and historical earthquakes, active fire detections, past disaster declarations) and save it in the project as a dated snapshot. Ideation and the scenario overview can then use the snapshot to propose hazards that fit the place. Nothing is fetched until the user turns the feature on and presses Fetch; the screen says exactly what is sent to which host. After the fetch, everything works offline from the snapshot.

## Source review (checked 2026-10-28)

| Source                    | Endpoint used                                                                                                                                                                                                                                                                                                     | Key                                                                                                                               | Limits and terms                                                                                                                                                                                                                                                                                                                                                                                         | Coverage                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **NWS alerts**            | `GET https://api.weather.gov/alerts/active?point={lat},{lon}` ([alerts docs](https://www.weather.gov/documentation/services-web-alerts))                                                                                                                                                                          | none; a `User-Agent` identifying the application is required ([API docs](https://www.weather.gov/documentation/services-web-api)) | limits not published; the alerts page recommends no more than one request every 30 s and says rate-limit firewalls block clients that exceed limits; "open data, free to use for any purpose"                                                                                                                                                                                                            | US and territories                   |
| **NWS forecast**          | `GET https://api.weather.gov/points/{lat},{lon}` → `properties.forecast` URL → `GET` that URL (12-hour periods, 7 days)                                                                                                                                                                                           | none; `User-Agent`                                                                                                                | as above; grid assignments can change, so the `/points` result is not cached between fetches                                                                                                                                                                                                                                                                                                             | US                                   |
| **USGS earthquakes**      | `GET https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=…&longitude=…&maxradiuskm=…&starttime=…&minmagnitude=…&orderby=time&limit=…` ([FDSN event service](https://earthquake.usgs.gov/fdsnws/event/1/))                                                                                    | none                                                                                                                              | `limit` 1–20000, over 20000 matches is HTTP 400; the service asks automated real-time displays to use the GeoJSON feeds instead (this feature is a user-started one-off query, not a poller); USGS data is U.S. public domain, credit "U.S. Geological Survey" ([copyrights and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits))                             | global                               |
| **NASA FIRMS**            | `GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{west,south,east,north}/{days}` ([area API](https://firms.modaps.eosdis.nasa.gov/api/area/))                                                                                                                                      | **MAP_KEY required**, free, sent by email after sign-up ([map key](https://firms.modaps.eosdis.nasa.gov/api/map_key/))            | day range 1–5; 5,000 transactions per 10 minutes per key, larger requests count as several                                                                                                                                                                                                                                                                                                               | global                               |
| **OpenFEMA declarations** | `GET https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=fipsStateCode eq '{ss}' and fipsCountyCode eq '{ccc}'&$orderby=declarationDate desc&$top=200` ([API](https://www.fema.gov/about/openfema/api), [dataset](https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2)) | none ("free and does not require a subscription or API key")                                                                      | `$top` max 10,000; terms require the statement "This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA." and a citation of endpoint, version and access date ([terms](https://www.fema.gov/about/openfema/terms-conditions))                                                                                                                              | US states, territories, tribal areas |
| **HIFLD**                 | **no live endpoint**                                                                                                                                                                                                                                                                                              | —                                                                                                                                 | DHS sunset HIFLD Open: the portal went offline in August 2025; most layers remain with their original publishers, some moved to HIFLD Secure (restricted), and archives exist on DataLumos and Source Cooperative ([NGAC talk, Aug 2026](https://www.fgdc.gov/ngac/meetings/August_2026_Public_Meeting/HIFLDNext_LightningTalk_Aug2026), [Source Cooperative archive](https://source.coop/seerai/hifld)) | —                                    |

Consequence for HIFLD: this spec supports infrastructure layers by **local file import** only (GeoJSON or CSV the user downloaded from an archive or an original publisher), filtered to the area on this computer. No network call is made for infrastructure data.

## Requirements

### User stories

- As an exercise designer at a coastal water utility, I want ideas that reflect the hazards my area actually has (hurricane watches, past flood declarations), so that the scenario is believable to my staff.
- As a privacy-minded administrator, I want nothing sent anywhere until I start it, and I want to see what is sent to whom.
- As a facilitator, I want the exercise to keep working on an air-gapped laptop after the data was fetched once.
- As a designer, I want to see where each piece of hazard context came from and when, so that I can tell players "based on the 2019 declaration" without overstating it.

### Functional requirements

**Location**

- **FR-1** A project can have a location: label, latitude and longitude, and for US locations the state and county FIPS codes. It is set in Project settings → Location by choosing a county from a bundled offline list ([US Census Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) counties file, with internal point coordinates), or by entering coordinates. No geocoding service is called.
- **FR-2** Coordinates sent to any source are rounded to the precision the user picks: 0.01° (about 1 km, default) or 0.1° (about 11 km). The stored location keeps full precision; only the rounded values leave the computer.

**Opt-in and consent**

- **FR-3** The feature is off by default (Settings → Hazard data → "Allow fetching public hazard data"). While off, no hazard UI offers a fetch and no code path builds a request.
- **FR-4** With the feature on, the project's **Hazard context** screen has a Fetch dialog listing each source with: host name, what is sent (for example "rounded coordinates 41.88, −87.63", "state and county FIPS 17 / 031", "your FIRMS map key"), what comes back, and a checkbox. Sources that do not cover the location are disabled with the reason. Nothing is fetched until the user presses **Fetch**.
- **FR-5** No background, scheduled or automatic fetch exists. Opening a project, generating ideas or starting an exercise never triggers a fetch.

**Fetching**

- **FR-6** NWS: active alerts for the point and the 7-day forecast for the point.
- **FR-7** USGS: two queries, (a) recent: past 30 days, radius 250 km, magnitude ≥ 2.5, up to 100 events; (b) historical: since 1975, radius 150 km, magnitude ≥ 4.5, up to 50 events ordered by magnitude. Radius and thresholds are editable in the dialog within limits (radius 10–500 km).
- **FR-8** FIRMS: VIIRS SNPP near-real-time detections in a box of ±0.5° around the point for the last 1–5 days (default 3). Requires a map key stored in the OS keychain (FR-12). Hidden when no key is saved.
- **FR-9** OpenFEMA: disaster declarations for the county (or the state when no county is set), newest first, up to 200, plus a count by `incidentType`.
- **FR-10** Infrastructure (HIFLD layers): **Import layer file…** accepts GeoJSON (`FeatureCollection`) or CSV with latitude/longitude columns, up to 100 MB, read and filtered on this computer to the radius; the snapshot keeps up to 200 features per layer (name, type, distance, coordinates rounded to 0.01°) and the source the user enters (for example "HIFLD archive, Hospitals, DataLumos copy of 2025-08"). Nothing is sent anywhere.
- **FR-11** Each source runs independently; one failure (timeout, HTTP error, rate limit) does not stop the others. Results show per source: ok, empty, or the error. A source that returned HTTP 429 or a firewall block is not retried automatically; the user can retry after 60 s.

**Keys**

- **FR-12** The FIRMS map key is stored with `setSecret('firms', key)` in `src/main/secrets/` (Electron `safeStorage`; refused when no OS keychain is available, as for provider keys). It is never written to settings, the project, the snapshot, logs or error messages (`redactSecrets` from `src/main/providers/http.ts`). Settings → Hazard data shows "Map key saved" with Replace and Remove, and a link to the FIRMS sign-up page that opens in the browser only when clicked.

**Snapshot**

- **FR-13** A fetch writes a snapshot to the project: when it was fetched, the rounded request parameters, for each source the request URL with any key replaced by `<MAP_KEY>`, the HTTP status, the normalized records, and the attribution text. Raw responses are not kept beyond the normalized records.
- **FR-14** A project keeps up to 10 snapshots; the user can label, pin and delete them. One snapshot can be marked **active** for generation.
- **FR-15** The snapshot is plain data in the project folder, so the exercise works offline after the fetch, the project can be copied to an air-gapped computer, and exports do not need the network.

**Use in generation**

- **FR-16** The Ideas dialog has "Use hazard context" (on when an active snapshot exists). When on, `prompts/ideate.md` receives a compact `hazards` summary (at most about 1,500 tokens): active alerts (event, severity, headline, effective/expiry), a one-line forecast summary per day, recent and historical earthquakes (count, largest with magnitude, place text, date), fire detection count and nearest distance, declaration counts by incident type with the three most recent titles and years, and imported infrastructure counts by layer with the nearest few names.
- **FR-17** The prompt labels this block as context fetched on a date, possibly outdated, and tells the model to use it to choose plausible hazards and seasons, not to state current conditions as facts in the scenario. The scenario stays an exercise: injects say "exercise" as today, and real people are never named (repository naming rule; NWS alerts and FEMA declarations contain no personal names, but the lint below checks).
- **FR-18** A scenario created with hazard context records the snapshot id in `brief.hazardSnapshotId`; `scenario_overview` receives the same block. The scenario's provenance shows "Hazard context: snapshot of <date> (NWS, USGS, OpenFEMA)".
- **FR-19** The controller handbook appendix lists the sources and attribution lines for any scenario that used a snapshot, including the exact OpenFEMA statement and the access date, and "Credit: U.S. Geological Survey" when USGS data was used.
- **FR-20** A realism lint (extending `src/main/generate/lint-realism.ts`) warns when an inject presents a hazard snapshot value (an alert headline, a magnitude, a declaration number) as current in an exercise dated later than the snapshot by more than 30 days.

### Non-functional requirements

- **NFR-1** Cost: every source is free; FIRMS needs a free key. No paid service (CONTRIBUTING, Project rules 1).
- **NFR-2** Privacy: off by default; nothing sent until the user presses Fetch; the dialog states what is sent and where; coordinates rounded; no cookies, no identifying headers beyond the `User-Agent` "ActionStations/<version> (+https://actionstations.ai)" (no user email); no analytics (Project rules 3).
- **NFR-3** Accessibility: WCAG 2.2 AA. The Fetch dialog is a labelled form; per-source results are text with status words, not icons alone; the snapshot viewer is a table with headers; maps are not required to use the feature.
- **NFR-4** Offline: generation with an existing snapshot never touches the network; the e2e test fails on any non-loopback request.
- **NFR-5** Limits: per request 30 s timeout, 5 MB response cap counted on received bytes, https only, at most 3 redirects and only to the same host; fixed host allow-list (`api.weather.gov`, `earthquake.usgs.gov`, `firms.modaps.eosdis.nasa.gov`, `www.fema.gov`).
- **NFR-6** Platforms: macOS, Windows, Linux; no native dependencies.

### Out of scope

- Non-US alert services (for example national weather services outside the US). The design allows more sources later.
- Maps or GIS display.
- Live updates during an exercise.
- Fetching HIFLD Secure or any source that needs an account beyond a free key.

## Design

### Data model

`src/shared/schemas/project.ts`:

```ts
location: z.object({
  label: z.string().max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  stateFips: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
  countyFips: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
  sendPrecision: z.union([z.literal(0.01), z.literal(0.1)]).default(0.01),
}).optional()
```

New `src/shared/schemas/hazards.ts`:

```ts
export const HazardSourceId = z.enum([
  'nws_alerts',
  'nws_forecast',
  'usgs_recent',
  'usgs_historical',
  'firms',
  'openfema',
  'infrastructure',
])

export const HazardSnapshot = z.object({
  id: SafeId,
  label: z.string().max(80).default(''),
  pinned: z.boolean().default(false),
  fetchedAt: z.string(),
  request: z.object({
    lat: z.number(),
    lon: z.number(),
    precision: z.number(),
    stateFips: z.string().optional(),
    countyFips: z.string().optional(),
  }),
  sources: z.array(
    z.object({
      id: HazardSourceId,
      url: z.string().optional(), // key replaced by <MAP_KEY>; absent for imported files
      status: z.enum(['ok', 'empty', 'error', 'skipped']),
      error: z.string().optional(),
      attribution: z.string(),
      accessedAt: z.string(),
    }),
  ),
  alerts: z
    .array(
      z.object({
        event: z.string(),
        severity: z.string(),
        urgency: z.string().optional(),
        headline: z.string(),
        effective: z.string(),
        expires: z.string().optional(),
        areaDesc: z.string(),
      }),
    )
    .max(50)
    .default([]),
  forecast: z
    .array(
      z.object({
        name: z.string(),
        shortForecast: z.string(),
        temperature: z.number().optional(),
        unit: z.string().optional(),
        windSpeed: z.string().optional(),
      }),
    )
    .max(14)
    .default([]),
  earthquakes: z
    .object({
      recent: z.array(Quake).max(100).default([]),
      historical: z.array(Quake).max(50).default([]),
    })
    .default({ recent: [], historical: [] }), // Quake = { mag, place, time, depthKm, distanceKm, id }
  fires: z
    .object({
      days: z.number(),
      count: z.number(),
      nearestKm: z.number().optional(),
      detections: z
        .array(
          z.object({
            lat: z.number(),
            lon: z.number(),
            acqDate: z.string(),
            confidence: z.string(),
            frp: z.number().optional(),
          }),
        )
        .max(500),
    })
    .optional(),
  declarations: z
    .array(
      z.object({
        disasterNumber: z.number(),
        declarationType: z.string(),
        declarationDate: z.string(),
        incidentType: z.string(),
        declarationTitle: z.string(),
        designatedArea: z.string(),
      }),
    )
    .max(200)
    .default([]),
  infrastructure: z
    .array(
      z.object({
        layer: z.string(),
        source: z.string(),
        features: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional(),
              distanceKm: z.number(),
              lat: z.number(),
              lon: z.number(),
            }),
          )
          .max(200),
      }),
    )
    .max(20)
    .default([]),
})
export const HazardIndex = z.object({
  active: SafeId.optional(),
  snapshots: z.array(
    z.object({ id: SafeId, label: z.string(), fetchedAt: z.string(), pinned: z.boolean() }),
  ),
})
```

`Scenario.brief` gains `hazardSnapshotId: SafeId.optional()`.

Project folder:

```
hazards/index.json                HazardIndex
hazards/<snapshotId>.json         HazardSnapshot
```

Bundled data: `src/main/hazards/data/us-counties.json` (name, state, FIPS, internal point lat/lon), built by `scripts/build-gazetteer.mjs` from the Census Gazetteer counties file and bundled into the main build as JSON (about 3,200 rows); source file and date recorded in `src/main/hazards/data/README.md`.

### Main process

New `src/main/hazards/` (these are public data sources, not model or media providers, so they sit outside `src/main/providers/`; they reuse its HTTP helpers):

| File                        | Role                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`                   | `fetchJson` / `fetchText` with the host allow-list, https-only, timeout, size cap, redirect rule, fixed `User-Agent`, built on `src/main/providers/http.ts` |
| `sources/nws.ts`            | alerts + forecast; parses GeoJSON `features[].properties`                                                                                                   |
| `sources/usgs.ts`           | two FDSN queries; distance computed locally (haversine)                                                                                                     |
| `sources/firms.ts`          | reads the key with `getSecret('firms')`; parses CSV; never logs the URL with the key                                                                        |
| `sources/openfema.ts`       | OData query; builds `$filter` from validated FIPS digits only                                                                                               |
| `sources/infrastructure.ts` | local GeoJSON/CSV import in a worker thread (size, feature count and coordinate checks)                                                                     |
| `snapshot.ts`               | runs the selected sources concurrently (max 2 in flight), assembles and writes the snapshot, keeps 10                                                       |
| `summary.ts`                | builds the compact `hazards` prompt variable (pure, token-capped)                                                                                           |
| `gazetteer.ts`              | loads the bundled county list; search by name                                                                                                               |

`src/main/generate/vars.ts` adds the `hazards` variable when the request carries `useHazards` and the project has an active snapshot. `prompts/ideate.md` and `prompts/scenario_overview.md` get an optional `{{#if hazards}}` block; `hazards` is added to their `variables` lists. Prompt `version` bumps to 3.

### IPC

`src/shared/ipc/hazards.ts`, handlers `src/main/ipc/handlers/hazards.ts`. `P = { projectPath }`.

| Channel                                                              | Request                                      | Response                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hazards:settings`                                                   | `void`                                       | `{ enabled, hasFirmsKey, encryptionAvailable }`                                                                                |
| `hazards:settings-save`                                              | `{ enabled }`                                | same                                                                                                                           |
| `hazards:firms-key-set` / `hazards:firms-key-remove`                 | `{ key }` / `void`                           | `{ hasFirmsKey }`                                                                                                              |
| `hazards:gazetteer-search`                                           | `{ query }`                                  | `{ label, stateFips, countyFips, lat, lon }[]` (max 20)                                                                        |
| `hazards:plan`                                                       | `P`                                          | what each source would send and to which host, given the project location and settings (drives the consent dialog; no network) |
| `hazards:fetch`                                                      | `P & { sources: HazardSourceId[], options }` | `{ jobId }`; refused with `FORBIDDEN` when the feature is off                                                                  |
| `hazards:import-layer`                                               | `P & { layer, source }`                      | `{ jobId }` (open dialog in main)                                                                                              |
| `hazards:list` / `hazards:get` / `hazards:update` / `hazards:delete` | snapshot management                          |                                                                                                                                |

`generate:ideas` request gains `useHazards: boolean` (default false).

Settings: `AppSettings.hazards = { enabled: false }` in `src/shared/schemas/settings.ts`.

### Renderer

- Settings → **Hazard data** section: the switch with a plain description of every host, the FIRMS key field.
- Project settings → **Location**: county search, coordinate fields, precision choice.
- New `src/renderer/src/routes/project-home/HazardContext.tsx`: snapshot list, Fetch dialog (from `hazards:plan`), per-source result table, Import layer.
- `src/renderer/src/routes/generate/IdeasPanel.tsx`: "Use hazard context (snapshot of <date>)" checkbox.

### Export

`src/main/export/documents.ts`: handbook appendix "Hazard data sources" (FR-19) when `brief.hazardSnapshotId` is set. Snapshots are not included in packs or the players' folder.

### Documentation

`docs/guides/hazard-data.md` (new: what is sent where, the FIRMS key, the HIFLD situation and where to get layer files), `docs/05-DATA-MODEL.md`, `docs/02-ARCHITECTURE.md` (network calls list), README privacy section, ADR `docs/adr/NNNN-public-hazard-data.md` (opt-in, snapshot, no HIFLD fetch).

## Security and privacy

| Concern                                                | Mitigation                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Revealing the organization's location to third parties | Off by default; consent dialog per fetch; rounded coordinates; only the four hosts listed; no identifying headers                   |
| Key leakage                                            | safeStorage; redaction in errors; snapshot stores `<MAP_KEY>`; unit test asserts the key appears in no written file and no log line |
| Malicious or oversized responses                       | https only; host allow-list; size and time caps; zod parsing with length caps on every string; responses treated as data in prompts |
| OData injection                                        | `$filter` built only from two- and three-digit FIPS strings validated by regex                                                      |
| Imported layer files                                   | parsed in a worker with size and feature limits; no script evaluation; coordinates validated                                        |
| Misuse as real-time warning                            | UI and handbook label the data as a dated snapshot for exercise design, not for operational decisions                               |

Network calls happen only after the user turned the feature on and pressed Fetch (CONTRIBUTING, Project rules 3).

## Testing

- Unit: each source parser against recorded fixtures in `src/main/hazards/sources/fixtures/` (NWS alerts and forecast, USGS GeoJSON, FIRMS CSV, OpenFEMA JSON, an HTTP 429, a truncated body, an oversize body); `http.test.ts` (allow-list, redirect to another host refused, https only); `summary.test.ts` (token cap, ordering); `snapshot.test.ts` (one source failing, retention of 10, key never written); `gazetteer.test.ts`.
- Prompt: `src/main/generate/engine.test.ts` case with a snapshot verifies the `hazards` block is present only when `useHazards` is true.
- E2E: `e2e/hazards.spec.ts` with a local test server on 127.0.0.1 standing in for the four hosts (host mapping injected in test builds only, like `src/main/packs/test-server.ts`): feature off → no Fetch; on → consent dialog shows hosts and values; fetch writes a snapshot; ideas generation with the mock provider runs with the network recorder (`e2e/net-recorder.cjs`) reporting no non-loopback request.
- Live (`LIVE=1`, never in CI): `src/main/hazards/live.test.ts` fetches NWS, USGS and OpenFEMA for a fixed public location (a county seat) and prints counts; FIRMS only when `FIRMS_MAP_KEY` is set in the environment.

## Tasks

1. **Location and gazetteer.** `project.ts` location field, `scripts/build-gazetteer.mjs`, `src/main/hazards/data/`, `src/main/hazards/gazetteer.ts`, Project settings → Location, tests.
2. **Settings, consent plan and FIRMS key.** `settings.ts` field, `src/shared/ipc/hazards.ts` (settings, key, plan), handlers, Settings → Hazard data, secrets use, tests.
3. **HTTP layer and NWS + USGS sources.** `src/main/hazards/http.ts`, `sources/nws.ts`, `sources/usgs.ts`, fixtures, tests.
4. **FIRMS and OpenFEMA sources.** `sources/firms.ts`, `sources/openfema.ts`, fixtures, redaction tests.
5. **Snapshots and Hazard context screen.** `src/shared/schemas/hazards.ts`, `snapshot.ts`, `hazards:fetch`/list/get/update/delete, `HazardContext.tsx`, `e2e/hazards.spec.ts`.
6. **Infrastructure layer import.** `sources/infrastructure.ts` (worker), `hazards:import-layer`, UI, tests.
7. **Generation use.** `summary.ts`, `src/main/generate/vars.ts`, `prompts/ideate.md` and `prompts/scenario_overview.md` blocks, `brief.hazardSnapshotId`, `IdeasPanel.tsx` checkbox, realism lint in `lint-realism.ts`, tests.
8. **Attribution and docs.** Handbook appendix in `src/main/export/documents.ts`, `docs/guides/hazard-data.md`, ADR, data model and architecture docs.

## Open questions

1. **HIFLD: local import only, or also fetch from a community mirror (Source Cooperative, HIFLD Next)?** Recommendation: local import only for 0.9.0. The mirrors are not official, their URLs and formats are still settling, and adding hosts widens what the privacy statement must cover. Revisit if HIFLD Next publishes a stable API.
2. **Default coordinate precision.** Recommendation: 0.01° (about 1 km), needed for a useful NWS point query; offer 0.1° for organizations that do not want a near-exact location sent.
3. **Allow non-US organizations to use USGS and FIRMS (global)?** Recommendation: yes; the dialog disables only the US-only sources (NWS, OpenFEMA) when no FIPS codes are set.
4. **Contact information in the NWS `User-Agent`.** Recommendation: application name, version and the project website only; never the user's email. NWS asks for contact details, and the website gives them a way to reach the maintainers.
5. **Keep raw responses for auditing?** Recommendation: no; the normalized records plus the request URL and access time are enough to cite the source, and smaller files travel better with the project.
