# Domain dossier: `meteorology` (weather forecast and warning operations)

Research for the meteorology epic (#647, spec 0449) and the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** teams whose job is to forecast weather and warn or advise others: National Weather Service forecast offices (WFOs) and national centers as outside parties; broadcast meteorology teams; meteorologists embedded with emergency management, utilities, airlines, airports, agriculture and event venues; university meteorology programs that train forecasters.

**Exercise types this domain needs:**

- **Warning operations:** a convective outbreak worked from the morning outlook through watches, warnings and storm reports, with warning decisions under time pressure.
- **Integrated Warning Team (IWT) exercises:** the forecast office with emergency managers and broadcasters, testing whether products give partners what they need. NWS offices already run these as HSEEP tabletops that move from a several-day outlook through the watch and the warning window **[V: NWS Charleston WV Tri-State IWT situation manual and AAR]**.
- **Decision support (IDSS):** briefing emergency managers for an event (hurricane landfall, winter storm, flash flood, heat, fire weather, large outdoor event).
- **Continuity of operations:** radar outage, AWIPS or communications failure, office evacuation and service backup by a neighboring office, staffing shortfall.
- **Information integrity:** viral fake tornado photos, false social media warnings, misread forecast graphics.

**Aliases:** weather service, forecast office, WFO, NWS office, weather team, broadcast meteorology, TV weather, storm team, meteorology department, weather desk, operational meteorology, decision support meteorologist.

## 2. Organization and roles (forecast office in severe weather)

Most WFOs have about two forecasters on duty in quiet weather and add staff for events **[V: 2021 House testimony: 122 WFOs, most of the time two forecasters on duty]**.

| Title                                    | Abbrev. | Team       | What they decide                                                                                                                                  |
| ---------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead Forecaster / Shift Supervisor       | LEAD    | Operations | Staffing and sectorization, who warns which counties, when to call in help, service backup                                                        |
| Warning Forecaster (radar sector)        | WARN    | Warning    | Issues and updates tornado, severe thunderstorm and flash flood warnings and statements                                                           |
| Mesoanalyst                              | MESO    | Warning    | Watches the environment (surface, upper air, satellite, mesoanalysis), advises the warning forecasters **[V: NWS 2020 mesoanalyst presentation]** |
| Decision Support (IDSS) Meteorologist    | DSS     | Partners   | Briefs emergency managers and partners, answers their questions, joins their calls                                                                |
| Warning Coordination Meteorologist       | WCM     | Partners   | Partner and media relations, social media, the IDSS program **[V: USAJOBS posting]**                                                              |
| Hydrologist / Service Hydrologist        | HYDRO   | Hydrology  | River and flash flood forecasts with the River Forecast Center                                                                                    |
| Science and Operations Officer           | SOO     | Leadership | Science and training, post-event review                                                                                                           |
| Meteorologist in Charge                  | MIC     | Leadership | Office decisions, continuity, external escalation                                                                                                 |
| Communications / social media forecaster | COMMS   | Partners   | Graphics, posts, NWSChat/partner chat, spotter coordination                                                                                       |

**Broadcast team variant:** Chief Meteorologist, on-air meteorologists, weather producer, digital/social producer, news director (outside the weather team).

**Outside parties:** Storm Prediction Center (outlooks, watches, mesoscale discussions), National Hurricane Center, Weather Prediction Center, River Forecast Center, neighboring WFOs, county and state emergency management, 911 centers, SKYWARN spotters and amateur radio, broadcast partners, the public on social media, FAA and airports, utilities, school districts, large venues.

## 3. Systems

- **AWIPS** (the forecast office workstation), the warning generation software, NWSChat/partner chat, the radar network (WSR-88D/NEXRAD, dual polarization: reflectivity, velocity, spectrum width, differential reflectivity, correlation coefficient), GOES satellites, upper-air soundings, surface observations (ASOS/AWOS, mesonets), lightning detection, model guidance (HRRR, NAM, GFS, ensembles), the NOAA Weather Radio transmitter, IPAWS/WEA/EAS dissemination.
- **OT-like dependencies:** radar site power and communications, the data network to the office, NOAA Weather Radio transmitters, upper-air launch equipment.

## 4. Products (what injects look like)

| Product                                                                                                                           | From         | Render                                       |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| Convective outlook (Day 1–3, categorical and probabilistic map)                                                                   | SPC          | map figure from outlook polygons             |
| Mesoscale discussion, watch (box and text)                                                                                        | SPC          | text + map figure                            |
| Tornado / severe thunderstorm / flash flood warning with impact tags, severe weather statement                                    | WFO          | existing `nws_weather_warning` + polygon map |
| Local storm report, public information statement, area forecast discussion, hazardous weather outlook                             | WFO          | text templates                               |
| IDSS briefing (slides or one page)                                                                                                | WFO          | template with figures                        |
| Tropical cyclone public advisory, discussion, forecast cone, wind speed probabilities, local statement, storm surge watch/warning | NHC / WFO    | text + map figures                           |
| Excessive rainfall outlook                                                                                                        | WPC          | map figure                                   |
| METAR, TAF, SIGMET / center weather advisory                                                                                      | NWS aviation | text templates                               |
| Red flag warning, fire weather forecast                                                                                           | WFO          | text template                                |
| Radar (reflectivity, velocity, correlation coefficient), satellite                                                                | instruments  | data figure (never AI pixels)                |
| Sounding (skew-T, hodograph), meteogram, hydrograph, model guidance panels, mesoanalysis maps                                     | instruments  | data figure                                  |
| Spotter reports, partner chat messages, social posts, 911 call notes                                                              | people       | existing templates                           |

Impact-based warnings: tornado and severe thunderstorm warnings carry damage threat tags ("Considerable", "Catastrophic"/"Destructive") whose criteria are set in NWSI 10-511 **[V: 10-511 revision history, January 2023 adds SVR Considerable/Destructive tags]** **[U: tag criteria text not read]**.

## 5. Regulations, doctrine and documents (public domain candidates)

- NWS Instructions: 10-511 WFO severe weather products **[V]**; tropical cyclone products, VTEC and other 10-series directives **[U: numbers to confirm]**.
- NWS impact-based warning guidance, StormReady and SKYWARN spotter training material **[U]**.
- NHC product descriptions; FEMA hurricane evacuation studies and HURREVAC fact sheets **[V: FEMA fact sheets 2024]**.
- HSEEP; the Tri-State IWT situation manual and after-action report as model IWT exercises **[V]**.

## 6. Data sources (free, public)

| Data                                                    | Source                                                                              | Notes                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Radar Level II, 1991–today                              | AWS open data, bucket `unidata-nexrad-level2` (moved from `noaa-nexrad-level2`)     | no account needed; NODD terms: open use, do not imply modified data is original **[V]** |
| Storm reports since 1950/1955, outlooks since 2003, MDs | SPC archive; Iowa Environmental Mesonet (IEM) shapefiles and LSR archive since 2003 | IEM MD archive is unofficial, from 2008 **[V]**                                         |
| Hurricane forecasts                                     | NHC GIS archive (cone, track, watches/warnings per advisory); HURDAT2 best tracks   | KMZ/shapefile per advisory **[V]**                                                      |
| Soundings since 1905                                    | NCEI IGRA v2.2                                                                      | free; standard and significant levels only **[V]**                                      |
| Model guidance                                          | HRRR on AWS since 2014 (`noaa-hrrr-bdp-pds`); GFS rolling ~4 weeks (`noaa-gfs-pds`) | GRIB2 **[V: third-party summaries; confirm on registry]**                               |
| Satellite                                               | GOES on AWS (NODD)                                                                  | **[U: current bucket names]**                                                           |
| Warning polygons and VTEC archive                       | IEM                                                                                 | **[U]**                                                                                 |

## 7. Evaluation

- **Warning verification:** probability of detection, false alarm ratio, critical success index, lead time; known trade-off between detection and false alarms; polygon-based scoring has gaps (unverified warnings do not count against lead time) **[V: NOAA 1986–2016 study, AMS papers]**.
- **Decision support:** briefing timeliness, consistency of messages across the forecast office, emergency management and broadcasters, partners' actions matched to the forecast (for hurricanes: evacuation start = arrival of tropical-storm-force winds minus clearance time **[V: FEMA HURREVAC fact sheet]**).
- **HSEEP core capabilities:** Public Information and Warning, Situational Assessment, Operational Communications, Planning.

## 8. Threat families and scenario arcs

- **Hazard-driven:** convective outbreak, flash flood, tropical cyclone, winter storm, heat, fire weather, aviation weather.
- **Operations-driven (new family "service degradation"):** radar outage, data or dissemination failure, office evacuation with service backup, staffing shortfall, misinformation.
- Arc for warning operations: outlook → environment assessment → watch → warnings → reports and verification → recovery and storm survey.

## 9. Reuse by other domains

Weather appears in most domains' scenarios: airports (METAR/TAF, SIGMETs, ground stops), utilities (outage forecasts, storm staging), agriculture (flooding, drought, heat, frost), stadiums and venues (lightning, evacuation of outdoor events), schools (closures, sheltering), transit and rail (flooding, high wind), port and maritime (marine warnings, surge), public health (heat), emergency communications (warnings to the public). The weather toolkit (spec 0448) makes these products and figures available to every domain.
