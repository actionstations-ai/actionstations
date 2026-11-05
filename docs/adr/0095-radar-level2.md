# ADR-0095: Radar is decoded from NEXRAD Level II, not taken from archived images

Date: 2026-11-05 · Status: Accepted · Issue: #659 · Spec: [0449](../specs/0449-meteorology.md) FR-5, FR-7 · Related: ADR-0075 (figures), ADR-0076 (case data)

## Context

The weather toolkit shows radar the way forecasters read it: one site, reflectivity, radial velocity and correlation coefficient, with warning polygons and storm motion drawn over it. Spec 0449 asked for a spike before choosing between decoding NEXRAD Level II files and using something lighter (archived Level III products or mosaic images), measured on size and speed.

## Spike

One real volume, KILN (Wilmington, Ohio), 7 May 2024, 20:03Z, from the open AWS bucket `unidata-nexrad-level2` (no account; open data terms).

| Option                                      | What it gives                                                                                 | Size for one 5 minute frame                                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level II volume                             | every tilt, REF, VEL, SW, ZDR, PHI, RHO at full resolution (0.5 degree, 250 m gates, 460 km)  | 10.3 MB whole; the first six records (the lowest tilt, all moments) are 1.3 MB and can be fetched alone with an HTTP range, because each record is its own bzip2 stream and the volume is written lowest tilt first |
| Level III per-site products (N0B, N0G, N0C) | lowest tilt only, quantized products: reflectivity, velocity, correlation coefficient         | 220 kB + 157 kB + 116 kB, three separate files per frame, about 0.5 MB                                                                                                                                              |
| Mosaic images (IEM composite PNG)           | national composite reflectivity only; no velocity, no correlation coefficient, no single site | small per frame, but not a radar display                                                                                                                                                                            |

The decoder written for the spike (`src/main/toolkits/weather/nexrad`) parses the Archive II header and LDM records, decompresses each record with a small bzip2 implementation (Node has none), and reads message type 31. Measured on the whole volume: 2.1 s to decode all 16 tilts; 0.4 s for the lowest two. Decoded sweeps are 720 radials by up to 1,832 gates. Cropped to 150 km and one moment, a sector of 240 radials deflates to a few kilobytes.

Level III decoding needs its own bzip2 handling and packet formats (digital radial, run-length) and still yields only quantized single-tilt products, so it does not remove the decoder work; it removes data (all upper tilts, spectrum width, differential reflectivity) that exercises such as a tilt-by-tilt storm interrogation would want.

## Decision

- **Decode Level II.** One format covers 1991 to today, every moment and every tilt, with the radar's own scale and offset.
- **Fetch only what the exercise uses.** A connector reads the volume's first records with an HTTP range and stops after the tilts the scenario needs (default: the lowest two cuts, which hold reflectivity, correlation coefficient and velocity), then crops to the scenario's area and keeps the radar's 8-bit codes (#661). Per 5 minute frame and site that is about 1.5 MB downloaded and a few hundred kilobytes stored, inside the case data limit (spec NFR-4).
- **Own bzip2 decoder, about 250 lines, checked by CRC.** It is tested against streams made by the standard tool and against the recorded fixture. No dependency is added.
- **A radar figure carries a polar field** (radials by gates, deflated, with scale and offset) and draws the PPI itself into a PNG inside the SVG, so it stays a pure function of its data (ADR-0075), is exact and is never an AI image. Color tables follow the long-standing NWS reflectivity steps, a green/red velocity scale and a correlation ramp; a legend lists the ranges and the text summary states peaks, positions and what each warning polygon contains, so color is not the only cue.
- **Mosaic imagery stays an optional context layer** for a later issue; it is not the radar display.

## Consequences

- The fixture `tests/fixtures/weather/KILN20240507_200303_V06.part` is a real recording cut to five records (two tilts, 120 degree sectors, 0.7 MB) so the tests and goldens run offline.
- The decoder reads 8-bit and 16-bit moments but the figure carries 8-bit moments only (every operational moment the figure uses is 8-bit).
- Super-resolution and split-cut volumes (two sweeps per angle, one with reflectivity and one with velocity) decode as two elevation cuts; the figure picks the cut that has the moment.
- Archives are contacted only when a user fetches an event (spec NFR-2); the connector's host, `unidata-nexrad-level2.s3.amazonaws.com`, is fixed in code.

## Replay connectors (#661)

The weather toolkit names five connectors, each with a fixed public host, a pure estimate and a fetch limited to that host:

- `nexrad-level2` (radar, range requests as above; one features dataset per product, frames chained so each shows until the next scan);
- `spc-storm-reports` (the day files of the Storm Prediction Center; points that appear when reported, plus the same reports as ground-truth events in the same file, which warning verification reads);
- `iem-warnings` (NWS warning polygons from the Iowa Environmental Mesonet VTEC archive);
- `iem-soundings` (radiosonde profiles for the skew-T and hodograph, from the same archive; the IGRA archive the spec names holds only standard and significant levels in a fixed-width format, and the IEM serves the same NWS reports as JSON);
- `nhc-hurdat2` (a storm's best track from the latest HURDAT2 file).

A figure inject points at a frames dataset (`{ dataset }` as the figure's data); the render picks the frame active at the inject's case time (`computeFigures` reads the resolved case data). Model guidance (HRRR GRIB2), satellite (GOES NetCDF) and gauges (USGS, owned by the flooding toolkit) are not fetched yet; the simulated generators (#662) cover those figures until decoders exist. Connector responses are recorded in `tests/fixtures/weather`; `LIVE=1` runs the same fetches against the real archives.

## Simulated events (#662)

Two generators register through the case data framework, so everything they write is labeled simulated:

- `weather-convective`: a storm of one mode (supercell, line, multicell) moving in a straight line past a radar. It writes radar frames (reflectivity, velocity and correlation coefficient on the radar's own 8-bit codes), storm reports along the track (also as ground-truth events), the warning a simulated office issues a set number of minutes before the tornado begins (a polygon along the storm's track), a sounding whose CAPE and shear fit the mode, hourly mesoanalysis and model-temperature grids that move with the storm, and a station's observations as it passes.
- `weather-tropical-cyclone`: a straight track with an intensity history and a wind profile that is linear inside the radius of maximum wind and decays outside it. It writes the track as best-track-like fixes, the sustained wind over time at named places, and the hour tropical-storm-force winds first reach each place, as the ground truth for the hurricane decision timeline.

There is no numerical model: cells are Gaussian shapes with a hook echo, a bowed arc or three cores, a Rankine vortex gives the rotation, and a small disk of low correlation coefficient marks the debris while the tornado is on the ground. Simulated counties are a 25 km grid named by column and row. Radar sites in simulated data are named KSIM unless the author gives another id.
