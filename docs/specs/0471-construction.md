# Spec 0471: Construction, engineering and the built environment — the structures toolkit

Issue: #704 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: spec 0450 (earth sciences), spec 0456 (EMS and fire) · Research: [docs/research/domains/construction.md](../research/domains/construction.md)

## Summary

Action Stations can exercise the people who build and inspect buildings: contractors and construction safety managers, engineers of record, building officials, and the volunteer evaluators who walk damaged buildings after an earthquake or storm. A `construction` domain describes the organizations; the **structures toolkit** brings the products and figures they use: trench and crane inspection records, incident reports, stop-work orders, structural monitoring series with alarm thresholds, site logistics plans, rapid and detailed evaluation forms, and the INSPECTED, RESTRICTED USE and UNSAFE placards. Teams work a crane collapse, a trench cave-in, a partial collapse in an occupied building, or a post-earthquake inspection program, make stop-work, evacuation, rescue-support and placard decisions, and are scored on occupant safety decisions, rescue timelines and inspection throughput. Because it is a toolkit, an earthquake exercise gets building evaluators, a hospital expansion gets a collapse scenario, and a utility gets a trench strike.

## Requirements

### User stories

- As a contractor's safety director, I want a trench cave-in exercise where my superintendent has to decide who goes in, who calls 911, and what to tell OSHA within the reporting clock.
- As a building official, I want a post-earthquake exercise with 300 buildings to evaluate and 12 volunteer evaluators, where I assign teams, post placards and report counts to the EOC.
- As a structural engineer, I want a scenario where monitoring data shows a shoring load rising, and I have to decide to clear the area before anyone tells me it is safe.
- As a construction management instructor, I want a classroom case where an owner pushes to keep working after an engineer finds a deficiency.
- As an earthquake exercise designer (spec 0450), I want building evaluators and placards in my scenario without writing inspection forms.
- As a fire department technical rescue officer, I want the contractor's side of a collapse in my rescue exercise.

### Functional requirements

**Domain**

- **FR-1 Construction domain.** A `construction` domain profile with the roles, systems, outside parties and phrasing in the research dossier (sections 2–3), with variants for a general contractor's project team, an owner and design team, a building department and post-disaster evaluation program, and an engineering or construction management class; aliases as listed. Existing domains (`industrial`, `commercial_facilities`, `municipal`) are not changed except for suggested toolkits (FR-14).
- **FR-2 Threat families and arcs.** Families for site emergency (crane, trench, fall, fire, utility strike), structural collapse and rescue support, post-disaster building inspection, professional dilemma (schedule pressure against safety), site security and theft, and the shared service degradation family, each with the arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**Structures toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for: daily excavation inspection record, crane daily inspection and lift plan with wind log, incident and near-miss report, stop-work order and site evacuation announcement, OSHA report record (with the 8-hour and 24-hour clocks, using the regulatory clocks of spec 0426), RFI and change order and schedule recovery request, unsafe building order and notice to vacate, the rapid and detailed evaluation forms and fixed equipment checklist, the three placards (INSPECTED, RESTRICTED USE, UNSAFE) as images with their text, inspection assignment log and team report, and a utility strike report. The seismic toolkit's placard and inspection templates (spec 0450 FR-3) are these templates, referenced by id, not duplicated. **Forms and placards follow the structure and wording of the public evaluation methods, written as new exercise templates; the ATC-20 and ATC-45 documents themselves are not bundled** (no reproduction terms are stated on the publisher's page).
- **FR-4 Format rules and knowledge.** Lint and generator knowledge for: the placard meanings and colors (green INSPECTED, yellow RESTRICTED USE, red UNSAFE) and that a placard applies to the building condition at the time of evaluation; the OSHA excavation and crane rules the scenario relies on (protective systems at 5 feet or deeper unless in stable rock, or under 5 feet with no indication of cave-in; daily and post-rain inspections by a competent person; exits within 25 feet of lateral travel for trenches 4 feet or deeper; employees removed from the hazard until precautions are taken); the reporting clocks (8 hours and 24 hours); the roles' real authority (the competent person and the superintendent can stop work; the engineer of record decides structural adequacy; the building official declares a building unsafe); and the rule not to state a depth threshold for engineered trench systems without checking the standard. The generator is told rules are summaries, to be verified against the current standard.

**Structures toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: a structural monitoring time series (crack width, tilt, settlement, shoring load) with alarm and action thresholds and annotations, a site logistics plan (laydown, crane position and swing radius, access routes, exclusion zone, muster point) drawn from entered geometry, an inspection status board (buildings by placard color and area, evaluators and teams), and an inspection assignment map (map overlays of spec 0448 FR-11 with buildings colored by status and a time slider). Each produces a text summary and data table (spec 0448 FR-5). None are AI images (project rule 5); photographs of damage stay AI or template as today.

**Structures toolkit: data**

- **FR-6 Case data.** Scenarios can carry: shaking intensity for the area from the seismic toolkit (spec 0450), wind and rain series from the weather toolkit, and a building list for the inspection program (fictional buildings by default; imported footprints when the user supplies them). Public statistics (BLS fatal injuries, OSHA inspection search) and investigation reports (NIOSH FACE, NIST) are references and sources for realistic sequences, not replay feeds.
- **FR-7 Simulated structural monitoring.** For a fictional event, parameters (sensor type, baseline, drift, a failure onset time and shape, noise, dropouts) produce consistent monitoring series and alarm crossings; for post-disaster programs, a building list with damage states drawn from a simple fragility relation of shaking intensity and building type, so the share of buildings that end up green, yellow and red follows the scenario and the evaluators' ground truth is known. All labeled simulated (spec 0448 FR-10).

**Exercise play**

- **FR-8 Structured decisions.** Decision forms (spec 0448 FR-14) for: stop work (scope, time), evacuate the site or an adjacent building (area drawn on the map, time), call 911 and request rescue, set the exclusion zone, shore or stabilize, shut off utilities, notify OSHA, owner and insurer (who, time), post a placard (building, color, restrictions), issue an unsafe building order, assign an evaluation team, and release a public statement. Available to players in live play and to the facilitator in Facilitate.
- **FR-9 Post-disaster inspection program play.** A mode where the building department or EOC seats receive building lists with priority classes (hospitals, shelters, schools, then others), a limited number of evaluators with qualifications, requests from owners and the public, and conflicting reports; the team leader assigns teams, evaluators post placards from the information in each building's record, and the building official reports counts to the EOC. The facilitator can introduce traps (the same condition placarded two ways, an unsafe adjacent building, an owner refusing to leave). The mode follows FEMA P-2055 guidance in structure; references to its contents are checked against the document when the pack is built.

**Evaluation**

- **FR-10 Metrics.** On spec 0448 FR-12: **warning-to-action time** (decision timing from the first threshold crossing or reported sign to stop work and evacuation, against the simulated ground truth of failure onset); **reporting timeliness** (OSHA 8-hour and 24-hour, owner and insurer notice, as entered); **rescue timeline** (times to 911, first responders, rescue plan with shoring; secondary hazards controlled); **inspection throughput and consistency** (buildings evaluated per team per shift, priority buildings first, placard agreement against ground truth with a confusion table by color, and under- and over-restriction counts); **message consistency** across the contractor, owner, building official and rescue agencies on the structure's status and the exclusion zone. Each shows its inputs. The ethics case is scored by a facilitator rubric (information gathered, escalation chain, documentation) and is not given a right answer.
- **FR-11 Core capabilities.** EEGs (spec 0421) for Operational Coordination, Mass Search and Rescue Operations, Critical Transportation, Infrastructure Systems, Situational Assessment, Public Information and Warning, On-scene Security, Protection and Law Enforcement, Fatality Management Services, and Planning, with critical tasks specific to site emergencies and post-disaster inspection.

**Knowledge and reuse**

- **FR-12 Document library.** A library pack of verified public-domain US federal material: OSHA 29 CFR 1926 Subparts P and CC and 29 CFR 1904.39 text, NIOSH FACE reports for trench and crane incidents, the NIST NCST Champlain Towers South reports, FEMA P-2055 and P-2055-1 (if its terms are confirmed on FEMA's site), FEMA US&R framework material, and OSHA construction publications; each license and URL verified when building the pack. ATC-20 and ATC-45, ICC and NSPE/ASCE materials are linked, not bundled.
- **FR-13 Examples.** (1) A fictional contractor's trench cave-in with a utility strike and an OSHA clock. (2) A crane collapse on a fictional mid-rise project with an adjacent occupied building and monitoring data. (3) A post-earthquake rapid inspection program for a fictional city of 300 buildings, reusing the shaking from a seismic example (spec 0450). Optionally (4) a classroom ethics case on schedule pressure.
- **FR-14 Reuse by other domains.** Suggested toolkits added to `industrial`, `commercial_facilities`, `municipal`, `energy_utility`, `water_utility`, `water_dam`, `transit`, `freight_rail`, `airport`, `stadium_venue`, `campus`, `k12_schools` and `healthcare`; the seismic toolkit references the inspection templates; the EMS and fire toolkit (spec 0456) references the collapse products for technical rescue.

### Non-functional requirements

- **NFR-1 Cost:** only free public sources; no accounts or keys; nothing paid.
- **NFR-2 Privacy:** no real worker, company or building data; scenarios use fictional contractors, engineers and buildings (project naming rule), real city geography allowed; nothing about the user's plans is sent anywhere.
- **NFR-3 Accessibility:** placards and status boards carry words and patterns, not color alone; monitoring figures have data tables and the threshold values in their summaries.
- **NFR-4 Accuracy:** regulatory statements follow the cited text and are marked as summaries; a review by a structural engineer and a construction safety director before release (owner to arrange); all products carry an "exercise" mark and a statement that they are not a safety evaluation of any real structure.
- **NFR-5 Safety:** nothing in the toolkit directs real structural decisions; real inspections follow the jurisdiction's program.

### Out of scope

- Structural analysis or fragility modeling beyond simple relations; the simulator draws plausible series and damage states.
- A real inspection management system, permitting software or a building information model.
- Legal advice on OSHA obligations; templates summarize clocks and duties.
- Live data during a session.

## Design

- **Domain:** `packs/domains/construction.json` with variants as role sets.
- **Toolkit:** `packs/toolkits/structures/` (toolkit JSON, templates, knowledge fragments, lint rule configuration).
- **Figures:** `src/main/render/figures/structures/` (monitoring series using the generic time series with thresholds, site plan, status board, assignment map via shared overlays).
- **Simulation:** `src/main/toolkits/structures/simulate.ts` (sensor series generator, fragility-based building damage states with a seeded random source so scenarios reproduce).
- **Inspection program mode:** building list and team assignment data in the scenario's case data; decision frames from spec 0448 FR-14; the placard decision records the building, color, restrictions and time for the metric.
- **Metrics:** `src/main/evaluation/metrics/{inspection_agreement,rescue_timeline}.ts` plus the generic metrics.

## Security and privacy

As spec 0448: fixed hosts for any connector (none required at launch), files inside the scenario folder, schema-validated imports of building lists (CSV, GeoJSON) with size limits. Building lists are local and are never sent anywhere. No real addresses of private buildings are generated by default.

## Testing

Golden images for each figure; simulation tests (failure onset is detectable after the threshold crossing, damage share rises with shaking intensity, seeded runs repeat); lint tests for placard colors and wording and for the excavation and crane rule statements; metric tests with worked examples (stop work 7 minutes after the first alarm; 24 of 30 buildings placarded in agreement with ground truth, with the confusion table); decision frame tests; example projects generated end to end with the local model before release.

## Tasks

1. **#824** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#828** Structures toolkit: templates, format rules and knowledge (FR-3, FR-4).
3. **#846** Structures figures: monitoring series, site plan, inspection status (FR-5).
4. **#851** Case data and simulated structural monitoring (FR-6, FR-7).
5. **#853** Structured decisions: stop work, evacuate, rescue, placard (FR-8).
6. **#855** Post-disaster inspection program play (FR-9).
7. **#856** Metrics and core capabilities (FR-10, FR-11).
8. **#858** Document library (FR-12).
9. **#859** Examples and reuse in other domains (FR-13, FR-14).

## Open questions

- **ATC placards and forms.** The publisher's page offers the placards and forms for download but states no reproduction terms. Recommendation: write new templates in the same structure and cite the methods; ask the Applied Technology Council before bundling any original.
- **FEMA P-2055.** Confirm its terms and read the placard and form content directly when building the pack (FEMA's site blocked automated access this session).
- **Engineered trench systems.** Verify the depth rule for registered professional engineer designs (tabulated data and appendices of Subpart P) before any template states it.
- **Practitioner review.** A structural engineer who has served as a building safety evaluator and a construction safety director review the toolkit and examples before release.
- **Collapse rescue.** Recommendation: keep rescue tactics in the EMS and fire toolkit (spec 0456) and keep this toolkit to the contractor's and engineer's decisions.
