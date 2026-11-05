# Spec 0449: Meteorology — forecast and warning operations, and the weather toolkit

Issue: #647 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/meteorology.md](../research/domains/meteorology.md)

## Summary

Action Stations can exercise the people who forecast and warn: a National Weather Service-style forecast office, a broadcast weather team, meteorologists embedded with emergency management or a utility, and university meteorology students. They work a real past event replayed from public archives or a simulated one, with the radar, soundings, satellite, model guidance and products they use every day, make warning and decision-support calls under time pressure, and are scored the way the field scores itself (warning lead time and false alarms, decision timelines, consistent messages with partners). Everything they need for products and figures also ships as the **weather toolkit**, so any other domain (airports, utilities, agriculture, venues, schools, transit) can put real weather into its exercises.

## Requirements

### User stories

- As a forecast office's training officer, I want to replay last spring's outbreak with my staff at exercise speed and score our warnings against what was reported.
- As a meteorology instructor, I want a two-hour lab where students assess the environment, brief a mock emergency manager, and issue warnings, without access to operational systems.
- As an Integrated Warning Team organizer, I want one exercise where the forecast office, county emergency managers and broadcasters each see their own products and the same storms.
- As a county emergency manager, I want a hurricane exercise whose decision timeline is driven by forecast tropical-storm-force wind arrival and our clearance times.
- As an airport operations manager, I want thunderstorms and a TAF amendment in my airport exercise without building a meteorology exercise.

### Functional requirements

**Domain**

- **FR-1 Meteorology domain.** A `meteorology` domain profile with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3), with variants for a forecast office, a broadcast team and an embedded meteorologist; aliases as listed.
- **FR-2 Threat families and arcs.** Hazard families (convective outbreak, flash flood, tropical cyclone, winter storm, heat, fire weather, aviation weather) and a **service degradation** family (radar outage, data or dissemination failure, office evacuation and service backup, staffing shortfall, misinformation), each with its phase arc (for warning operations: outlook → environment → watch → warnings → reports and verification → storm survey and recovery), using extensible families (spec 0448 FR-15).

**Weather toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for: convective outlook (with map figure), mesoscale discussion, watch (text and box map), local storm report, public information statement (including damage survey), area forecast discussion, hazardous weather outlook, decision-support briefing (one page and slides), tropical cyclone public advisory, forecast discussion, forecast cone and wind speed probabilities (map figures), tropical cyclone local statement, storm surge watch/warning, excessive rainfall outlook, METAR, TAF, SIGMET and center weather advisory, red flag warning and fire weather forecast, and partner chat messages. The existing warning, CAP and EAS templates gain impact-based damage threat tags and a warning polygon map.
- **FR-4 Format rules.** Lint checks for the products' fixed formats (VTEC and UGC already exist; add METAR/TAF syntax, LAT...LON polygons, product headers and time conventions), and generator knowledge so drafts use the right product for the right time (a watch before warnings in its area, a statement after a warning, etc.).

**Weather toolkit: figures**

- **FR-5 Instrument figures.** Figure kinds (spec 0448 FR-4) for: radar display (single site, reflectivity, velocity, correlation coefficient; range rings, county lines, warning polygons, storm motion), satellite (visible, infrared, water vapor), sounding (skew-T with parcel and key indices; hodograph), meteogram, model guidance panel (one field over the area with contours or colors), ensemble plume, mesoanalysis parameter map, river hydrograph (shared with the flooding toolkit). Each produces the text summary and data table of spec 0448 FR-5.
- **FR-6 Never fake data.** Weather figures are drawn from case data only, historical or simulated (spec 0448 FR-7, FR-10); an AI image is never used for radar, satellite, charts or maps. Photographic injects (damage, flooding streets, a funnel cloud reported by a spotter) stay AI or template as today.

**Weather toolkit: data**

- **FR-7 Event finder and replay.** Find a past event by date and place (or by storm name for hurricanes) and fetch, with consent and a size estimate, the matching data for the scenario's area and times: radar (NEXRAD Level II on AWS open data), storm reports, outlooks, mesoscale discussions and watches (SPC archive, Iowa Environmental Mesonet), warnings and their polygons (Iowa Environmental Mesonet VTEC archive), soundings (NCEI IGRA), hurricane advisories, cones and tracks (NHC GIS archive, HURDAT2), model guidance (HRRR archive on AWS; GFS where the archive reaches), satellite (GOES on AWS), river gauges (USGS). The scenario's dates, places and products follow the replayed event; exercising organizations stay fictional (project naming rule).
- **FR-8 Simulated events.** For a fictional event, parameters (storm mode and track, timing, intensity; or a hurricane track and size) produce consistent simulated case data: radar fields, reports along the track, polygons, a sounding consistent with the storm mode, model panels; all labeled simulated.

**Exercise play**

- **FR-9 Warning decisions.** A structured decision (spec 0448 FR-14) "Issue warning" (type, area drawn on the map or chosen by county, duration, impact tags, basis), "Issue statement", "Cancel/expire" and "Brief partner" (who, key message, time), available to players in live play and to the facilitator in Facilitate.
- **FR-10 Integrated Warning Team play.** Seats for the forecast office, emergency managers and broadcasters see the products relevant to them; the hot wash compares their messages (spec 0448 message consistency).
- **FR-11 Hurricane decision timeline.** For tropical cyclone scenarios, a timeline figure and metric compare emergency management decisions with the arrival of tropical-storm-force winds minus clearance times (entered per zone from the community's hurricane evacuation study).

**Evaluation**

- **FR-12 Warning verification.** The decision timing metric configured for warnings: probability of detection, false alarm ratio, critical success index, lead time per event and on average, against storm reports (historical) or simulated ground truth, with the known caveats shown (polygon-based scoring does not penalize unverified warnings in lead time).
- **FR-13 Core capabilities.** EEGs for Public Information and Warning, Situational Assessment, Operational Communications and Planning with meteorology-specific critical tasks.

**Knowledge**

- **FR-14 Document library.** A public-domain library pack: NWS directives for warning, tropical and VTEC products, impact-based warning guidance, StormReady and SKYWARN material, NHC product descriptions, FEMA hurricane evacuation study and HURREVAC fact sheets, and example IWT exercise documents (verify each license and URL when building the pack).
- **FR-15 Examples.** (1) Warning operations: a fictional broadcast weather team and a fictional county emergency management agency replaying a real past convective event. (2) Hurricane decision support for a fictional coastal county. (3) An airport exercise from the existing airport example using the weather toolkit for a thunderstorm and ground stop.
- **FR-16 Reuse by other domains.** Suggested toolkits added to the airport, energy utility, food and agriculture, stadium and venue, K–12, transit, freight rail, port and maritime, public health, municipal and emergency communications profiles; `cap_alert` and `eas_broadcast` added to the emergency communications and municipal profiles.

### Non-functional requirements

- **NFR-1 Cost:** only free public archives; no accounts or keys.
- **NFR-2 Privacy:** archives are contacted only when the user fetches an event for a scenario; nothing about the user's plans is sent.
- **NFR-3 Accessibility:** every weather figure has a text summary; color scales for radar and models follow published palettes with a legend, and the summary carries the values a color-blind reader would need.
- **NFR-4 Size:** radar and model data are cropped to the scenario's area and cut to the frames the exercise uses (default: one radar frame per 5 minutes of case time per site).
- **NFR-5 Accuracy:** formats verified against the official product specifications; a meteorologist review of the templates and examples before release (owner to arrange).

### Out of scope

- An operational forecasting workstation or warning software; products are exercise products marked as exercises.
- Running weather models.
- Live data during a session.

## Design

- **Domain:** `packs/domains/meteorology.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/weather/` (toolkit JSON, templates, knowledge fragments, lint rule configuration).
- **Figures:** `src/main/render/figures/weather/` (radar, satellite, skew-T, hodograph, meteogram, model panel, plume, mesoanalysis); shared map overlay code from spec 0448.
- **Radar decoding:** NEXRAD Level II decoding in the main process (a small decoder for message 31 with bzip2 blocks), producing polar arrays rendered to a raster with the standard color tables; a spike first measures size and speed against a lighter option (archived Level III or mosaic images) and records the choice in an ADR.
- **Connectors:** `src/main/toolkits/connectors/{nexrad,spc,iem,nhc,igra,hrrr,goes,usgs}.ts`, each with an estimate, a fetch cropped to the scenario's area and times, and recorded-response tests.
- **Simulated generator:** `src/main/toolkits/weather/simulate.ts`: parametric cells (reflectivity cores, hook echoes for supercells, a bow echo for lines), velocity couplets, reports along tracks, polygons from a warning-decision model, hurricane wind fields from a parametric profile.

## Security and privacy

As spec 0448: fixed archive hosts per connector, size limits, files only in the scenario folder, consent before fetching.

## Testing

Golden images for each weather figure from fixed fixtures; decoder tests on a recorded Level II file; connector contract tests with recorded responses and opt-in live tests; lint tests for each product format; warning verification tests on a worked contingency table; example projects generated end to end with the local model before release.

## Tasks

1. **#657** Meteorology domain profile, roles and variants, threat families and arcs (FR-1, FR-2).
2. **#658** Weather product templates and format lint (FR-3, FR-4).
3. **#659** Radar decoding spike and ADR, then the radar figure (FR-5 radar).
4. **#660** Sounding, satellite, meteogram, model panel, plume and mesoanalysis figures (FR-5).
5. **#661** Event finder and connectors for replay (FR-7).
6. **#662** Simulated weather events (FR-8).
7. **#663** Warning decisions, IWT play and hurricane decision timeline (FR-9–FR-11).
8. **#664** Warning verification metric and meteorology EEGs (FR-12, FR-13).
9. **#665** Document library pack (FR-14).
10. **#666** Examples and reuse in other domains (FR-15, FR-16), user guides.

## Open questions

- **Meteorologist review.** Accuracy needs a forecaster's review of the templates, figures and examples before release. Recommendation: ask a WCM or a broadcast meteorologist from the owner's network, or a university meteorology faculty member.
- **Radar decoding path.** Decided by the spike in #659 (Level II decoding vs. archived images).
