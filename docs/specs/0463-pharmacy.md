# Spec 0463: Pharmacy and pharmaceutical supply, and the pharmacy toolkit

Issue: #696 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #684 (clinical systems, spec 0451), #685 (clinical care, spec 0452), #695 (supply chain) · Research: [docs/research/domains/pharmacy.md](../research/domains/pharmacy.md)

## Summary

Drug shortages and pharmacy system outages reach patients directly, and pharmacy is part of every hospital exercise. This epic adds a `pharmacy` domain, a department view of the existing `healthcare` hospital plus a community pharmacy variant, and the **pharmacy toolkit**: shortage and allocation boards driven by real FDA shortage records, dispensing and verification queues, cold chain temperature logs and excursion reports, controlled substance diversion reports and recall notices. Players work a critical shortage (assess, allocate, substitute, communicate), a claims or e-prescribing outage, a compounding error, a diversion case, a cold chain failure or dispensing in a disaster, and are scored on patients affected by shortages, safe substitutions, cold chain losses contained and the timing of required reports. The toolkit reuses the clinical systems toolkit (spec 0451) for interfaces and downtime, the clinical care toolkit (spec 0452) for the medication administration record and handoffs, and the supply chain toolkit (#695) for shipments and lots, and does not rebuild them.

## Requirements

### User stories

- As a director of pharmacy, I want a shortage exercise in which a sole-source IV product is allocated at 50 percent, so my team practices the assessment, the allocation rules and the message to nursing and physicians.
- As a medication safety officer, I want each proposed substitution checked against a safety list so we see which ones create errors.
- As a vaccine coordinator at a clinic, I want a freezer failure at 2 a.m. that tests who gets called, how product is moved and how a viability decision is made.
- As a community pharmacist-in-charge, I want a claims switch outage on a Monday morning, with patients at the counter and cash-or-wait decisions.
- As a controlled substance diversion specialist, I want a cabinet anomaly case that runs from detection to the DEA notice and report.
- As a pharmacy school instructor, I want a two-hour lab on a shortage using a real FDA shortage record and a fictional hospital.
- As a hospital emergency manager, I want the pharmacy represented in the annual tabletop (42 CFR 482.15(d)(2)(ii)(C)) without a separate exercise.

### Functional requirements

**Domain**

- **FR-1 Pharmacy domain.** A `pharmacy` domain profile that **extends** `healthcare` for the hospital pharmacy department (inherits the hospital command, outside parties and media) and adds a community pharmacy variant (chain and independent), a compounding or sterile products variant, and a vaccine program variant; roles, systems, outside parties and phrasing as in the dossier (sections 1 through 3), with the aliases listed. A hospital exercise can run `healthcare`, `nursing` and `pharmacy` together.
- **FR-2 Threat families and arcs.** New families **drug shortage**, **compounding error**, **controlled substance diversion**, **cold chain failure** and **recall**, plus pharmacy forms of the shared **service degradation** family (claims or e-prescribing outage, dispensing cabinet failure, supply chain disruption), with the arcs in the dossier (section 9), using extensible families (spec 0448 FR-15).

**Pharmacy toolkit: products**

- **FR-3 Products as templates.** Exact, legible templates for the products in dossier section 4: drug shortage board; shortage assessment form (operational and therapeutic); allocation and restriction memo, therapeutic interchange table and emergency approval; substitution safety checklist; dispensing and verification queue views; claims or e-prescribing outage notice and pharmacy workaround sheet; cold chain temperature log and data logger report; temperature excursion report and viability decision form; controlled substance discrepancy and diversion report; theft or loss notice and DEA Form 106 worksheet (data fields, not the form); recall notice and recall response log; compounding batch record and out-of-spec result; patient letter or call script. Existing healthcare templates are reused; the medication administration record and lab results come from the clinical care toolkit.
- **FR-4 Format rules.** Lint and generator knowledge: NDC format (the 10- and 11-digit forms), lot and expiration conventions, units and concentrations stated consistently in substitution tables, temperature ranges in both Celsius and Fahrenheit matching the stored range (for example 2 to 8 °C is 36 to 46 °F), excursion reports stating min, max and time outside range, controlled substance report timing words ("within one business day" for the Field Division notice; Form 106 filed electronically within 45 days), and the rule that a shortage record's recovery date is an estimate. The generator is told it must not invent doses or drug interactions beyond what the scenario's author supplies, and the lint flags implausible doses.

**Pharmacy toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: cold chain temperature chart (time series with the acceptable range band and excursion shading, probe and ambient lines), shortage board and days-on-hand projection (on-hand divided by usage, with allocation scenarios), queue age and count over time (dispensing and verification), controlled substance usage chart (transactions by user compared with peers, by hour), recall tracing diagram (lot, locations, quantity, patients), and inventory by presentation. Each has the text summary and data table of spec 0448 FR-5. None are AI images.

**Pharmacy toolkit: data**

- **FR-6 Shortage replay.** A connector fetches FDA drug shortage records from the openFDA shortages endpoint for a drug name or class (with consent and a size estimate; no key), stores them in the scenario folder with provenance (source, retrieval date, terms, historical) and builds a shortage board from them. The records are shown as the FDA reported them (availability, related information including estimated recovery, contact), labeled with their retrieval date, and carry the endpoint's statement that they are not for medical decisions. Real manufacturer names that appear in FDA records are shown only as dated quotes of the record; the exercising organization remains fictional (project naming rule).
- **FR-7 Historical seeds.** The dated shortage and outage events in dossier section 8 are available as scenario seeds with attributed facts; the generator is told they are history. Narrative details not in the verified sources are not invented as fact.
- **FR-8 Simulated cases.** For fictional events: a **shortage model** (usage per day, on-hand, deliveries, allocation percentage, projected stockout date by drug and unit) that stays consistent as decisions change usage; a **cold chain model** (a unit with a compressor or power failure, temperature rising along a curve, door openings, product load, time to leave range) with a viability table of the scenario's fictional product ranges; a **diversion model** (a user whose transactions diverge from peers, with seeded innocent explanations); a **queue model** (arrivals, service times, staffing). All values labeled simulated and deterministic given a seed.

**Exercise play**

- **FR-9 Pharmacy decisions.** Structured decisions (spec 0448 FR-14): "Set allocation" (drug, tiers, percentage, rule), "Approve substitution" (alternative, dose conversion note, safety checklist result, who is told), "Restrict use", "Source supply" (alternate supplier, import, loan from another hospital), "Hold or release a batch", "Quarantine product" (lots, locations), "Make viability decision" (product, keep or discard, basis), "Move product" (to which unit or site), "Start investigation" and "Notify" (DEA, board, FDA, health department, patients), "Switch to manual workflow". They enter the session log and feed the metrics.
- **FR-10 Consequences.** Decisions update the models in a simple, explainable way (an allocation tier changes the projected stockout; a late move extends the time out of range; a missed notice appears on the clocks); the facilitator can see which rule fired and override it. The rules are a small table in the toolkit.

**Evaluation**

- **FR-11 Metrics.** Using spec 0448 FR-12 plus pharmacy measures: patients affected by shortages (doses delayed, substituted, or unavailable, by tier); safe substitutions (checklist passed versus failed, errors that occurred); cold chain losses contained (time from alarm to action, doses at risk, discarded, saved, patients needing recontact); diversion handling timing (anomaly to investigation to the one-business-day notice to Form 106 within 45 days, via spec 0426 regulatory clocks); recall response (notice to quarantine to patient contact); message consistency across pharmacy, clinicians and patients. Each shows its inputs.
- **FR-12 Core capabilities.** EEGs for Supply Chain Integrity and Security, Logistics and Supply Chain Management, Public Health Healthcare and EMS, Operational Coordination, Operational Communications and Public Information and Warning, with pharmacy-specific critical tasks.
- **FR-13 Exercise record.** For hospital exercises, the after-action report groups findings under the Joint Commission six critical areas, with a record of the annual exercise as in spec 0451 FR-15 (an aid, not a compliance claim).

**Knowledge and reuse**

- **FR-14 Document library.** A public-domain library pack: the CDC Vaccine Storage and Handling Toolkit, FDA drug shortage and recall pages and 506C guidance, 42 CFR 482.25 and 21 CFR 1301.76 as generated regulation extracts, ASPR TRACIE pharmacy and drug shortage resources, FEMA Healthcare Facilities and Power Outages; each license and URL verified when building the pack. ASHP, USP and Joint Commission documents are named, not bundled.
- **FR-15 Examples.** (1) A critical IV fluid shortage for a fictional community hospital, using real FDA shortage records for the board. (2) A vaccine freezer failure at a fictional county clinic. (3) A claims switch outage at a fictional independent pharmacy. (4) A diversion case in a fictional hospital pharmacy.
- **FR-16 Reuse by other domains.** Suggested toolkits added to `healthcare`, `nursing` (spec 0452), `health_informatics` (spec 0451), `public_health` (vaccine programs, dispensing sites), long-term care, and later EMS, behavioral health, humanitarian response, animal health and research labs; reuse of the clinical care and clinical systems toolkits is by reference to specs 0452 and 0451, and of supply chain by reference to #695 once specified.

### Non-functional requirements

- **NFR-1 Cost:** only the free openFDA endpoints and bundled data; no keys; the connector fetches only on the user's request.
- **NFR-2 Privacy:** the connector contacts only the fixed FDA host after consent and sends only the search terms; no patient data of any kind enters the app; prescription and patient examples are synthetic; imported documents are scanned for identifiers (spec 0433).
- **NFR-3 Accessibility:** every figure has a text summary and data table; temperature excursion shading and status colors carry words and patterns; the shortage board exports as an accessible table.
- **NFR-4 Accuracy:** formats and regulatory statements verified against the sources in the dossier with retrieval dates; clinical content (substitutions, ranges) is scenario content marked as exercise content and is not guidance; a review by a health-system pharmacy director and, for cold chain, an immunization program staff member before release (owner to arrange).
- **NFR-5 Data caveat:** FDA shortage records are shown with their dates and the disclaimer; the app never presents them as the current state of supply.

### Out of scope

- Drug interaction or dosing references, clinical decision support or a formulary.
- Connecting to wholesaler, switch, state monitoring program or cabinet systems.
- Legal advice on controlled substance or compounding law; the app states what the cited rules say and when it checked.
- Modeling pharmacy benefit design or reimbursement.
- The supply chain toolkit itself (#695).

## Design

- **Domain:** `packs/domains/pharmacy.json` with variants as role sets, extending `healthcare` (ADR-0014).
- **Toolkit:** `packs/toolkits/pharmacy/` (toolkit JSON, templates, knowledge fragments, lint configuration, decision forms, consequence rules table, fictional product range table for viability).
- **Figures:** `src/main/render/figures/pharmacy/` (cold chain chart, days-on-hand, queue, controlled substance usage, recall tracing); generic kinds from spec 0448 used where they suffice.
- **Connector:** `src/main/toolkits/connectors/openfda_shortages.ts` (fixed host `api.fda.gov`, an estimate from the response's `meta.results.total`, paging within the limit, recorded-response tests); a sibling `openfda_enforcement.ts` for recalls once its fields are verified.
- **Simulation:** `src/main/toolkits/pharmacy/{shortage,coldchain,diversion,queue}.ts`, deterministic given a seed; shared patient generator from spec 0451.
- **Lint:** rule kinds `ndc_format` and `temperature_range_pair` added to the fixed lint set of spec 0448 FR-1.

## Security and privacy

As spec 0448: fixed service host per connector, size limits, files only in the scenario folder, consent before fetching, no keys. No patient data; synthetic generator output only; packs contain no vendor credentials or logos; DEA registration numbers and NDCs in exercise products are fictional unless quoted from a dated FDA record.

## Testing

Golden images for each figure; connector contract tests with a recorded openFDA response and an opt-in live test (`LIVE=1`); NDC and temperature lint tests; shortage model tests (days on hand equals on-hand over usage; allocation changes the projected stockout); cold chain model tests (temperature curve crosses the range at the expected time for fixture parameters); diversion model tests (the divergent user stands out in the fixture); regulatory clock tests on worked examples (one business day and 45 days); example projects generated end to end with the local model before release.

## Tasks

1. **#899** Pharmacy domain profile extending healthcare, variants, threat families and arcs (FR-1, FR-2).
2. **#900** Pharmacy templates and format lint (FR-3, FR-4).
3. **#901** Pharmacy figures: cold chain chart, days on hand, queues, usage, recall tracing (FR-5).
4. **#902** openFDA shortage connector and shortage replay (FR-6).
5. **#903** Historical seeds and document library pack (FR-7, FR-14).
6. **#904** Shortage, queue and cold chain simulation models (FR-8).
7. **#905** Diversion model and controlled substance products (FR-3, FR-8).
8. **#906** Pharmacy decisions and consequence rules (FR-9, FR-10).
9. **#907** Metrics, EEGs and exercise record (FR-11–FR-13).
10. **#908** Examples and reuse in other domains, user guides (FR-15, FR-16).

## Open questions

- **Practitioner review.** Recommendation: a health-system pharmacy director for shortage and diversion content, and an immunization program coordinator for cold chain.
- **Shortage history.** The openFDA endpoint returns current records, and no history by date was verified. Recommendation: store the fetch as a dated snapshot; for past shortages, use the narrative seeds and say so.
- **Recall data.** The enforcement endpoint was not checked. Recommendation: verify fields and terms in the connector task before promising recall replay.
- **Supply chain toolkit order.** If #695 is not built first, the recall tracing figure is built here and moved into the supply chain toolkit later. Recommendation: build it in the pharmacy toolkit with a stable figure id so the move is a relocation, not a change.
