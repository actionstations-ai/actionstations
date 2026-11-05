# ADR-0110: Wildfire data, spread illustration and shutoff windows

Date: 2026-11-05 · Status: Accepted · Issues: #784, #787, #792, #800 · Spec: [0461](../specs/0461-wildfire.md) · Related: ADR-0075 (figures), ADR-0076 (case data), ADR-0081 (flooding data)

## Context

The wildfire toolkit needs fires to draw and replay, evacuation zones whose status every partner repeats, power shutoff notices with clocks, and smoke at schools and hospitals. It must not present a spread model as a prediction, must not claim minute-by-minute truth from perimeters that were mapped a few times a day, and must not hard-code one state's shutoff rule as a national requirement.

## Decision

- **Maps use the shared overlay code.** The fire map and smoke map build overlay layers (polygons, points, lines with times) and draw them with `mapFigure` from `src/shared/maps/overlays`, the code the map view and exports already use. The zone status words are in every label, legend entry and table row. The wildfire boards and the AQI series are drawn in `src/main/render/figures/fire/`.
- **Spread is an ellipse with a published ratio.** `simulate/spread.ts` grows an ellipse whose length-to-breadth ratio is Anderson (1983) from the midflame wind; head, back and flank rates follow from the standard ellipse relations. The base rate by fuel and the wind, slope and suppression multipliers are parametric, not calibrated. Every dataset is labeled simulated and the perimeter dataset says it is not a fire behavior prediction.
- **Arrival and the latest order time are data.** The generator writes, for each zone, the arrival time and the latest time to order (arrival less the zone's clearance). A modeled series of minutes past that time crosses 0 there, so the generic threshold timing metric scores each zone against its own deadline with no per-zone configuration.
- **Replay never claims continuity.** Real perimeters come from the NIFC services (the GeoMAC history for 2000 to 2019, the WFIGS layer after, the current layer for fires burning now) and are labeled historical and dated. Frames between two mapped perimeters are interpolated by the app (`replay.ts`) and carry the basis `interpolated`.
- **Smoke and air quality are simple rules.** A plume wedge downwind in three densities and PM2.5 from a falloff along and across the wind; the AQI uses the EPA breakpoints in effect since 6 May 2024. Local school and event thresholds are plan settings, not federal rules.
- **Shutoff windows are an example rule.** The windows (48-72 hours for public safety partners, 24-48 hours for customers, 1-4 hours before, and at de-energization) come from California decision D.19-05-042 (read in the decision text, page 86 and Appendix A page A8); a later decision, D.21-06-034, updated the guidelines and was not read. The scenario writes the windows it uses as ground-truth events, the metric reads those, and a project can change them. Circuits, customers and facilities are generated from a seed and are always fictional.
- **Connectors have fixed hosts and keep keys out of messages.** NIFC (`services3.arcgis.com`), NOAA HMS (`satepsanone.nesdis.noaa.gov`), NASA FIRMS (`firms.modaps.eosdis.nasa.gov`) and EPA AirNow (`www.airnowapi.org`). The FIRMS key is the one hazard data stores under `firms`; the AirNow key is stored under `airnow`. A key is scrubbed from every error, and a request carries a fire name, a year, a rounded box or an hour, never plan content.

## Consequences

- A spread illustration looks like a fire but is not one; the controller handbook and the figure say so. Teams that want realism replay a real fire.
- FIRMS and AirNow fixtures are written from the services' documentation because both need a key; the opt-in live tests check them.
- Both keys live in the keychain store hazard data already uses (`firms` and `airnow`), are entered under Settings, Hazard data, and are read by the connectors from there. Without a key a connector reports that it needs one.
