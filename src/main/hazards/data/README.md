# Hazard data files

`us-counties.json` lists every US county and county equivalent with its internal point, for the
Project settings location picker (#439). No geocoding service is called.

- Source: US Census Bureau Gazetteer Files, counties, 2024 (`2024_Gaz_counties_national.txt`),
  https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
- Built on 2026-10-29 with `node scripts/build-gazetteer.mjs <file>`.
- Row: `[name, state, FIPS (state + county), latitude, longitude]`.
