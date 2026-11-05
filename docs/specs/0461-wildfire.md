# Spec 0461: Wildfire — WUI fire, power shutoffs, smoke and the wildfire toolkit

Issue: #694 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/wildfire.md](../research/domains/wildfire.md)

## Summary

Wildfire reaches communities that never planned for it, and utilities now de-energize lines in high wind to avoid starting fires, so wildfire ships as a **toolkit** many domains can add (hospitals and care homes, schools and campuses, utilities, telecom, transit, airports, venues, agriculture, counties) plus a small `wildfire` domain for the organizations whose job it is (a fire district or agency, a county wildfire and evacuation program, a utility wildfire and power shutoff program). The toolkit provides incident and evacuation products, perimeter and spread maps with evacuation zone status, a power shutoff kit (circuits, customers, medical baseline customers, the notification windows), smoke and air quality products and an AQI series, and decisions scored by the clocks that matter: evacuation orders before the fire reaches a zone, shutoff notifications inside their windows, medically vulnerable customers reached. Real fires are replayed from public interagency perimeter data; fictional fires come from a simple spread generator. The toolkit reuses weather (red flag warnings, wind, fire weather), earth sciences (debris flows) and flooding (burn scar floods) by reference.

## Requirements

### User stories

- As a county emergency manager in the wildland-urban interface, I want a fast fire with pre-defined evacuation zones, where orders and warnings must go out before the projected arrival minus clearance time, and where the map in front of every seat shows the same zone status.
- As a utility's wildfire program lead, I want a power shutoff exercise with circuits, customer counts, medical baseline customers and the notification windows, so we can test whether each notice went out on time and whether we reached the people who depend on power.
- As a hospital administrator, I want a smoke and fire scenario that tests whether we shelter in place or evacuate, how long the generator fuel lasts, and who we call.
- As a school district operations lead, I want an AQI series that crosses our thresholds and an order to close, so we practice the decision and the message.
- As a fire district planner, I want to replay a real past fire from its mapped perimeters and test our zone plan against how it grew.
- As a telecom or water operator, I want fire and shutoff effects on my sites without building a fire exercise.
- As an instructor, I want students to read a perimeter map and a zone table and write the message each zone needs.

### Functional requirements

**Domain**

- **FR-1 Wildfire domain.** A `wildfire` domain profile with variants for a fire district or agency, a county wildfire and evacuation program, and a utility wildfire and power shutoff program, with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3); aliases as listed.
- **FR-2 Threat families and arcs.** Hazard families (WUI fire, red flag wind event, smoke episode, resource shortage, flood after fire) and a **service degradation** family (alerting platform outage, dispatch or radio failure, cell and power loss, wrong or missed zone message, utility notification failure, misinformation about orders), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**Wildfire toolkit: products**

- **FR-3 Incident and evacuation products.** Exact, legible templates for: incident summary and update, incident status summary (ICS-209 style), evacuation order, evacuation warning and shelter-in-place notices per zone, all clear, road closure and traffic control point status, contraflow notice, shelter and animal shelter notices, a wildfire situation report, and a re-entry notice (reusing `cap_alert`, `eas_broadcast`, `ics_201_prefill`, `ics_213_general_message`, `emergency_declaration`). Red flag warnings, fire weather watches and spot forecasts come from the weather toolkit (spec 0449 FR-3) and are not duplicated.
- **FR-4 Power shutoff products.** Templates for the notices in a shutoff event: forecast notice to public safety partners, customer warning, power-off notice, restoration and cancellation notices, all-clear, call, text and email scripts, community resource center notice, and the post-event report (circuits, customers, durations, notification times).
- **FR-5 Smoke and air quality products.** Templates for a smoke advisory, an AQI forecast and observation summary, a school closure or early release notice, a hospital status and outdoor event cancellation notice, a clean-air shelter notice; a smoke polygon map; an AQI time series with the EPA categories.
- **FR-6 Format rules and knowledge.** Lint and generator knowledge for: evacuation language (order, warning, shelter in place, all clear; the project's own glossary since terms vary by place; Ready, Set, Go tiers when the project uses them); zone ids consistent between map, table and messages; the PM2.5 AQI categories and breakpoints in effect since 6 May 2024; shutoff notification windows (48–72 hours partners; 24–48 hours customers; 1–4 hours; at de-energization) with their source; the rule that a perimeter is a mapped polygon at a time, not continuous truth; acreage and containment definitions; national preparedness level meaning.

**Wildfire toolkit: figures**

- **FR-7 Figures.** Figure kinds (spec 0448 FR-4, map overlays FR-11): fire map (perimeters over time with a time slider, hotspots, spread projections for 6, 12 and 24 hours, evacuation zones colored by status with the status words in labels, shelters, road closures, assets); evacuation status board (zone, status, time ordered, people and special populations, clearance time, projected arrival); PSPS circuit and customer board (circuit, customers, medical baseline, critical facilities, status, notified time); AQI series with category bands and thresholds; smoke plume map. Each yields the text summary and data table of spec 0448 FR-5.

**Wildfire toolkit: data**

- **FR-8 Public data connectors.** Connectors, with consent and a size estimate (spec 0448 FR-8), for: the National Interagency Fire Center WFIGS services (current and historical interagency perimeters, incident locations) on the NIFC ArcGIS organization; NASA FIRMS hotspots (reusing the keychain-held MAP_KEY and its handling from spec 0439); NOAA Hazard Mapping System smoke polygons; and EPA AirNow observations and forecasts (a free key, stored like the FIRMS key and used only when present). Fixed hosts per connector. Layers are cropped to the scenario area and times.
- **FR-9 Event finder and replay.** Find a past fire by name, date and place (WFIGS history and GeoMAC history), fetch its mapped perimeters over time, hotspot detections for the dates, and smoke polygons and AQI for the nearby area; the scenario animates between mapped perimeters and labels the animation as interpolation (spec 0448 FR-9). Evacuation zones for replays are fictional zones drawn on the real terrain, since real zone geometry and order times are not in these services; exercising organizations stay fictional (project naming rule).
- **FR-10 Simulated wildfire events.** For a fictional fire, parameters (ignition point, fuel type map or a simple fuel class by area, wind speed and direction schedule with shifts, slope from a supplied elevation or none, suppression effect) produce consistent case data: an ellipse-based perimeter series with a published fire-spread relation, spread rates, arrival times at each evacuation zone, hotspots, a smoke plume downwind and an AQI series at fixed places from a simple dispersion rule. Everything is labeled simulated, and no output is presented as a fire behavior prediction.
- **FR-11 Power shutoff scenario kit.** A circuit and customer generator for a utility: circuits with customer counts by class, medical baseline and critical facility customers (hospitals, water pumps, cell sites, care homes), a de-energization schedule, a restoration sequence with patrols, and the notification schedule from the four windows in FR-6; fictional data only, never real customer or utility records.

**Exercise play and evaluation**

- **FR-12 Decisions.** Structured decisions (spec 0448 FR-14): issue an evacuation order or warning for zones (picked from the zone list or drawn); shelter in place; open a shelter; close a road or order contraflow; request resources or mutual aid; de-energize or re-energize circuits; send a shutoff notification (audience, channel, time); activate a community resource center; close a school or move a facility; issue a smoke advisory. Each records time, area and stated basis.
- **FR-13 Metrics.** Threshold timing (spec 0448 FR-12) configured for: evacuation order time against projected fire arrival minus clearance time per zone; shutoff notifications against their windows; de-energization decision against the wind event window. Counters for medical baseline customers reached (attempts and contacts entered by the facilitator), critical facilities notified, and zones where messages disagreed (message consistency, spec 0448). The AAR states whether ground truth is historical, interpolated or simulated.
- **FR-14 Core capabilities.** EEGs for Public Information and Warning, Operational Communications, Operational Coordination, Critical Transportation, Mass Care Services, Infrastructure Systems, Situational Assessment and Fire Management and Suppression, with critical tasks for WUI evacuation and for shutoff events.

**Knowledge and reuse**

- **FR-15 Document library.** A public-domain library pack: NIFC and NWCG public glossaries and guides, the EPA smoke guide for public health officials, USGS debris-flow hazard assessment explanations, FEMA fire management material, NWS fire weather product descriptions, and the after-action reports that are public records and allow redistribution (for example the Marshall Fire joint operational report and the Lahaina incident analysis), verifying each license and URL when building the pack. State utility commission decisions are linked, not copied, unless their terms allow it. The California notification timeline is cited from the decision itself and shown as an example of a state rule, not as a national requirement.
- **FR-16 Examples.** (1) A WUI fire for a fictional county with evacuation zones on a real foothills area, replaying a real fire's growth. (2) A utility shutoff event for a fictional utility with circuits, medical baseline customers and notification windows, with the county as a partner. (3) A hospital and school district using smoke and fire status with no fire agency in the project.
- **FR-17 Reuse by other domains.** Suggested toolkits added to healthcare, K–12, campus, energy utility, water utility, water and dam, telecom, transit, freight rail, airport, stadium and venue, food and agriculture, municipal, emergency communications and public health; weather and wildfire both suggested for the utility and municipal profiles.

### Non-functional requirements

- **NFR-1 Cost:** only free public services; the FIRMS and AirNow keys are free and optional, stored in the OS keychain, and never in files or logs.
- **NFR-2 Privacy:** services are contacted only when the user fetches an event; requests carry a fire name, bounding box or ZIP code, never plan content; the fixed host list is shown in the dialog. Customer and circuit data in examples are fictional; a user may enter real utility data only in their own project, which is never sent anywhere.
- **NFR-3 Accessibility:** every figure has a text summary and a data table; evacuation zone colors always carry the words order, warning, shelter in place and none; AQI colors carry the category names; maps list zones and their status in a table.
- **NFR-4 Accuracy:** AQI breakpoints, notification windows and tags verified against the primary documents in the library; real replay data labeled historical and dated; practitioner review (a fire agency planner and a utility wildfire mitigation lead) before release (owner to arrange).
- **NFR-5 Stated limits:** simulated spread is an illustration with a simple relation, not a prediction; the app says so on the figure and in the controller handbook.
- **NFR-6 Sensitivity:** real fire replays name real places; no real victim, address or private property is shown in examples (project naming rule).

### Out of scope

- Fire behavior modeling beyond a simple spread relation (no FARSITE or WFDSS replacement).
- Live data during a session.
- Evacuation traffic simulation; clearance times are entered by the user or taken from a plan.
- Real customer or circuit data from utilities.
- Fireline tactics and suppression operations training.

## Design

- **Domain:** `packs/domains/wildfire.json` with variants as role sets.
- **Toolkit:** `packs/toolkits/wildfire/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, decision forms, a shutoff notification schedule).
- **Figures:** `src/main/render/figures/fire/` (fire map overlay, evacuation board, circuit board, AQI series, smoke map), using the map overlay code of spec 0448 and the time series kind.
- **Connectors:** `src/main/toolkits/connectors/{wfigs,firms,hms_smoke,airnow}.ts`; FIRMS reuses `src/main/secrets/` and the source from spec 0439; each connector has `estimate()`, `fetch()` and recorded-response tests.
- **Simulation:** `src/main/toolkits/wildfire/simulate.ts` (ellipse spread series, zone arrival times, smoke and AQI rule) and `src/main/toolkits/wildfire/shutoff.ts` (circuit and customer generator, notification schedule).
- **Metrics:** configuration of existing metrics in `packs/toolkits/wildfire/`; a time-window check helper for notifications.

## Security and privacy

As spec 0448: fixed hosts per connector (`services3.arcgis.com` for the NIFC organization, `firms.modaps.eosdis.nasa.gov`, `satepsanone.nesdis.noaa.gov`, `www.airnowapi.org`), size limits, files only in the scenario folder, consent before fetching. API keys are held through `setSecret` and `getSecret`, never logged (`redactSecrets`), and the fetch dialog states what each key is sent to. Responses are validated against schemas; unexpected shapes are rejected.

## Testing

Golden images for each figure from fixtures; connector contract tests with recorded responses and opt-in live tests (a perimeter record with missing fields, an AirNow response for a ZIP code with no reporting area); simulation tests (spread follows the wind direction, arrival times increase with distance, zone ordering); lint tests for AQI breakpoints and evacuation status words; metric tests for the four notification windows on a worked event; example projects generated end to end with the local model before release.

## Tasks

1. **#772** Wildfire domain profile, roles and variants, threat families and arcs (FR-1, FR-2).
2. **#776** Incident, evacuation and fire weather product templates and format knowledge (FR-3, FR-6).
3. **#780** Power shutoff products and scenario kit (FR-4, FR-11).
4. **#784** Wildfire figures (FR-7).
5. **#787** Public data connectors, event finder and replay (FR-8, FR-9).
6. **#792** Simulated wildfire events (FR-10).
7. **#798** Smoke and air quality products for hospitals and schools (FR-5).
8. **#800** Wildfire decisions, timing metrics and EEGs (FR-12–FR-14).
9. **#803** Document library pack (FR-15).
10. **#807** Examples, reuse in other domains, user guides (FR-16, FR-17).

## Open questions

- **Practitioner review.** A fire agency planner (a fire district or state agency) and a utility wildfire mitigation lead should review the templates, notification windows and examples before release. Recommendation: ask through a state fire marshal's office or a county fire safe council, and a utility's wildfire safety group.
- **Other states' shutoff rules.** The notification timeline is California's. Oregon requires a public safety partner coordination strategy that covers tabletop exercises; other states differ. Recommendation: ship California's windows as an example rule that the user can edit per project, and research the other states when a user asks.
- **Perimeter history completeness.** The history services exist but their completeness for a given fire and the field contents should be checked when building the connector.
- **Evacuation zone data.** Real zone geometry is held by counties and alerting platforms. Recommendation: fictional zones only; accept a user-supplied GeoJSON file.
