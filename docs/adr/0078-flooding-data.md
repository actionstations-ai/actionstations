# ADR-0078: Flood data comes from four fixed services and a replay uses observed values

Date: 2026-11-05 · Status: Accepted · Issues: #735, #738, #741 · Spec: [0454](../specs/0454-flooding.md) · Related: ADR-0076 (case data)

## Context

A flood exercise wants real gauge records, flood zones and a believable forecast that changes. The
public services are free and need no key, but they differ in what they keep: the National Water
Prediction Service (NWPS) returns about a month of observed stage and only the current forecast, never
an archive; USGS keeps decades of observed values; FEMA publishes effective regulatory zones; NWS
publishes an experimental modeled extent for the current forecast.

## Decision

- **Four connectors, one per service,** each with a fixed host and a pinned API path: `nwps`
  (api.water.noaa.gov, v1), `usgs-waterdata` (api.waterdata.usgs.gov, ogcapi v0; the retiring
  WaterServices are not used), `fema-nfhl` (hazards.fema.gov) and `nws-fim` (maps.water.noaa.gov).
  Responses are validated before use and an unexpected shape is refused with the service named.
- **Replay uses observed values.** The event finder lists past crests from the gauge record, plans a
  USGS fetch around one and shows that past NWS forecasts are not available. A replay then has
  simulated forecasts built from the observed rise (`flood-replay-forecast`), labeled simulated, or none.
- **Regulatory zones and modeled extents are separate datasets** with different labels and ids and are
  never merged. Boxes sent to the services are rounded to 0.01 degree and never exceed half a degree.
- **Simulation is parametric.** A cosine rise and fall, a kinematic travel time between gauges, forecast
  issuances scaled from the first gauge so a category can change, a step relation from stage to a drawn
  extent with exposure counts, and a rain response for a small basin. No hydraulic model.
- **Gauge records are GeoJSON points** with the point's category stages (missing ones left out), historic
  crests and a thinned rating, the same shape whether fetched or simulated, so the hydrograph builder
  (`hydrographFromCase`) treats both alike.

## Consequences

- A service change is a one-file fix in its connector; live checks (`LIVE=1`) catch it.
- Observed NWPS stage older than a month is never available; the connector says so.
- Simulated extents are illustrations, not hazard maps, and are labeled that way.
