# Domain dossier: `space_weather` (geomagnetic storms, radiation, radio blackouts and satellite operations)

Research for the space weather and satellite operations epic (#701, spec 0468), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the organizations that forecast space weather or have to operate through it.

- **Forecast and warning side (outside parties):** NOAA's Space Weather Prediction Center (SWPC; the public site is now spaceweather.gov and the older swpc.noaa.gov address redirects there **[V]**), the NOAA satellites that watch the Sun and the space environment, USGS geomagnetic observatories, NASA, the Air Force 557th Weather Wing **[U]**.
- **Electric power:** reliability coordinators and transmission operators (grid operating procedures for geomagnetic disturbances), transmission planners and owners (assessments and transformer mitigation), generator owners.
- **Aviation:** airlines and flight dispatch on high-latitude and polar routes (HF radio blackouts, radiation, GNSS), air navigation service providers, airports (GNSS-dependent approaches).
- **Positioning, navigation and timing users:** telecom (GNSS-disciplined timing at cell and network sites), precision agriculture, surveying, construction, maritime, rail and pipeline operators, financial networks that rely on time stamps.
- **Satellite operators and space operations:** commercial and government satellite operators (drag, charging, single-event upsets, tracking), launch providers, crewed spaceflight.
- **Emergency management:** state and federal agencies that would coordinate a long, wide power or communications loss.

**Exercise types this field needs:**

- **Severe geomagnetic storm with grid operating procedures:** a coronal mass ejection (CME) watch days ahead, a warning hours before arrival, a storm onset with little lead time, and operating procedures that must be applied before onset.
- **GNSS degradation:** loss of precision, timing holdover and failover, scintillation lingering for days; precision farming, surveying, aviation approaches, telecom timing, rail.
- **HF radio blackout and radiation storm for aviation:** polar routes, oceanic HF, rerouting, crew radiation concerns.
- **Satellite anomaly or loss:** orbit decay from drag, surface charging, single-event upsets, tracking uncertainty, customer outages.
- **National-level cascade:** the first end-to-end US space weather tabletop exercise was held on 8–9 May 2024 by the Johns Hopkins Applied Physics Laboratory with NOAA, NASA, NSF and FEMA as sponsors and more than 25 federal, state, tribal and local agencies participating. It was adapted from HSEEP and simulated intense radiation, radio outages, degraded GPS, reduced satellite tracking and regional power outages affecting railways and pipelines. A real G5 storm began during it and the exercise did not replicate that event **[V: NOAA/NESDIS and SWPC pages; the report was published in 2025]**.

**Aliases:** space weather, geomagnetic storm, geomagnetic disturbance, GMD, GIC, solar storm, CME, solar flare, radio blackout, solar radiation storm, GNSS outage, PNT, satellite operations, Kp.

## 2. Organization and roles

| Title                                           | Abbrev. | Team           | What they decide                                                                                          |
| ----------------------------------------------- | ------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| Space weather forecaster (SWPC)                 | SWFC    | Outside party  | Watches, warnings, alerts, scale levels, forecast discussions                                             |
| Reliability coordinator operator                | RC      | Grid           | Disseminate space weather information to entities in the GMD operating plan; coordinate operating actions |
| Transmission operator system operator           | TOP     | Grid           | Actions in the GMD operating procedure at predetermined conditions; when to end them                      |
| Transmission planner / protection engineer      | TP      | Grid           | Assessments, GIC calculations, transformer risk; post-event review                                        |
| Generation / plant operator                     | GEN     | Grid           | Reactive support, protection settings, unit availability                                                  |
| Airline operations control / flight dispatch    | OCC     | Aviation       | Reroute away from polar or high-latitude paths, altitude, HF-dependent routes, crew communications        |
| Air traffic and airport operations              | ATC     | Aviation       | Approach procedures when GNSS is degraded, NOTAMs, ground-based alternatives                              |
| Network timing engineer                         | TIME    | Telecom        | Holdover, failover to other time sources, monitoring of timing alarms                                     |
| Satellite operations engineer / flight director | SATOPS  | Space          | Safe-mode, attitude and drag management, anomaly response, customer notices                               |
| Space situational awareness analyst             | SSA     | Space          | Tracking quality, conjunction risk when drag changes orbits                                               |
| Farm or survey operations lead                  | FIELD   | PNT user       | Stop or switch to non-GNSS guidance; resume when accuracy returns                                         |
| Emergency manager / state grid liaison          | EM      | Government     | Pre-position, shelters, communications, coordination of long outages                                      |
| Public information officer                      | PIO     | Communications | Impact-focused messages, not technical jargon (an AAR finding below)                                      |

**Outside parties:** SWPC and the NOAA satellite operations team, NERC and Regional Entities, the reliability coordinator and neighboring entities, FAA and ICAO space weather centers, GNSS providers and receiver makers, satellite customers, state emergency management and FEMA, public utility commissions, equipment makers (transformers, receivers), news media, amateur radio operators.

## 3. Systems

- **Data and products:** SWPC alerts, watches, warnings, summaries and forecasts; planetary Kp; GOES X-ray, proton and magnetometer series; solar wind; the NOAA Space Weather Scales; ICAO space weather advisories for aviation **[U]**.
- **Grid:** energy management systems and SCADA, GIC monitors on transformer neutrals, reactive power resources, protection systems, system operator procedures, voice and data links to the reliability coordinator.
- **PNT:** GNSS receivers, GNSS-disciplined oscillators and grandmaster clocks, holdover clocks, alternative timing (fiber time transfer, other constellations, terrestrial systems) **[U]**.
- **Space:** ground stations, command and telemetry links, orbit determination, onboard fault protection.
- **OT-like dependencies:** substation protection relays, neutral-ground GIC sensors, time distribution networks, ground station antennas.

## 4. Products (what injects look like)

| Product                                                                                               | From                          | Render                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Geomagnetic storm watch (days ahead, by G level per day), warning, alert (threshold crossed), summary | SWPC                          | text template from the real message layout |
| Radio blackout and solar radiation storm alerts and summaries (X-ray and proton threshold messages)   | SWPC                          | text template                              |
| Space Weather Scales table and current conditions panel                                               | SWPC                          | figure (scale panel) with text             |
| Planetary Kp series (3-hour bars colored by G level), Kp forecast                                     | SWPC                          | time series figure                         |
| GOES X-ray flux (flare classes), proton flux, magnetometer series, solar wind speed                   | NOAA satellites               | time series figures                        |
| CME arrival forecast and discussion                                                                   | SWPC                          | text template                              |
| ICAO space weather advisory (HF communications, GNSS, radiation, moderate or severe)                  | space weather centers         | text template **[U: format to confirm]**   |
| Grid GMD operating procedure notice (conditions met, actions taken, termination)                      | reliability coordinator / TOP | text template; operator log                |
| GIC reading at a transformer, reactive power reserve, voltage alarm board                             | utility                       | status board / time series figure          |
| GNSS error series (horizontal error, satellites tracked, timing alarms) and holdover status           | network / PNT user            | time series figure and status board        |
| Satellite anomaly report, safe-mode notice, customer outage notice, orbit change due to drag          | operator                      | text templates                             |
| Precision agriculture equipment notice (guidance accuracy off by feet)                                | manufacturer / farm           | text template, `field_report`              |
| Airline dispatch reroute notice, NOTAM for GNSS, crew HF loss report                                  | aviation                      | existing `notam`, text template            |
| Power outage reports, public messages, `sitrep`, `emergency_declaration`                              | grid / EM / PIO               | existing templates                         |
| Aurora photos and social posts                                                                        | public                        | AI image (scene), never the data figures   |

**NOAA Space Weather Scales (levels 1 to 5: Minor, Moderate, Strong, Severe, Extreme)** **[V: SWPC scales page]**:

- **G (geomagnetic storms)** are tied to the planetary Kp index: G1 = Kp 5, G2 = 6, G3 = 7, G4 = 8 (including 9-), G5 = 9. Stated effects include weak grid fluctuations at G1; high-latitude voltage alarms at G2; false protection alarms and voltage corrections at G3; widespread voltage control problems and possible protection trips at G4; possible grid collapse and transformer damage at G5. Satellite navigation is degraded for hours at G4 and for days at G5, and HF radio is intermittent at G3 and may be impossible for one to two days at G5.
- **S (solar radiation storms)** are tied to the flux of particles at or above 10 MeV (S1 = 10 up to S5 = 10^5 particle flux units): minor polar HF effects at S1; single-event upsets in satellites at S3; polar HF blackout and navigation errors over several days at S4.
- **R (radio blackouts)** are tied to GOES X-ray class: R1 = M1, R2 = M5, R3 = X1, R4 = X10, R5 = X20, with HF blackout on the sunlit side lasting tens of minutes at R2, about an hour at R3 and hours at R5.
- Average frequencies per 11-year solar cycle are listed on the page (for example G4 about 100 per cycle, about 60 days; G5 about 4 per cycle, about 4 days).

**Message definitions (SWPC):** a watch is for elevated risk with uncertain timing; a warning is for an event that is occurring, imminent or likely; an alert says a threshold has been crossed or an event has begun **[V: NWS and SWPC pages]**. Details differ across pages: the Kp page says watches are issued when predicted Kp is 5 or more and warnings when Kp of 4 or more is expected, and alerts when Kp reaches 4 through 9, while an NWS page describes warnings at G1 to G3 and watches at G1 to G4 or greater. The toolkit therefore copies live message layouts and codes rather than inventing thresholds **[V for the discrepancy, U for which is current]**.

**Real message codes seen in the live alerts feed on 2026-11-04:** `WATA20` and `WATA30` (geomagnetic watches), `WARK04` to `WARK07` (K-index warnings), `ALTK04` to `ALTK07` (K-index alerts), `WARSUD`, `ALTXMF`, `ALTEF3`, `SUM10R`, `SUMSUD`, `SUMXM5` (warnings, X-ray alerts, electron flux, summaries) **[V]**.

## 5. Regulations, doctrine and documents (public domain candidates)

- **NERC EOP-010-1, Geomagnetic Disturbance Operations:** applies to reliability coordinators and to transmission operators whose area includes a power transformer with a high-side wye-grounded winding above 200 kV. R1: each reliability coordinator develops, maintains and implements a GMD operating plan with a description of mitigating activities and a process to review transmission operators' procedures. R2: the reliability coordinator disseminates forecasted and current space weather information to the entities in its plan. R3: each transmission operator has an operating procedure or process with steps to receive space weather information, operator actions initiated at predetermined conditions, and conditions for terminating the procedure. Evidence is operator logs and recordings, retained for three years **[V: NERC text, version 1; later versions may exist: U]**.
- **NERC TPL-007-4, Transmission System Planned Performance for GMD Events:** applies to planning coordinators, transmission planners, transmission owners and generator owners with the same transformer class. Requirements include identifying responsibilities (R1), system models (R2), performance criteria (R3), a benchmark GMD vulnerability assessment at least every 60 calendar months (R4), GIC flow information for transformers (R5), thermal assessments (R6, within 24 months of receiving GIC data), corrective action plans where assessments show failure (R7), and a supplemental vulnerability assessment every 60 months (R8, R9) **[V: NERC text]**. The benchmark uses a reference peak geoelectric field of 8 V/km (scaled for geomagnetic latitude and local earth conductivity) and the supplemental event uses 12 V/km over a localized area **[V]**. NERC's standard text is copyrighted and is linked, not bundled; a later version (TPL-007-5 or other) may be in force **[U]**.
- **Federal policy:** the PROSWIFT Act (Public Law 116-181, 21 October 2020) set up an interagency working group, research and data-sharing requirements, and a commercial data pilot **[V: summaries of the statute; full text not read]**. The 2015 National Space Weather Strategy and Action Plan and the 2018 benchmarks report (induced geoelectric fields, ionizing radiation, ionospheric disturbances, solar radio bursts, upper atmospheric expansion) are public **[U: values not read]**.
- **Resilient PNT:** DHS Resilient PNT Conformance Framework (first published December 2020; version 2.0 in May 2022) for PNT user equipment **[U]**.
- **Aviation:** ICAO Annex 3 and Doc 10100 define space weather advisories; the global service started on 7 November 2019 with three rotating centers (SWPC, the ACFJ consortium and PECASUS); advisories carry moderate or severe levels for HF communications, GNSS, radiation and satellite communications **[U: from FAA InFO 20007 and ICAO material in search results]**. ICAO documents are linked, not copied.
- **Exercise material:** the 2024 Space Weather Tabletop Exercise after-action report (published 2025). Its findings, per NOAA's summary: notifications need to be understandable and describe impacts on critical infrastructure; whole-of-government coordination needs improvement; forecasting has technology limits (placing spacecraft farther upstream could give earlier warning); a national public education campaign is needed; messaging across channels should be coordinated and focus on impacts, not technical science **[V: NESDIS summary; the report PDF itself was not read, and its redistribution terms are unverified]**.
- **Real event record:** the G5 storm of 10–11 May 2024 was the largest in more than 20 years; farmers in North Dakota reported GPS-guided equipment off by about 10 feet, and John Deere warned that all GPS brands were affected; ionospheric disturbance lingered for days **[U: news coverage; no SWPC assessment found this session]**.

## 6. Data sources (free, public)

| Data                                                             | Source                                                                                                                             | Notes                                                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alerts, watches, warnings (rolling list of recent messages)      | `https://services.swpc.noaa.gov/products/alerts.json`                                                                              | JSON array of `product_id`, `issue_datetime`, `message` (full text with message code and serial number); no key **[V: live request, 87 messages]**        |
| Planetary Kp, observed (3-hour)                                  | `.../products/noaa-planetary-k-index.json` and `.../products/noaa-planetary-k-index-forecast.json`                                 | JSON objects with `time_tag`, `Kp`, `a_running`, `station_count`; forecast file marks observed, estimated and predicted values and the NOAA scale **[V]** |
| One-minute estimated Kp                                          | `.../json/planetary_k_index_1m.json`                                                                                               | **[V]**                                                                                                                                                   |
| Current scale levels and probabilities                           | `.../products/noaa-scales.json`                                                                                                    | keys "0" (now) to "3"; R, S and G entries **[V]**                                                                                                         |
| GOES X-ray, proton and magnetometer series (1 day, longer files) | `.../json/goes/primary/{xrays,integral-protons,magnetometers}-1-day.json`                                                          | JSON; magnetometer has He, Hp, Hn components **[V]**                                                                                                      |
| Solar wind and other summaries                                   | `.../products/summary/solar-wind-speed.json` and sibling files                                                                     | **[V]**                                                                                                                                                   |
| Long-term archive of SWPC products and indices                   | NCEI SWPC Products and Data Archive; `ftp.swpc.noaa.gov/pub/indices/old_indices/` (Kp tables back to 1994); SWPC warehouse         | official long-term archive is NCEI **[V per SWPC data page]**; archive file layouts to confirm **[U]**                                                    |
| Ground magnetometer data                                         | USGS Geomagnetism web service `https://geomag.usgs.gov/ws/data/` (1-second, 1-minute and hourly; 14 US observatories); INTERMAGNET | IAGA2002 text or JSON; per-request size limits; geoelectric field products exist **[U: from search]**                                                     |
| GNSS error and ionosphere                                        | public GNSS monitoring and ionosphere maps (NOAA, NASA CDDIS, FAA WAAS performance reports)                                        | **[U: source and format to choose when building]**                                                                                                        |

**Important for replay:** the feeds above show recent data; a past storm (for example May 2024) must come from the NCEI archive or the long-term files. The connector's estimate step reports what is available for the dates and does not claim coverage it has not checked.

## 7. Evaluation

- **Procedures applied before onset:** a decision timing metric for the operating actions (the grid operating procedure applied at the predetermined condition, notice sent to entities) measured against storm onset (sudden commencement or the time Kp crossed the procedure's condition) **[V for the requirement; the clock is the scenario's]**.
- **Timing failover:** time from the first timing alarm or accuracy loss to failover to another source, and whether holdover lasted.
- **Message consistency:** impact-focused messages from SWPC, the utility, the airline and emergency management agree on severity and duration (an AAR theme).
- **Notification chain:** the reliability coordinator disseminated forecast and current information to the entities named in its plan (EOP-010 R2 evidence: logs and recordings) **[V]**.
- **Satellite operations:** safe-mode and attitude decisions before the flux or drag threshold; customer notice time.
- **HSEEP core capabilities:** Public Information and Warning, Situational Assessment, Operational Communications, Operational Coordination, Infrastructure Systems, Planning; Logistics and Supply Chain Management for equipment loss.
- **Caveat:** CME arrival times are uncertain by hours; the scenario states the lead time it assumes, and the metric uses the scenario's ground truth.

## 8. Threat families and scenario arcs

- **Hazard-driven:** severe geomagnetic storm, solar radiation storm, radio blackout (flare), combined event (flare, radiation, then CME).
- **Operations-driven (service degradation):** GNSS timing loss, loss of a monitoring satellite or data feed (a data gap during the event), satellite anomaly, communications loss, unclear or conflicting messages.
- **Arc for a severe storm:** flare and CME observed → watch with days of lead time → warning as the CME approaches → arrival and onset (Kp crosses) → grid operating actions, GNSS and HF effects → peak and recovery period (scintillation can linger for days) → post-event review.

## 9. Reuse by other domains

Space weather is a toolkit for energy utilities (a severe storm watch is already listed as a scenario seed in `energy_utility`), telecom (GNSS timing and satellite links), airports and airlines (HF and GNSS), food and agriculture (precision guidance), freight rail and transit (signaling and timing, power), port and maritime (navigation), gas pipeline (induced currents and SCADA links), emergency communications (HF, satellite and amateur radio), financial services (time stamping), unmanned systems (GNSS dependence), and municipal and state emergency management (long power loss). It uses the weather toolkit (spec 0449) for forecasting style and decision timing, and the energy utility, telecom and airport domains for the organizations.

## Expert review (2026-11-11)

Model-led expert review from the standpoint of a NOAA SWPC space weather forecaster. It is not a review by a licensed or employed practitioner.

**Checked:** the space weather toolkit (glossary, product conventions, realism rules, decisions, metrics, critical tasks), the space weather domain profile, the scale, message code, CME arrival and ICAO lint rules, the simulated SWPC message sequence, the SWPC message template and the user guide.

**Sources:** NOAA Space Weather Scales (G to Kp, R to GOES X-ray class, S to 10 MeV proton flux); the SWPC subscription services product list (message codes and titles, watch lead time up to 72 hours, warnings minutes to a couple of hours ahead); NERC EOP-010-1 requirements; ICAO Annex 3 Amendment 82 material on space weather advisories (HF COM, GNSS, RADIATION, SATCOM effects kept).

**Correct as found:** the G, R and S mappings and their lint; watch, warning, alert definitions; EOP-010 elements (plan, dissemination, actions at predetermined conditions, termination); G4/G5 navigation and HF effects; ICAO advisory layout checks.

**Changed and why:**

- The simulation always issued WATA20 (the G1 watch) whatever level it predicted, ended with SUMSUD headed "geomagnetic storm reached Gn" (SUMSUD is the sudden impulse summary, issued at shock arrival), and stopped K-index alerts at 7. It now uses WATA20, WATA30, WATA50 or WATA99 (G4 or greater) for the predicted level, issues WARSUD before arrival and SUMSUD after the shock, heads WARK07 "7 or greater", raises ALTK08 and ALTK09 when reached, and never places the watch before the eruption for fast CMEs.
- The message code lint now checks that a watch code matches the G level in its headline.
- The SWPC message preview was WATA20 with a G4 headline; it is now WATA99 "G4 or Greater Predicted" (golden regenerated). The schema's code list described SUM10R as a proton summary; it is the 10 cm radio burst summary. The list now gives the full code families.
- A realism rule said a flare gives "minutes of effect"; R-scale blackouts last minutes to a few hours. The domain said a CME is watched "for days"; watches give one to three days (up to 72 hours).

**Defaults set:** the dissemination measure keeps a 60-minute target and an empty entity list for the planner to fill; the GIC relation stays a stated exercise constant.

**Remaining caveats:** the strategy documents in the library are the 2015 editions (a 2019 strategy and action plan exist); TPL-007-4 is cited and should be checked against any later version; proton (WARPX1, ALTPXn) messages are not simulated.
