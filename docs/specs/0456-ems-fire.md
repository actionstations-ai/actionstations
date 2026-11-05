# Spec 0456: EMS, fire and hazardous materials — mass casualty, hazmat and dispatch toolkits

Issue: #689 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/ems_fire.md](../research/domains/ems_fire.md)

## Summary

Action Stations can exercise the agencies that respond on the street: EMS, fire, hazardous materials and technical rescue teams, and the dispatchers who send them. Three toolkits give them what they work with. **MCI and triage** brings triage tags and counts, patient tracking, treatment and transport groups, and a hospital capacity board. **Hazmat** brings placards, shipping papers, the structure of the Emergency Response Guidebook, isolation and protective action zones against the wind, and air monitoring and decontamination products. **Dispatch** brings CAD incident views, unit status and radio traffic from the responders' side. Teams work a bus crash, an explosion, a chemical release or a structure fire, make triage, destination, protective action and command decisions under time pressure, and are scored the way the field scores itself (time to triage complete, patients to appropriate hospitals, protective actions against the isolation distances, command and accountability). The toolkits are available to every other domain: a chemical plant, a stadium, a railroad or a hospital can add a realistic street response.

## Requirements

### User stories

- As an EMS training officer, I want a bus crash with 28 patients where my crews triage with START or SALT, and the hospital board fills while we decide destinations.
- As a hazmat team leader, I want a tank car release where wind shifts during the exercise and we have to move the protective action zone.
- As a fire chief, I want a structure fire where a mayday and a command transfer happen in the same hour, and an accountability report that shows what we missed.
- As a healthcare coalition coordinator, I want the street side of a mass casualty incident to feed my hospitals' exercises, with patient counts and arrival times that match.
- As a paramedic program instructor, I want a two-hour lab where students run triage and transport without needing real equipment.
- As a chemical plant emergency coordinator preparing the RMP tabletop, I want the county fire department's hazmat team as players, not just names on the plan.

### Functional requirements

**Domain**

- **FR-1 EMS and fire domain.** An `ems_fire` domain profile with the roles, systems, outside parties and phrasing in the research dossier (sections 2–3), with variants for an EMS agency, a fire department, a hazmat team, a dispatch center (as dispatching these units, distinct from `emergency_communications`) and a regional healthcare coalition liaison; aliases as listed.
- **FR-2 Threat families and arcs.** Families for mass casualty incident, hazmat release, structure fire and command transfer, technical rescue, and the shared service degradation family (CAD or radio failure, hospital diversion cascade, simultaneous incidents), each with the arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**MCI and triage toolkit**

- **FR-3 Products and knowledge.** Templates for: triage tag (color, ID, vitals, injuries), MCI patient list, Medical Branch worksheet, treatment area assignments, patient transportation log, medical communications hospital call record, family reunification and hospital information notices (existing templates reused), and the ICS 201, 202, 205, 207, 213, 214 and 215A set (with existing prefills reused). Generator knowledge: START, SALT and a free-text local method; the ICS medical group structure (triage, treatment, transportation, medical communications) with the point that titles vary by jurisdiction; sequencing rules (Immediate patients transport first, expectant patients are not abandoned, children need a pediatric method); and the rule that the scenario states which triage method the players use, since no federal rule picks one.
- **FR-4 Figures.** Figure kinds (spec 0448 FR-4) for: triage counts by priority over time (stacked bar or time series), a patient tracking board (patient ID, priority, location, transport time, destination), and a hospital capacity and status board (beds by level, trauma, burn, pediatric, diversion, patients received), all with text summaries and data tables (spec 0448 FR-5). None are AI images (project rule 5). Photographs of a crash scene stay AI or template as today.

**Hazmat toolkit**

- **FR-5 Products and knowledge.** Templates for: placard and label images for a shipping paper (diamond color, class number, UN number), the shipping paper itself (shared with the chemical dossier's `hazmat_shipping_paper`), a hazmat entry team briefing, an air monitoring log, a decontamination corridor layout, a CHEMTREC-style call record (fictional), a shelter-in-place or evacuation order, and a multi-agency protective action recommendation. Generator knowledge: the OSHA emergency response levels (awareness, operations, technician, specialist, incident commander) so players act at their level; hot, warm and cold zones; the difference between the initial isolation zone (a circle) and the protective action zone (a downwind square); the immediate precautionary measure distances in the guide pages.
- **FR-6 Protective action zone map and ERG handling.** A figure kind that draws the initial isolation circle and the downwind protective action square on the map over the incident point, with wind direction and speed from case data (weather toolkit or entered), and a table of the numbers used. **Source of the distances:** until PHMSA confirms terms for bundling ERG content (open question), the pack does not ship ERG guide text or the distance tables. The toolkit takes the numbers in one of three ways, chosen per scenario: (a) the facilitator or designer enters the isolation and protective action distances and the guide number from their own copy of the guidebook; (b) the scenario uses a **fictional material** with invented, clearly labeled exercise distances; (c) once licensing is confirmed, a small data file of the entries the examples use. A lint rule flags a real UN number paired with distances the author typed but that do not match a loaded table, and the controller handbook states which edition the numbers came from. Players are told to use their own guidebook for decisions, because the exercise is not a source of real hazmat guidance.
- **FR-7 Toxic plume figure.** The plume footprint kind from the spill and plume toolkit (spec 0455 FR-5) is reused for threat zones (red, orange, yellow) from a simple dispersion estimate or from an imported ALOHA export (an ALOHA threat zone as GeoJSON or KML), labeled with its source.

**Dispatch toolkit**

- **FR-8 CAD views and radio traffic.** Templates for a CAD incident detail (call type, address, units, timestamps for dispatched, en route, on scene, patient contact, transporting, at hospital), a unit status board, a pending-calls queue showing a surge, a radio traffic transcript (dispatch, command and tactical channels, mayday and emergency traffic), station alerting and tone-out text, and mutual aid request messages. The existing `911_cad_entry`, `radio_call`, `status_board` and `avl_fleet_map` are reused. These are the responders' view; the 911 center's view and CAD failure stay in `emergency_communications`.

**Data and simulation**

- **FR-9 Simulated incidents and replay.** (a) A casualty generator: given an incident type, patient count and mix (for example 28 patients on a bus: 4 Immediate, 9 Delayed, 12 Minor, 3 Expectant), it produces consistent patient records (age, injuries, vitals) that match the chosen triage method's outcome and a timeline of when each patient is reached, triaged, treated and transported, with hospital capacities that make some destination choices better than others. (b) A release generator: a material (real, from user-entered data, or fictional), amount, container and wind produce an isolation zone, a protective action zone and a plume footprint by simple relations. (c) A call load generator for dispatch (calls per minute, incident mix). Typical call mixes and response times may be shaped by aggregate public statistics (NEMSIS dashboards); there is no replay of real patients or logs. Everything is labeled simulated (spec 0448 FR-10). Real past events are used as narratives and published after-action reports, not as data feeds.

**Exercise play and evaluation**

- **FR-10 Structured decisions.** Decision forms (spec 0448 FR-14) for: declare an MCI, set the triage method, assign a patient to a destination (patient, hospital, mode, time), open or close a hospital to arrivals, call for mutual aid or state resources, set isolation and protective actions (zone and action: shelter in place or evacuate, area drawn on the map), set PPE level and entry, transfer command (from, to, time, briefing), declare a mayday, and issue a public statement. Available to players in live play and to the facilitator in Facilitate.
- **FR-11 Metrics.** On spec 0448 FR-12: **time to triage complete** (first unit on scene to last patient categorized; decision timing against the simulated ground truth of when patients were reachable); **destination appropriateness** (share of patients sent to a hospital capable of their injuries, hospitals not sent more than capacity, scored against the generator's ground truth); **protective action timing** (threshold timing: isolation and downwind actions in place before the plume reaches a place); **protective action distance check** (distance chosen against the table or entered distance for the material, spill size and time of day); **command and accountability** (command established, transfers briefed, PAR intervals kept, mayday time to action); and **message consistency** between command, the PIO and hospitals on casualty counts. Each metric shows its inputs.
- **FR-12 Core capabilities.** EEGs (spec 0421) for Operational Coordination, Public Health, Healthcare and Emergency Medical Services, Environmental Response/Health and Safety, Fire Management and Suppression, Mass Search and Rescue Operations, Operational Communications, Logistics and Supply Chain Management, and Public Information and Warning, with critical tasks specific to MCI, hazmat and fire.

**Knowledge and reuse**

- **FR-13 Document library.** A library pack of US federal material that is verified public domain at build time: the USFA EMS mass incident templates (June 2012) if its status is confirmed, FEMA NIMS and the ICS forms booklet (shared with the `generic` library), EPA RMP exercise guidance and the 40 CFR 68.96 fact sheet (shared with `chemical`), OSHA HAZWOPER material, and published after-action reports whose terms permit (Boston 2013 is a candidate; terms to check). The ERG is linked, not bundled, until FR-6 licensing is resolved. NFPA, NENA and APCO standards are named, not copied.
- **FR-14 Examples.** (1) A fictional county EMS agency and hospital coalition: a bus crash with 28 patients, START and SALT variants, a hospital capacity board. (2) A fictional fire department hazmat team and a fictional chemical plant: a tank release with a wind shift, protective action decisions, the county tabletop required for the plant's RMP program. (3) A structure fire with a mayday and a command transfer, ending with an accountability review.
- **FR-15 Reuse by other domains.** Suggested toolkits added to `chemical`, `industrial`, `gas_pipeline`, `energy_utility`, `transit`, `freight_rail`, `stadium_venue`, `campus`, `airport`, `healthcare`, `k12_schools`, `municipal`, `emergency_communications` and `port_maritime`; the structures toolkit (spec 0471) adds this toolkit's technical rescue products by reference.

### Non-functional requirements

- **NFR-1 Cost:** only free public data (aggregate NEMSIS, CAMEO suite exports); nothing paid.
- **NFR-2 Privacy:** no real patient data is ever used; simulated patients are synthetic; any imported file is data only; nothing about the user's plans is sent anywhere.
- **NFR-3 Accessibility:** triage colors always carry the words (Immediate, Delayed, Minor, Expectant) and a pattern; placards have text; boards have data tables; screen-reader packets summarize counts.
- **NFR-4 Accuracy:** triage algorithms and ICS roles follow the cited sources; the hazmat figures never present invented numbers as real guidance (FR-6); a review by a fire chief or EMS director and a hazmat technician before release (owner to arrange); products carry an "exercise" mark.
- **NFR-5 Safety:** exercise material states that it is not clinical or hazmat guidance for a real incident.

### Out of scope

- Real-time dispersion or fire modeling; plume figures use simple relations or imported exports.
- A full patient simulator (physiology over time); detailed clinical content belongs to the clinical care toolkit (#685).
- A real CAD, ePCR or radio system; products are views and transcripts.
- Bundling the Emergency Response Guidebook before licensing is confirmed.
- Live data during a session.

## Design

- **Domain:** `packs/domains/ems_fire.json` with variants as role sets.
- **Toolkits:** `packs/toolkits/{mci_triage,hazmat,dispatch}/` (toolkit JSON, templates, knowledge fragments, lint rules). The triage method definitions (START, SALT) are data (decision trees) used by the generator knowledge and the casualty generator.
- **Figures:** `src/main/render/figures/ems/` (triage counts, patient board, hospital board) and `src/main/render/figures/hazmat/` (protective action zones); the plume figure is imported from `src/main/render/figures/spill/`.
- **Simulation:** `src/main/toolkits/ems/simulate.ts` (casualty and timeline generator, hospital capacities, call load) and the shared release/plume code with spec 0455.
- **ERG data:** an optional `packs/data/erg/` file schema (material id, guide number, distances by size and time, edition) that the facilitator can fill in per scenario; no content ships until licensing is confirmed.
- **Metrics:** `src/main/evaluation/metrics/{destination_fit,protective_action_distance,accountability}.ts` plus the generic metrics.

## Security and privacy

As spec 0448 (fixed hosts for any connector, size limits, files inside the scenario folder). Imported plume files and ERG data files are parsed as data only, with schema validation. No patient-identifying data is stored; the casualty generator uses synthetic names from the project naming rule (fictional people).

## Testing

Golden images for each figure; casualty generator tests (counts match the requested mix, START and SALT algorithms applied to the generated vitals give the intended categories, timeline is monotonic); release generator tests (the downwind square is aligned to the wind, zone sizes grow with the entered distance); lint tests for the real-UN-number-with-untabled-distances rule; metric tests with worked examples (triage completed in 17 minutes; 3 of 5 Immediate patients to the trauma center; protective action 6 minutes before arrival); dispatch template tests; example projects generated end to end with the local model before release.

## Tasks

1. **#790** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#850** MCI and triage toolkit: templates and knowledge (FR-3).
3. **#796** Triage counts, patient tracking and hospital capacity figures (FR-4).
4. **#799** Hazmat toolkit: templates and knowledge (FR-5).
5. **#802** Isolation and protective action zone map, and ERG handling (FR-6, FR-7).
6. **#806** Dispatch toolkit: CAD views and radio traffic (FR-8).
7. **#809** Simulated casualties and releases, and replay data (FR-9).
8. **#812** Structured decisions: triage, transport, protective actions, command transfer (FR-10).
9. **#816** Metrics and core capabilities (FR-11, FR-12).
10. **#820** Document library, examples and reuse in other domains (FR-13–FR-15).

## Open questions

- **ERG licensing.** PHMSA offers the guidebook free, but a public-domain statement was not found. Recommendation: the owner writes to PHMSA's ERG address for terms before any content ships; until then the toolkit accepts user-entered numbers or fictional materials (FR-6).
- **Triage method.** Recommendation: ship START and SALT as selectable methods, and let the scenario name the local method; confirm the SALT primary publication (Lerner 2008) when building the knowledge fragment, since this session reached it only through secondary sources.
- **Practitioner review.** A fire chief or EMS director and a hazmat technician review the toolkits and examples before release.
- **USFA templates.** Confirm the license of the 2012 USFA/NEMSMA document before bundling.
- **Overlap with clinical care (#685).** Patient detail beyond a triage record belongs there; recommendation: this spec defines the triage record and the clinical care toolkit extends it.
