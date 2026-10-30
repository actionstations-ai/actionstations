# Spec 0436: Map view of injects

Issue: #436 · Milestone: 0.9.0 · Status: Mostly implemented (0.9.0 PR 1; follow-ups #500). Map on devices (`map.state`) is built (#500). Still open: tile pyramid, offline place labels, Locations pages for geo maps, packaged WebGL check. Changes: `maps:snapshot` takes `{ projectPath, scenarioId, mapId, audience }` (site plans only) and draws with `map_annotation`; Locations pages are HTML pages drawn from project data · Depends on: #444 for FR-14 · Related: #417 (controller dashboard), #411/#412 (player page, inject delivery), #439 (live hazard data), #440 (regional exercises), #442 (update notifications), facility facts (#143)

## Summary

Injects can be placed on a map:

- A **site plan**: an image or PDF page of the facility, such as a terminal plan, a dam's site
  drawing or a campus map. Places are pinned by percentage coordinates.
- A **geographic map**: places are pinned by latitude and longitude. The map data comes from
  one of three sources:
  - online tiles, off until the user turns them on;
  - an offline map file per US state that Action Stations publishes;
  - a small area around a site downloaded from OpenFreeMap, or the user's own PMTiles or
    MBTiles file.

Facilitate gets a Map tab that shows delivered, due and upcoming injects at their places. The
presentation window and, optionally, players' devices show the delivered ones. Every download
is started by the user, verified, resumable and attributed.

## Requirements

### User stories

- As an exercise planner, I want to drop the terminal plan PDF in and pin "Gate A1", "BHS
  room" and "AOC", so that every inject that happens there shows on the map.
- As a facilitator, I want to see where the delivered injects are and what is coming next, so
  that I can tell the room "the second alarm is across the airfield".
- As a facilitator in a room with no internet, I want the Ohio map file on my laptop, so that the
  exercise does not depend on the venue's Wi-Fi.
- As a planner preparing at my desk, I want online maps while I place staging areas, so that I
  do not have to download anything first.
- As a regional planner (#440), I want a street map of the county with the staging areas, so
  that agencies see the same picture.

### Functional requirements

**Maps and places**

- **FR-1** Project-level maps in `<project>/maps/maps.json`, at most 20, one default. Each map is a
  `site_plan` (an image in the project) or a `geo` map (a basemap source, see FR-9).
- **FR-2** **Add site plan** imports `.png .jpg .webp` (≤ 50 MP) or one page of a `.pdf` (rendered
  at 200 dpi, capped at 8000 px on the long edge). The original goes to
  `maps/<mapId>/source.<ext>` and the display image to `maps/<mapId>/plan.png`. A project document
  of kind `map` (`DocumentMeta.kind`) can be used directly ("Use as site plan").
- **FR-3** Places are project-level, named points or areas shared by all scenarios:
  `{ id, label, kind, positions[] }`. A position is either `{ mapId, x, y }` in percent of a site
  plan (0–100 from the top-left, the same convention as the `map_annotation` template) or
  `{ mapId, lat, lon }` on a geo map. An area is a polygon of up to 32 points. A place can link
  to a facility fact (`factRef: "<categoryId>:<entry>"`, for example `gates:A1`).
- **FR-4** A **Places** editor lets the user pan and zoom, drop a pin, draw an area, name it, and
  choose a kind (`incident`, `staging`, `command`, `asset`, `public`, `other`). It can also link a
  fact, and **Pin facility facts** lists fact entries not yet placed so they can be dragged onto
  the map.
- **FR-5** MSEL rows reference places with `MselRow.placeIds` (≤ 5). There is a picker in the
  MSEL editor, and the names show in the Facilitate side panel.
- **FR-6** Generation: `msel_phase` receives place labels (≤ 60, fact-linked first) and may
  return `placeIds`. Unknown ids are dropped by the deterministic repairs. A rule pass fills
  `placeIds` when a row's event text names a place label or its fact entry exactly
  (word-boundary match, case-insensitive), with no model call.

**Facilitate**

- **FR-7** A **Map** tab beside the timeline. Pins are drawn per row: delivered (filled, with the
  row id), due (filled with a ring and "due" in the legend), upcoming (outlined, hidden unless
  "Show upcoming" is on, so the screen can be shared without spoilers). Selecting a pin selects
  the row and the reverse. Several rows at one place form a numbered cluster.
- **FR-8** **Show map on screen** sends the map to the presentation window with delivered pins
  only, labels and a legend. It follows the Facilitate view unless unlinked. **Exports:** the MSEL
  PDF and controller handbook can include "Locations" pages rendered with the `map_annotation`
  template (≤ 12 markers per page, split across pages). With live play, **Map on devices** sends a
  `map.state` message (session protocol #406): the map id, a raster snapshot or site plan hash,
  and delivered pins for that role's injects only.

**Basemap sources for geo maps**

- **FR-9** A geo map has one basemap source: `online` (FR-10), `catalog` (an installed state file,
  FR-14), `area` (an OpenFreeMap area download, FR-15) or `file` (an imported archive, FR-16).
  The map can switch sources without losing places, because places are stored in latitude and
  longitude.
- **FR-10** **Online maps** are off by default (CONTRIBUTING, Project rules 3). Settings › Maps
  has a switch with the text: "When on, the map provider receives your computer's IP address and
  the map tiles for the area you view. Nothing else from your project is sent." Providers:
  - **OpenFreeMap** (default): vector tiles from `https://tiles.openfreemap.org/styles/<style>`
    (Liberty, Positron, Bright, Dark). No API key, no request limit, commercial use allowed.
    Attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".
  - **OpenStreetMap standard**: raster tiles from a configurable HTTPS URL (default
    `https://tile.openstreetmap.org/{z}/{x}/{y}.png`) for interactive viewing only, under the OSM
    Foundation tile usage policy (FR-11).
  - **Custom**: a MapLibre style URL or a raster/vector tile URL template the user enters, with an
    attribution field that must be filled.
- **FR-11** OpenStreetMap standard tiles follow the
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/):
  - HTTPS URL only, and the URL is configurable.
  - Requests send the distinct User-Agent `ActionStations/<version> (+https://actionstations.ai)`.
  - The cache honours `Cache-Control`, `Expires` and `ETag` (conditional requests), and keeps a
    tile at least 7 days when the headers do not say.
  - Attribution "© OpenStreetMap contributors" is visible and links to
    `https://www.openstreetmap.org/copyright`.
  - No prefetching (MapLibre `prefetchZoomDelta: 0`, no off-screen tiles), no bulk download, no
    offline save. The OSM cache is not exportable and is never offered as a download source.
- **FR-12** Online requests go through the main process (Design §3), so the User-Agent, cache and
  host checks hold regardless of the renderer. With online maps off, no request leaves the
  computer, and a geo map with an `online` source shows "Online maps are off. Turn them on in
  Settings › Maps or choose offline map data."
- **FR-13** All downloads (FR-14, FR-15) are started by the user and run as jobs:
  - progress and Cancel;
  - resume after Cancel, crash or restart (HTTP Range with `If-Range` on the stored `ETag`, and
    skip-existing for tiles);
  - a byte cap;
  - sha256 verification before the file is used. The app uses sha256 rather than BLAKE3
    because Node's `crypto` has it, so no new native dependency is needed (Open question 5).

**Offline map data**

- **FR-14** **State map files.** The app reads a catalog
  (`https://github.com/actionstations-ai/maps/releases/latest/download/catalog.json`) only when
  the user opens **Download a state map** or clicks **Check for updates**. The catalog lists one
  PMTiles extract per US state, DC and each territory, with size, sha256, bounds, zoom range,
  build date and attribution.
  - The user picks a state, sees the size and free disk space, and downloads it.
  - **Check for updates** compares the installed sha256 with the catalog. The new version is
    downloaded and verified before the old one is removed, and projects that use the state
    switch to the new file.
  - With #442 update notifications on, the monthly catalog can be checked with the app's
    update check. Otherwise only by click.
  - The files are produced by the #444; see Design §6.
- **FR-15** **Area around a site.** The user draws a box (on a state or online map, or by typing
  W,S,E,N) and picks a zoom range. The app downloads OpenFreeMap vector tiles for the box
  within OpenFreeMap's offline terms:
  - at most 3,000 tiles **and** at most 50 MB per download (the plan is refused above 3,000
    tiles, and the download stops at 50 MB);
  - at most 4 parallel requests;
  - the unique User-Agent above.

  The result is a local MBTiles archive with the style's attribution. The estimate ("1,840
  tiles, about 22 MB") is shown before the download starts. This works even with online maps
  off, because it is a separate user action that names the host it contacts.

- **FR-16** **Import your own** `.pmtiles` (vector in the Protomaps or OpenMapTiles schema, or
  raster PNG/JPEG/WebP) or `.mbtiles` (raster or vector), ≤ 4 GB. The app reads the header and
  metadata (bounds, zooms, attribution) and refuses archives without bounds. The user must
  enter an attribution when the metadata has none.
- **FR-17** Styles, glyphs (Latin script) and sprites for offline rendering ship with the app:
  - the Protomaps basemap style for Protomaps-schema archives (state files);
  - an OpenMapTiles-schema style for OpenFreeMap areas and OpenMapTiles imports, which is
    OpenFreeMap's Liberty or Positron style rewritten to local sources; task 5 confirms the
    license.

  Rendering offline needs no network.

- **FR-18** Attribution is always visible: bottom right on every geo map, on the presentation
  window, on devices and on exported pages, taken from the source's metadata. It cannot be
  hidden. Exports also list the map source and build date.

### Non-functional requirements

- **NFR-1** Cost: nothing paid (CONTRIBUTING, Project rules 1).
  - OpenFreeMap and OSM are free.
  - State files are GitHub release assets of a public repository, built by a free GitHub Actions
    workflow (ADR-0023). Release assets have no bandwidth charge, and each file is under the
    2 GiB per-file limit.
  - Libraries: MapLibre GL JS (BSD-3-Clause) and `pmtiles` (BSD-3-Clause). The Protomaps
    `basemaps-assets` are BSD-3 code with OFL fonts.
- **NFR-2** Privacy: no network until the user turns on online maps or starts a download. The
  settings text names what the provider sees (FR-10). Requests carry no cookies, no referrer and
  no project data. Tiles never go to a model provider.
- **NFR-3** Accessibility: WCAG 2.2 AA.
  - A "Locations" list (row id, place, status) mirrors the map, so screen reader and keyboard
    users work from the list.
  - Map controls are labeled buttons, and pin states differ by shape and text.
  - `prefers-reduced-motion` turns off fly-to animation.
  - Download progress is announced at 25 % steps.
- **NFR-4** Performance:
  - An 8000 × 6000 site plan pans and zooms at 60 fps on integrated graphics (tile pyramid,
    Design §4).
  - A local tile request through IPC takes < 10 ms median.
  - The Map tab adds < 20 MB of renderer memory with a 200-row MSEL.
  - Hashing a 2 GB state file takes < 15 s on an M1 (streamed sha256).
- **NFR-5** Platforms: macOS arm64, Windows x64, Linux x64. MapLibre needs WebGL. Without it,
  site plans still work (canvas renderer), and geo maps show "This computer cannot draw vector
  maps. Use a raster archive or a site plan."
- **NFR-6** Storage: state files go in a shared app-level store (Design §2). The Maps settings
  page shows each installed file, its size, the projects that use it, and **Delete**.

### Out of scope

- Georeferencing a site plan to latitude/longitude (Open question 2).
- Routing, distances, live unit positions, 3D and indoor multi-floor maps (a floor is a
  separate site plan).
- Live hazard overlays (#439).
- Keyed commercial map providers (Google, Mapbox, Esri). A custom URL may point at one, but the
  app does not integrate or store keys for them.
- State files outside the US (Open question 6).

## Design

### 1. Data model (`src/shared/schemas/maps.ts`, new)

```ts
export const PercentPoint = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
})
export const GeoPoint = z.object({
  lat: z.number().min(-85.06).max(85.06),
  lon: z.number().min(-180).max(180),
})
// Sha256Hex is the existing schema in src/shared/schemas/pack.ts
export const Bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]) // W,S,E,N

export const BasemapSource = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('online'),
    provider: z.enum(['openfreemap', 'osm', 'custom']),
    style: z.string().max(40).optional(), // openfreemap style name
    url: HttpUrl.optional(),
    attribution: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal('catalog'),
    ids: z
      .array(z.string().regex(/^[a-z0-9-]{2,24}$/))
      .min(1)
      .max(8),
  }),
  // "us-oh"; several for a cross-state region
  z.object({ kind: z.literal('area'), sha256: Sha256Hex }), // OpenFreeMap area in the store
  z.object({ kind: z.literal('file'), sha256: Sha256Hex }), // imported archive in the store
])

export const MapLayer = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('site_plan'),
    id: SafeId,
    title: z.string().max(120),
    source: RelPath,
    image: RelPath,
    width: z.number().int(),
    height: z.number().int(),
    documentId: Id.optional(),
    floor: z.string().max(40).optional(),
  }),
  z.object({
    kind: z.literal('geo'),
    id: SafeId,
    title: z.string().max(120),
    basemap: BasemapSource,
    fallback: BasemapSource.optional(), // e.g. online while planning, catalog in the room
    view: z.object({ center: GeoPoint, zoom: z.number().min(0).max(22) }).optional(),
    style: z.enum(['light', 'dark', 'grayscale']).default('light'),
  }),
])
export const PlacePosition = z.union([
  z
    .object({ mapId: SafeId })
    .merge(PercentPoint)
    .extend({ area: z.array(PercentPoint).max(32).optional() }),
  z
    .object({ mapId: SafeId })
    .merge(GeoPoint)
    .extend({ area: z.array(GeoPoint).max(32).optional() }),
])
export const Place = z.object({
  id: SafeId,
  label: z.string().min(1).max(80),
  kind: z.enum(['incident', 'staging', 'command', 'asset', 'public', 'other']).default('other'),
  factRef: z.string().max(200).optional(),
  positions: z.array(PlacePosition).max(20).default([]),
  note: z.string().max(500).default(''),
})
export const ProjectMaps = z.looseObject({
  formatVersion: z.literal(1).default(1),
  defaultMapId: SafeId.optional(),
  maps: z.array(MapLayer).max(20).default([]),
  places: z.array(Place).max(500).default([]),
})
```

- `MselRow.placeIds: z.array(SafeId).max(5).default([])` in `src/shared/schemas/scenario.ts`.
- `FacilitatorState` (a `looseObject` per specs 0426/0428) gains `map: { mapId?, showUpcoming,
onScreen, onDevices, view? }`.
- `AppSettings.maps` (`src/shared/schemas/settings.ts`): `{ online: { enabled: false, provider:
'openfreemap', style: 'liberty', osmUrl?, customUrl?, customAttribution? }, catalogUrl (default
above), checkUpdates: false }`.

### 2. Where archives live: a shared app-level store

```
userData/maps/
  store.json                      installed archives: sha256, kind (catalog|area|file), catalog id and
                                  build date, bytes, bounds, zooms, attribution, schema, addedAt
  archives/<sha256>.pmtiles|.mbtiles   content-addressed, read-only after verification
  partial/<id>.part + <id>.json   resumable downloads (offset, ETag, expected sha256)
  http-cache/                     online tile cache (FR-11), size-capped at 500 MB, LRU, never exported
userData/maps/catalog.json        last good catalog
```

The decision is a shared app-level store, not the project folder. A state file is up to 2 GB.
Planners keep several projects for organizations in the same state: tabletop series, the
regional exercises in #440, examples. One file per state, referenced by every project that needs
it, avoids copying gigabytes per project. Content addressing (sha256) gives deduplication and
lets a project say exactly which data it was built on. A project stays git-friendly with nothing
to ignore.

The cost is portability. A project copied to another computer refers to archives that are not
there. Two mitigations:

1. The map shows "Map data for Ohio is not on this computer" with **Download Ohio** (catalog) or
   **Locate file** (area/file). The app then hashes the file the user locates and accepts it only
   if its sha256 matches.
2. **Copy map data into the project** (per map) copies the archive to `maps/<mapId>/<sha256>.<ext>`,
   which `PROJECT_GITIGNORE` ignores. The project then resolves the project copy first.

Site plans stay in the project: they are the organization's own material and small.

### 3. Main process (`src/main/maps/`)

```
store.ts       userData/maps store, store.json (writeJsonAtomic), reference counting from opened projects
project.ts     maps.json read/write (serialized per project), path guards
import-plan.ts image → plan.png and PDF page → PNG (pdfjs-dist + @napi-rs/canvas); 512 px tile pyramid
               into maps/<id>/plan-tiles/ (git-ignored, rebuildable); task 2 adds sharp as a direct
               dependency (today it is only a transitive dependency of transformers.js)
archives.ts    open PMTiles (pmtiles library, local file source with positioned reads) and MBTiles
               (better-sqlite3, read-only, query_only, TMS y flip); LRU of 4 handles; a catalog source with
               several ids is served as one composite (first archive whose bounds hold the tile)
online.ts      the only module that fetches tiles: host check against the enabled provider, User-Agent,
               no cookies/referrer, cache per FR-11 (Cache-Control/Expires/ETag, 7-day minimum), no
               prefetch; returns 'offline' errors when online maps are off
catalog.ts     fetch + zod-validate catalog.json (≤ 1 MB), keep last good copy, compare installed hashes
download.ts    resumable HTTPS file download (Range + If-Range, .part, byte cap, idle timeout, redirects
               followed by hand to allowed hosts), streamed sha256, atomic move into archives/
area.ts        FR-15: plan tiles for bbox × zooms against the OpenFreeMap TileJSON, refuse > 3,000 tiles,
               fetch with 4 workers, write MBTiles in a transaction per 100 tiles (resume = skip present
               tiles), stop at 50 MB, compute sha256 at the end
raster.ts      raster snapshots for exports and devices (raster tiles composited with sharp; vector tiles
               rendered by MapLibre in a render-pool sandboxed window using the same asmap protocol)
```

Allowed hosts:

| Use                     | Hosts                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| catalog and state files | `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com` (the same allowlist as Ollama in ADR-0021) |
| OpenFreeMap             | `tiles.openfreemap.org`                                                                                                          |
| OSM standard            | the configured HTTPS host                                                                                                        |
| Custom                  | the host the user entered                                                                                                        |

Every hop must be HTTPS on an allowed host.

### 4. Renderer

- `components/map/MapView.tsx` has two engines:
  - `SitePlanEngine`: a `<canvas>` over `plan-tiles/`, with no WebGL.
  - `GeoEngine`: MapLibre GL JS with `maplibregl.addProtocol('asmap', …)`. `asmap://<mapId>/{z}/{x}/{y}`
    → `maps:tile` IPC → main resolves the map's source (project copy, store archive or
    `online.ts`). Styles, glyphs and sprites come from `asmap://assets/…` in the app bundle. For
    online OpenFreeMap the remote style JSON is fetched by main once per session and its source,
    glyph and sprite URLs are rewritten to `asmap://online/…`, so the renderer never fetches
    `http(s)`.
- The CSP in `src/renderer/index.html` keeps `connect-src 'self' ttx-media:`. Task 4 picks
  MapLibre's CSP build (separate worker file) to avoid `worker-src blob:`. If that is not
  possible, the CSP adds `worker-src 'self' blob:` only.
- `src/shared/maps/pins.ts` `pinsFor(scenario, injects, state, places, mapId, audience)` is shared
  by Facilitate, the presentation window, exports and devices. Audience `room` and `device` never
  include upcoming rows.
- Presentation: `facilitator:present` gains `{ view: 'map', mapId }`.

### 5. IPC (`src/shared/ipc/maps.ts`, new domain file; handlers `src/main/ipc/handlers/maps.ts`)

| Channel                                  | Request                                                            | Response                                                     |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `maps:get` / `maps:save`                 | `{ projectPath }` / `{ projectPath, maps, revision }`              | `ProjectMaps` (stale → `CONFLICT`)                           |
| `maps:import-plan`                       | `{ projectPath, documentId?, page?, title }` (file picked in main) | `{ jobId }` (`map-import`)                                   |
| `maps:import-archive`                    | `{ title }` (file picked in main)                                  | `{ jobId }` (`map-import`, hashes and copies into the store) |
| `maps:catalog`                           | `{ refresh: boolean }`                                             | catalog entries with installed / update-available state      |
| `maps:download-state`                    | `{ ids: string[] }`                                                | `{ jobId }` (`map-download`)                                 |
| `maps:check-updates`                     | `void`                                                             | `{ updates: [{ id, installedSha, latestSha, bytes }] }`      |
| `maps:area-plan`                         | `{ bbox, minZoom, maxZoom, style }`                                | `{ tiles, estimatedBytes, allowed, reason? }`                |
| `maps:area-download`                     | `{ bbox, minZoom, maxZoom, style, title }`                         | `{ jobId }` (`map-area`)                                     |
| `maps:tile`                              | `{ projectPath, mapId, z, x, y }` / `{ asset }`                    | `{ data: Uint8Array, contentType, encoding? }`               |
| `maps:plan-tile`                         | `{ projectPath, mapId, z, x, y }`                                  | `{ data }`                                                   |
| `maps:store` / `maps:store-delete`       | `void` / `{ sha256 }`                                              | installed archives with project usage / `void`               |
| `maps:copy-into-project` / `maps:locate` | `{ projectPath, mapId }`                                           | `ProjectMaps`                                                |
| `maps:snapshot`                          | `{ projectPath, mapId, view, audience, width, height }`            | `{ path }` (`.cache/maps/…png`)                              |

Push events: `maps:changed`, `maps:store-changed`. `maps:catalog` with `refresh: true`,
`maps:download-*`, `maps:check-updates` and `maps:area-*` are the only channels that reach the
network besides `maps:tile` with online maps on.

### 6. State map files (published; maps repo issue, to be opened)

- **Source:** the Protomaps daily planet build
  ([downloads](https://docs.protomaps.com/basemaps/downloads)). It is an ODbL Produced Work, and
  OpenStreetMap attribution is required. Protomaps discourages hotlinking its build server and
  recommends copying the tileset, so Action Stations hosts its own extracts and the app never
  contacts the Protomaps build server.
- **Workflow** (in the public repository `actionstations-ai/maps`, free GitHub Actions under
  ADR-0023, monthly plus manual dispatch): run `pmtiles extract <build> us-<st>.pmtiles --bbox=… --maxzoom=15`
  per state, DC and territory, using boundaries from a committed GeoJSON (US Census cartographic
  boundaries, public domain), buffered 10 km. Then:
  1. Verify each file with `pmtiles verify`.
  2. Compute its sha256.
  3. Write `catalog.json`.
  4. Upload everything as assets of a release tagged `YYYY.MM`, marked latest.
- **Size rule:** each asset must be < 1.9 GiB (the per-file limit is 2 GiB). If a state exceeds
  it at zoom 15, the workflow retries at zoom 14. If it still exceeds it, the state is split
  into parts by latitude bands (`us-tx-1`, `us-tx-2`), listed under one catalog entry.
  `archives.ts` serves parts as one composite source. **Sizes are to be measured by the first
  workflow run**. Texas, California and Alaska are the likely splits.
- **Catalog schema** (`MapCatalog` in `src/shared/schemas/maps.ts`):

```ts
MapCatalog = z.object({
  formatVersion: z.literal(1),
  release: z.string(),
  generatedAt: IsoDateTime,
  source: z.object({ name: z.string(), build: z.string(), url: HttpUrl }),
  license: z.literal('ODbL-1.0'),
  attribution: z.string(), // "© OpenStreetMap contributors"
  entries: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{2,24}$/),
        name: z.string(),
        kind: z.enum(['state', 'district', 'territory']),
        bbox: Bbox,
        minZoom: z.number().int(),
        maxZoom: z.number().int(),
        parts: z
          .array(z.object({ url: HttpUrl, bytes: z.number().int().positive(), sha256: Sha256Hex }))
          .min(1)
          .max(8),
      }),
    )
    .max(100),
})
```

- **Trust:** the catalog is fetched over HTTPS from the allowed hosts. Each part's sha256 is
  checked after download, and a mismatch deletes the file and fails the job. The app does not
  sign catalogs, matching the hashes-only trust model of packs (`docs/packs-format.md`).

### 7. UI

Facilitate, Map tab:

```
┌ Timeline | Map ─────────────────────────────────────────────────────────┐
│ Map: [County roads (Ohio, offline) ▾]  ☐ Show upcoming  [Show on screen] │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │        ●I-03          ◉I-07 due                                      │ │
│ │   ▣ EOC (command)                ③ Staging A (3 rows)   [+] [−] [⟲]  │ │
│ │                                         © OpenStreetMap contributors │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ Legend: ● delivered  ◉ due  ○ upcoming  ▣ command  ③ cluster   [List]    │
└──────────────────────────────────────────────────────────────────────────┘
```

Settings › Maps:

```
┌ Online maps ─────────────────────────────────────────────────────────────┐
│ [ ] Use online maps                                                      │
│     When on, the map provider receives your computer's IP address and    │
│     the map tiles for the area you view. Nothing else from your project  │
│     is sent.                                                             │
│     Provider: (•) OpenFreeMap  [Liberty ▾]  ( ) OpenStreetMap standard   │
│               ( ) Custom URL [______________] Attribution [__________]   │
├ Offline map data ────────────────────────────────────────────────────────┤
│ Ohio            1.1 GB  2026.10  used by 3 projects   [Delete]           │
│ Area: Lakeport  21 MB   OpenFreeMap 2026-10-28  used by 1 project        │
│ [Download a state map…] [Download an area…] [Import file…] [Check for updates] │
└──────────────────────────────────────────────────────────────────────────┘
```

The area dialog shows the box, the zoom range and the estimate ("1,840 tiles, about 22 MB,
within OpenFreeMap's 3,000-tile / 50 MB offline limit"). When the plan exceeds the limit it
offers a lower maximum zoom or the state file.

## Security and privacy

| Threat                               | Mitigation                                                                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network use without consent          | Online maps off by default, with a settings text that says what the provider sees. Downloads and catalog fetches only on click (or #442 opt-in). Every request is in `online.ts`/`download.ts`/`area.ts` in main, with no renderer fetches.                                       |
| Breaking provider terms              | The OSM standard provider gets distinct UA, header-honoured cache, no prefetch and no download or offline save (FR-11). OpenFreeMap areas are capped at 3,000 tiles / 50 MB / 4 parallel with a unique UA (FR-15). The Protomaps build server is never contacted by the app (§6). |
| Tampered or corrupt state file       | sha256 per part from the catalog, verified before use, atomic move into the content-addressed store. Archives are read-only afterwards.                                                                                                                                           |
| Malicious imported archive           | Size cap (4 GB). PMTiles directory sizes and tile lengths are bounded before reading. MBTiles opens read-only with `query_only`. A tile is ≤ 2 MB, and gzip inflate is capped at 8 MB.                                                                                            |
| Remote style pulling arbitrary hosts | Online style JSON is rewritten in main to `asmap://online/…`, and only the provider's host is fetched. Offline styles ship with the app, and CSP `connect-src` has no `http(s)`.                                                                                                  |
| Path escape via `maps.json`          | Every `RelPath` must sit under `maps/<mapId>/` (`safeJoinReal`, no symlinks). Store paths derive from sha256 only.                                                                                                                                                                |
| Leaking upcoming injects             | `pinsFor` audiences `room` and `device` exclude upcoming rows (unit-tested).                                                                                                                                                                                                      |
| License (ODbL, OpenMapTiles)         | Attribution always visible and exported (FR-18). Catalog files carry license and attribution. The Maps guide explains that sharing a project with copied map data is distributing an ODbL Produced Work.                                                                          |

## Testing

- **Unit:**
  - `pins.test.ts` (states, audiences, clusters) and the schema round-trip with forward
    compatibility.
  - The place-matching rule pass.
  - The area planner: tile counts, refusal above 3,000 tiles, antimeridian boxes refused.
  - MBTiles writer resume (skip present tiles) and TMS y flip.
  - The composite catalog source.
  - The OSM cache policy: `Cache-Control: max-age`, missing headers → 7 days, `ETag`
    revalidation with 304.
  - The host checks.
  - `prefetchZoomDelta: 0` set for the OSM provider.
- **Contract (local fixture server, no internet):**
  - catalog fetch and validation;
  - state download with an interrupted transfer resumed by Range/If-Range, an `ETag` change
    restarting from zero, and a sha256 mismatch failing;
  - redirect to an http URL refused;
  - an area download hitting the 50 MB stop;
  - an online OSM request carrying the app User-Agent.
- **Component:** Settings › Maps (switch text, provider choice), the Places editor keyboard flow
  and the list mirror (happy-dom, engines stubbed).
- **Render:** golden PNG of an exported "Locations" page from a fixture site plan
  (`map_annotation`).
- **e2e:**
  - Site plan: import, pin, assign rows, deliver one, and check the presentation window shows
    one delivered pin and no upcoming pin.
  - Geo map: import a small fixture `.pmtiles` and check tiles load through `maps:tile` while
    Playwright blocks all http.
  - With online maps off, an `online` map shows the off message and makes no request.
- **Live (`LIVE=1`):** fetch the real catalog, download the smallest entry (DC), verify its
  hash. Fetch 10 OpenFreeMap tiles and check the User-Agent and attribution.
- **Packaged smoke:** WebGL on the Linux AppImage in Docker and the Windows VM, and the fallback
  message.

## Tasks

1. **Schemas, store and project maps.**
   - `src/shared/schemas/maps.ts` (incl. `MapCatalog`), `MselRow.placeIds`, `AppSettings.maps`.
   - `src/main/maps/{store,project}.ts`.
   - `src/shared/ipc/maps.ts` and `src/main/ipc/handlers/maps.ts` (`maps:get/save/store`).
   - `PROJECT_GITIGNORE` lines (`maps/*/plan-tiles/`, `maps/*/*.pmtiles`, `maps/*/*.mbtiles`).
   - Tests.
2. **Site plans.** `src/main/maps/import-plan.ts` (image, PDF page, pyramid), `maps:plan-tile`,
   `components/map/{MapView,SitePlanEngine}.tsx`, route `routes/maps/` with the Places editor and
   fact pinning (reads `project:facility-facts`).
3. **MSEL places and generation.** Place picker in the MSEL editor (`routes/scenarios/`), the rule
   pass after `msel_phase` in `src/main/generate/`, the `places` variable in
   `prompts/msel_phase.md`, `MselPhaseOutput.placeIds`, and the repair dropping unknown ids.
4. **Facilitate map and presentation.** `src/shared/maps/pins.ts`, `routes/facilitate/MapTab.tsx`,
   `FacilitatePage.tsx`, the `facilitator:present` map view (`src/main/facilitator/present.ts`,
   `routes/present/`), `FacilitatorState.map`, and the CSP decision (MapLibre CSP build).
5. **Geo engine with imported archives.**
   - Add `maplibre-gl` and `pmtiles`.
   - Bundle the Protomaps and OpenMapTiles-schema styles, glyphs and sprites under
     `src/renderer/src/assets/map-styles/` (license check for the OpenFreeMap style).
   - `src/main/maps/archives.ts`, `maps:tile`, `maps:import-archive`, `GeoEngine.tsx`, the
     attribution control and third-party notices.
   - ADR `docs/adr/00NN-maps-and-map-data.md` (MapLibre + PMTiles, app-level store, providers and
     their terms).
6. **Online maps.** `src/main/maps/online.ts` (providers, User-Agent, header-honouring cache, style
   rewrite, no prefetch) and Settings › Maps in `routes/settings/`. Contract tests.
7. **State files.** `src/main/maps/{catalog,download}.ts` (resume, sha256, updates),
   `maps:catalog`/`maps:download-state`/`maps:check-updates`, the "missing map data"
   locate/download flow, `maps:copy-into-project`, and the #442 hook. Depends on the maps repo
   issue (to be opened) for real data; the fixture server stands in until then.
8. **Area downloads.** `src/main/maps/area.ts` (planner, 4 workers, MBTiles writer, caps),
   `maps:area-plan`/`maps:area-download`, and the area dialog.
9. **Exports, snapshots, devices.** `src/main/maps/raster.ts`, `maps:snapshot`, "Locations" pages in
   `src/main/export/` with `map_annotation`, a golden test, and `map.state` for live play (after
   #411/#412).
10. **Docs.** Maps guide (`docs/guides/maps.md`: site plans, online providers and what they see,
    state files, areas, imports, attribution and ODbL), `docs/05-DATA-MODEL.md`, and
    `docs/02-ARCHITECTURE.md` (app data folder layout).

## Open questions

1. **State file sizes and splits.** _Recommendation:_ zoom 15 everywhere that fits under
   1.9 GiB, zoom 14 next, latitude-band parts last. The first run of the maps repo workflow (maps
   repo issue, to be opened) measures sizes and records them in that repo's README. Revisit
   whether zoom 15 is needed once the sizes are known; street-level labels are readable at 14.
2. **Georeferenced site plans** (aligning a plan to the geo map with three control points).
   _Recommendation:_ defer past 0.9.0. Two positions per place (FR-3) cover it without the math.
3. **Shared store vs. project folder.** _Recommendation:_ shared app-level store (Design §2), with
   per-map **Copy map data into the project** for moving projects between computers. Revisit if
   facilitators often carry projects on USB drives without the app's data folder.
4. **Default online provider.** _Recommendation:_ OpenFreeMap. It has no key, no request limit,
   commercial use, and a vector style that matches the offline style family. OSM standard stays a
   choice for users who prefer it, under its policy.
5. **sha256 or BLAKE3.** _Recommendation:_ sha256. It is in Node `crypto`, fast enough for 2 GB
   (NFR-4), and matches packs and model downloads. BLAKE3 would add a dependency for no
   user-visible gain.
6. **Outside the US.** _Recommendation:_ catalog format v1 allows any `kind`. Add EU countries or
   Canadian provinces when a user asks, through the same workflow, still under the 2 GiB rule.
7. **Catalog update check.** Check monthly in the background? _Recommendation:_ only by click,
   or through the #442 opt-in update check, never on its own (Project rules 3).

## Implementation notes (PR 1)

Built: tasks 1, 2 (images), 4 (Facilitate Map tab), 5 to 8, 10. Differences from the text above:

- **Site plans:** PNG, JPEG and WebP only; PDF pages are refused with a message. No tile pyramid:
  the one image is scaled by the browser. `source` and `image` are the same file, `plan.<ext>`.
- **IPC:** `maps:get`/`maps:save` return `{ maps, revision }`. `maps:import-plan` and
  `maps:import-archive` are direct calls (the file is picked with `dialog:open-files`), not jobs.
  `maps:settings-set`, `maps:basemap` and `maps:fetch` were added; `maps:snapshot` was not.
- **MapLibre 5 has no `prefetchZoomDelta`.** The engine uses `refreshExpiredTiles: false` and a
  small tile cache; main never prefetches (ADR-0060).
- **Offline styles** have no text labels (no glyphs or sprites bundled yet).
- `MselRow.placeIds` is optional. The Facilitate state keeps `map: { mapId?, showUpcoming }`.
- **Deferred:** task 3 (MSEL place picker, `msel_phase` places and the rule pass; `matchPlaces` is
  written and tested), FR-8 (presentation window, exports "Locations" pages, `map.state` for
  devices), `maps:snapshot`, the #442 update hook, free disk space in the state dialog.

### Map on devices (#500)

`map.state` (host-signed, sealed under the players key) is addressed to one device (`client:<id>`),
not to a role. Servers hand `role:` and `team:` frames to every device and the page filters, so a
frame per device is what keeps a role's places off another role's phone. `src/main/live/device-map.ts`
computes each device's pins from the releases that reached its seat (`all`, its role, its team, or
the device itself) and were not withdrawn, resends only when a device's payload changed (after a
release, a resend or a withdraw, and when a device joins), and sends `closed: true` when sharing
stops. A site plan's picture goes once as a sealed blob, shrunk to 1200 px wide when larger and
left out when still over the blob cap. A geographic map sends positions only; the device draws a
schematic of the places (`src/shared/maps/schematic.ts`) with a coordinate list, because the
device bundle is same-origin and has no tile source. The device shows it under More, with a
numbered list as the accessible form. The Facilitate Map tab has a "Map on devices" checkbox
while a session runs (`live:map-share`, `live:map-shared`).
