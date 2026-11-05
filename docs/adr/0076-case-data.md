# ADR-0076: Case data: provenance, a time mapping and consent before any fetch

Date: 2026-11-04 · Status: Accepted · Issue: #651 · Spec: [0448](../specs/0448-toolkits.md) · Related: ADR-0016 (forward compatibility), ADR-0061 (hazard data)

## Context

Field toolkits need real or simulated data in injects, at the right moment of the exercise, with
a clear record of where it came from. Public archives are free but the app is local-first: no
network call without the user's say-so, and the scenario must work offline afterward. Open data
terms ask that modified data not be presented as original.

## Decision

- **Storage:** `scenarios/<id>/case/manifest.json` (a loose zod object, so a newer build's keys
  survive) plus data files (JSON series and text, GeoJSON, PNG and WebP rasters) and
  `fetch-log.jsonl`. Every write goes through one function that accepts a plain file name with an
  allowed extension, checks image bytes, and refuses a path that leaves `case/` (including by
  symlink).
- **Provenance is enforced by schema:** historical needs a retrieval date and cannot name a
  generator; simulated needs a generator and cannot have a retrieval date. Connectors and
  generators do not write provenance; the framework does, so simulated data cannot pass as
  historical.
- **Time:** exercise minute to case time is a pure function of a start offset, a speed and a list
  of jumps `{atMin, skipMin}`; the inverse maps a case time inside a skipped span to the jump.
  It lives in `src/shared` so the render path and the facilitator view agree.
- **References:** an inject field `{dataset}`, `{dataset, time}` or `{dataset, offset}` is
  resolved in main at render. The fields handed to validation and the template carry the display
  text; the template context gains `caseData` with the full values and labels, and the document
  prints the origin labels. The inject on disk keeps the reference. A time with no data raises an
  error instead of being filled in.
- **Connectors:** `{id, estimate, fetch}` in a registry; `estimate` is pure (it gets only the
  query), `fetch` gets a `get` limited to the connector's fixed https hosts. Consent is two
  steps: `case:plan-fetch` returns the estimate and a one-time id, `case:fetch` needs that id and
  `consent: true`. A fetch that does not fit the room under the limit (default 500 MB, a setting)
  is refused before any request, and the byte cap is enforced while receiving. Hosts are
  validated at registration (no IPs, loopback or private names). No real connectors ship here.
- **Simulated generators:** pure functions from validated parameters to datasets, run by the
  framework, which labels them simulated.
- **Prompts** receive a short note on the datasets that says historical data is history.

## Consequences

- Toolkits name connectors by id; the registry's ids are exposed for that check.
- Raster rendering, map overlays and figures read case data through the same resolver and files.
- Altered historical data must set `modified`, which shows in every label.
- The user's clock mapping is data, so time jumps need an explicit skip amount; a jump card in the
  MSEL does not carry one.
