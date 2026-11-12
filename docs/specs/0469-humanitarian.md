# Spec 0469: Humanitarian and international response — coordination, field security and the humanitarian toolkit

Issue: #702 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #697 (human services, spec 0464, for the service level, time to completion and needs coverage metrics and camp management), #690 (epidemiology), #695 (supply chain), #691 (crisis communications) · Research: [docs/research/domains/humanitarian.md](../research/domains/humanitarian.md)

## Summary

A `humanitarian` domain and a **humanitarian toolkit** let Action Stations exercise NGOs, UN agencies, cluster partners and development programs working under hard field conditions: a sudden-onset disaster abroad where clusters must coordinate in the first 72 hours, a refugee influx, a cholera outbreak in a camp, a staff kidnapping or detention, a supply pipeline break. Players work with situation reports, flash updates, 3W (who does what where) tables and maps, cluster minutes and gap lists, pipeline dashboards and field security reports, make structured decisions, and are scored on coordination gaps closed, staff safety decisions and needs coverage. Real public humanitarian data (3W datasets, reports, aid worker security incident counts) can seed baselines and replays; simulated events fill the rest. The toolkit reuses the human services, epidemiology and supply chain toolkits and is useful to domestic voluntary organizations active in disasters.

## Requirements

### User stories

- As an NGO country director, I want a 72-hour sudden-onset disaster exercise where clusters activate, a 3W picture builds up from partners' reports, and gaps appear that my team must decide whether to fill.
- As a cluster coordinator, I want a gap list that changes as partners report, so I practice prioritizing and escalating to the Humanitarian Country Team.
- As a security manager, I want a staff detention scenario where I must decide on movement stops, share alerts with other agencies and brief the crisis management team, at the level of decisions and communications.
- As a headquarters crisis management team lead, I want family liaison, legal, media and donor messages to stay consistent through a long incident.
- As a logistics head, I want a pipeline dashboard that shows a break coming and a customs hold that makes it worse.
- As a humanitarian studies instructor, I want students to play different organizations around one fictional crisis, with scoring on coordination and coverage.
- As a domestic voluntary organization planner, I want the sitrep, 3W and coordination products in a community disaster exercise.

### Functional requirements

**Domain**

- **FR-1 Humanitarian domain.** A `humanitarian` domain profile with variants for an international NGO country office, a UN coordination office and cluster, a refugee response site, and a headquarters crisis management team: the roles, systems, outside parties and phrasing in the research dossier (sections 2–3), aliases as listed. Country, crisis and organization names are fictional; real countries and regions may be used as geography only where the project naming rule allows.
- **FR-2 Threat families and arcs.** Families for sudden-onset disaster, refugee influx, outbreak in a site, staff security incident, supply pipeline break, funding gap, beneficiary data breach, and the shared **service degradation** family (communications loss), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15). Refugee influx scenarios use the refugee coordination model, not cluster activation, as the dossier states.

**Toolkit: products and knowledge**

- **FR-3 Coordination products.** Templates for the situation report and flash update, 3W table and map by sector and admin area, cluster meeting minutes, gap list, humanitarian needs overview summary, response plan summary, funding status, HCT meeting agenda and decision record, and a partner coordination message.
- **FR-4 Field security products.** Templates for the security incident report, security risk assessment summary, movement request and approval, security alert shared among agencies (at the level of the Saving Lives Together information-sharing goals), crisis management team log and decision record, family liaison update, staff statement and media holding statement.
- **FR-5 Supply pipeline products.** Templates and figures for the pipeline dashboard (stock on hand, in transit, forecast break date, lead times), shipment status table, customs hold notice, procurement request, warehouse report, access constraint note (shared with the logistics cluster style), and donor notification of a pipeline change.
- **FR-6 Needs and response products.** Templates for the rapid assessment summary, distribution report with coverage by site, camp health surveillance report (cases, deaths, attack rate, case fatality) with epidemic curve (shared with the epidemiology toolkit), community feedback and complaint log, and a misinformation tracker.
- **FR-7 Format rules and knowledge.** Generator knowledge and lint for: cluster activation (requested by the Humanitarian Coordinator, activated by the Emergency Relief Coordinator with IASC Principals' endorsement; strategic and time-limited under the Transformative Agenda) and the difference in refugee settings; who leads what (the HC through cluster lead agencies; examples of global cluster leads, flagged for review); the Saving Lives Together principle that participation does not make the UN responsible for an NGO's security; humanitarian principles named in the pack **[U: cite the governing resolutions when building]**; product conventions (a flash update's sections, 3W fields). Each rule carries its source and date so a user sees why a draft says what it says. Field security and kidnapping content stays at the decision and communications level: no negotiation tactics, no evasion or detention-resistance technique, no ransom mechanics (the guardrails of spec 0465 FR-7 apply to this domain).

**Toolkit: figures and data**

- **FR-8 Figures.** Figure kinds (spec 0448 FR-4/FR-6) for: 3W map and matrix (partners by sector and admin area, with coverage gaps highlighted), needs against coverage by sector, pipeline chart (stock projection with break date and lead times), epidemic curve and attack rate by site, funding status bar (required, received, gap), security incident timeline and map, and an access constraints map. Each has the text summary and data table of spec 0448 FR-5.
- **FR-9 Replay and baselines.** Connectors for: HDX country operational presence (3W) datasets and the global operational presence data (used as realistic partner and sector structure for a scenario's country), ReliefWeb reports and disaster entries for a past event timeline (with GDACS disaster events as the timeline that needs no approval, ADR-0172), OCHA Key Figures, and aggregate aid worker security incident counts from the Aid Worker Security Database as context. Each dataset's license is read at fetch time and stored with its provenance; datasets that forbid redistribution are used for the scenario only and not exported in packs. ReliefWeb and Key Figures require a registered application name: the user enters their own in Settings (it identifies an application and is not a secret), and without one the connector is off and the bundled sample data is used. Fetches happen once, with consent and a size estimate. The funding tracking service is added if its terms permit **[U]**.
- **FR-10 Simulated events.** Parametric generators (spec 0448 FR-10) for: displacement and arrivals at a site (arrival rate, registration throughput), a sudden-onset disaster impact (affected population by admin area, access constraints), partner reporting into a 3W table over time (partners, sectors, coverage rising and falling), an outbreak in a camp (reuses the epidemiology toolkit's transmission model when available), and a pipeline with lead times, shipments and a break. All labeled simulated.

**Exercise play and evaluation**

- **FR-11 Structured decisions** (spec 0448 FR-14): "Request cluster activation" and "Activate cluster" (cluster, lead), "Assign gap to partner" (gap, partner, time), "Escalate gap to HCT", "Launch or revise appeal" (amount, sectors), "Stop movements" (area, duration), "Hibernate or relocate staff" (site, reason), "Evacuate", "Notify family", "Activate crisis management team", "Share security alert" (to whom), "Reroute shipment" (route, cost, delay), "Request customs waiver", "Declare outbreak response" (sectors), and "Issue public statement".
- **FR-12 Metrics.** Using the generic metrics of spec 0464 FR-11 and 0448 FR-12: **time to completion** configured for time to close each coordination gap (assigned and then covered) and the share of gaps open at the end; **needs coverage** by sector and site against the response plan's targets (entered by the facilitator, with Sphere indicators shown as linked references only); **threshold timing** for staff safety decisions against the onset of a threat (movement stop, hibernation, evacuation, family notified, alert shared) and for pipeline decisions against the break date; **message consistency** across the NGO, the HQ, the HCT and donors' messages.
- **FR-13 Core capabilities.** A humanitarian capability list (coordination; assessment and information management; security and duty of care; logistics; sector response; communications and accountability to affected communities) with critical tasks, and a mapping to HSEEP core capabilities (Operational Coordination, Situational Assessment, Operational Communications, Logistics and Supply Chain Management, Mass Care Services, Public Health, Healthcare and Emergency Medical Services, Public Information and Warning) for US sponsors.

**Knowledge and reuse**

- **FR-14 Document library.** Because most humanitarian doctrine is not public domain, the library pack is mostly **links plus short original summaries** with the source and license recorded for each: IASC documents (cluster coordination reference module, Transformative Agenda, scale-up, preparedness guidance), the Saving Lives Together framework, INSARAG guidance, GISF guides, and the Core Humanitarian Standard. The Sphere Handbook is linked, never bundled, until its license is clarified with Sphere (open question). US federal public-domain works (CDC cholera and refugee health guidance; a former USAID field operations guide for disaster assessment and response if still available; FEMA material) are bundled where verified. Datasets are never bundled in the library; they are fetched by connectors.
- **FR-15 Examples.** (1) A fictional earthquake in a fictional country, first 72 hours with cluster coordination, 3W and a gap list. (2) A refugee influx and cholera outbreak at a fictional site. (3) A staff detention incident for a fictional international NGO, headquarters crisis management team focus. (4) A pipeline break for a fictional food assistance program.
- **FR-16 Reuse by other domains.** Suggested toolkits added to the public_health, municipal, port_maritime, food_agriculture and emergency_communications profiles for community and domestic voluntary organization exercises; the human services toolkit's shelter products are linked from camp management scenarios; the humanitarian pack depends on the epidemiology and supply chain toolkits when those ship and works without them (simple built-in series) until then.

### Non-functional requirements

- **NFR-1 Cost:** only free public data. ReliefWeb and Key Figures need a free application name the user registers; no payment, no account beyond that.
- **NFR-2 Privacy:** no real beneficiary, staff or incident-level data; the aid worker incident data used is aggregate; connectors fetch only on the user's request and send nothing about the plans except the application name the user entered; case data stays in the scenario folder.
- **NFR-3 Accessibility:** every figure has a text summary and table; maps carry legends and keyboard-reachable layers; scenarios support multiple languages (injects can be translated, spec 0435); status colors carry words.
- **NFR-4 Accuracy and review:** formats and coordination rules checked against the cited sources and dated; a review by a humanitarian operations lead who has run cluster or NGO coordination, and a security manager for FR-4, before release (owner to arrange); products marked as exercise products.
- **NFR-5 Care and respect:** scenarios about real populations avoid stereotypes; affected communities are depicted as actors with agency; fictional crises are used for examples; a content notice and facilitator wellbeing script apply to staff-harm scenarios.

### Out of scope

- Operational humanitarian information systems, beneficiary registration or case management.
- Real-time data during a session.
- Tactical security or negotiation content, as in FR-7.
- Detailed clinical or public health protocols beyond what the epidemiology toolkit provides.

## Design

- **Domain:** `packs/domains/humanitarian.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/humanitarian/` (toolkit JSON, templates, knowledge fragments with sources and dates, guardrail fragments, lint configuration).
- **Figures:** `src/main/render/figures/humanitarian/` (3W map and matrix, needs coverage, pipeline chart, funding bar, security timeline, access map); the epidemic curve is shared with the epidemiology toolkit when present.
- **Connectors:** `src/main/toolkits/connectors/{hdx,reliefweb,ocha_key_figures,awsd}.ts`, each with an estimate, a fetch cropped to the scenario's country and period, license capture into the case data manifest, and recorded-response tests. The application name is read from Settings and never logged.
- **Simulation:** `src/main/toolkits/humanitarian/simulate.ts` (arrival process, partner reporting model, pipeline with lead times, outbreak using the epidemiology model when available).
- **Metrics:** configured instances of the metrics in specs 0448 and 0464.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching. The application name entered in Settings is stored with other settings, sent only to the host that requires it, and is not an API secret. The guardrails of spec 0465 FR-7 apply to security content. Generated scenarios use fictional organizations, people and crises. Per-dataset licenses are recorded and respected on export.

## Testing

Golden images for each figure; connector contract tests with recorded responses (including a ReliefWeb refusal when no application name is set) and opt-in live tests; simulation tests (3W coverage responds to partner reports; the pipeline break date matches stock and consumption; arrivals match the configured rate); metric tests for gap closure times and needs coverage on worked examples; lint tests for cluster activation statements; guardrail tests for field security content; example projects generated end to end with the local model before release.

## Tasks

1. **#805** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#813** Coordination products (FR-3, FR-7).
3. **#817** Field security products and knowledge (FR-4, FR-7).
4. **#821** Supply pipeline products and dashboards (FR-5).
5. **#826** Needs and response products (FR-6).
6. **#831** Humanitarian figures and maps (FR-8).
7. **#911** Replay connectors and baselines from humanitarian data sources (FR-9).
8. **#913** Simulated displacement, outbreak and pipeline events (FR-10).
9. **#914** Decisions, metrics and core capabilities (FR-11–FR-13).
10. **#915** Document library, examples and reuse in other domains, user guides (FR-14–FR-16).

## Open questions

- **Sphere license.** Sphere's pages and the handbook's PDF notice appear to disagree. Recommendation: ask Sphere in writing before bundling anything; link and cite indicators until then.
- **Application name for ReliefWeb.** A shared Action Stations name would identify all users to the service; per-user names are more private but add a setup step. Recommendation: per-user, optional, with bundled sample data for examples.
- **Cluster changes.** Reports of a reorganization of the cluster system were not confirmed. Recommendation: the pack's knowledge fragments carry a date and the reviewer confirms the current structure before release.
- **Practitioner review.** Recommendation: an OCHA or cluster coordination alumnus, an NGO security manager, and a logistics head from a large relief agency.
