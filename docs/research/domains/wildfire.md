# Domain dossier: `wildfire` (wildland-urban interface fire, power shutoffs and smoke)

Research for the wildfire epic (#694, spec 0461), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the agencies and organizations that plan for, fight or are affected by fire where wildland fuels meet communities, and the electric utilities whose operations can start or avoid fires.

- **Fire agencies:** local fire departments and districts, state forestry and fire agencies, federal land agencies (Forest Service, Bureau of Land Management, National Park Service, Bureau of Indian Affairs), tribal fire programs, interagency dispatch centers and coordination centers.
- **Emergency management and public safety:** county and city emergency management, sheriffs and police (who usually issue evacuation orders), 911 and dispatch, public information officers, animal control, transportation departments.
- **Utilities:** electric utilities with wildfire mitigation plans and public safety power shutoff (PSPS) programs; water utilities (pressure and supply during fire); telecom (site power, backhaul).
- **Affected institutions:** hospitals and nursing homes, schools and campuses, large employers, tourist and camping areas, tribal nations, airports (smoke, TFRs).

**Exercise types this field needs:**

- **WUI fire with evacuation zones:** a fast-moving fire, pre-defined evacuation zones, orders and warnings, contraflow and road capacity, shelters, animals, people with access and functional needs, a hospital or care home to move.
- **Public safety power shutoff:** forecast of high wind and dry fuels, a decision to de-energize circuits, customer and public safety partner notification in advance, medical baseline and critical facility customers, community resource centers, restoration after patrols.
- **Smoke and air quality:** AQI series for hospitals and schools, closures, clean-air shelters, outdoor events.
- **Resource shortage:** national preparedness level, competing incidents, mutual aid, engines and crews not available.
- **Flood after fire:** burn scar flash floods and debris flows (see `flooding`, `earth_sciences`).
- **Continuity:** dispatch center or alerting system failure, cell tower and power loss, a siren system that cannot reach a canyon.

**Aliases:** wildfire, wildland fire, WUI, wildland-urban interface, red flag, PSPS, public safety power shutoff, de-energization, fire weather, evacuation zones, fire district, forestry, burn scar.

## 2. Organization and roles

| Title                                        | Abbrev. | Team           | What they decide                                                                                     |
| -------------------------------------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| Incident commander (wildland, Type 3 to 1)   | IC      | Command        | Strategy, tactics, resource orders, requests for evacuation                                          |
| Operations section chief / division sup.     | OPS     | Operations     | Assignments, structure protection, triage of structures                                              |
| Planning section / fire behavior analyst     | FBAN    | Planning       | Spread projections, perimeters, timing of threat to zones                                            |
| Dispatch / coordination center               | DISP    | Support        | Resource orders, mutual aid, National Preparedness Level effects                                     |
| Sheriff or police incident commander         | LE      | Evacuation     | Evacuation orders and warnings, zone sweeps, road control, contraflow                                |
| Emergency manager (county)                   | EM      | EOC            | Alert and warning, shelters, large animal and access and functional needs support, requests to state |
| Public information officer                   | PIO     | Communications | Messages that match the status of each zone; rumor control; coordinated with the utility             |
| Utility wildfire / PSPS incident commander   | PSPS-IC | Utility EOC    | Decision to de-energize and re-energize, circuits, customers, notifications                          |
| Utility meteorologist / fire potential staff | UMET    | Utility EOC    | Fuel and wind forecasts, circuit-level risk, timing of the event window                              |
| Utility customer care and community liaison  | LIAISON | Utility EOC    | Notifications to customers and public safety partners, medical baseline outreach, resource centers   |
| Public health officer                        | PHO     | Health         | Smoke advisories, clean-air shelters, guidance for schools and events                                |
| Hospital or care home administrator          | FAC     | Facility       | Shelter in place or evacuate, generator fuel, air filtration, patient transfer                       |
| School district operations lead              | SCH     | Facility       | Closure, early release, bus routes, indoor air quality                                               |
| Fire weather forecaster (NWS)                | FWX     | Outside party  | Red flag warning, spot forecasts, incident meteorologist (IMET) support                              |

**Outside parties:** National Weather Service forecast office and fire weather desk, geographic area coordination centers and the National Interagency Coordination Center, state emergency management, Red Cross, transportation department and highway patrol, FEMA (Fire Management Assistance Grants), airports and the FAA (temporary flight restrictions), air quality agencies (EPA, state districts), media, volunteer organizations active in disaster, tribal governments, neighboring counties.

## 3. Systems

- **Fire data:** interagency incident systems that feed the public National Incident Feature Service and the Wildland Fire Interagency Geospatial Services (WFIGS) layers **[V: current perimeter and incident services respond]**; the daily Incident Management Situation Report from the National Interagency Coordination Center **[U]**; satellite detections (NASA FIRMS VIIRS/MODIS) **[V: already used by hazard data, spec 0439]**; fire weather outlooks and red flag warnings from the NWS **[U, weather toolkit]**.
- **Alert and warning:** Wireless Emergency Alerts and the Integrated Public Alert and Warning System, mass notification systems, sirens, evacuation zone platforms and maps, door-to-door sweeps.
- **Utility:** SCADA and distribution management systems, circuit and customer information systems, weather station networks, outage management, customer notification systems, community resource centers.
- **OT-like dependencies:** substation and recloser controls, radio and cell sites, dispatch consoles, generators at hospitals and cell sites.

## 4. Products (what injects look like)

| Product                                                                                                                  | From                  | Render                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------- |
| Red flag warning, fire weather watch, spot forecast, fire weather outlook                                                | NWS                   | weather toolkit templates (spec 0449 FR-3)                            |
| Incident summary (name, size, containment, structures, resources, evacuations) and incident update                       | fire agency           | text template                                                         |
| Perimeter map with evacuation zones (order, warning, no status) and shelters                                             | fire agency / EM      | map figure from case data                                             |
| Fire spread projection (timing of arrival at zones, 6/12/24 hours)                                                       | fire behavior analyst | map figure from case data (simulated or published)                    |
| Evacuation order, evacuation warning, shelter in place, all clear; `cap_alert`, WEA text, `eas_broadcast`                | sheriff / EM          | existing templates plus zone-based text                               |
| Road closure and traffic control point status; contraflow notice                                                         | DOT / LE              | status board figure; `rider_service_alert`-style notices              |
| Shelter opening and capacity; animal shelter                                                                             | EM / Red Cross        | status board; text template                                           |
| Situation report, ICS-209-style incident status summary, ICS-201 prefill, ICS-213                                        | IC / planning         | text templates; existing `ics_201_prefill`, `ics_213_general_message` |
| PSPS forecast notice to public safety partners, customer warning, power-off notice, restoration, cancellation, all-clear | utility               | text / SMS / email / call script templates                            |
| PSPS circuit and customer board (circuits, customers, medical baseline, critical facilities, status)                     | utility EOC           | status board figure; table                                            |
| Community resource center notice (hours, services)                                                                       | utility               | text template                                                         |
| PSPS post-event report (circuits, customers, durations, notification times, complaints)                                  | utility               | text template and table                                               |
| AQI series and smoke advisory; smoke polygons (light, medium, heavy)                                                     | EPA / NOAA / health   | time series figure; map figure; text template                         |
| School closure notice, hospital status, outdoor event cancellation                                                       | facility              | text templates                                                        |
| Aerial and ground photos of flame fronts, smoke columns, burned structures                                               | public, responders    | AI image (scene), never the data figures                              |

## 5. Regulations, doctrine and documents (public domain candidates)

- **PSPS notification timeline (California):** CPUC Decision D.19-05-042 (30 May 2019, Phase 1 guidelines, rulemaking R.18-12-005) says electric investor-owned utilities should, whenever possible, adhere to this minimum timeline: 48-72 hours before anticipated de-energization for public safety partners and priority notification entities; 24-48 hours before for all other affected customers; 1-4 hours before, if possible, for all affected customers; when de-energization is initiated; immediately before re-energization begins; and when re-energization is complete **[V: read in the decision text, page 86 and Appendix A page A8, 2026-11-05]**. Footnote 93 says it may not be possible to know exactly when de-energization will occur and that utilities should strive to say it is imminent. The CPUC later updated the guidelines (D.21-06-034) **[U: not read]**. A CPUC citation printed both "24-48" and "28-48" hours in different places; the decision itself says 24-48. Resolution ESRB-8 (2018) extended earlier requirements to all electric investor-owned utilities **[U]**.
- **Oregon:** the Public Utility Commission's rules for wildfire mitigation plans (OAR 860-300) require a public safety partner coordination strategy that includes tabletop exercise planning and after-action reporting; the PUC has co-hosted a PSPS tabletop exercise with the state emergency management office **[U: from search results; rule text not read]**.
- **Evacuation terms:** the Ready, Set, Go! program of the International Association of Fire Chiefs uses three tiers (prepare; be ready to leave; leave now when directed), and local officials issue the actual orders **[U]**. Terms for orders versus warnings vary by state and county, so the toolkit stores a per-project glossary.
- **Smoke:** EPA's _Wildfire Smoke: A Guide for Public Health Officials_ (a 2026 edition appears on EPA's site) covers clean-air shelters, school and event decisions and communication **[U: edition and recommendations not read]**.
- **Air quality scale:** the EPA Air Quality Index for PM2.5 changed on 6 May 2024: Good 0.0–9.0, Moderate 9.1–35.4, Unhealthy for Sensitive Groups 35.5–55.4, Unhealthy 55.5–125.4, Very Unhealthy 125.5–225.4, Hazardous 225.5 and above (µg/m³) **[V: EPA fact sheet, February 2024]**.
- **Preparedness levels:** NIFC national preparedness levels run from 1 to 5; at level 5 national resources are heavily committed and inactive or low-activity geographic areas are reaching drawdown levels **[V: NIFC National Preparedness Levels sheet and BLM explainer, 2026-11-11; corrected from "below drawdown levels for multiple resource types"]**.
- **Flash floods on burn scars:** NWS Instruction 10-922 allows an expected rainfall rate tag for rain on a burn scar **[V]**; USGS publishes post-fire debris-flow hazard assessments with rainfall thresholds (earth sciences toolkit) **[U]**.
- **After-action reports to learn from:** the Marshall Fire (Colorado, 30 December 2021) joint operational after-action report, which found the fire outpaced evacuation orders in places and gaps in alert coverage and agency radio planning **[U: from news summaries]**; the Fire Safety Research Institute's Lahaina fire incident analysis (Phase 2, 13 September 2024: 84 findings and 140 recommendations, with risk perception, preparedness and incident coordination among the priorities) and the Maui fire, police and emergency management after-action reports **[U: from summaries]**.
- **Exercise material:** HSEEP; FEMA Fire Management Assistance Grant material **[U]**.

## 6. Data sources (free, public)

| Data                                                         | Source                                                                                                                                                                      | Notes                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current interagency fire perimeters                          | NIFC ArcGIS service `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer`                                 | fields include incident name, acres, dates, containment, cause; responds without a key **[V]**. Perimeters are not available for every incident **[U]**                    |
| Perimeter history (1979 to present, by decade and all years) | same organization: `InterAgencyFirePerimeterHistory_All_Years_View`, `WFIGS_Interagency_Perimeters` and `WFIGS_Interagency_Perimeters_YearToDate`, GeoMAC history 2000–2019 | service names listed **[V]**; field contents and completeness for replay **[U]**                                                                                           |
| Incident locations                                           | `WFIGS_Incident_Locations_Current`, `_Last24h`, `_YearToDate`                                                                                                               | listed **[V]**                                                                                                                                                             |
| Satellite hotspots                                           | NASA FIRMS area API (VIIRS, MODIS)                                                                                                                                          | free MAP_KEY required; the key handling already exists in hazard data (spec 0439 FR-12); rate limit 5,000 transactions per 10 minutes **[V in spec 0439; U this session]** |
| Smoke plumes (light, medium, heavy)                          | NOAA Hazard Mapping System shapefiles `https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/Shapefile/YYYY/MM/hms_smokeYYYYMMDD.zip`                         | analyst-drawn from satellite imagery, 2005 to present; start and end times are the imagery window **[U: from search listing]**                                             |
| Air quality observations and forecasts                       | EPA AirNow API (`docs.airnowapi.org`)                                                                                                                                       | free account key by email; by ZIP code or latitude and longitude; NowCast AQI by reporting area **[U]**. Store the key like the FIRMS key                                  |
| Fire weather                                                 | NWS red flag warnings and fire weather outlooks (weather toolkit); Iowa Environmental Mesonet archive                                                                       | reuse spec 0449                                                                                                                                                            |
| Post-fire debris flow                                        | USGS assessments and API                                                                                                                                                    | earth sciences toolkit                                                                                                                                                     |
| Wildfire risk and housing                                    | USDA Forest Service Wildfire Risk to Communities; Census; WUI maps                                                                                                          | **[U]**                                                                                                                                                                    |

**Replay limit:** perimeters are published as a sequence of mapped polygons, not as a continuous spread, so a replay animates between mapped perimeters (labeled interpolation) and never claims minute-by-minute truth. Evacuation zone geometry and the timing of real orders are held by counties and are mostly not in these services **[U]**; examples use fictional zones drawn on real terrain.

## 7. Evaluation

- **Threshold timing:** evacuation orders issued before the projected arrival of the fire at a zone minus the zone's clearance time (spec 0448 threshold timing), with the fire's modeled or mapped arrival as ground truth.
- **PSPS notification:** each notification sent within its window (48–72 hours partners; 24–48 hours customers; 1–4 hours; at de-energization) against the event timeline; medical baseline and critical customers reached (counts and attempts) **[V for windows]**.
- **Message consistency:** the evacuation status each partner repeats (fire agency, sheriff, utility, school district, hospital) versus the current zone map (spec 0448 message consistency).
- **Facility actions:** hospitals and schools acted on the AQI and the fire status by the time it crossed their thresholds (for example, AQI over 100 for schools to activate filtration, a local plan rather than a federal rule) **[U]**.
- **HSEEP core capabilities:** Public Information and Warning, Operational Communications, Operational Coordination, Critical Transportation, Mass Care Services, Infrastructure Systems, Situational Assessment, Fire Management and Suppression.
- **Caveat shown with the score:** a late order is judged against the case's projected arrival, which for simulated spread is the scenario's, not the fire's; the report says which.

## 8. Threat families and scenario arcs

- **Hazard-driven:** WUI fire, red flag wind event, smoke episode, resource shortage, flood after fire.
- **Operations-driven (service degradation):** alerting platform outage, dispatch or radio failure, cell and power loss in a canyon, missed or wrong evacuation zone message, utility notification failure, misinformation about orders.
- **Arc for a WUI fire:** red flag forecast → ignition and initial attack → extended attack and rapid growth → zone warnings and orders → evacuation and road constraints → shelters and facility moves → containment → re-entry → burn scar flood watch.
- **Arc for a PSPS event:** fuel and wind forecast → watch and decision call → partner notice (48–72 hours) → customer notice → de-energize → patrol and weather monitoring → restoration decision → customers back and post-event report.

## 9. Reuse by other domains

Wildfire is a toolkit for healthcare and care facilities (smoke, evacuation), K–12 and campuses (closures, indoor air), energy utilities (PSPS, outage staging, substation protection), water utilities (pressure, contamination after fire), telecom (site power, backhaul), transit and freight rail (line closures, smoke), airports (smoke, TFRs, ARFF mutual aid), stadium and venue (event cancellation), food and agriculture (livestock moves, smoke taint), municipal and emergency communications (zone-based alerting), and public health (smoke and clean-air shelters). It uses the weather toolkit (red flag warnings, wind, spot forecasts), the earth sciences toolkit (debris flows) and the flooding toolkit (burn scar floods) instead of duplicating them.

## Expert review (2026-11-11)

This is a model-led expert review, written from the standpoint of a wildland fire incident commander and fire behavior analyst with utility power shutoff and smoke experience. It is not a review by a licensed or employed practitioner.

**What was checked:** the domain profile (roles, threat families, prompt guidance, decision examples), the wildfire toolkit (glossary, product conventions, realism rules, decision forms, metrics and critical tasks), the format checks (zone status, containment, AQI category, shutoff windows and counts), the spread and smoke simulations (Anderson length-to-breadth relation, EPA AQI equation), the fire figures, every `wildfire_*` template with its preview data, the user guide and the pack readme.

**Sources consulted:**

- CPUC Decision D.19-05-042 (30 May 2019), section 5.3 and Appendix A: the minimum notification timeline, read in the decision text: 48-72 hours (public safety partners and priority notification entities), 24-48 hours (all other affected customers), 1-4 hours if possible (all affected customers), when de-energization is initiated, immediately before re-energization begins, and when re-energization is complete.
- CPUC "Evolution of PSPS guidelines" page: D.20-05-051 (Phase 2) and D.21-06-034 (Phase 3) additions (exercises, critical facilities, resource center services, access and functional needs support); no change to the timeline is listed there.
- NWCG / FEMA ICS 209 Incident Status Summary (v3) and its block instructions: block 3 report version (initial, update, final), block 8 percent contained or completed, block 29 primary materials or hazards, block 30 damage assessment rows (single residences, nonresidential commercial property, other minor structures) with "# threatened (72 hrs)", "# damaged", "# destroyed", blocks 35 weather concerns, 36 projected activity (12, 24, 48, 72 hours and after), 39 critical resource needs, 43 anticipated incident management completion date.
- EPA AQI technical assistance and the February 2024 PM2.5 fact sheet: breakpoints since 6 May 2024 (Good 0.0-9.0 up to Hazardous 225.5 and above) and the AQI equation with truncation to 0.1 microgram per cubic meter.
- NIFC National Preparedness Levels sheet and the BLM explainer "What it means to be at PL 5" (2024).
- Oregon Department of Emergency Management: Level 1 Be Ready, Level 2 Be Set, Level 3 Go Now; IAFC Ready, Set, Go!.
- NWCG glossary definitions of contained and controlled.

**What changed and why:**

- **Fire behavior analyst role.** The domain role was titled "Planning Section Chief / Fire Behavior Analyst". These are different positions: the FBAN is a technical specialist working in the planning section. Renamed to "Fire Behavior Analyst (Planning Section)", matching the toolkit's advisor.
- **Preparedness level 5.** The text said resources are "below drawdown levels for multiple resource types". NIFC describes PL 5 as national resources heavily committed, with low-activity areas reaching drawdown levels. Corrected in the domain and toolkit.
- **Shutoff notice timeline.** The pack listed only the four notices before and at de-energization. The decision also lists notices immediately before re-energization begins and when it is complete. They were added to the prompt guidance, product conventions, guide and readme, and two such rows were added to the post-event report example. The timing measure still scores only the notices before and at de-energization; the guide now says so.
- **Post-event report example.** The power-off notice sent six minutes after de-energization was marked "Missed", but the app's own timing rule accepts a power-off notice up to 30 minutes after. It is now "Met", so the example agrees with the measure.
- **ICS 209 style summary.** The labels now follow the current form: "Percent contained", "Anticipated completion" (block 43; the old form's "estimated control" is no longer a block), "Primary fuels", and "Threatened (72 hours)". The example rows use the form's structure categories. The report version description now includes final.
- **AQI summary example.** The PM2.5 concentrations did not produce the AQI values printed beside them under the EPA equation (78.4 gives 167, not 168; 52.0 gives 142, not 132; 135.2 gives 211, not 212). The concentrations were corrected (79.8, 48.1, 136.6) so that each row computes. The note said the observations were "1-hour NowCast values" and the forecasts "daily maximums"; NowCast is a weighted multi-hour average reported hourly, and AirNow forecasts are of the daily AQI, so the note now says that.
- **Evacuation levels.** The glossary, prompt guidance and guide now say that some states use numbered levels (Level 1 Be Ready, Level 2 Be Set, Level 3 Go Now), that Go Now and an order both mean leave immediately, and that a project should use one system throughout.
- **Containment.** The glossary and guide now separate contained from controlled.

**Checked and left as is:** the AQI breakpoints and category bands in the checks, figures and simulation; the Anderson (1983) length-to-breadth relation; the fixed partner window check (48-72 hours); the medical baseline count check; the order-before-latest-time and de-energize-before-threshold measures; the school and event AQI thresholds labeled as local plans; the smoke advisory guidance (well-fitted N95, clean-air spaces); the incident summary, evacuation, shutoff customer, contact script, resource center, school and facility notices.

**Defaults set:**

- The shutoff windows stay at the CPUC D.19-05-042 timeline and stay labeled as one state's example rule. Restoration notices are described but not timed, because the scenario has no ground-truth re-energization start for every circuit.
- Evacuation status words stay order, warning, shelter in place, none, with numbered levels as the documented alternative; the format checks compare a notice with itself and do not impose either system.
- The school action threshold stays at AQI 150 as an editable local plan value.

**Caveats for the owner:**

- D.21-06-034 itself was not read in full; only the CPUC summary of what it added.
- The NWS fire weather planning forecast example (weather toolkit) carries the header FNUS53 KILN; the Wilmington, Ohio office issues it as FNUS51 KILN (Iowa Environmental Mesonet product list, 2024 and 2026). That template belongs to the weather toolkit and was left for its review.
- The format checks do not test that a PM2.5 value and its printed AQI agree, only the category; a numeric check would have caught the example above.
- Real red flag criteria are set per forecast office in its annual operating plan; the toolkit leaves red flag products to the weather toolkit and makes no claim about thresholds.
