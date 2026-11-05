# Spec 0454: Flooding and hydrology — flood response and the flooding toolkit

Issue: #687 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/flooding.md](../research/domains/flooding.md)

## Summary

Floods are the most common reason a county, a utility or a farm needs a river or flash flood scenario, so flooding ships mainly as a **toolkit**: river gauges and forecast hydrographs, NWS flood categories, flash flood warnings with damage tags, inundation maps over roads, parcels and critical facilities, closure and sandbag logistics boards, and decisions scored by the clocks that matter (action before the forecast stage, closure before the road goes under, evacuation before the water arrives). A small `flooding` domain describes the organizations whose job is flood response and floodplain management (a county flood program, a levee or drainage district, a flood warning program). The toolkit is used by water and wastewater utilities, energy utilities, agriculture, transit and rail, airports, ports, healthcare and schools, and uses the weather toolkit (rainfall, warnings, the hydrograph figure kind) and the earth sciences toolkit (post-fire debris flows) by reference rather than duplicating them. Real past events are replayed from public USGS and NWS data; fictional events come from simple parametric generators.

## Requirements

### User stories

- As a county emergency manager on a large river, I want a forecast crest that is revised twice during the exercise, so my team practices deciding on a changing forecast and not a single number.
- As a public works director, I want a closure board tied to the stage at which each low-water crossing goes under, so closures are judged against the water and not against the clock alone.
- As a wastewater plant manager, I want a river flood scenario with gauge readings and an inundation map over my plant, without building a hydrology exercise.
- As a farm cooperative planner, I want to know when the forecast reaches the stage that floods our grain storage and whether we moved the stock before then.
- As a camp or school administrator near a creek, I want a night-time flash flood warning with a CONSIDERABLE tag and a plan that must reach people who are asleep.
- As a floodplain manager, I want to replay a real past flood at one gauge with its observed stages and crest, and compare what the community did against the categories.
- As an instructor, I want students to read a hydrograph and a flood category table and write the message residents need.

### Functional requirements

**Domain**

- **FR-1 Flooding domain.** A `flooding` domain profile with variants for a county flood program (emergency management with floodplain administration and public works), a levee or drainage district, and a regional flood warning program, with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3); aliases as listed.
- **FR-2 Threat families and arcs.** Hazard families (river flood, flash flood, levee or dam breach, urban and stormwater flooding, ice jam, flood after wildfire) and a **service degradation** family (gauge or telemetry loss, forecast or dissemination outage, pump station power loss, missing or false warnings), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15). Coastal flooding with storm surge stays with the weather and port toolkits.

**Flooding toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for: hydrologic outlook, flood watch, flood warning and flash flood warning (the existing `nws_weather_warning` gains flash flood damage threat tags and flash flood emergency language), flood advisory, flood statement, flood forecast discussion, gauge summary page, road closure notice and low-water crossing status, sandbag and pump request, levee patrol report, evacuation order and shelter opening notice (reusing `cap_alert`, `eas_broadcast`, `emergency_declaration`, `ics_213_general_message`), substantial-damage letter and damage assessment summary. Products follow the Ready, Set, Go tiers of NWS Instruction 10-922.
- **FR-4 Format rules and knowledge.** Lint and generator knowledge for: the NWS flood category definitions and the rule that minor, moderate and major categories may not exist at a point (NWS Manual 10-950); action stage versus flood stage versus bankfull; flash flood tags (base, CONSIDERABLE, CATASTROPHIC; WEA only for the last two; CATASTROPHIC only with emergency language); the order of products (outlook before watch before warning); stage in feet and flow in cfs or kcfs with the gauge's datum; forecast times in local time with the gauge's time zone. The generator is told that flood stage is not the same as bankfull and that categories come from local impacts.

**Flooding toolkit: figures**

- **FR-5 Hydrograph and gauge figures.** Figure kinds (spec 0448 FR-4, shared with the weather toolkit's hydrograph in spec 0449 FR-5): river hydrograph (observed and forecast stage or flow, flood category bands, the action stage line, crest marker and time, historic crest lines, issuance time); gauge summary (current value, category, trend, flood stage table); multi-gauge profile (stage along a river, upstream to downstream, with category colors); rainfall and stage together. Each yields the text summary and data table of spec 0448 FR-5, and color bands also carry the category names.
- **FR-6 Inundation maps.** A map overlay (spec 0448 FR-11) showing a flood extent for a stage, with a time slider over case data: polygons for the extent at each time, depth classes where the data has them, and exposure counts per time (structures, road segments, critical facilities, population where the scenario provides it). The extent comes from a replayed layer (FR-10), from a simplified generator (FR-11), or from user-supplied GeoJSON.
- **FR-7 Exposure and logistics boards.** Status board and table figure kinds configured for flood operations: road and crossing closure board (road, stage that floods it, status, time), critical facility status, shelter occupancy, sandbag and pump tracker (needs, in transit, delivered), levee patrol log. Each board reads from case data and decisions so that closures and deliveries made in the exercise appear on it.

**Flooding toolkit: data**

- **FR-8 Gauge and forecast connectors.** Connectors, with consent and a size estimate (spec 0448 FR-8), for the NWS National Water Prediction Service gauge API (gauge metadata with flood category stages and historic crests, observed and forecast stage and flow, rating curve) and the USGS Water Data OGC API (instantaneous and daily values). The legacy USGS WaterServices are not used because USGS plans to decommission them in 2027. The connectors live behind a version-pinned adapter so that a service change is a one-file fix.
- **FR-9 Event finder and replay.** Find a past event by gauge or river, and a date range; fetch the observed series for the gauge and its neighbors from USGS, the category table and the highest observed crest, and past warnings and local flood reports for the area from the Iowa Environmental Mesonet archive shared with the weather toolkit (spec 0449 FR-7). Because the NWS forecast endpoint returns only the current forecast, a replayed event has no archived forecast hydrographs unless the user saved them; the scenario then uses either **simulated forecasts** built to match the observed rise (FR-11), clearly labeled, or no forecast. This limit is shown in the fetch dialog.
- **FR-10 Flood hazard and inundation layers.** Connectors for the FEMA National Flood Hazard Layer (flood zones at a site, fetched as vector data for the scenario area and scale) and, when available, NWS forecast inundation extents for the scenario area. Layers are cropped to the scenario area, stored with provenance, and labeled as regulatory flood zones or as modeled forecast extents, never mixed. Fetching preliminary or pending maps is allowed with a label that they are not effective.
- **FR-11 Simulated flood events.** For a fictional event, parameters (river and reach, flood stage table with category thresholds, rise rate, crest stage and time, rain amount and duration for flash floods, crest revision schedule) produce consistent case data: a stage series at one or more gauges with travel time between them, forecast hydrographs for each issuance (including one that changes category), a simple stage-to-extent relation over a user-supplied or drawn floodplain, and the flash flood polygon for a small basin. Everything is labeled simulated and uses simple published relations (kinematic travel time, a given rating curve), not a hydraulic model.

**Exercise play and evaluation**

- **FR-12 Decisions.** Structured decisions (spec 0448 FR-14): activate the EOC; issue an evacuation order or advisory for an area drawn or picked; close a road, crossing or facility; open a shelter; order sandbags, pumps or a levee patrol; request state or federal help; issue a public message. Each records the time, the area and the stated basis (gauge, forecast, warning).
- **FR-13 Timing metrics.** Threshold timing (spec 0448 FR-12) configured for: closure before the stage at which the road floods, evacuation start before the stage that reaches an area (minus the clearance time the community enters), sandbag delivery before the action stage, and facility moves before the stage that floods them; decision timing for warnings against observed reports for flash floods (shared with spec 0449 FR-12); message consistency between the warning tag, the public message and partner messages (spec 0448 FR-12).
- **FR-14 Core capabilities.** EEGs for Public Information and Warning, Situational Assessment, Operational Coordination, Critical Transportation, Mass Care Services, Infrastructure Systems and Logistics and Supply Chain Management, with critical tasks specific to flood events.

**Knowledge and reuse**

- **FR-15 Document library.** A public-domain library pack: NWS Manual 10-950 (definitions) and Instruction 10-922 (water resources products), NWS flood safety and river forecast terminology material, FEMA flood tabletop exercise materials and dam and levee guidance, USGS gauge and flood fact sheets, and example county flood after-action reports that are public records; each license and URL verified when building the pack (verify that state and county reports permit redistribution; otherwise link).
- **FR-16 Examples.** (1) River flood with a revised crest for a fictional county on a real river, replaying real gauge data. (2) A night flash flood for a fictional youth camp and county. (3) A wastewater plant and a farm cooperative using the toolkit, with no flood-response domain.
- **FR-17 Reuse by other domains.** Suggested toolkits added to water utility, water and dam, energy utility, gas pipeline, food and agriculture, transit, freight rail, airport, port and maritime, healthcare, K–12, campus, stadium and venue, telecom, municipal and emergency communications; weather and flooding both suggested for the agriculture and municipal profiles.

### Non-functional requirements

- **NFR-1 Cost:** only free public services; no keys or accounts.
- **NFR-2 Privacy:** services are contacted only when the user fetches an event; the request carries a gauge id or a rounded bounding box, never plan content; the fixed host list is shown in the dialog.
- **NFR-3 Accessibility:** every figure has a text summary and a data table; category colors always carry the words minor, moderate, major, and patterns on maps; inundation maps list exposed assets in a table.
- **NFR-4 Accuracy:** categories and tags verified against the NWS documents in the library; real replay data shown as historical and dated; a review by a floodplain manager and an NWS service hydrologist before release (owner to arrange).
- **NFR-5 Stated limits:** simulated extents are labeled as illustrations, not hazard maps; no flood zone or modeled extent is presented as an insurance or regulatory determination.

### Out of scope

- Running hydrologic or hydraulic models (HEC-RAS, the National Water Model); a simulated extent is a simple relation.
- Live data during a session.
- Storm surge and coastal flooding (weather and port toolkits).
- Dam failure modeling; the dam owner's emergency action plan stays in `water_dam`.

## Design

- **Domain:** `packs/domains/flooding.json` with variants as role sets.
- **Toolkit:** `packs/toolkits/flooding/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, decision forms).
- **Figures:** `src/main/render/figures/flood/` (hydrograph shared with weather, gauge summary, river profile, closure and logistics boards, inundation overlay), using the map overlay code of spec 0448.
- **Connectors:** `src/main/toolkits/connectors/{nwps,usgs_waterdata,fema_nfhl,nws_fim}.ts` (the Iowa Environmental Mesonet connector is shared with weather), each with `estimate()`, `fetch()`, and recorded-response tests. The existing hazard-data USGS source (spec 0439) is not changed.
- **Simulation:** `src/main/toolkits/flooding/simulate.ts`: stage series from a rise-and-fall shape, travel time between gauges, forecast issuance generator with a crest revision, stage-to-extent from a floodplain polygon set, flash flood basin polygon.
- **Metrics:** configuration of existing metrics in `packs/toolkits/flooding/`; no new metric code beyond a stage-threshold crossing helper.

## Security and privacy

As spec 0448: fixed hosts per connector (`api.water.noaa.gov`, `api.waterdata.usgs.gov`, `hazards.fema.gov`, `maps.water.noaa.gov`), size limits, files only in the scenario folder, consent before fetching, no keys. Responses are validated against a schema before use; unexpected shapes are rejected with a clear error because these services change.

## Testing

Golden images for each figure from fixtures; connector contract tests with recorded responses (a gauge record with and without defined categories, a forecast with a revision) and opt-in live tests; simulation tests (the crest equals the parameter, categories are assigned from the table, travel time orders gauges correctly); lint tests for flood categories and flash flood tags; threshold timing tests on a worked closure example; example projects generated end to end with the local model before release.

## Tasks

1. **#723** Flooding domain profile, roles and variants, threat families and arcs (FR-1, FR-2).
2. **#726** Flood product templates and format knowledge (FR-3, FR-4).
3. **#729** Hydrograph and gauge figures (FR-5).
4. **#732** Inundation maps, exposure and flood logistics boards (FR-6, FR-7).
5. **#735** Gauge and forecast connectors, event finder and replay (FR-8, FR-9).
6. **#738** Flood hazard layer and inundation connectors (FR-10).
7. **#741** Simulated flood events (FR-11).
8. **#753** Flood decisions, timing metrics and EEGs (FR-12–FR-14).
9. **#744** Document library pack (FR-15).
10. **#746** Examples, reuse in other domains, user guides (FR-16, FR-17).

## Open questions

- **Practitioner review.** A floodplain manager (a Certified Floodplain Manager) and an NWS service hydrologist should review the templates, categories and examples before release. Recommendation: ask through a state floodplain managers association or a county flood program.
- **Forecast archive.** NWS archived forecast hydrographs may exist outside the public API; if a free archive is found, FR-9 can replay real forecasts. Until then replay uses observed data plus labeled simulated forecasts.
- **Inundation maps.** The status of NWS forecast inundation mapping in 2026 was not confirmed; FR-10 treats it as optional and the toolkit works without it.
- **Rainfall inputs.** Gridded rainfall estimates for replay are left to the weather toolkit's connectors; confirm which are available when 0449 is built.
