# Domain dossier: `earth_sciences` (earthquakes, volcanoes, tsunamis, landslides)

Research for the earth sciences epic (#668, spec 0450), built on the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the teams who monitor, forecast and warn for geologic hazards, and the people who act on their warnings.

- **Science and warning teams:** volcano observatories, regional seismic networks and the national earthquake information center, earthquake early warning operations, tsunami warning centers, state geological surveys, landslide and debris-flow hazard teams.
- **Partners who act:** state and county emergency management, transportation departments (closures after debris-flow forecasts), utilities and pipelines (earthquake shutdown and inspection), rail and transit (slowing trains on early warning), schools (lahar and earthquake drills), hospitals, ports (tsunami), airports and airlines (volcanic ash), building officials (post-earthquake inspection).

**Exercise types:**

- **Catastrophic earthquake with tsunami:** a Cascadia-style M9 — Cascadia Rising 2016 was a four-day exercise for more than 20,000 emergency managers in Idaho, Oregon and Washington, followed by a 2022 discussion-based rehearsal **[V: FEMA]**. Lessons included communications as the top priority, face-to-face and amateur radio information flow, logistics, reunification, and mass power outage **[V]**.
- **Earthquake early warning:** an alert seconds before shaking: who gets it, what automated actions fire (trains slow, elevators stop, doors open), late or missed alerts near the epicenter, false alerts.
- **Aftershock sequence:** days to months of aftershocks, the aftershock forecast and its public messaging, re-occupying damaged buildings.
- **Volcanic unrest and eruption:** alert level changes, ash for aviation, lahars. Pierce County, Washington runs the world's largest lahar evacuation drill, more than 45,000 students in 2024, and a lahar could reach the Puyallup area in about three hours, with or without an eruption **[V: USGS caption, local reporting]**. Washington has also run tabletop exercises on Mount Rainier eruption notification **[V: WA EMD]**.
- **Tsunami:** local (minutes) and distant (hours) sources; warning, advisory, watch and information statement; evacuation of inundation zones; ports and maritime response. LANTEX and CARIBE WAVE are regular tsunami exercises using test messages **[V]**.
- **Landslides and post-fire debris flows:** rainfall-triggered flows below burn scars; road closures and evacuations decided on USGS hazard maps and rainfall thresholds **[V: USGS Landslide Hazards Program]**.
- **Monitoring outage and false alerts:** a seismic network or telemetry failure during unrest; a false early warning or a false tsunami message.

## 2. Organization and roles

| Title                                                    | Abbrev. | Team       | What they decide                                                          |
| -------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------- |
| Scientist-in-Charge (observatory)                        | SIC     | Leadership | Volcano alert level and aviation color code, statements, partner calls    |
| Duty Seismologist                                        | SEIS    | Monitoring | Event locations and magnitudes, reviews automatic solutions, felt reports |
| Volcano monitoring scientist (deformation, gas, seismic) | MON     | Monitoring | Interprets unrest data, recommends alert changes                          |
| Early warning operations                                 | EEW     | Monitoring | System health, alert review after events, false alert response            |
| Tsunami warning duty scientist                           | TSU     | Warning    | Message type and areas, upgrades, cancellation                            |
| Hazard communication / public affairs                    | PIO     | Partners   | Public statements, media, social posts, partner briefings                 |
| Emergency management liaison                             | EML     | Partners   | Joins EOC calls, translates science into decisions                        |
| Landslide / geologic hazards geologist                   | GEO     | Assessment | Debris-flow hazard maps, rainfall thresholds, post-event reconnaissance   |
| Post-earthquake building inspector lead                  | INSP    | Response   | Safety placards (inspected, restricted use, unsafe), re-entry             |

**Outside parties:** USGS national centers, NOAA tsunami warning centers, Volcanic Ash Advisory Centers, the National Weather Service (rainfall, tsunami dissemination), FAA and airlines, state and county emergency management, utilities and pipelines, transportation departments, rail and transit operators, school districts, hospitals, ports and the Coast Guard, building departments, the media and the public, early warning app and phone delivery partners.

## 3. Systems

Seismic and geodetic networks (seismometers, accelerometers, GPS, tiltmeters), gas monitoring, webcams and satellite thermal and deformation data, telemetry links, the early warning processing system and its delivery partners (Wireless Emergency Alerts, apps, operating systems), tsunami detection (DART buoys, tide gauges), lahar detection systems and sirens, the hazard notification system for volcano notices.

## 4. Products (what injects look like)

| Product                                                                                                            | From                      | Render                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------- |
| Earthquake event summary (location, magnitude, depth, felt reports)                                                | USGS                      | template                                                              |
| ShakeMap (shaking intensity map)                                                                                   | USGS                      | map figure from grid                                                  |
| PAGER alert (estimated fatalities and losses, color level)                                                         | USGS                      | template                                                              |
| "Did You Feel It?" responses map                                                                                   | USGS                      | map figure                                                            |
| Aftershock forecast (probabilities over the next day, week, month, year)                                           | USGS                      | template + time-magnitude figure                                      |
| Ground failure (liquefaction and landslide likelihood)                                                             | USGS                      | map figure                                                            |
| Early warning alert (phone, app, automated action log)                                                             | early warning system      | template (WEA through existing CAP)                                   |
| Volcano Activity Notice and Volcano Observatory Notice for Aviation                                                | observatories             | template (VONA format aligned with aviation weather products **[V]**) |
| Volcano alert level and aviation color code (Normal/Green, Advisory/Yellow, Watch/Orange, Warning/Red, Unassigned) | observatories             | template badge **[V]**                                                |
| Volcanic ash advisory (text and graphic)                                                                           | VAAC                      | template + map figure (basis for SIGMETs **[V]**)                     |
| Lahar warning and siren activation                                                                                 | county / detection system | template                                                              |
| Tsunami messages: warning, advisory, watch, information statement; international threat messages                   | NOAA centers              | template **[V: four U.S. levels; watches not sent by WEA]**           |
| Tsunami travel times, inundation zones, tide gauge and DART records                                                | NOAA                      | map and time-series figures                                           |
| Post-fire debris-flow hazard map and rainfall thresholds                                                           | USGS                      | map figure + template                                                 |
| Building safety placards and inspection reports                                                                    | building departments      | template                                                              |
| Seismograms, volcano monitoring time series (seismicity rate, tilt, GPS)                                           | monitoring networks       | time-series figures                                                   |

**Early warning thresholds:** Wireless Emergency Alerts for M5.0+ with expected shaking MMI IV+; apps for M4.5+ with MMI III+; delivery partners must reach 95% of users within 5 s **[V: SRL 2019 review; USGS/Cal OES deck; Android thresholds differ between sources]**. Late and missed alerts near the source come from update delays, source estimate errors and magnitude underestimation **[V: USGS evaluation]**.

## 5. Doctrine and documents (public domain candidates)

USGS circulars and fact sheets on volcano alert levels, the ShakeAlert system, aftershock forecasts and the HayWired scenario **[U: list each]**; FEMA Cascadia Rising after-action material **[V: FEMA pages]**; NOAA tsunami message definitions **[V]**; NTHMP guidance **[U]**; state earthquake and volcano response plans (check each state's license) **[U]**. ICAO volcanic ash documents are not public domain; link only.

## 6. Data sources (free, public)

| Data                                                  | Source                                                                | Notes                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Earthquake catalog and products                       | USGS ComCat, FDSN event API (GeoJSON); products ShakeMap, PAGER, DYFI | 20,000 events per query **[V]**                   |
| Scenario earthquakes                                  | USGS ShakeMap scenario catalogs (e.g. Cascadia, HayWired)             | **[U: catalog URLs]**                             |
| Waveforms (seismograms)                               | FDSN dataselect at EarthScope, SCEDC, NCEDC (miniSEED)                | limit concurrent downloads; cite networks **[V]** |
| Volcano notices and levels                            | USGS volcano notification service (HANS)                              | **[U: API]**                                      |
| Tsunami events and messages                           | tsunami.gov previous events; NCEI historical tsunami database         | **[U]**                                           |
| Tide gauges, DART buoys                               | NOAA CO-OPS API; NDBC                                                 | **[U]**                                           |
| Faults                                                | USGS Quaternary fault and fold database                               | **[U]**                                           |
| Debris-flow hazard assessments, landslide inventories | USGS Landslide Hazards Program, ScienceBase data releases (some CC0)  | **[V: CC0 example]**                              |

## 7. Evaluation

- **Threshold timing:** protective action before shaking arrives (early warning), evacuation complete before tsunami arrival, lahar evacuation within travel time, road closure before debris-flow rainfall threshold.
- **Decision timing:** alert level changes against eruption onset; tsunami message upgrades and cancellation against observed waves.
- **Message consistency:** observatory, emergency management, aviation and media messages agree on alert levels and areas.
- **HSEEP core capabilities:** Public Information and Warning, Situational Assessment, Operational Coordination, Mass Care, Critical Transportation, Infrastructure Systems, Mass Search and Rescue.

## 8. Threat families and arcs

- **Earthquake:** shaking → first information (automatic solution, felt reports, ShakeMap, PAGER) → damage and lifelines → aftershocks and forecast → re-entry and recovery.
- **Volcanic unrest:** background → unrest and alert changes → eruption (ash, lahar, flows) → waning activity and re-entry.
- **Tsunami:** source event → first message → upgrades or cancellation → waves and inundation → all clear and recovery.
- **Debris flow:** fire → hazard assessment → forecast storm → closures and evacuations → flows → clearing.
- **Service degradation:** monitoring or telemetry outage, false or missed alerts.

## 9. Reuse by other domains

Earthquakes reach every domain with buildings and lifelines (hospitals, schools, utilities, water, gas pipelines, transit and rail, data centers, municipal); tsunamis reach ports, coastal municipalities and venues; volcanic ash reaches airports and airlines, utilities (insulators, filters) and water utilities (ashfall in reservoirs); debris flows reach transportation, water and municipal domains. Each hazard is a toolkit any domain can turn on.

## 10. Related toolkits

The weather toolkit (spec 0449) supplies rainfall forecasts for debris flows and dissemination through NWS channels for tsunamis. Space weather (geomagnetic storms, from NOAA's Space Weather Prediction Center) is a candidate separate toolkit for utilities, aviation and communications.

## Expert review (2026-11-11)

This is a model-led expert review, written from the standpoint of a USGS hazards scientist and exercise designer. It is not a review by a licensed or employed seismologist, volcanologist or warning scientist.

**What was checked.** The geoscience domain profile; the seismic, volcanic, tsunami and debris-flow toolkits (glossary, product conventions, realism rules, decision forms, critical tasks, metric settings); the earth science lint rules; the product templates and their sample data (earthquake event summary, PAGER, aftershock forecast, early warning alert and action log, placard, lifeline board, ground failure summary, Volcano Activity Notice, VONA, alert badge, volcanic ash advisory, lahar warning, tsunami messages, debris-flow assessment, rainfall threshold guidance); the simulation relations (Wells and Coppersmith rupture length, Reasenberg and Jones generic aftershock parameters, shear-wave timing for early warning, shallow-water tsunami speed); and the user guide.

**Sources.**

- USGS Volcano Hazards Program, "Volcanic alert-levels characterize conditions at U.S. volcanoes" (usgs.gov/programs/VHP), and the HVO VAN/VONA for Mauna Loa, 4 December 2022 (notice 2022/H628: alert level WARNING, aviation color code ORANGE, previous RED).
- ICAO PANS-MET, Appendix 7, Table A7-1, template for the Volcano Observatory Notice for Aviation (July 2025 text, as distributed by WOVO); USGS announcement of ICAO-aligned VONAs, March 2026.
- ICAO Annex 3, Appendix 2, Table A2-1, volcanic ash advisory template (OBS VA DTG, OBS VA CLD, FCST VA CLD +6/+12/+18 HR, AVIATION COLOUR CODE).
- PTWC international Tsunami Threat Messages (for example the 29 July 2025 Kamchatka messages on weather.gov/itic) with wave-amplitude bands greater than 3 m, 1 to 3 m, 0.3 to 1 m and less than 0.3 m above the tide.
- USGS ShakeAlert delivery thresholds (Wireless Emergency Alerts M 5.0 and MMI IV; apps M 4.5 and MMI III), Cal OES partner material and ShakeAlert post-event reports.
- USGS PAGER and ShakeMap documentation (MMI shaking words, alert colors, X+ as the top map class); USGS aftershock forecast product (M3, M5, M6, M7 rows; day, week, month and year windows that all start at the issue time).
- USGS post-fire debris-flow emergency assessments (peak 15-minute rainfall intensity design storms; volume classes).

**What changed and why.**

- _Alert level and aviation color code._ The lint rule, the volcanic glossary, the domain guidance and the guide treated the four usual pairs as the only legal ones. The two scales are set separately, and a hazardous eruption that puts little ash in the air (a lava flow) is issued as WARNING with ORANGE, as Mauna Loa was in 2022. The rule now accepts WARNING/ORANGE and still flags every other mix (WATCH/RED, NORMAL/ORANGE, WARNING/YELLOW and so on). The guidance also says that a Volcano Activity Notice announces an alert level change and a VONA a color code change.
- _Modified Mercalli scale._ The text said Roman numerals I to X. The scale runs I to XII; USGS maps show I to X+. Glossary, guidance, guide and the lint message are corrected, and the magnitude check now also catches XI and XII written as a magnitude.
- _VONA._ The template now carries the ICAO status line STATUS: EXER, which marks an exercise notice so it cannot be used operationally. The sample used an activity status ("UNREST. NO ERUPTION") and a cloud height ("0FT AMSL") that the ICAO template does not allow; they are now HEIGHTENED UNREST and NO VA CLD PRODUCED, and the field descriptions list the allowed values.
- _Volcanic ash advisory._ The color code line is spelled AVIATION COLOUR CODE as in Annex 3. The observation now prints on two lines, OBS VA DTG and OBS VA CLD, when the observation time is given (older injects with one combined field still render). The sample's +6 hour forecast time read 05/2500Z; the forecast times are now 06/0100Z, 06/0700Z and 06/1300Z.
- _International tsunami threat message._ The sample and schema used Threat / Potential threat / No threat. PTWC threat messages list coasts by forecast wave amplitude above the tide; those four bands are now the listed values (the older three are still accepted so saved exercises open) and the column reads "Threat forecast (wave above tide)".
- _Sample consistency._ The earthquake event summary listed a maximum intensity of VIII while the PAGER sample for the same event shows people at IX; it is now IX. The early warning app sample gave 12 seconds of warning at a town 14 km from the epicenter, inside the zone where no warning is possible; it now names Olympia, about 95 km away, where 12 seconds is consistent with the alert time, with an expected intensity of V. The aftershock forecast sample started the week window a day later than the day window; all windows start at the issue time. The rainfall threshold sample described the 15, 30 and 60 minute thresholds as escalating levels; each is the threshold for its own duration.
- _Volcanic metric._ "Alert level change against eruption onset" only counted a change made within six hours before onset, so raising the level days ahead, which is what observatories aim to do, scored as a miss. The lead window is now seven days, and a change up to an hour after onset (raising to WARNING once the eruption is confirmed) still counts.

**Defaults set.** Alert level and color code combinations accepted: NORMAL/GREEN, ADVISORY/YELLOW, WATCH/ORANGE, WARNING/RED and WARNING/ORANGE. Volcanic decision timing: 7-day lead window, 60-minute grace. Simulated unrest keeps the usual pairs (it models an ash-producing eruption).

**Checked and left as is.** ShakeAlert delivery thresholds; PAGER shaking words and alert colors; the aftershock magnitude rows and windows; the Reasenberg and Jones generic parameters; the early warning blind zone (about 20 to 30 km) and 3.5 km/s shear speed; tsunami Warning, Advisory, Watch and Information Statement definitions and the rule that a Watch is not sent as a Wireless Emergency Alert; the VAA +6/+12/+18 hour forecasts; ATC-20 placard categories; debris-flow design storms by peak 15-minute intensity.

**Caveats.** The VONA follows the ICAO template, which the USGS adopted in March 2026; older USGS plain-language VONAs used different labels, and a fixture of a real older notice is kept as fetched. A WATCH/RED combination is flagged; it is not something the review found in USGS practice, but if an observatory uses it the rule will need widening. The volcanic ash advisory template has no STATUS line; ICAO allows one, and adding it is left to the owner. Lahar guidance to evacuate on foot follows Pierce County practice for Mount Rainier and is not universal.
