# Spec 0464: Behavioral health and human services — crisis lines, mass care, reunification and child welfare

Issue: #697 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #647 (meteorology, spec 0449), #690 (epidemiology), #691 (crisis communications) · Research: [docs/research/domains/human_services.md](../research/domains/human_services.md)

## Summary

A `human_services` domain and a **human services toolkit** let Action Stations exercise the people who help others on the worst days: 988 Suicide & Crisis Lifeline centers facing a surge of contacts, shelter teams opening a general population shelter for a hurricane or wildfire, school and venue staff reuniting children with families, and child welfare agencies finding children displaced by a disaster. Players work with the products they use (queue and wait-time reports, shelter status and needs reports, reunification rosters, displaced-children lists), make structured decisions under time pressure, and are scored on measures the field already uses: answer rates and wait times, shelter needs met, time to reunify. Real public data (open shelter locations, electricity-dependent population counts, published 988 statistics) can drive figures; simulated surges fill the rest. The toolkit is reusable by municipal, K-12, campus, emergency communications, healthcare, public health and the humanitarian field (spec 0469).

This spec adds three generic evaluation metrics (service level, time to completion, needs coverage) that justice (spec 0465) and humanitarian (spec 0469) also use.

## Requirements

### User stories

- As a 988 center director, I want a surge exercise where contacts double after a community tragedy and two counselors call out, so my supervisors practice overflow, backup and staffing calls and I can see our answer rate under stress.
- As a county mass care coordinator, I want to open a shelter for a hurricane with residents who use oxygen, wheelchairs and service animals, and see which needs we met and how fast.
- As a school district safety director, I want a reunification exercise after a bus crash or a campus incident, with parents arriving faster than staff can verify identity.
- As a state child welfare disaster coordinator, I want an exercise where a flood displaces foster families and caseworkers, and I must locate every child within our plan's targets.
- As a social work instructor, I want students to run a shelter's mental health table and practice psychological first aid with fictional residents.
- As an emergency manager, I want the shelter and crisis line pieces to plug into my county exercise without building a human services exercise.

### Functional requirements

**Domain**

- **FR-1 Human services domain.** A `human_services` domain profile with variants for a crisis center (988 and other lines), a mass care and shelter team, a reunification team, and a child welfare or social services agency: the roles, systems, outside parties, media channels and phrasing in the research dossier (sections 2–3), aliases as listed. Domain-neutral phrasing: no state is assumed; the 988 national network and a state coordinator are the defaults.
- **FR-2 Threat families and arcs.** Families for crisis line surge, shelter operations, reunification, displaced children in care, and responder stress, plus the shared **service degradation** family (telephony or text outage, staffing shortfall, cyber incident, misinformation), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**Toolkit: products and knowledge**

- **FR-3 Crisis line products.** Templates for the daily contact report, network surge notice, backup activation notice, queue wait-time board, staffing coverage summary, supervisor escalation, de-identified contact summary (fictional, safe-messaging compliant, FR-13), and state coordinator briefing.
- **FR-4 Shelter products.** Templates for the shelter status report, open shelters list, FNSS support request, registration form, daily count, incident report, health referral, closing report, and EOC mass care request.
- **FR-5 Reunification and child welfare products.** Templates for the reunification plan and site layout, roster, release log, parent notification text, "where is my child" call script, unaccompanied and unreleased student tracker, displaced-children-in-care list, state disaster plan activation notice, and crisis counseling immediate services request.
- **FR-6 Format rules and knowledge.** Generator knowledge and lint for: 988 routing and rerouting behavior (calls about 2 minutes to backup, texts and chats about 5 minutes, Spanish contacts cannot be rerouted) with the dated note that these are the March 2026 values; the FNSS principle that general population shelters integrate people with access and functional needs rather than create a separate tier; the role split in reunification (check-in, retrieval, release, exceptions) and that release authority is verified by identity; child welfare plan elements (identify, locate, continue services); the crisis counseling program durations (immediate up to 60 days, regular up to nine months). Rules are labeled with their source and date so a user can see why a draft says what it says.

**Toolkit: figures and data**

- **FR-7 Figures.** Figure kinds (spec 0448 FR-4/FR-6) for: contact volume and answer rate time series by contact type with target lines; queue board (rows of wait by channel); staffing coverage against demand; shelter dashboard (population against capacity by site, needs counts by category, supply status); shelter map with open shelters and an optional electricity-dependent population overlay; reunification flow board (arrived, verified, released, pending, exceptions) with a timeline; displaced-children tracker (located, contacted, placed, unknown). Each has the text summary and data table of spec 0448 FR-5.
- **FR-8 Replay and baselines.** Connectors (spec 0448 FR-8) for: FEMA open shelters (a snapshot the user captures now and keeps as case data, since the service does not offer history; labeled with its capture date), HHS emPOWER aggregate counts by ZIP or county, published 988 national and state statistics as baselines for a surge (SAMHSA, network administrator, GAO dataset), and CDC/ATSDR Social Vulnerability Index by tract **[U: confirm terms]**. All fetched once, with consent and a size estimate, then used offline. Fixed hosts per connector; no keys.
- **FR-9 Simulated events.** Parametric generators (spec 0448 FR-10) for: a contact surge (baseline arrivals, a multiplier and decay, staffing shortfall, channel mix, rerouting timers) producing consistent queue series; shelter population growth with needs mix drawn from configurable rates; reunification arrivals and verification throughput; displaced children by placement type. All labeled simulated.

**Exercise play and evaluation**

- **FR-10 Structured decisions** (spec 0448 FR-14): "Activate surge plan" (actions chosen from a list: overflow, pause outbound work, request backup, change scripts), "Request backup support" (from whom, time), "Open shelter" (site, capacity, opening time), "Close or consolidate shelter", "Assign FNSS support" (need, resource), "Activate reunification site" (site, roles), "Release student to guardian" (exception handling when identity cannot be verified), "Locate displaced child" (method), "Request crisis counseling program", "Issue public statement".
- **FR-11 Metrics.** Three new generic built-in metrics (app code, configured by packs, spec 0448 FR-12): **service level** (from a time series of offered, answered and abandoned work: answer rate, share answered within a threshold, time to answer, longest wait, abandonment, optionally with a rerouting timer; targets configurable, defaults taken from published goals with their source shown), **time to completion** (elapsed time from a start event to a completion event for a population, with median and slowest values, such as doors open after decision, all students released, all displaced children located), and **needs coverage** (share of recorded needs met, and time to meet each, by category). The existing **threshold timing** metric covers shelter opening against the arrival of a hazard condition.
- **FR-12 Core capabilities.** EEGs for Mass Care Services, Public Information and Warning, Operational Communications, Operational Coordination, Situational Assessment and Health and Social Services, with critical tasks specific to a surge, a shelter, a reunification and a child welfare disaster plan.
- **FR-13 Safeguards.** (a) **Safe messaging:** generated injects and examples never include method or means detail, never present suicide as a solution, and follow published safe-messaging principles for any public message **[U: cite the specific guidance in the pack]**; contact summaries are fictional, de-identified and clearly marked. (b) **Exercise labeling:** public-facing messages and handouts that include a real helpline number carry an "EXERCISE" banner, and exercise materials never ask a player to contact a real line. (c) **Content notice:** when a scenario includes self-harm, abuse or child-loss material, Action Stations shows a content notice at the briefing and facilitators get a wellbeing check script and a "stop and step out" option. (d) **Psychological first aid:** a knowledge fragment and handouts (eight core actions) for hot washes and responder-stress injects.

**Knowledge and reuse**

- **FR-14 Document library.** A library pack of public-domain material (verify each license and URL when building): FEMA's FNSS guidance, the Shelter Field Guide, the ESF #6 annex, the Children's Bureau and state child welfare disaster plan templates, FEMA crisis counseling program guidance, FEMA reunification fact sheets, the NIMS and ICS forms the shelter teams use, and the DOJ COPS reunification publication. The PFA Field Operations Guide is bundled only if its license allows; otherwise it is linked. Copyrighted or trademarked methods (the Standard Reunification Method, Red Cross shelter training material) are named and linked, never copied.
- **FR-15 Examples.** (1) A 988 surge for a fictional state crisis center after a community tragedy. (2) A hurricane shelter for a fictional coastal county with an access and functional needs focus. (3) A school bus crash and reunification for a fictional district, using the K-12 domain. (4) A flood and child welfare continuity exercise for a fictional state agency.
- **FR-16 Reuse by other domains.** Suggested toolkits added to the municipal, k12_schools, campus, emergency_communications, healthcare, public_health, stadium_venue and humanitarian profiles; the municipal profile gains the mass care branch roles; the k12_schools and campus profiles gain a reunification variant; emergency_communications gains the 988 interplay (transfers between 988 and 911).

### Non-functional requirements

- **NFR-1 Cost:** only free public data; no accounts or keys.
- **NFR-2 Privacy:** no client, caller or resident data is entered; examples are fictional and de-identified; connectors fetch only on the user's request and send nothing about the plans; case data stays in the scenario folder. Action Stations is not a records system and the pack says so.
- **NFR-3 Accessibility:** every figure has a text summary and table; status colors always carry words; shelter FNSS content is itself accessible (plain language, large-print and screen-reader packets from spec 0435); translated and interpreter-need scenarios supported.
- **NFR-4 Accuracy:** formats and routing rules checked against the cited sources and dated; a review by a crisis line director and a mass care lead before release (owner to arrange); products marked as exercise products.
- **NFR-5 Care:** the safeguards in FR-13 are part of acceptance for every example and template.

### Out of scope

- Real-time connection to 988 platforms, shelter databases or student information systems.
- Clinical guidance, risk assessment scripts or counselor training content beyond psychological first aid and fictional summaries.
- Live data during a session.

## Design

- **Domain:** `packs/domains/human_services.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/human_services/` (toolkit JSON, templates, knowledge fragments with sources and dates, lint configuration, safeguard fragments).
- **Figures:** `src/main/render/figures/human_services/` (contact series, queue board, staffing coverage, shelter dashboard, reunification flow, displaced-children tracker); shelter map overlays from spec 0448.
- **Connectors:** `src/main/toolkits/connectors/{fema_shelters,empower,lifeline_stats,svi}.ts`, each with an estimate, a fetch cropped to the scenario area, and recorded-response tests.
- **Simulation:** `src/main/toolkits/human_services/simulate.ts` (arrival process with surge multiplier and decay, queue model with staffing and rerouting timers, needs mix, reunification throughput).
- **Metrics:** `src/main/evaluation/metrics/{service_level,time_to_completion,needs_coverage}.ts`; justice and humanitarian configure them.
- **Safeguards:** a generation-time rule set and a lint check for method or means detail terms in crisis scenarios; the exercise banner is a template partial.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching, no keys. Generated crisis content stays fictional; no real person is named (project naming rule); real phone numbers appear only where FR-13(b) allows.

## Testing

Golden images for each figure from fixtures; connector contract tests with recorded responses and opt-in live tests; simulation tests (queue wait grows with offered load; rerouting timers move contacts after the stated times); metric tests on worked examples (answer rate and wait percentiles from a small series; time to completion with open items; needs coverage); lint tests for safe-messaging terms; template tests for the exercise banner; example projects generated end to end with the local model before release.

## Tasks

1. **#706** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#707** Crisis line toolkit templates and knowledge (FR-3, FR-6).
3. **#708** Mass care and shelter toolkit templates and knowledge (FR-4, FR-6).
4. **#709** Reunification and child welfare templates and knowledge (FR-5, FR-6).
5. **#710** Human services figures and status boards (FR-7).
6. **#711** Replay connectors and baselines for shelters, electricity-dependent populations and crisis line statistics (FR-8).
7. **#712** Simulated surges, shelter populations and reunification flows (FR-9).
8. **#713** Decisions, metrics and core capabilities (FR-10–FR-12).
9. **#714** Safeguards for sensitive content and psychological first aid knowledge (FR-13).
10. **#715** Document library, examples and reuse in other domains, user guides (FR-14–FR-16).

## Open questions

- **Practitioner review.** Recommendation: a crisis center director (a state 988 coordinator can introduce one) and a county mass care lead; for safeguards, a clinician with crisis line experience reviews FR-13 before any example ships.
- **Bundling the PFA guide.** The source page states no terms; decide after reading the PDF's own notice, otherwise link it.
- **Targets.** Defaults for answer rate and wait come from published goals; whether to ship any default or leave blank until a center enters its own. Recommendation: ship the published goal as a labeled default and let each center overwrite it.
- **Shelter history.** The open shelters service has no history, so a past-event replay needs the user's own capture. Recommendation: offer a "capture now" button during real activations and ship fictional shelter data for examples.
