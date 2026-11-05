# Spec 0470: Hospitality, tourism and cruise — the hospitality domain and guest emergency toolkits

Issue: #703 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/hospitality.md](../research/domains/hospitality.md)

## Summary

Action Stations can exercise the people who look after guests away from home: a cruise line's ship and shoreside teams, a hotel or resort, and a destination tourism board. They work a gastroenteritis outbreak at sea (case counts, the 2 and 3 percent thresholds, reports to the CDC, isolation, cleaning, the boarding decision for the next voyage), a hurricane that affects a resort or an itinerary, a guest death or serious injury, a hotel cyber attack on reservations and keycards, or a security incident in a lobby. They are scored on guest safety and accounting, port and health authority notifications, and communications. Two toolkits (**outbreak at sea** and **guest emergency**) carry the products and figures, and they reuse the epidemiology toolkit (#690), the weather toolkit (spec 0449), crisis communications (#691) and the existing `commercial_facilities`, `port_maritime` and `stadium_venue` profiles by reference.

## Requirements

### User stories

- As a cruise line's shoreside medical director, I want an outbreak exercise where the ship's counts cross 2 percent and then 3 percent while the ship is two days from a US port, and my team must report, advise on cleaning and decide on the next voyage.
- As a ship's master and hotel director, I want a muster and accounting exercise where passengers and crew are not all accounted for, and a medical emergency is happening at the same time.
- As a resort general manager, I want a hurricane exercise where guest departures depend on flight and road clearance, and the front office has to account for every guest.
- As a hotel security director, I want a lobby incident exercise with guest messaging and law enforcement coordination.
- As a tourism board director, I want a crisis exercise where a disaster hits the destination and we must coordinate messages with hotels, the airport and emergency management.
- As a hospitality instructor, I want a case with roles for the front office, housekeeping, communications and the general manager.

### Functional requirements

**Domain**

- **FR-1 Hospitality domain.** A `hospitality` domain profile with variants for a cruise line (ship and shoreside), a hotel or resort, and a tourism board; roles, systems, outside parties and phrasing as in the dossier (sections 2–3). The hotel variant extends the lodging roles of `commercial_facilities` by reference and does not copy them.
- **FR-2 Threat families and arcs.** Health (outbreak at sea or in a property), natural hazards affecting a property or itinerary, safety and security (fire, armed threat, man overboard, serious injury, death), and cyber (reservations, property management, keycards), with the phase arcs in the dossier (section 9), using extensible families (spec 0448 FR-15).

**Outbreak at sea toolkit**

- **FR-3 Products as templates.** Exact, legible templates for: the cumulative gastroenteritis (AGE) report (24-hour and 4-hour reports, counts for passengers and crew, zero reports), special report at 2 and 3 percent, outbreak response checklist, passenger and crew letters (notice, cabin isolation, itinerary change, compensation offer), port health notification, boarding decision memo for the next voyage, and shoreside situation report.
- **FR-4 Knowledge and lint.** Generator knowledge states the reporting rules and thresholds in the dossier (section 5): immediate report of death or illness, the 24-hour and 4-hour AGE reports for ships with 13 or more passengers, CDC support at 2 percent and outbreak at 3 percent, and the ship's response actions. Lint checks: percentages equal cases divided by persons on board; cumulative counts never decrease; reports are timed relative to arrival; a letter names the real action steps without medical advice beyond the cited guidance; the ship, line and port are fictional.
- **FR-5 Guest emergency toolkit.** Templates for: muster and passenger accounting report, man overboard checklist and search plan, alleged crime report to the FBI and Coast Guard (for serious categories), in-house guest list and floor evacuation status, hurricane guest departure plan and shelter-in-place notice, guest death or serious injury notification checklist (family contact, consulate, coroner), hotline script, family reunification message, media holding statement. The existing `pms_outage_board` and `guest_letter` templates are reused.

**Figures**

- **FR-6 Figures.** Figure kinds (spec 0448 FR-4): outbreak epidemic curve by onset day with the 2 and 3 percent lines (from the epidemiology toolkit's curve), muster and accounting board (mustered, missing, cabins checked), floor-by-floor evacuation status for a tower, itinerary map with ports, storm cone and port status (weather toolkit overlays), guest departures against road and flight clearance (timeline). Each produces the text summary and data table of spec 0448 FR-5.

**Data and simulation**

- **FR-7 Simulated outbreak.** From parameters (ship size, persons on board, attack rate, onset curve, isolation and cleaning effect, days to port) use the epidemiology generator (#690) to produce consistent case data: daily cases by passengers and crew, medical log entries, threshold crossings, and the reports a ship would send. All labeled simulated. CDC's public outbreak updates may be read as a pacing reference (consent, size estimate), never as a source of real ship names in exercises.
- **FR-8 Simulated guest emergencies.** Generators for muster results with a planted number of unaccounted persons, a fire on a chosen floor with guest counts, a hurricane approach with property and flight timelines, and a cyber outage timeline for a property management system and keycards.

**Regulations and clocks**

- **FR-9 Regulation pack.** Pack data (spec 0426): `cdc_ship_illness_reporting` with triggers "death or illness onboard" (immediate report), "AGE 24-hour report point", "AGE 4-hour report point", "2 percent reached" and "3 percent reached". The report points are milestones the scenario places at arrival minus 24 hours and minus 4 hours; the facilitator or the case data fires the 2 and 3 percent triggers when counts cross them. A small engine extension (Open question 1) would let a clock be defined as a time before a scheduled event. Status `in_force`, `verifiedOn` dated, source links to 42 CFR 71.21 and the CDC pages. FBI/Coast Guard crime reporting is added as guidance after the statute text is checked.

**Exercise play and evaluation**

- **FR-10 Structured decisions.** Forms: "Report to authority" (which, time, content), "Isolate and clean" (scope, resources), "Itinerary or port change" (new plan, reason), "Boarding decision for next voyage" (proceed, delay, with conditions), "Evacuate or shelter" (property or ship, zones), "Guest accounting" (method, status), "Notify family or consulate", "Public statement" (audience, key message).
- **FR-11 Metrics and core capabilities.** From the built-in set (spec 0448 FR-12): time to account for all persons; unaccounted at each time; authority reports filed on time against the report points; time from threshold crossing to action; message consistency across guest, family, media and employee messages. EEGs for Public Health, Healthcare and EMS; Mass Care Services; Operational Communications; Public Information and Warning; On-scene Security, Protection and Law Enforcement; and Fatality Management Services, with hospitality critical tasks.

**Knowledge**

- **FR-12 Document library.** A public-domain library pack: 42 CFR 71.21; CDC Vessel Sanitation Program Operations Manual and Environmental Public Health Standards; CDC outbreak updates page and MMWR surveillance summary; CDC norovirus guidance; FDA Food Code; Cruise Vessel Security and Safety Act text and DOT quarterly reports; USCG guidance; FEMA and USFA hotel fire safety material; CISA Commercial Facilities CTEP situation manual (verify each license and URL when building the pack). SOLAS and ISM Code text are cited, not bundled.
- **FR-13 Examples.** (1) A fictional cruise line: norovirus outbreak on a 7-night itinerary returning to a US port, with the CDC reports and the boarding decision. (2) A fictional resort: hurricane guest departure and accounting with the weather toolkit. (3) A fictional hotel: reservation system cyber attack on a holiday weekend with a lobby security incident (extends the existing `commercial_facilities` hotel scenario).
- **FR-14 Reuse.** Suggested toolkits added to the commercial facilities, stadium and venue, port and maritime, airport, campus, K–12 (field trips), healthcare, public health and emergency communications profiles; the outbreak response products suit any congregate setting.

### Non-functional requirements

- **NFR-1 Cost:** only free public sources; no accounts or keys.
- **NFR-2 Privacy:** CDC pages are contacted only when the user fetches them for a scenario; exercise guests, passengers and crew are fictional; no real ship, cruise line or hotel brand appears in generated documents.
- **NFR-3 Accessibility:** every figure has a text summary and data table; letters can be exported as accessible documents and translated (spec 0435); thresholds are shown with words and numbers, not color alone.
- **NFR-4 Accuracy:** regulation data carries `verifiedOn` and is re-checked each release (spec 0426 FR-16); the AGE case definition is quoted only after reading the VSP manual; a review by a hotel or cruise safety manager and a public health professional with maritime experience before release (owner to arrange).

### Out of scope

- Medical diagnosis or treatment advice in generated material.
- Live ship tracking or CDC data during a session.
- Real regulatory submissions to CDC or the FBI.
- Maritime navigation or stability simulation.

## Design

- **Domain:** `packs/domains/hospitality.json` (bundled) with variants as role sets.
- **Toolkits:** `packs/toolkits/outbreak_at_sea/` and `packs/toolkits/guest_emergency/` (toolkit JSON, templates, knowledge, lint, decision forms).
- **Regulation:** `packs/regulations/cdc_ship_illness_reporting.json`.
- **Figures:** `src/main/render/figures/hospitality/` (muster board, floor status, departures timeline); outbreak curve from the epidemiology toolkit; itinerary map from the weather toolkit and map overlays.
- **Simulation:** `src/main/toolkits/hospitality/simulate.ts` wraps the epidemiology generator for ships and adds muster, fire, hurricane and cyber timelines.

## Security and privacy

As spec 0448: fixed hosts for any fetch (`cdc.gov`), size limits, files only in the scenario folder, consent before fetching. Guest data in examples is fictional; templates never ask for real passenger data.

## Testing

Golden images for each figure; simulation tests (cumulative counts monotonic, percentages correct, threshold crossings fire the right triggers, muster totals reconcile); lint tests for each rule in FR-4; clock tests for the report points and thresholds; example projects generated end to end with the local model before release.

## Tasks

1. **#825** Domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#829** Outbreak-at-sea toolkit templates and knowledge (FR-3, FR-4).
3. **#835** Guest emergency toolkit templates and knowledge (FR-5).
4. **#837** Muster, accounting and outbreak figures (FR-6).
5. **#840** Simulated outbreak and guest emergency case data (FR-7, FR-8).
6. **#843** Ship illness reporting regulation pack and clocks (FR-9).
7. **#848** Decisions, metrics and EEGs (FR-10, FR-11).
8. **#854** Document library pack (FR-12).
9. **#861** Examples, reuse in other domains, user guide (FR-13, FR-14).

## Open questions

- **Clocks before an event.** The 24-hour and 4-hour AGE reports are due before arrival, but the clock engine counts forward from a trigger. Recommendation: allow a `before` direction on a clock term in spec 0426's schema, and until then place milestone triggers in the scenario.
- **AGE case definition and current thresholds.** The 2 and 3 percent thresholds were read on CDC pages; the case definition came from a search summary. Recommendation: read the current VSP Operations Manual during the regulation task.
- **Practitioner review.** Recommendation: a cruise or hotel safety manager and a public health professional with maritime experience review the templates and examples before release.
- **Epidemiology dependency.** The outbreak figures and generator depend on spec 0457 (#690). Recommendation: build the simple common-source curve here if that field lags, then switch to the shared one.
