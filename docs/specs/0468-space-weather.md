# Spec 0468: Space weather and satellite operations — geomagnetic storms, GNSS loss and the space weather toolkit

Issue: #701 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/space_weather.md](../research/domains/space_weather.md)

## Summary

A severe geomagnetic storm touches the grid, navigation and timing, high-frequency radio and satellites at once, yet few organizations have ever exercised it. Space weather ships mainly as a **toolkit** that utilities, telecom, aviation, agriculture, rail and emergency management can add, plus a small `space_weather` domain for the people who operate through it (a grid reliability coordinator or transmission operator control room, satellite operations, a GNSS-dependent network or timing team). The toolkit provides the NOAA Space Weather Prediction Center's real message layouts (watches, warnings, alerts, summaries), the G, S and R scale panel, Kp, X-ray and proton flux series, GNSS error and timing-holdover series, and decisions scored by the clocks that matter: grid operating procedures applied before storm onset and timing failover before holdover expires. Real past storms are replayed from public archives; fictional storms come from a simple parametric generator. The toolkit reuses the weather toolkit (spec 0449) for forecast and warning style, and the energy utility, telecom and airport domains for the organizations by reference.

## Requirements

### User stories

- As a transmission operator's training lead, I want a storm watch that escalates to a warning, so operators apply our GMD operating procedure at the predetermined condition, log it, and end it when the termination condition is met.
- As a reliability coordinator, I want to show that forecasted and current space weather information reached the entities in our plan, with a log that the exercise produces.
- As a network timing engineer, I want GNSS error to rise during the scenario so we test holdover time and failover to another time source before alarms propagate.
- As a farm cooperative or surveying company, I want guidance accuracy to degrade for days and ask when we stop work and when we resume.
- As an airline dispatcher, I want an HF blackout on polar routes with a radiation storm, so we decide on reroutes and crew communications.
- As a satellite operator, I want drag and charging effects, a safe-mode event and a customer notice, without building a space exercise from scratch.
- As an emergency manager, I want impact-focused messages for a long, wide power and communications loss, written from the scale levels and not from jargon.
- As an instructor, I want to replay the May 2024 storm's Kp and X-ray series at exercise speed and compare student decisions with the record.

### Functional requirements

**Domain**

- **FR-1 Space weather domain.** A `space_weather` domain profile with variants for a grid control room (reliability coordinator and transmission operator), a satellite operations center, and a GNSS timing and network operations team, with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3); aliases as listed.
- **FR-2 Threat families and arcs.** Hazard families (severe geomagnetic storm, solar radiation storm, radio blackout, combined flare-radiation-CME event) and a **service degradation** family (GNSS timing loss, loss of a monitoring satellite or data feed, satellite anomaly, communications loss, conflicting messages), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**Space weather toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates that follow the real SWPC layouts: geomagnetic storm watch (with highest level predicted by day), warning, alert and summary; X-ray flux and proton event alerts and summaries; CME arrival forecast and discussion; ICAO space weather advisory (format confirmed when building); grid GMD operating procedure notice and operator log entry; reliability coordinator dissemination message; transmission planner post-event summary; GIC and reactive power status; GNSS timing alarm and holdover status notice; satellite anomaly, safe-mode and customer outage notices; precision agriculture equipment notice; airline dispatch reroute and GNSS NOTAM (reusing `notam`); impact-focused public message (reusing `press_release`, `sitrep`, `emergency_declaration`). Templates carry the message code, serial number and UTC issue time the real products use, and mark exercise products as exercises.
- **FR-4 Format rules and knowledge.** Lint and generator knowledge for: G scale to Kp mapping (G1 = 5, G2 = 6, G3 = 7, G4 = 8 and 9-, G5 = 9); S scale to proton flux and R scale to X-ray class; the difference between watch, warning and alert as SWPC defines them; message codes and their meaning copied from live products; UTC times; the stated effects at each level (for example, satellite navigation degraded for hours at G4 and days at G5); the rule that scale levels describe potential effects and that CME arrival time is uncertain by hours; NERC EOP-010 elements (information receipt steps, actions at predetermined conditions, termination condition, evidence in logs) and TPL-007 terms (benchmark and supplemental events, geoelectric field in V/km). The generator is told that impacts are regional and depend on latitude and ground conductivity.

**Space weather toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4): Kp bar series colored by G level with the words; X-ray flux with flare class lines and R levels; proton flux with S levels; magnetometer components; scale panel (G, S and R now and by day); solar wind speed; GIC at a transformer neutral over time with an operator action marker; GNSS error series (horizontal error, satellites tracked, timing alarms) with holdover remaining; status board for grid, aviation, PNT and satellite impacts. Each yields the text summary and data table of spec 0448 FR-5, and level colors always carry the level names.

**Space weather toolkit: data**

- **FR-6 Public data connectors.** Connectors, with consent and a size estimate (spec 0448 FR-8), for the SWPC data service (alerts list, planetary Kp observed and forecast, scales, GOES X-ray, proton and magnetometer series, solar wind), the NCEI SWPC products and data archive for past dates, and the USGS geomagnetism web service for ground magnetometer series. The fixed hosts are `services.swpc.noaa.gov`, the NCEI archive host and `geomag.usgs.gov`; no keys are used. The connectors validate every response against a schema because the feeds change formats (for example the Kp feed has changed shape).
- **FR-7 Event finder and storm library.** Find a past storm by date (and, when the user wants, by its peak G level), fetch the Kp series, X-ray and proton series, SWPC messages issued during the dates, and ground magnetometer data for the scenario's region, and map exercise time to case time (spec 0448 FR-9). A small curated list of well-known storms (including the May 2024 G5 event) ships as pointers to dates, not as bundled data. The estimate step reports exactly which products exist for the dates; a product that is not archived is not claimed.
- **FR-8 Simulated space weather events.** For a fictional event, parameters (peak G, S and R levels, flare time and class, CME speed and arrival time with an uncertainty window, storm onset type, duration, latitude of the region) produce consistent case data: flare X-ray series, proton event rise and decay, solar wind step at arrival, Kp trajectory by 3-hour interval consistent with the stated peak, magnetometer disturbance, a GIC series for a user-entered transformer and ground conductivity factor from a simple relation, and the SWPC message sequence (watch, warning, alert, summary) in the right order with plausible lead times. Everything is labeled simulated.
- **FR-9 GNSS and timing impact model.** A simple, documented model for exercises: GNSS horizontal error, number of satellites tracked and timing alarm times as functions of the storm's Kp series and a scintillation duration after peak (days at G4 and above), for a user-entered receiver class (single-frequency, multi-frequency, GNSS-disciplined oscillator with holdover specified in hours). The model outputs error series and holdover remaining; it is labeled simulated and is not a prediction of real receiver performance.

**Exercise play and evaluation**

- **FR-10 Decisions.** Structured decisions (spec 0448 FR-14): apply or terminate the GMD operating procedure (with the action list and time); disseminate space weather information to named entities; reduce transfers, bring reactive resources or change protection settings (as choices configured per project, not engineering advice); switch a time source or declare holdover; stop or resume GNSS-guided operations; reroute a flight; put a satellite in safe mode; issue a notice to customers; issue a public message. Each records time and stated basis.
- **FR-11 Metrics.** Threshold timing (spec 0448 FR-12) configured for: operating procedure applied before storm onset (onset defined as the first Kp or magnetometer condition in the procedure), time source failover before holdover expires, safe-mode before a flux threshold, and message consistency across the grid, aviation, telecom and public messages. A dissemination metric checks that each entity named in the project's operating plan received the information, with timestamps from the log (as EOP-010 evidence).
- **FR-12 Core capabilities.** EEGs for Public Information and Warning, Situational Assessment, Operational Communications, Operational Coordination, Infrastructure Systems and Planning, with critical tasks specific to a geomagnetic storm.

**Knowledge and reuse**

- **FR-13 Document library.** A public-domain library pack: the NOAA Space Weather Scales and product descriptions, SWPC message definitions, the 2015 National Space Weather Strategy and Action Plan and the 2018 benchmarks report, USGS geomagnetism fact sheets, the DHS PNT material that is public, and the 2024 Space Weather Tabletop Exercise after-action report only if its terms permit redistribution (otherwise linked). NERC standards (EOP-010, TPL-007) and ICAO documents are linked, not copied. Each license and URL is verified when building the pack.
- **FR-14 Examples.** (1) A severe storm for a fictional transmission operator and reliability coordinator, with a replayed storm's Kp and X-ray record and the operating procedure. (2) GNSS degradation for a fictional telecom timing team and a farm cooperative over three days. (3) A satellite operator and an airline using the toolkit with no grid domain.
- **FR-15 Reuse by other domains.** Suggested toolkits added to energy utility, telecom, airport, food and agriculture, freight rail, transit, port and maritime, gas pipeline, emergency communications, financial services, unmanned systems and municipal; the weather and space weather toolkits suggested together for energy utility.

### Non-functional requirements

- **NFR-1 Cost:** only free public services; no keys or accounts.
- **NFR-2 Privacy:** services are contacted only when the user fetches an event; requests carry dates and a rounded region, never plan content; the fixed host list is shown in the dialog. Operating procedures, transformer data and receiver details the user enters stay in the project.
- **NFR-3 Accessibility:** every figure has a text summary and a data table; Kp and scale colors always carry the level words and numbers; status boards use text states.
- **NFR-4 Accuracy:** scale mappings, message layouts and NERC element lists verified against the primary documents in the library and the live feeds; a review by a utility reliability engineer (and, for the satellite and aviation examples, an operator) before release (owner to arrange). The toolkit does not give engineering advice about protection settings.
- **NFR-5 Stated limits:** simulated GIC and GNSS series are illustrations with simple relations; the figure and the handbook say so. The toolkit never presents a simulated level as an NOAA product.
- **NFR-6 Integrity:** real SWPC text is reproduced only as case data labeled historical with its serial and issue time; modified text is never labeled as original (spec 0448 NFR-5).

### Out of scope

- Solar and magnetospheric physics models, CME propagation models, or a real GIC network calculation (power flow with the real transformer data). The simple relations are for exercise consistency only.
- Live data during a session.
- Radiation dose calculation for crews or astronauts.
- Replacing NERC compliance evidence; the exercise log helps, but compliance remains the entity's responsibility.

## Design

- **Domain:** `packs/domains/space_weather.json` with variants as role sets.
- **Toolkit:** `packs/toolkits/space_weather/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, decision forms).
- **Figures:** `src/main/render/figures/space/` (Kp bars, flux series, scale panel, GIC series, GNSS error and holdover, impact board), using the time series and status board kinds of spec 0448.
- **Connectors:** `src/main/toolkits/connectors/{swpc,ncei_swpc,usgs_geomag}.ts`, each with `estimate()`, `fetch()` and recorded-response tests; response schemas pinned in `src/shared/toolkits/space/`.
- **Simulation:** `src/main/toolkits/space_weather/simulate.ts` (flare and proton shapes, Kp trajectory, message sequence), `.../gic.ts` (a simple geoelectric-to-GIC relation) and `.../gnss.ts` (error, satellites tracked, holdover).
- **Metrics:** configuration of existing metrics in `packs/toolkits/space_weather/`; an entity dissemination check helper.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching, no keys. Responses are validated against schemas and unexpected shapes are rejected. Entered operating procedures and customer or asset data never leave the project.

## Testing

Golden images for each figure from fixtures; connector contract tests with recorded responses (alerts list, Kp object feed, X-ray series) and opt-in live tests; simulation tests (peak Kp matches the stated G level, the message sequence order is watch, warning, alert, summary, holdover decreases while error is above its limit); lint tests for G, S and R mappings and message codes; metric tests on a worked procedure-before-onset example and a failover example; example projects generated end to end with the local model before release.

## Tasks

1. **#811** Space weather domain profile, roles and variants, threat families and arcs (FR-1, FR-2).
2. **#815** Space weather product templates and format knowledge (FR-3, FR-4).
3. **#818** Space weather figures (FR-5).
4. **#822** Public data connectors, event finder and storm library (FR-6, FR-7).
5. **#827** Simulated space weather events (FR-8).
6. **#830** GNSS and timing impact model (FR-9).
7. **#916** Space weather decisions (FR-10).
8. **#917** Timing metrics and EEGs (FR-11, FR-12).
9. **#918** Document library pack (FR-13).
10. **#919** Examples, reuse in other domains, user guides (FR-14, FR-15).

## Open questions

- **Practitioner review.** A utility reliability engineer who has written or run a GMD operating procedure should review the templates, mappings and examples before release. Recommendation: ask through a reliability coordinator's operations training group or a regional reliability entity.
- **Current NERC versions.** This session read EOP-010-1 and TPL-007-4. Later versions may be in force; confirm when building the lint rules and the library.
- **SWPC thresholds.** Pages disagree on exactly when watches and warnings are issued for each level. Recommendation: reproduce live products as written and avoid encoding issuance thresholds beyond what a product states.
- **Past-storm archive coverage.** Which SWPC products are archived by date, and in which file layouts, needs a short spike before FR-7 is built.
- **GNSS data.** A free source of historical GNSS error and ionosphere data for replay was not chosen; the simulated model covers the gap.
