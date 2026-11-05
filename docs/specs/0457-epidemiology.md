# Spec 0457: Epidemiology — outbreak investigation, surveillance and the epidemiology toolkit

Issue: #690 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/epidemiology.md](../research/domains/epidemiology.md)

## Summary

Action Stations can exercise the people who detect and investigate outbreaks: state and local health department epidemiologists and disease investigators, hospital infection preventionists, public health laboratories, and epidemiology students. They work a foodborne, respiratory, vaccine-preventable or healthcare-associated outbreak from the first report to control measures and communication, with the data they actually use: epidemic curves, line lists, attack-rate tables, contact networks, laboratory turnaround boards, wastewater series and dispensing throughput charts. The data come from simulated outbreaks (compartment models, a common-source generator, contact networks) or from free CDC series replayed from public archives, and decisions are scored on the clocks the field uses: time to case definition, to control measures, to public notice, contacts reached, and dispensing throughput. The same products ship as the **epidemiology toolkit**, which the animal health domain (spec 0460), research labs (spec 0466), hospitality and cruise, humanitarian response, schools, airports and healthcare use for outbreaks in their own settings. Public health agencies that run CDC PHEP exercises also get after-action output that maps to the program's improvement plan data elements.

The existing `public_health` domain (the agency: DOC activation, health orders, dispensing operations) stays as is; this domain describes the analytic and investigative work and extends `public_health` by reference.

## Requirements

### User stories

- As a state epidemiologist's exercise planner, I want a PHEP Biological Incident 100 tabletop and later a Biological Incident 200 functional exercise whose AAR gives me the improvement plan data to submit.
- As a local disease investigator, I want a measles exposure scenario with a flight, a school and a clinic, and a contact list that grows as I work it.
- As an infection preventionist, I want a healthcare-associated cluster exercise where the health department and I disagree on when to close a unit.
- As an epidemiology instructor, I want a two-hour lab where students build the case definition, draw the epi curve from a line list and name the likely food vehicle.
- As a hospitality manager, I want an outbreak-at-sea or hotel illness scenario without building an epidemiology exercise (spec 0457 toolkit; field epic #703).
- As a PIO, I want exposure notices and health alerts consistent with the numbers on the epi curve.

### Functional requirements

**Domain**

- **FR-1 Epidemiology domain.** An `epidemiology` domain profile with the roles, systems, outside parties and phrasing in the dossier (sections 3–4), with variants for a state or local health department epidemiology program, a hospital infection prevention team, a public health laboratory and an academic program; aliases as listed. It lists `public_health` as the parent agency profile and suggests the epidemiology toolkit.
- **FR-2 Threat families and arcs.** Families: foodborne outbreak, respiratory pathogen with community spread, vaccine-preventable exposure, healthcare-associated cluster, mass prophylaxis, surveillance signal, laboratory surge, and the shared service degradation family (surveillance system outage, laboratory reporting backlog, contact list breach). Phase arc for an investigation: signal → verify → define cases → describe by time, place and person → hypothesis → control → communicate → close and after-action (the ten steps of CDC's field investigation, dossier section 1), using extensible families (spec 0448 FR-15).

**Epidemiology toolkit: products**

- **FR-3 Products as templates.** Exact templates for: case report form, outbreak questionnaire, exposure notice (with locations and time windows), clinician health alert, school and employer letter, isolation and quarantine guidance sheet (with pathogen fields filled from knowledge fragments), laboratory result sheet, situation report, hotline call notes, and press release. Reuse the `public_health` templates by reference; do not duplicate those that exist.
- **FR-4 Format rules and knowledge.** Generator knowledge so drafts use the right term and sequence (case definition tiers confirmed, probable and suspect; onset date, not report date, on an epi curve; incubation and exposure window arithmetic; attack rate and odds ratio definitions; the ten investigation steps and their order) and lint checks for internal consistency (counts in a notice match the line list and curve; exposure windows are computed from onset and incubation). Pathogen fact fragments cover a short, reviewed list (norovirus, Salmonella, measles, influenza, SARS-CoV-2, pertussis, Legionella) with incubation periods and infectious periods marked with their source, and are limited to public health response facts.

**Epidemiology toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: epidemic curve (histogram by onset date or hour, with case status shading, exposure and intervention markers, and a smoothed overlay option); line list (table with sort, hidden identifiers, fictional names); attack-rate and odds-ratio table by exposure; spot map of cases; contact tracing network (index case, generations, contact status colors with symbols as well as colors); laboratory surge board (specimens received, pending, positive, turnaround against target); dispensing throughput chart (arrivals, stations, queue length); wastewater concentration or activity level series with levels and thresholds. Each produces the text summary and data table of spec 0448 FR-5. None is an AI image (project rule 5).

**Simulation**

- **FR-6 Compartment model.** SIR and SEIR models with parameters (reproduction number, latent and infectious periods, initial cases, vaccination coverage, intervention start and effect), solved with a fixed-step numerical method in app code, producing daily incidence, prevalence and the epi curve; a stochastic variant for small outbreaks. Labeled simulated.
- **FR-7 Common-source outbreak generator.** An event with attendees, a food or exposure list, an incubation distribution, a vehicle, and an attack rate by exposure; produces a line list, the curve and the attack-rate and odds-ratio tables so the correct vehicle is findable and the distractors are plausible.
- **FR-8 Contact network generator.** Households, workplaces, schools, a flight or a hospital unit with contact counts and reachability by day; produces contact lists with classification (close contact or not, by exposure window) and the follow-up schedule; supports contact reachability (some contacts unreachable) for the metric in FR-12.
- **FR-9 Wastewater and dispensing models.** A wastewater series generated from the epi curve with shedding lag, noise and a levels scale, consistent with the curve; a dispensing site model (arrival pattern, stations, service times) for throughput and queue length. Both labeled simulated.

**Data and replay**

- **FR-10 Replay connectors.** With consent and a size estimate (spec 0448 FR-8): CDC wastewater viral activity levels (data.cdc.gov dataset `atcp-73re`, weekly, full history, filtered by state or site and date range), and NNDSS weekly notifiable disease counts (data.cdc.gov); aggregate real curves feed a scenario as historical data labeled with source and date, and the dataset's own level definitions are shown with the data. Line lists are never fetched or implied to be real; individual cases in a replayed scenario are simulated to fit the real aggregate, and marked so.

**Decisions and evaluation**

- **FR-11 Structured decisions.** Forms (spec 0448 FR-14): adopt or change a case definition, declare an outbreak, request Epi-Aid, classify a contact, issue an exposure notice (who, where, window), recommend exclusion of a worker or closure of a facility or unit, order a laboratory test priority, open or close a dispensing site, release data publicly. Decisions go to the session log and feed the metrics.
- **FR-12 Metrics.** Decision timing (spec 0448 FR-12) configured for: time from first report to case definition, outbreak declaration, first control measure and public notice, each against the simulated or replayed ground truth; **contact reach** (share of contacts reached within a target set by the designer, and the share unreachable, with no national target assumed); **dispensing throughput** (people per hour against plan, time to open the site); **message consistency** across health department, hospital and school messages; a **curve accuracy** check (the curve a team drew matches the line list).
- **FR-13 Core capabilities and PHEP capabilities.** EEGs (spec 0448 and the HSEEP evaluation specs) for Public Health, Healthcare and Medical Services; Epidemiological Surveillance and Investigation; Public Information and Warning; Operational Coordination; with the dossier's critical tasks, and a mapping to the PHEP capabilities (8, 9, 11, 12, 13).
- **FR-14 PHEP exercise framework in the AAR.** An exercise can be tagged with a PHEP exercise from the 2024-2028 framework (for example Biological Incident 100 discussion-based, Biological Incident 200 functional, Capstone 100 to 400, Critical Contacts Drill). The tag sets suggested objectives and participants from the framework, and the AAR and improvement plan include the fields CDC asks for, exported for entry into CDC's reporting system within the 90-day window the framework sets. The tag text and rules are versioned with the framework's date (April 2024); the product does not submit anything to CDC.

**Knowledge and reuse**

- **FR-15 Document library.** A public-domain library pack: CDC Field Epidemiology Manual chapters, Principles of Epidemiology lessons, Epi Info documentation, the PHEP Exercise Framework supplemental guidance and capabilities, and HSEEP, each with license and URL verified when building the pack (dossier section 6).
- **FR-16 Examples.** (1) A common-source foodborne outbreak after a fictional event for a fictional county health department, with the line list, curve and traceback. (2) A measles exposure with a flight, a school and a clinic, using the contact network and exposure notices. (3) A PHEP Biological Incident 200-style dispensing exercise for a fictional county, using the throughput model and the PHEP tag.
- **FR-17 Reuse by other domains.** Suggested toolkit added to the public health, healthcare, campus, K–12, airport, food and agriculture, port and maritime, emergency communications and municipal profiles; the animal health and research labs specs reference it.
- **FR-18 Guides.** User guides: choosing a model, reading the figures, building a line list scenario, using the PHEP tag, and the limits of simulated data.

### Non-functional requirements

- **NFR-1 Cost:** only free public data; no keys.
- **NFR-2 Privacy:** the connectors contact CDC data services only when the user fetches data for a scenario; no real patient data is ever used or created; line lists use fictional people; nothing about the user's plans is sent. Contact lists in a scenario are exercise data and exports carry the exercise marking.
- **NFR-3 Accessibility:** every figure has a text summary and data table; network and status colors also use shapes and labels; curve colors meet contrast guidance.
- **NFR-4 Accuracy:** formats and facts verified against the sources in the dossier; a review by a state or local epidemiologist and an infection preventionist before release (owner to arrange, as in the epic); pathogen facts carry their sources.
- **NFR-5 Integrity:** historical data is labeled with source and date; the level scale used by CDC's wastewater data is shown as published for the dataset version fetched; simulated data is never presented as historical (spec 0448 NFR-5).

### Out of scope

- Real patient or case-level data, or any connection to a surveillance system.
- Predicting real outbreaks; the models are teaching models with parameters set by the designer.
- Pathogen-specific clinical guidance beyond response facts in the reviewed fragments.
- Clinical care scenarios (nursing and clinical care, #685) and EMS/MCI (#689).

## Design

- **Domain:** `packs/domains/epidemiology.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/epidemiology/` (toolkit JSON, templates, knowledge fragments, lint rule configuration, PHEP exercise tag data with the framework date).
- **Figures:** `src/main/render/figures/epi/` (epi curve, line list, attack-rate table, spot map, network, lab board, dispensing chart, wastewater series), sharing time-series and table code from spec 0448.
- **Simulation:** `src/main/toolkits/epidemiology/simulate.ts` (compartment solver, common-source, contact network, wastewater, dispensing), seeded for reproducibility.
- **Connectors:** `src/main/toolkits/connectors/{cdc_nwss,cdc_nndss}.ts`, each with an estimate, a fetch cropped to the scenario's place and dates, and recorded-response tests; hosts fixed in code.
- **Metrics:** `src/main/evaluation/metrics/{contact_reach,dispensing_throughput}.ts` beside the shared decision timing and message consistency.
- **PHEP tag:** data in the toolkit pack; AAR export in the existing HSEEP document set (spec 0420) as an extra table.

## Security and privacy

As spec 0448: fixed data hosts per connector, size limits, files only in the scenario folder, consent before fetching. Fictional people only; the generator never takes real names from a pack or the user's documents for case data without the usual redaction rules (spec 0433). Contact list and line list exports are marked as exercise material.

## Testing

Golden images for each figure from fixtures; solver tests against closed-form checks (a no-intervention SIR run matches a reference table; final size relation holds within tolerance; counts conserved); common-source generator tests (the true vehicle has the highest odds ratio in a fixed-seed run); contact network reachability tests; wastewater consistency tests (peak follows the curve by the shedding lag); connector contract tests with recorded responses and opt-in live tests; lint tests (notice counts match the line list); metric tests with worked examples; PHEP tag tests (objectives and fields match the framework text); example projects generated end to end with the local model before release.

## Tasks

1. **#832** Epidemiology domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#834** Toolkit product templates and format knowledge (FR-3, FR-4).
3. **#836** Figures: epidemic curve, line list, attack-rate tables, spot map, contact network, lab board, dispensing chart (FR-5).
4. **#838** Simulated outbreaks: compartment model, common-source, contact network, wastewater, dispensing (FR-6–FR-9).
5. **#839** Wastewater and notifiable disease replay connectors (FR-10).
6. **#841** Structured decisions (FR-11).
7. **#842** Metrics, core capabilities and PHEP exercise framework mapping in the AAR (FR-12–FR-14).
8. **#844** Document library pack (FR-15).
9. **#845** Examples and reuse in other domains (FR-16, FR-17).
10. **#847** User guides and practitioner review (FR-18, NFR-4).

## Open questions

- **Practitioner review.** Recommendation: a state or local epidemiologist (a CSTE member through the owner's network) and a hospital infection preventionist review the templates, knowledge fragments and examples before release.
- **Pathogen fragments.** Recommendation: start with the seven listed and add only with a cited source and the reviewer's approval.
- **PHEP tag scope.** The framework text is dated April 2024; the cooperative agreement runs to June 30, 2029. Recommendation: version the tag data and show its date, and check CDC's current guidance at each release.
- **Level scale for wastewater.** CDC's published level cutoffs differ between pages and versions. Recommendation: the connector stores the dataset's own fields and shows the cutoffs from the methodology page retrieved at fetch time.
