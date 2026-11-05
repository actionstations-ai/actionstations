# Spec 0465: Law enforcement, corrections and courts — the justice toolkit

Issue: #698 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #697 (human services, spec 0464, for the service level, time to completion and needs coverage metrics and reunification), #691 (crisis communications) · Research: [docs/research/domains/justice.md](../research/domains/justice.md)

## Summary

A `justice` domain and a **justice toolkit** let Action Stations exercise police and sheriff's offices, jails and prisons, and courts at the level where their hardest decisions are made: who takes command and who joins unified command, what families and the public are told and when, whether an AMBER alert criteria set is met, how a jail reconciles its count, and which court functions keep running when ransomware takes the case management system down. Players work with CAD chronologies, fictional coordination-level radio traffic, negotiation logs, count sheets, docket continuity boards and court orders, make structured decisions, and are scored on time to unified command, communication with families and media, and continuity of court operations. The toolkit stays at the coordination and decision level by design: it never teaches tactics (FR-7). Other domains (municipal, K-12, campus, venues, transit, airports, healthcare) reuse its unified command and dispatch pieces.

## Requirements

### User stories

- As a sheriff's training lieutenant, I want an active assailant exercise where agencies from three jurisdictions arrive within minutes and the first hour is about who commands, who is at the command post, and what we tell families, not about tactics.
- As a chief of a small department, I want to practice requesting mutual aid and agreeing in advance who leads a multiagency response, because our neighbors will respond to us.
- As a crisis negotiation team leader, I want an exercise where the incident commander needs updates and decisions at set times and negotiators' notes do not reach the wrong people.
- As an investigations commander, I want to walk through the AMBER alert criteria with a missing-child case that does not clearly meet them, and see what we decide and how fast.
- As a jail administrator, I want a disturbance and a medical emergency during a shift change, with a count that does not reconcile.
- As a court administrator, I want a ransomware scenario that closes e-filing and the case management system, so my staff decide what to run on paper, which hearings continue, and what to tell the bar and public.
- As a criminal justice instructor, I want students to play the command post, dispatch and the public information officer for a fictional incident, with scoring on decisions, not tactics.

### Functional requirements

**Domain**

- **FR-1 Justice domain.** A `justice` domain profile with variants for a municipal police department, a sheriff's office with jail, a campus or transit police department, a correctional facility, and a court (trial court or statewide judiciary): the roles, systems, outside parties and phrasing in the research dossier (sections 2–3), aliases as listed. The existing municipal, k12_schools, campus and emergency_communications domains reference it as a partner variant.
- **FR-2 Threat families and arcs.** Families for active assailant (single site, complex coordinated), barricaded subject with negotiation, missing child, civil unrest, corrections disturbance or medical emergency, evidence integrity failure, and the shared **service degradation** family (court ransomware, courthouse evacuation, jail power or communications loss, dispatch failure), each with the phase arc in the dossier (section 8), using extensible families (spec 0448 FR-15).

**Toolkit: products**

- **FR-3 Incident command and dispatch products.** Templates for the CAD incident chronology and unit status board, fictional radio traffic transcripts, the incident's ICS forms (existing templates), unified command briefing, mutual aid request, staging and reunification site plan (shared with spec 0464), joint information center statement, and a family assistance notice.
- **FR-4 Negotiation and missing child products.** Templates for the negotiation log (contact times, decision requests and welfare indicators at the level of "agreed to speak", never technique), the negotiation team activation and update to the incident commander, the AMBER alert activation worksheet (the five recommended criteria as a checklist with the commander's reasoning), database entry confirmation, alert text, tip log, and a media briefing.
- **FR-5 Corrections products.** Templates for the count sheet and reconciliation, movement log, incident report, lockdown notice, population and capacity dashboard, medical emergency report, facility evacuation plan activation, and external notification list.
- **FR-6 Court continuity products.** Templates for the court closure order, emergency docket order, e-filing outage notice, remote hearing notice, jury notice, notice to the bar, public statement, continuity status board (essential functions with recovery time objectives and status), ransomware outage tickets and a non-functional ransom note, and an evidence chain-of-custody log with an audit discrepancy memo.
- **FR-7 Guardrails.** The generator, templates and lint enforce the level of detail rule: no tactical instruction (entry or breaching methods, weapons handling, positioning, force options), no ways to defeat security or detention measures, no attack planning content, no real facility floor plans or security weaknesses, and no real individuals. Radio traffic and logs use unit names, building-level locations and statuses. Scenarios about perpetrators are written without glorifying them, and public messages do not name the perpetrator **[U: cite the "no notoriety" style guidance in the pack]**. A negotiation scenario's subject is fictional and the log does not contain technique. Knowledge fragments carry the sources and dates of the rules they teach (criteria for AMBER alerts, unified command principles, court continuity concepts). A reviewer from law enforcement checks the guardrails before release (NFR-4).

**Toolkit: figures and data**

- **FR-8 Figures.** Figure kinds (spec 0448 FR-4/FR-6) for: CAD unit status board (units by status over time, building-level site map), incident timeline (first arrival, command post, unified command, mutual aid, public statements, family center), jail population and capacity by housing area with count status, court continuity board (essential functions against recovery time objective with a Gantt style view), caseload and filings backlog chart, and a map of the incident area with staging, command post and family center. Each has the text summary and data table of spec 0448 FR-5.
- **FR-9 Replay and baselines.** Connectors for: city open data calls for service (Seattle Police call data and San Francisco dispatched calls as the first two, fields mapped to a common CAD record) to build realistic call volumes and response time baselines for a scenario's city; BJS jail statistics (average daily population, admissions, rates by state) as baselines for facility sizes; FBI active shooter incident reports for counts and characteristics used as context (aggregate only); AMBER Alert program statistics **[U]**. All fetched once, with consent and a size estimate; no keys. No connector fetches or stores incident-level detail about real victims or suspects.
- **FR-10 Simulated events.** Parametric generators (spec 0448 FR-10) for: a call surge with units dispatched and arrival times; an incident timeline with agencies arriving at configurable times and command established at configurable times (so the metric can be exercised); a jail count with configurable discrepancy and housing movement; a court outage with systems, restoration order and dependencies (case management, e-filing, public website, telephones); an evidence audit with configurable discrepancy counts. All labeled simulated.

**Exercise play and evaluation**

- **FR-11 Structured decisions** (spec 0448 FR-14): "Establish command post" (location at building level, IC), "Establish unified command" (agencies), "Request mutual aid" (who, what kind, time), "Activate negotiation team", "Open family reunification or assistance center" (site), "Issue public statement" (channel, content summary), "Decide AMBER criteria" (each of the five criteria met or not, rationale), "Issue AMBER alert" (area, time), "Lock down or evacuate a housing area or facility", "Declare count clear", "Close the courthouse or a function" (scope, duration), "Move to paper filing", "Restore system" (order), "Notify the bar and public".
- **FR-12 Metrics.** Using the generic metrics of spec 0464 FR-11 and 0448 FR-12: **time to completion** configured for time to unified command (first arrival to named IC and staffed command post with all required agencies), time to family center open, time to accurate count, and time to restore each court function; **decision timing** for AMBER issue time against the decision and database entry; **message consistency** across agencies' statements; and **service level** for dispatch (call answer and unit response times) when a dispatch failure is simulated. Results show the inputs used and avoid scoring tactics.
- **FR-13 Core capabilities.** EEGs for Operational Coordination, Operational Communications, Public Information and Warning, On-scene Security Protection and Law Enforcement, Situational Assessment, Mass Care Services (reunification), and Cybersecurity (courts), with critical tasks at the coordination level (for example: command established and communicated, mutual aid requested through agreed channels, unified command with fire/EMS, joint information system activated).

**Knowledge and reuse**

- **FR-14 Document library.** A library pack of public-domain material (verify each license and URL when building): the FBI active shooter incident reports, the U.S. Fire Administration active shooter guide, FEMA's complex coordinated attack planning considerations, CISA's active shooter planning and response document, the DOJ COPS critical incident reviews (Orlando Pulse response, Robb Elementary response), the AMBER Alert program guidance, the National Institute of Corrections emergency guides for jails and prisons, CISA and FBI ransomware guidance, and the NIMS and ICS forms. NCSC and state court material is linked unless its terms allow bundling. Accreditation standards and commercial training material are named, never copied.
- **FR-15 Examples.** (1) A multi-agency active assailant at a fictional high school, command and family reunification focus, with the K-12 domain and the human services toolkit. (2) A missing child and AMBER decision for a fictional county sheriff's office. (3) A fictional county jail disturbance and medical emergency with a count discrepancy. (4) A fictional state trial court ransomware outage, shaped by public descriptions of recent court incidents.
- **FR-16 Reuse by other domains.** Suggested toolkits added to the municipal, k12_schools, campus, emergency_communications, stadium_venue, transit, airport, healthcare, elections, port_maritime and data_center_it profiles; the municipal profile gains law enforcement roles in its EOC; emergency_communications links dispatch failure scenarios to the justice dispatch toolkit; the campus and k12_schools profiles link their active threat scenarios to the unified command products.

### Non-functional requirements

- **NFR-1 Cost:** only free public data and open data portals; no accounts or keys.
- **NFR-2 Privacy:** no real victims, suspects, inmates or case numbers; case data is aggregate or fictional; connectors fetch only on the user's request and send nothing about the plans; the pack states that Action Stations is not a records or evidence system.
- **NFR-3 Accessibility:** every figure has a text summary and table; status colors carry words; court notices and public statements have plain-language and translated variants (spec 0435).
- **NFR-4 Accuracy and review:** formats checked against the cited sources and dated; a review by a law enforcement trainer who has run multi-agency exercises and a court administrator before release (owner to arrange); a corrections practitioner checks the jail products; products marked as exercise products.
- **NFR-5 Care:** content notice at the briefing for scenarios involving violence against children or in schools; facilitators get a wellbeing check script (shared with spec 0464 FR-13).

### Out of scope

- Tactics, techniques and procedures of any kind (FR-7).
- Real-time connection to CAD, jail or court systems; live data during a session.
- Legal advice; examples show decisions, not holdings.
- Forensic analysis content.

## Design

- **Domain:** `packs/domains/justice.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/justice/` (toolkit JSON, templates, knowledge fragments with sources and dates, guardrail fragments, lint configuration).
- **Figures:** `src/main/render/figures/justice/` (unit status board, incident timeline, jail population, court continuity board, backlog chart); incident map overlays from spec 0448.
- **Connectors:** `src/main/toolkits/connectors/{open_cad,bjs_jails,fbi_asi}.ts`, each with an estimate, a fetch cropped to the scenario city and period, and recorded-response tests. The two CAD portals are mapped to one record shape by a small adapter table.
- **Simulation:** `src/main/toolkits/justice/simulate.ts` (dispatch arrivals, incident milestones, jail count, court outage dependency graph, evidence audit).
- **Guardrails:** a generation-time rule fragment and a lint check (a blocklist and an allowlist of unit and location vocabulary) applied to justice toolkit output; tests with adversarial prompts.
- **Metrics:** configured instances of the metrics in specs 0448 and 0464.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching, no keys. Open data call records are aggregated before being stored (no addresses or free text); generated scenarios use fictional organizations and places consistent with the project naming rule (real cities allowed as geography, fictional departments and people). The guardrails in FR-7 are also a safety property: the pack must not become a source of tactical or attack-planning content.

## Testing

Golden images for each figure; connector contract tests with recorded responses and opt-in live tests; simulation tests (the incident timeline honors configured arrival and command times; the jail count discrepancy is recoverable from the movement log; the court outage restoration order respects dependencies); metric tests for time to unified command on worked examples; guardrail tests that run a set of adversarial prompts and fail on tactical or planning terms; AMBER checklist logic tests (five criteria, partial sets); example projects generated end to end with the local model before release.

## Tasks

1. **#716** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#717** Incident command and dispatch toolkit templates (FR-3).
3. **#719** Crisis negotiation and missing child (AMBER) templates (FR-4).
4. **#721** Corrections templates (FR-5).
5. **#725** Court continuity templates (FR-6).
6. **#728** Guardrails: coordination-level generation rules, lint and tests (FR-7).
7. **#731** Justice figures and status boards (FR-8).
8. **#734** Replay and baselines from open CAD, jail, crime and active shooter data; simulated events (FR-9, FR-10).
9. **#737** Decisions, metrics and core capabilities (FR-11–FR-13).
10. **#740** Document library, examples and reuse in other domains, user guides (FR-14–FR-16).

## Open questions

- **Practitioner review.** Recommendation: a state POST or academy instructor who runs unified command exercises, a jail administrator or National Institute of Corrections trainer, and a state court administrative office continuity lead.
- **Guardrail strictness.** A blocklist can block legitimate after-action vocabulary. Recommendation: start strict for generation and lint, let a reviewer widen the allowlist, and log what was blocked.
- **Negotiation scenarios.** Some practitioners will want technique content. Recommendation: keep it out of scope and offer the decision-level log only; link published team-selection and training sources.
- **Which open data portals.** Seattle and San Francisco are the two verified; adding more cities depends on their terms and fields.
