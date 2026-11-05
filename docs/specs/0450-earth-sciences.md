# Spec 0450: Earth sciences — earthquakes, volcanoes, tsunamis and landslides

Issue: #668 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #647 (meteorology, spec 0449) · Research: [docs/research/domains/earth_sciences.md](../research/domains/earth_sciences.md)

## Summary

Four earth science toolkits (seismic, volcanic, tsunami, and landslide and debris flow) and a geoscience domain let Action Stations exercise both the scientists who monitor and warn (volcano observatories, seismic networks, early warning operations, tsunami warning centers, geological surveys) and everyone who acts on their warnings. Exercises use real past events replayed from public archives, published scenario earthquakes, or simulated events, with the products those teams issue (ShakeMap, PAGER, aftershock forecasts, early warning alerts, volcano notices and ash advisories, tsunami messages, debris-flow hazard maps) and the instruments they read (seismograms, intensity maps, aftershock plots, tide gauges, monitoring time series). Decisions are scored by the clocks that matter in these hazards: protective action before shaking arrives, evacuation before the waves or the lahar, closures before the rainfall threshold. Because they are toolkits, a hospital can add an earthquake, a port a tsunami, and an airport an ash cloud.

## Requirements

### User stories

- As a county emergency manager on the coast, I want a M9 earthquake and local tsunami where we have minutes, not hours, and the exercise times our evacuation against wave arrival.
- As a volcano observatory's scientist-in-charge, I want an unrest sequence where we decide when to raise the alert level and aviation color code, and coordinate statements with emergency management and aviation.
- As a transit operator, I want an early warning alert that tests our automated slowdown, a late alert near the epicenter, and a false alert the next week.
- As a school district near a volcano, I want a lahar exercise timed by the lahar's travel time to our schools.
- As a transportation department, I want a post-fire debris-flow scenario where we decide closures from the hazard map and the rainfall forecast.
- As an airport, I want a volcanic ash advisory and SIGMET in my exercise.

### Functional requirements

**Domain**

- **FR-1 Geoscience domain.** A `geoscience` domain profile with variants for a volcano observatory, a seismic network and early warning operations, a tsunami warning center and a geological survey: roles, systems, outside parties and phrasing as in the research dossier (sections 2–3).
- **FR-2 Threat families and arcs.** Earthquake, volcanic unrest, tsunami, debris flow and ground failure families, and the shared service degradation family (monitoring or telemetry outage, false or missed alerts), with the phase arcs in the dossier (section 8).

**Toolkits: products**

- **FR-3 Seismic toolkit.** Templates for the earthquake event summary, PAGER alert, aftershock forecast, early warning alert on a phone and in an app, early warning automated action log (trains, elevators, doors), building safety placards and inspection reports, lifeline status board.
- **FR-4 Volcanic toolkit.** Templates for the Volcano Activity Notice, the Volcano Observatory Notice for Aviation, the alert level and aviation color code badge, the volcanic ash advisory (text), lahar warning and siren activation; it uses the weather toolkit's SIGMET when both are on.
- **FR-5 Tsunami toolkit.** Templates for tsunami warning, advisory, watch and information statement messages and international threat messages, with the rule that watches are not sent as Wireless Emergency Alerts; the existing CAP and EAS templates carry tsunami events.
- **FR-6 Landslide and debris-flow toolkit.** Templates for the post-fire debris-flow hazard assessment summary, rainfall threshold guidance and road closure notices; ground failure (liquefaction and landslide likelihood) summaries after earthquakes.
- **FR-7 Format rules and knowledge.** Lint and generator knowledge for magnitudes and intensities (Mw and MMI, never mixed up), alert level and color code pairs, early warning thresholds and their timing limits (alerts can arrive after shaking near the epicenter), tsunami message levels and the timing difference between local and distant sources, and the messaging conventions for aftershock probabilities.

**Toolkits: figures**

- **FR-8 Figures.** Figure kinds (spec 0448 FR-4) for: ShakeMap intensity map, "Did You Feel It?" map, epicenter and aftershock map with fault traces, seismogram (from waveform data), aftershock time-magnitude plot and cumulative count, early warning timeline (alert time against shaking arrival by place), volcano monitoring time series (seismicity rate, tilt, GPS), ash advisory map, lahar travel-time map, tsunami travel-time map, inundation zones, tide gauge and DART records, debris-flow hazard map. None are AI images (project rule 5).

**Toolkits: data**

- **FR-9 Replay.** Find a past event by date and place or name and fetch, with consent and a size estimate: the USGS catalog event and its ShakeMap, PAGER and DYFI products; seismograms from FDSN data centers (respecting their download limits and citing networks); volcano notices; tsunami events, tide gauge and DART records; debris-flow hazard assessments; fault traces.
- **FR-10 Scenario earthquakes.** Use published USGS scenario ShakeMaps (for example a Cascadia M9 or a Bay Area M7) as case data, labeled as scenarios.
- **FR-11 Simulated events.** For fictional events: an earthquake at a chosen fault and magnitude with intensities from a simple ground-motion relation; an aftershock sequence from a standard statistical model, so the aftershock forecast and the sequence agree; a volcanic unrest sequence (rising seismicity, deformation, gas) leading to an eruption or not; tsunami arrival times from source distance; debris flows from a rainfall scenario. All labeled simulated.

**Exercise play and evaluation**

- **FR-12 Decisions.** Structured decisions (spec 0448 FR-14): change alert level and color code; issue or upgrade or cancel a tsunami message; order evacuation of a zone; close a road or a rail line; take an early warning automated action; place a building placard; issue a public statement.
- **FR-13 Timing metrics.** Threshold timing (spec 0448 FR-12) configured for: protective actions against shaking arrival, tsunami evacuation against first wave arrival, lahar evacuation against travel time, closures against the rainfall threshold; decision timing for alert level changes against eruption onset and for tsunami upgrades or cancellations against observed waves.
- **FR-14 Core capabilities.** EEGs for Public Information and Warning, Situational Assessment, Operational Coordination, Mass Care, Critical Transportation, Infrastructure Systems and Mass Search and Rescue, with critical tasks specific to each hazard.

**Knowledge and reuse**

- **FR-15 Document library.** Public-domain USGS, NOAA and FEMA material (alert level descriptions, early warning system descriptions, aftershock forecast explanations, scenario reports, tsunami message definitions, Cascadia Rising after-action material); each license and URL verified when building the pack; ICAO documents linked, not copied.
- **FR-16 Examples.** (1) Cascadia-style M9 and local tsunami for a fictional coastal county. (2) Volcanic unrest and lahar for a fictional school district near a real volcano. (3) Early warning for a fictional transit agency. (4) The airport example with an ash advisory.
- **FR-17 Reuse by other domains.** Suggested toolkits added to healthcare, K–12, campus, energy utility, gas pipeline, water utility, water and dam, transit, freight rail, data center, municipal, port and maritime, airport and emergency communications.

### Non-functional requirements

- **NFR-1 Cost:** only free public data services; no keys.
- **NFR-2 Privacy and good citizenship:** data services are contacted only when the user fetches an event for a scenario; FDSN download limits respected (no more than three concurrent requests); data networks cited in the case data provenance.
- **NFR-3 Accessibility:** every figure has a text summary; intensity colors follow the published MMI scale with labels; alert level and color code badges always carry the words, not color alone.
- **NFR-4 Accuracy:** a review by a seismologist or volcanologist and an emergency manager before release (owner to arrange); products marked as exercise products.

### Out of scope

- Running physics-based ground motion, ash dispersion or tsunami propagation models; simulated events use simple published relations.
- Live data during a session.
- Space weather (a separate candidate toolkit).

## Design

- **Domain:** `packs/domains/geoscience.json` with variants as role sets.
- **Toolkits:** `packs/toolkits/{seismic,volcanic,tsunami,debris_flow}/` (toolkit JSON, templates, knowledge fragments, lint rules).
- **Figures:** `src/main/render/figures/geo/` (intensity map, seismogram, aftershock plot, early warning timeline, monitoring series, travel-time maps, gauge records, hazard maps), with shared map overlays (spec 0448).
- **Connectors:** `src/main/toolkits/connectors/{comcat,fdsn,volcano_notices,tsunami,coops,ndbc,quaternary_faults,landslide}.ts`. The existing hazard-data USGS source is reused for catalog queries.
- **Simulation:** `src/main/toolkits/geo/simulate.ts`: ground-motion relation for intensities, an Omori-type aftershock sequence matched to the aftershock forecast, an unrest sequence generator, arrival-time estimates.

## Security and privacy

As spec 0448: fixed service hosts per connector, size limits, files only in the scenario folder, consent before fetching, no keys.

## Testing

Golden images for each figure from fixtures; miniSEED decoding tests on a recorded file; connector contract tests with recorded responses and opt-in live tests; simulation tests (aftershock counts match the forecast's expected numbers; intensities decrease with distance); lint tests for alert level pairs and message levels; threshold timing tests on worked examples; example projects generated end to end before release.

## Tasks

1. **#669** Geoscience domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#670** Seismic toolkit templates and knowledge (FR-3, FR-7).
3. **#671** Volcanic toolkit templates and knowledge (FR-4, FR-7).
4. **#672** Tsunami toolkit templates and knowledge (FR-5, FR-7).
5. **#673** Landslide and debris-flow toolkit templates and knowledge (FR-6, FR-7).
6. **#674** Earth science figures (FR-8).
7. **#675** Replay connectors and scenario earthquakes (FR-9, FR-10).
8. **#676** Simulated earth science events (FR-11).
9. **#677** Decisions, timing metrics and EEGs (FR-12–FR-14).
10. **#678** Document library, examples and reuse in other domains, user guides (FR-15–FR-17).

## Open questions

- **Expert review.** Recommendation: a USGS or state geological survey scientist and an emergency manager who has run a Cascadia or lahar exercise review the toolkits and examples before release.
- **Space weather.** Geomagnetic storms affect utilities, aviation and communications; recommendation: a separate toolkit after weather and flooding.
