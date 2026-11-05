# Spec 0455: Environmental response — oil spill and release management, and the spill and plume toolkit

Issue: #688 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/environmental_response.md](../research/domains/environmental_response.md)

## Summary

Action Stations can exercise the people who manage a release of oil or a hazardous substance: the responsible party's incident management team (IMT, formerly the spill management team), vessel, facility, pipeline and offshore plan holders, oil spill removal organizations, Coast Guard and EPA on-scene coordinators with their Area Committees, state agencies, and the water utilities and wildlife agencies downstream. They work a worst case discharge or a smaller release through unified command with the products they use (ICS 201, 232, 233 and 234, trajectory forecasts, ESI maps and resources-at-risk lists, boom plans, countermeasure requests, plume footprints), make sensitive-area and countermeasure decisions against the clock of the trajectory, and are scored the way the field scores itself (notifications on time, booms in place before the oil lands, sensitive areas protected). The spec also produces what a plan holder needs to keep: a PREP exercise record. Everything ships as the **spill and plume toolkit** so ports, pipelines, chemical plants, water utilities and railroads can put a real spill into their own exercises.

## Requirements

### User stories

- As a facility's environmental manager, I want an annual IMT tabletop with a worst case discharge every third year, and a PREP exercise record at the end that shows which core components I exercised.
- As an Area Committee exercise design team member, I want a four-year area exercise where industry, the Coast Guard, the state and local government see the same trajectory and argue over the same sensitive areas.
- As a pipeline operator's emergency response lead, I want a release into a river where the oil's travel time to a downstream water intake drives my decisions.
- As an Environmental Unit leader in training, I want to build the ICS 232 resources-at-risk list from an ESI map and a trajectory, then defend my protection priorities.
- As a water utility operator, I want to see the oil's predicted arrival at my intake and decide when to close it.
- As a port manager, I want a vessel casualty exercise that uses the trajectory and booming products without my building a spill exercise from scratch.

### Functional requirements

**Domain**

- **FR-1 Environmental response domain.** An `environmental_response` domain profile with the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3), with variants for a responsible party IMT (vessel, facility, pipeline or offshore), a unified command with the Area Committee, an OSRO, and a downstream stakeholder (water utility or wildlife agency); aliases as listed. It accepts both "incident management team" and "spill management team". The `port_maritime`, `chemical` and `gas_pipeline` domains are not changed except for suggested toolkits (FR-14).
- **FR-2 Threat families and arcs.** Hazard families (vessel casualty with release, facility or tank release, pipeline release to water, offshore release, chemical release with toxic plume, marine firefighting and salvage, drinking water intake threatened, wildlife and sensitive shoreline impact) with the phase arc in the dossier (section 8: discovery and notification through demobilization), and the shared service degradation family, using extensible families (spec 0448 FR-15).

**Spill and plume toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for: ICS 232 resources at risk summary, ICS 233 open action tracker, ICS 234 work analysis matrix, ICS 202 objectives and 204 assignments (alongside the existing ICS 201, 203, 213 and 214 prefills), a unified command meeting agenda, aerial observation and shoreline survey reports, countermeasure request and approval (dispersant, chemical agent, in-situ burn), wildlife status, fishing closure and water intake closure orders, a Joint Information Center release and claims line notice, and the NRC report record (shared with the port and chemical dossiers). Existing templates are reused where they fit (`press_release`, `memo`, `field_report`, `boil_water_notice`).
- **FR-4 Format rules and knowledge.** Lint and generator knowledge for: the order of notification (responsible party to the National Response Center, qualified individual, OSRO, federal and state) and the fact that the NRC call is a report, not a request; unit conventions (barrels, gallons and metric volumes, never mixed within a document); the unified command structure (FOSC, state, responsible party); the meaning of worst case discharge by regulator (a vessel's entire cargo in adverse weather, a facility's plan volume, a pipeline segment), since the term was widely misunderstood during Deepwater Horizon; the countermeasure approval path through the FOSC and Regional Response Team; fictional plan holders, never a real operator.

**Spill and plume toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: trajectory map (best estimate and uncertainty by time, over a base map and ESI shoreline classes), ESI map excerpt with a resources-at-risk table, booming strategy map with deployment status, oil weathering and mass balance chart (evaporated, dispersed, recovered, remaining by time), toxic plume footprint (threat zones by concentration level) and a current, tide and wind panel. Each produces a text summary and a data table (spec 0448 FR-5). None are AI images (project rule 5).

**Spill and plume toolkit: data**

- **FR-6 Data and replay.** Connectors (spec 0448 FR-8) for: NOAA ESI maps and data for the scenario's area (cropped to the area); ERMA public layers where available; NOAA CO-OPS water levels and currents and NDBC buoys; USGS river gauges (shared with the flooding toolkit); and import of a trajectory computed outside the app (a PyGNOME or WebGNOME export, or a GeoJSON of trajectory positions by time) as case data, labeled with its model, run date and inputs. Each fetch is on the user's request, with consent and a size estimate.
- **FR-7 Simulated spills and plumes.** For a fictional release, parameters (location, product type, volume, release duration, wind and current series from the weather and flooding toolkits or entered by hand) produce a consistent simulated trajectory, a weathering curve and a plume footprint by simple published relations (a drift of current plus a fraction of wind, a simple spreading and evaporation model, a Gaussian puff or plume for gases), with an uncertainty envelope. The ESI shoreline, resources at risk and landfall times follow from the trajectory and the area data. Everything is labeled simulated. The app does not run oil spill models (out of scope below).

**Exercise play**

- **FR-8 Structured decisions.** Decisions (spec 0448 FR-14) for: make notifications (who, time), activate the OSRO and assign equipment, set protection priorities (sensitive areas ranked), deploy protective boom (site, length, time), request a countermeasure (dispersant, in-situ burn, chemical agent), close a water intake, close fishing or a shoreline, set a safety zone, escalate the IMT (local to regional to national), and issue a public statement. Available to players in live play and to the facilitator in Facilitate.

**Evaluation**

- **FR-9 Metrics.** Built on spec 0448 FR-12: **notification timeliness** (decision timing of each required notification against the required time in the plan or regulation entered for the scenario); **threshold timing** for protective booming and intake closure (action complete before the predicted arrival time at the site); **protection coverage** (share of ranked sensitive areas with a protective strategy before landfall); and **message consistency** across the responsible party, unified command and the Joint Information Center. Each shows its inputs.
- **FR-10 PREP exercise support.** An exercise-type setting "PREP IMT tabletop" or "PREP area exercise" that (a) pre-fills the objectives from the PREP Guidelines for the exercise type; (b) tracks which of the 15 core components in PREP Appendix A each inject and decision exercised, and shows coverage across a project's exercises in the program view (spec 0438); (c) records whether the exercise included a worst case discharge scenario and which countermeasures in the plan were exercised; (d) generates the exercise record as a document: plan holder, exercise date, type, participants, scenario, objectives, evaluation, self-certification signature block and the records-retention reminder; (e) shows the triennial (facility and vessel) and quadrennial (Area) cycle position. The text is generic guidance, not legal advice; the plan holder and regulator decide what satisfies their plan.
- **FR-11 Core capabilities.** EEGs (spec 0421) for Environmental Response/Health and Safety, Operational Coordination, Public Information and Warning, Situational Assessment, Logistics and Supply Chain Management, and Planning, with spill-specific critical tasks.

**Knowledge**

- **FR-12 Document library.** A library pack of US federal and public NOAA material: the PREP Guidelines, NOAA job aids and the FOSC's Guide, ICS forms 232, 233 and 234 (Coast Guard and EPA versions), the Coast Guard Incident Specific Preparedness Review for Deepwater Horizon, the NTSB Marshall report, and the ESI training module; each license and URL verified when building the pack (dossier section 5).
- **FR-13 Examples.** (1) A fictional pipeline operator's annual IMT tabletop for a release into a river, with a downstream water utility, producing a PREP exercise record. (2) A worst case discharge from a fictional coastal terminal with an Area Committee, ESI shoreline, wildlife and a countermeasure request. (3) A chemical release with a toxic plume and a protective action decision, sharing figures with spec 0456.
- **FR-14 Reuse by other domains.** Suggested toolkits added to `port_maritime`, `gas_pipeline`, `energy_utility`, `chemical`, `industrial`, `water_utility`, `water_dam`, `freight_rail`, `transit`, `food_agriculture`, `municipal` and `emergency_communications`.

### Non-functional requirements

- **NFR-1 Cost:** only free public data (NOAA, USGS); no accounts or keys; nothing paid.
- **NFR-2 Privacy:** archives are contacted only when the user fetches data for a scenario; nothing about the user's plans is sent; plan holder and facility details stay in the project; scenarios use fictional operators.
- **NFR-3 Accessibility:** every figure has a text summary and data table; ESI shoreline classes and threat zones carry patterns and labels, not color alone.
- **NFR-4 Size:** ESI data is cropped to the scenario area; trajectory and weathering series are small; the Mobile Bay ESI module (137 MB) is an upper reference for a full fetch.
- **NFR-5 Accuracy:** the PREP requirements in the exercise settings follow the PREP Guidelines text, the dates and revision shown; a review of the toolkit, templates, PREP record and examples by a qualified individual or IMT member from a spill response organization before release (owner to arrange); products carry an "exercise" mark and fictional operators.

### Out of scope

- Running oil spill trajectory, weathering or hydrodynamic models inside the app; simulated spills use simple relations, and real model output is imported.
- Legal compliance determinations; the PREP record documents an exercise, it does not certify a plan.
- Live data during a session.
- Natural resource damage assessment and claims processes beyond injects.

## Design

- **Domain:** `packs/domains/environmental_response.json` with variants as role sets.
- **Toolkit:** `packs/toolkits/spill_plume/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, PREP objective sets for each exercise type).
- **Figures:** `src/main/render/figures/spill/` (trajectory, ESI excerpt, booming, weathering, plume, panel), using the shared map overlay code (spec 0448 FR-11).
- **Connectors:** `src/main/toolkits/connectors/{esi,erma,coops,ndbc,trajectory_import}.ts`; the USGS gauge connector is shared with the flooding toolkit.
- **Simulation:** `src/main/toolkits/spill/simulate.ts`: drift from current plus wind fraction, spreading and evaporation, Gaussian puff, shoreline intersection against the ESI data for landfall times.
- **PREP support:** `src/main/exercises/prep.ts` holds the objective sets and the core-component list as data; coverage tracking uses the same inject and decision tags as the EEG mapping; the exercise record template renders through the existing document pipeline.

## Security and privacy

As spec 0448: fixed NOAA and USGS hosts per connector, size limits, files only in the scenario folder, consent before fetching, no keys. Trajectory import files are parsed as data only, with size and type limits. Exercise records are local files; no plan holder data leaves the machine.

## Testing

Golden images for each spill figure from fixed fixtures; connector contract tests with recorded responses and opt-in live tests; trajectory import tests on a recorded PyGNOME export; simulation tests (landfall time grows with distance, mass balance sums to the released volume, plume concentration decreases downwind); lint tests for notification order and unit consistency; metric tests with worked examples (a boom deployed 40 minutes before arrival, one 10 minutes late); PREP record tests (core-component coverage, WCD flag, cycle position); example projects generated end to end with the local model before release.

## Tasks

1. **#757** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#759** Spill and plume toolkit: product templates, format rules and knowledge (FR-3, FR-4).
3. **#762** Trajectory, ESI, booming and resources-at-risk figures (FR-5).
4. **#765** Plume footprint and oil weathering figures (FR-5).
5. **#768** Connectors: ESI, ERMA layers, currents and gauges (FR-6).
6. **#771** Trajectory import and simulated spills and plumes (FR-6, FR-7).
7. **#775** Structured decisions for spill response (FR-8).
8. **#779** Metrics and core capabilities (FR-9, FR-11).
9. **#782** PREP exercise program support and documentation (FR-10).
10. **#786** Document library, examples and reuse in other domains (FR-12–FR-14).

## Open questions

- **Practitioner review.** Recommendation: an IMT member or qualified individual from an oil spill response organization or a pipeline operator, and an Area Committee member, review the toolkit and the PREP record.
- **PREP edition.** The 2016 Guidelines (version 2016.1, revised through 29 May 2018) were verified; confirm no newer edition exists when building the pack, and that "IMT" remains the term.
- **ESI and NOAA terms.** Confirm reuse terms of ESI data and NOAA job aids before bundling any (the NODD terms ask that modified data not be presented as original).
- **Trajectory source.** WebGNOME is online; whether a user can export results in a form the app can import, and whether PyGNOME can ship as an optional helper, needs a spike.
- **Hazmat overlap.** Toxic plume figures are shared with the hazmat toolkit (spec 0456); recommendation: one plume figure kind, owned here, used there.
