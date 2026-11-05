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
