# Domain dossier: `flooding` (flood response, floodplain management and hydrology)

Research for the flooding and hydrology epic (#687, spec 0454), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the people who forecast, manage and respond to floods, and everyone who has to act on a river forecast or a flash flood warning.

- **Forecast and data side (outside parties for most exercises):** National Weather Service forecast offices and River Forecast Centers, the National Water Center, USGS Water Science Centers (stream gauges), state and local flood warning programs (local gauge networks), the US Army Corps of Engineers (reservoirs, levees) **[U]**.
- **Managers and responders:** county and state emergency management, floodplain administrators, public works and road crews, levee and drainage districts, dam owners, water and wastewater utilities, transportation departments, farms and agricultural cooperatives, schools, hospitals, mobile home parks, campgrounds and camps near streams.

**Exercise types this field needs:**

- **River flood with a forecast crest:** days of lead time, a forecast hydrograph that changes with each issuance, flood categories that trigger actions (sandbags, road closures, evacuation of a reach, levee patrols).
- **Flash flood:** minutes to hours between rain and rising water; warnings with damage threat tags; low-water crossings, underpasses, creeks and campgrounds; the night-time case.
- **Levee or dam failure and high pool:** shares the dam owner's emergency action plan (see `water_dam`); the flood side is downstream warning, evacuation and inundation timing.
- **Urban and stormwater flooding:** underpasses, transit, basements, combined sewer overflow, pump station failure.
- **Agricultural flooding:** livestock moves, stored grain, manure lagoons, planting delays (see `food_agriculture`).
- **Flood after wildfire:** burn scar flash floods and debris flows (see `wildfire`, `earth_sciences`).
- **Continuity of data:** a stream gauge that is washed out, iced or offline during the event, and what responders do without it.

**Aliases:** flood, river flood, flash flood, floodplain management, hydrology, hydrologic services, flood warning program, flood fight, levee district, drainage district, stormwater, inundation.

**Evidence that the scenario is real (not a requirement):** an NWS Inspector General evaluation (Commerce OIG-26-017-I, April 2026) reviewed the National Weather Service's actions before and during the July 2025 Kerr County, Texas flash flood; news reports of the event say a flash flood warning was issued at 1:14 a.m., more than three hours before the first low-water crossing reports, and that the county had no warning sirens **[U: from news summaries; report text not read this session]**. Use as a source of questions (who got the warning, what did a warning mean to a camp at night), not as findings.

## 2. Organization and roles

| Title                                          | Abbrev. | Team           | What they decide                                                                        |
| ---------------------------------------------- | ------- | -------------- | --------------------------------------------------------------------------------------- |
| Emergency manager (county)                     | EM      | EOC            | Activation, evacuation orders, shelters, requests to state, public warning              |
| Floodplain administrator                       | FPA     | Planning       | Maps, permits, substantial-damage estimates after the event, community flood programs   |
| Public works / road superintendent             | PW      | Operations     | Road and bridge closures, barricades, pumps, debris, pump stations                      |
| Levee or drainage district operator            | LEV     | Operations     | Flood fight (patrols, sandbagging, boils), closure structures, pump operations          |
| Dam operator                                   | DAM     | Operations     | Releases, pool level, emergency action plan notifications (see `water_dam`)             |
| Water / wastewater operator                    | WWO     | Operations     | Plant flood protection, overflow, boil water or discharge notices (see `water_utility`) |
| Service hydrologist / hydrologist (NWS)        | HYDRO   | Outside party  | Flood warnings and statements, forecast discussion with the River Forecast Center       |
| River Forecast Center hydrologist              | RFC     | Outside party  | River stage and flow forecasts, forecast changes                                        |
| Utility flood planner (electric, gas, telecom) | UTIL    | Operations     | Substation and facility protection, outage staging, customer notification               |
| Farm or cooperative manager                    | FARM    | Operations     | Livestock and equipment moves, stored grain, fields, insurance documentation            |
| School or hospital facility manager            | FAC     | Operations     | Closures, evacuation, dry-site transfer                                                 |
| Public information officer                     | PIO     | Communications | Messages that match the forecast category and the actions asked of residents            |

**Outside parties:** NWS forecast office and River Forecast Center, National Water Center, USGS Water Science Center, state emergency management and National Guard, Corps of Engineers district, Red Cross and shelter operators, state DOT, railroads, power utilities, news media, neighboring counties and downstream communities, NGOs for muck-out, FEMA (declarations, assistance), volunteers with boats, amateur radio.

## 3. Systems

- **Data and forecasts:** National Water Prediction Service (NWPS) river gauge pages and API **[V]**; USGS stream gauge network (about 8,000 gauges in older USGS descriptions; most report in near real time) **[U: figures from older USGS pages]**; local ALERT-type flood warning gauge networks and rain gauges **[U]**; NWS Flood Inundation Mapping (experimental) **[U: status in 2026 not confirmed]**; FEMA National Flood Hazard Layer **[V: service responds]**; county GIS (parcels, critical facilities, road closures).
- **Alerting:** NOAA Weather Radio, Wireless Emergency Alerts, mass notification systems, sirens (often absent in small counties), door-to-door, social media.
- **Operational:** EOC software, closure status boards and 511 systems, pump and gate SCADA (see `scada_hmi` template), damage assessment apps.
- **OT-like dependencies:** gauge telemetry (radio, cellular, satellite), pump station power, SCADA links, road-closure signs.

## 4. Products (what injects look like)

| Product                                                                                                           | From               | Render                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| Hydrologic outlook ("Ready"), flood watch ("Set"), flood or flash flood warning ("Go"), flood advisory, statement | WFO                | text template; warning also existing `nws_weather_warning` + polygon map |
| Flash flood warning with damage threat tag (base, CONSIDERABLE, CATASTROPHIC) and flash flood emergency language  | WFO                | text template + polygon map                                              |
| River forecast: observed and forecast hydrograph with flood category bands, crest and time                        | RFC / WFO          | data figure (hydrograph)                                                 |
| Gauge page: current stage, flow, flood stage table, historic crests                                               | NWPS               | data figure + table                                                      |
| Inundation map: extent for a forecast or hypothetical stage over parcels and roads                                | NWS / FEMA / local | map figure from case data                                                |
| Flood hazard map (special flood hazard area) at a site                                                            | FEMA               | map figure                                                               |
| Road closure board, low-water crossing status, 511 notice                                                         | public works / DOT | status board figure; text template                                       |
| Sandbag and pump logistics tracker (counts, locations, delivery times)                                            | EOC                | status board / table figure                                              |
| Levee patrol report (boil, seepage, slough), flood fight request                                                  | levee district     | `field_report`, `ics_213_general_message`                                |
| Evacuation order, shelter opening notice, `cap_alert`, `eas_broadcast`, `emergency_declaration`                   | EM                 | existing templates                                                       |
| Damage assessment summary, substantial-damage letter                                                              | FPA                | text template                                                            |
| Photos and video of flooded streets, vehicles, water rescues                                                      | public, responders | AI image (scene), never the data figures                                 |

**Flash flood tags (NWS Instruction 10-922, 3 August 2021):** base (no tag) for most flash floods; CONSIDERABLE for unusual severity where urgent action is needed; CATASTROPHIC only with flash flood emergency language, for exceedingly rare violent floods that threaten lives and cause disastrous damage. Wireless Emergency Alerts go out only for warnings tagged CONSIDERABLE or CATASTROPHIC. Flash flood emergency criteria include multiple swift water rescue teams deployed, gauges at or above major levels, and total failure of a major high hazard dam **[V: NWSI 10-922 as published at weather.gov]**. An optional expected rainfall rate tag can name rain on a burn scar **[V]**.

**Ready, Set, Go:** NWS water resources products follow three tiers: hydrologic outlook (Ready), flood watch (Set), warning (Go) **[V: NWSI 10-922 section 1.3]**.

## 5. Regulations, doctrine and documents (public domain candidates)

- **Flood categories and stage terms:** NWS Manual 10-950, _Definitions and General Terminology_ (26 November 2019): action stage, flood stage, bankfull; minor flooding (minimal or no property damage, possibly some public threat such as road inundation), moderate (some inundation of structures and roads near the stream, evacuations of people and transfer of property to higher elevations), major (extensive inundation of structures and roads, significant evacuations); record flooding; minor, moderate and major categories do not necessarily exist at every forecast point (a leveed location may begin to see impacts at moderate) **[V]**.
- **Product specifications:** NWS Instruction 10-922, _WFO Water Resources Products Specification_ (3 August 2021) **[V]**.
- **Dam and levee:** dam emergency action plans and FEMA dam safety exercise guidance (covered in `water_dam`); USACE levee safety and flood fight guidance **[U: documents to identify]**.
- **Floodplain management programs:** the National Flood Insurance Program and its Community Rating System include a warning and response activity (Activity 610) and credit for levee and dam programs; the Certified Floodplain Manager credential is run by the Association of State Floodplain Managers **[U: from secondary pages]**.
- **Exercise material:** FEMA's archived Flood Tabletop Exercise package (situation manual, slides, evaluator handbook, AAR/IP template) and published county flood AARs (for example a 2022 Davison County, South Dakota functional exercise built on a flood warning) **[U: located by search, not read]**; HSEEP.

## 6. Data sources (free, public)

| Data                                                   | Source                                                                                                               | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gauge metadata, flood category stages, historic crests | NWPS API `https://api.water.noaa.gov/nwps/v1/gauges/{lid}`                                                           | JSON; includes linked USGS id, RFC, WFO, action/minor/moderate/major stages (flow `-9999` when not defined) and historic crests; no key needed **[V: live request, EADM7 St. Louis]**                 |
| Observed and forecast stage and flow                   | NWPS `.../gauges/{lid}/stageflow` and `.../stageflow/forecast`; rating curve at `.../ratings`                        | JSON time series with issue times **[V]**; the forecast is the current one, not an archive                                                                                                            |
| Real-time and daily gauge values                       | USGS Water Data OGC API `https://api.waterdata.usgs.gov/ogcapi/v0/collections/{latest-continuous, daily, ...}/items` | GeoJSON, no key needed in a test request **[V]**. USGS says the legacy WaterServices will be decommissioned in Q1 2027 **[U: from USGS pages seen in search]**, so connectors target the OGC API only |
| Flood hazard zones                                     | FEMA National Flood Hazard Layer `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer`               | ArcGIS REST; service responds **[V]**; detailed layers appear only at large scales and preliminary data is not for insurance rating **[U]**                                                           |
| Forecast inundation extent (experimental)              | NWS Flood Inundation Mapping services on `maps.water.noaa.gov`                                                       | based on the National Water Model with a 5-day maximum extent layer **[U: coverage and status in 2026 not confirmed]**                                                                                |
| Past warnings and polygons, flash flood reports        | Iowa Environmental Mesonet VTEC archive and local storm reports                                                      | shared with the weather toolkit (spec 0449 FR-7)                                                                                                                                                      |
| Rainfall                                               | weather toolkit connectors (radar, model guidance); MRMS/QPE is not covered this session                             | **[U]**                                                                                                                                                                                               |
| Post-fire debris-flow hazard                           | USGS assessments (earth sciences toolkit)                                                                            | reuse `debris_flow` toolkit                                                                                                                                                                           |

**Replay limit:** the NWPS forecast endpoint returns only the latest forecast, so the hydrograph a real past event looked like on a given day is not available from it. A replay therefore uses USGS observed series for the event, the crest and flood stages from the gauge record, and either a stored forecast the user saved at the time or a simulated forecast labeled as such **[V for the endpoint behavior, U for any NWS forecast archive]**.

## 7. Evaluation

- **Decision timing against thresholds:** evacuation, road closure and sandbagging decisions before the forecast reached the stage that makes the action necessary (spec 0448 threshold timing), for example closure before a road's first inundation stage.
- **Warning chain:** time from the warning to the first protective action at each place; whether the message matched the warning's damage tag (message consistency, spec 0448).
- **Forecast use:** actions taken on the right forecast (the latest, not a stale one); response to a forecast crest that changes by a category between issuances.
- **Exposure:** people, structures and critical facilities in the extent at each time, and whether the plan reached them (hospitals, schools, camps, mobile homes, dialysis centers).
- **HSEEP core capabilities:** Public Information and Warning, Situational Assessment, Operational Coordination, Critical Transportation, Mass Care Services, Infrastructure Systems, Logistics and Supply Chain Management.
- **Known scoring caveat:** NWS flood categories are impact thresholds set per forecast point with local officials, so the same crest is "moderate" on one river and "minor" on another; the figures always show the point's own category table.

## 8. Threat families and scenario arcs

- **Hazard-driven:** river flood, flash flood, levee or dam breach, urban and stormwater flooding, coastal flood combined with river flood (see `port_maritime` and the weather toolkit), ice jam, flood after wildfire.
- **Operations-driven (service degradation):** gauge or telemetry loss, forecast model outage, warning dissemination failure, pump station power loss, road closure sign shortage, false or missing flood warnings.
- **Arc for a river flood:** outlook (Ready) → watch (Set) → rise above action stage → flood stage and first closures → forecast crest changes category → evacuation and flood fight → crest → recession and re-entry → recovery and damage assessment.
- **Arc for a flash flood:** rain over a basin → warning with tag → rapid rise at a crossing or campground → water rescues and a flash flood emergency → recession → search, damage and reunification.

## 9. Reuse by other domains

Flooding is a toolkit most domains can use: water and wastewater utilities (overflow, plant protection), energy utilities (substations, outage staging), food and agriculture (livestock, grain, fields), transit and freight rail (washouts, underpasses), airports (field drainage, access roads), ports (river stage and navigation), healthcare and K–12 (dry-site transfer, closures), campuses and venues (drainage), telecom (sites and backhaul), gas pipeline (river crossings), municipal and emergency communications (warnings, closures). The flooding toolkit shares the hydrograph figure kind with the weather toolkit (spec 0449 FR-5) and the debris-flow toolkit with earth sciences (spec 0450).

## Expert review (2026-11-11)

Model-led expert review from the standpoint of an NWS service hydrologist and warning coordination meteorologist. It is not a review by a licensed or employed practitioner.

**Checked:** the flooding toolkit (glossary, product conventions, realism rules, decision forms, metrics), the flooding domain profile (roles, threat families, prompt guidance), the flood lint rules, the hydrologic product template preview, the hydrograph and gauge figures' category logic and the user guide.

**Sources:** NWS Manual 10-950 (flood stage and the flood categories), NWSI 10-922 (water resources products), NWS service change notice 21-56 and the Hydrology Hazard Simplification pages (Flood Watch consolidation, November 2021), NWS impact-based flash flood warning pages (base, CONSIDERABLE, CATASTROPHIC; WEA for CONSIDERABLE and CATASTROPHIC only), NWS St. Louis ESF products as carried on the NOAA text server (`FGUS73 KLSX`).

**Correct as found:** flood stage versus bankfull; per-point category tables with missing categories; the flash flood damage tag rules and WEA triggers; Ready, Set, Go tiers; river versus flash flood time scales; stage in feet and flow in cfs.

**Changed and why:**

- The flash flood threat family said "a flash flood watch covers the county" for heavy rain. Since November 2021 excessive rainfall is covered by a Flood Watch; the Flash Flood Watch is kept only for special cases (dam failure, burn scars). The beat and phase goal now say flood watch; the burn-scar family keeps its flash flood watch. The guide says so too and adds that a flash flood warning often has no watch before it.
- The category logic ignored flood stage when a table gave flood stage but no separate minor stage, so a stage above flood stage was reported as "action". Flood stage is where minor flooding begins (10-950); the stage is now minor, and a minor claim at such a point is accepted. The guide states that flood stage is where minor flooding begins.
- The hydrologic outlook sample used WMO heading FGUS63; NWS St. Louis issues ESF under FGUS73. Preview and schema example corrected and the golden image regenerated.

**Defaults set:** flash flood decision timing keeps a 120-minute lead window with area matching on; evacuation clearance stays at 120 minutes as a placeholder for the plan's own value.

**Remaining caveats:** the product order check (outlook, watch, warning) only fires when both products exist, which fits the no-watch case but can flag a watch issued later for a new area of the same event; a table that gives flood stage below a moderate stage with no minor stage is unusual in practice, since NWS sets flood stage equal to the minor threshold.
