# ADR-0060: Maps and map data: MapLibre, PMTiles, an app-level store

Date: 2026-10-29 · Status: Accepted · Issue: #436

## Context

Injects happen at places. Planners want a site plan with pins, a street map for regional
exercises, and maps that work in a room with no internet. Project rules say nothing leaves the
computer until the user turns it on, and map providers have terms: OpenStreetMap's tile usage
policy forbids bulk downloads and prefetching, and OpenFreeMap allows small offline areas
(3,000 tiles, 50 MB, 4 parallel requests).

## Decision

- **Renderer:** MapLibre GL JS 5 (BSD-3-Clause, about 1.2 MB as a lazy chunk loaded on first geo
  map) and `pmtiles` 4 (BSD-3-Clause, small). Both are free and have no key. The CSP build of
  MapLibre keeps its worker a same-origin file, so the CSP needs no `blob:` worker. Site plans
  use no WebGL: an image with percent-positioned pins.
- **No network in the renderer.** MapLibre loads everything through an `asmap://` protocol that
  calls `maps:*` IPC channels. Main reads archives or, with online maps on, fetches from the
  chosen provider's host only, with the app's User-Agent, no cookies or referrer, and a disk
  cache that follows `Cache-Control`, `Expires` and `ETag` (7 days when the headers are silent).
  MapLibre 5 has no `prefetchZoomDelta` option, so the engine is set up with
  `refreshExpiredTiles: false` and a small tile cache, and nothing in main prefetches.
- **Map data lives in an app-level store** (`userData/maps/archives/<sha256>`), content-addressed
  and read-only, shared by all projects. A project may copy an archive into `maps/<id>/`
  (git-ignored) to travel. State files come from a catalog published by `actionstations-ai/maps`
  and are verified by sha256 (Node `crypto`, no new dependency). Downloads resume with Range and
  If-Range and follow redirects only to allowed HTTPS hosts.
- **Offline styles are small and have no labels** in this release, so no fonts or sprites are
  bundled. Labels need the Protomaps and OpenMapTiles glyph files and a license check of the
  OpenFreeMap style; that is a follow-up.

## Consequences

- A project copied to another computer needs the map data again (download, locate, or copy it
  into the project first).
- Offline maps show shapes without place names until the glyph work lands.
- OSM standard tiles can never be saved for offline use; the offline paths are state files,
  OpenFreeMap areas and the user's own files.
