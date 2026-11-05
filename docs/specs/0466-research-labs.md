# Spec 0466: Research labs and biosafety — lab incidents, notifications and the lab safety toolkit

Issue: #699 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #690 (epidemiology, spec 0457), spec 0426 (regulatory clocks), #693 (animal health, spec 0460) · Research: [docs/research/domains/research_labs.md](../research/domains/research_labs.md)

## Summary

Action Stations can exercise the people who run and oversee research laboratories: biosafety officers, responsible officials of select agent registrations, laboratory directors and principal investigators, environmental health and safety, institutional biosafety committees, occupational health, research compliance and IRBs, research IT, facilities and security, and animal facility staff. They work the incidents these offices rarely rehearse: a potential exposure, an inventory discrepancy, a freezer failure that threatens irreplaceable samples, a lab fire, a research data breach, an animal facility emergency. The exercise centers on what an organization decides and whom it tells, against the real clocks: for select agent entities, immediate notification of theft, loss or release and the written report within seven calendar days; for NIH-funded institutions, the institutional biosafety committee's reporting duties; plus the institution's own deadlines. Registered entities must drill their incident response plan at least annually, so the AAR output includes the drill record the regulation asks for.

The scope is incident management, notification, continuity and compliance. The product never generates agent handling, culture, production or modification detail (FR-4). The **lab safety toolkit** (exposure and incident reports, notification matrices with clocks, inventory reconciliation, freezer alarm series, access logs) reuses the epidemiology toolkit for exposure follow-up (spec 0457), the regulatory clocks (spec 0426) and the cyber toolkits for data breaches, and serves healthcare and campus laboratories, public health laboratories, veterinary diagnostic laboratories (spec 0460) and school science labs (facility elements only).

## Requirements

### User stories

- As a responsible official, I want a select agent inventory discrepancy exercise that tests who we call, when we call, and whether Form 3 information is ready inside seven days, and I want the drill record in the form 42 CFR 73.14 asks for.
- As a biosafety officer, I want a potential exposure in a BSL-2 lab where the PI, occupational health and the IBC chair give conflicting advice and the clock keeps running.
- As a lab manager, I want a weekend freezer failure where the alarm call-out fails and I decide what to save first.
- As a research compliance director, I want a data breach on an instrument computer holding participant data, with IRB, sponsor and legal notifications on the clock.
- As an institutional official, I want a tabletop on the draft NIH biosafety policy's 24-hour notice for serious incidents, so we can see what our procedures would need.
- As a graduate program director, I want a biosafety incident management lab for students with no agent-specific content.

### Functional requirements

**Domain**

- **FR-1 Research labs domain.** A `research_labs` domain profile with the roles, systems, outside parties and phrasing in the dossier (sections 3–4), with variants for a university research biosafety program, a select agent registered entity, a hospital or clinical research laboratory, a vivarium or animal facility, and a company or core facility; aliases as listed. It suggests the lab safety, epidemiology and cyber toolkits.
- **FR-2 Threat families and arcs.** Families: laboratory exposure, inventory discrepancy, sample loss, facility emergency, animal facility emergency, research data breach, workplace violence or threat, and the shared service degradation family (monitoring or alarm system outage, access control failure), using extensible families (spec 0448 FR-15). Phase arc: discovery → immediate actions and containment → classify and notify → investigate → written reports → corrective action → return to work.

**Lab safety toolkit: products**

- **FR-3 Products as templates.** Exact templates for: internal incident report, notification matrix, incident report worksheet for theft, loss or release (marked as an exercise worksheet, not the official form), inventory reconciliation sheet, freezer or incubator alarm log, sample loss register, access log extract, occupational health exposure evaluation, work restriction memo, stop-work order, corrective action plan, IBC incident minutes, research data breach notices (IRB, sponsor, participants), emergency responder briefing sheet (facility hazards only), staff email, and press statement. Existing breach, press and social templates are reused by reference.
- **FR-4 Content guardrails.** Generator knowledge and lint checks that keep material at the level of organizational response: no technique, protocol, growth, production, enhancement or modification detail for any agent; no quantities, strains or agent-specific procedures beyond the agent name, risk group, biosafety level and public health response facts already in public guidance; scenarios state the agent only as a generic class or a named agent when the designer chooses one from the reviewed list. A generated inject that fails the check is rejected and regenerated, and the check is a documented, testable rule set. The guardrails are a design requirement of this field, not an optional setting.

**Notifications and clocks**

- **FR-5 Notification matrix and clock.** A figure and decision flow that shows, from discovery, each required notification (who, how, when due), its clock (immediate, 24 hours, 7 calendar days, 30 days, or institution-set), and its status (not started, made, late). Players and the facilitator record each notification as a structured decision (FR-9) and the clock display updates; the facilitator can see the clocks on exercise time.
- **FR-6 Regulatory clock pack.** Clock definitions for this field using the regulatory clock framework (spec 0426): select agent theft or loss (immediate to CDC or APHIS and law enforcement; Form 3 within seven calendar days), release (immediate to CDC or APHIS; Form 3 within seven days), the NIH Guidelines reporting (30 days; immediate for a BL2 overt exposure), the draft NIH biosafety policy's proposed 24 hours and 30 days (carried as a draft with the notice date and flagged so), and institution-set clocks (PI to BSO within a designer-set period). Each clock cites its source and date, and the designer can edit institution clocks. The pack states when an entity's own policy is stricter.

**Lab safety toolkit: figures and simulation**

- **FR-7 Figures.** Figure kinds (spec 0448 FR-4) for: temperature alarm trend (set point, alarm threshold, time of alarm, time acknowledged, warming curve), inventory reconciliation table with discrepancy highlighted, sample loss register, access log and door event table, notification clock board (FR-5), and facility status board (ventilation, power, alarms). Each produces the text summary and data table (spec 0448 FR-5). None is an AI image (project rule 5); photographs of a flooded floor or a fire stay AI or template photographic injects.
- **FR-8 Simulators.** An alarm series generator (compressor failure, door ajar, power loss, with call-out delay and optional alarm failure; viability windows are designer parameters, not biology claims); an inventory discrepancy generator (expected vs observed counts with record-keeping causes, after the program's finding that most reported losses are records problems); an exposure follow-up list using the epidemiology contact tools (fictional staff); access logs and backup status series. All labeled simulated.

**Decisions and evaluation**

- **FR-9 Structured decisions.** Forms (spec 0448 FR-14): classify an incident, notify a named party (who, how, time), stop work in an area, send a worker for medical evaluation, restrict a worker, move samples to backup, activate the incident response plan, order evacuation, submit a written report (which, when), brief the institutional official, issue a public statement. Decisions go to the session log and feed the metrics and the clock display.
- **FR-10 Metrics.** Decision timing and threshold timing (spec 0448 FR-12) configured for: **notification timing** (each required notification against its clock, with minutes early or late and a count of missed notifications); **exposure response** (time to stop-work and to medical evaluation, against protocol times the designer sets); **samples saved** (share moved before the alarm-to-loss window the designer sets); **data recovery**; **drill record completeness**; message consistency across the lab, EHS, compliance and communications.
- **FR-11 Drill record and core capabilities.** The AAR for an exercise tagged as a registered entity incident response drill includes a drill record with the elements 42 CFR 73.14 requires: how the plan was tested, problems found, corrective actions and participants, alongside the HSEEP improvement plan; and a prompt to review and revise the plan afterward, since the regulation requires review after any drill, exercise or incident. EEGs for Operational Coordination, Operational Communications, Public Information and Warning, Situational Assessment and Environmental Response/Health and Safety with lab-specific critical tasks.

**Knowledge and reuse**

- **FR-12 Document library.** A public-domain library pack: 42 CFR part 73 (select agent regulations) text, the FSAP incident notification and reporting training material and Form 3 print-only form, the BMBL 6th edition, the NIH Guidelines and the draft biosafety policy notice with its date, and HSEEP, each with license and URL verified when building the pack; documents of unclear license are linked, not copied.
- **FR-13 Examples.** (1) A university BSL-2 potential exposure with conflicting guidance and an IBC reporting question. (2) A select agent inventory discrepancy at a fictional registered entity with the notification and written report clocks. (3) A freezer failure and a ransomware event on instrument computers at a fictional research institute, combining the alarm series and the data breach notices. No example names an agent technique or a real institution.
- **FR-14 Reuse by other domains.** Suggested toolkit added to the healthcare, campus, public health and K–12 profiles (the K–12 variant limited to facility elements); animal health and food and agriculture reference the select agent clocks; the cyber toolkits supply the breach flow.
- **FR-15 Guides.** User guides: choosing clocks, why guardrails restrict content, editing institution policy clocks, and keeping an exercise at the incident management level.

### Non-functional requirements

- **NFR-1 Cost:** no paid data; no keys.
- **NFR-2 Privacy and safety:** no real incident, staff or institution data; fictional institutions and people (project naming rule); no agent handling detail in any generated or bundled material; exports marked as exercise material, and incident worksheets marked as not the official form.
- **NFR-3 Accessibility:** every figure has a text summary and data table; clock states use words and symbols as well as color.
- **NFR-4 Accuracy:** regulation text and clocks verified against the sources in the dossier on the date shown; a review by a biosafety officer before release (owner to arrange, as in the epic), including a check that no example crosses the guardrail; the product tells users to follow their registration and institutional policy.
- **NFR-5 Currency:** the NIH requirements are in transition (a draft policy would replace the Guidelines); every NIH clock carries its source date and draft status, and a release checklist re-checks them.

### Out of scope

- Agent-specific protocols, laboratory methods, risk assessment of particular agents, and containment engineering design.
- Filing any report with a federal program; templates are exercise worksheets.
- Clinical care of exposed workers beyond the response steps in the dossier.
- Dual-use research policy analysis (a possible later toolkit).

## Design

- **Domain:** `packs/domains/research_labs.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/lab_safety/` (toolkit JSON, templates, knowledge fragments, guardrail rules, clock definitions with source and date).
- **Figures:** `src/main/render/figures/lab/` (alarm trend, inventory table, loss register, access log, clock board, facility status board).
- **Simulation:** `src/main/toolkits/lab_safety/simulate.ts` (alarm series, inventory discrepancy, access logs), seeded for reproducibility.
- **Guardrails:** `src/main/toolkits/lab_safety/guardrails.ts`, a rule set applied after generation and to pack content at load; configuration data in the toolkit pack, with a deny list of content categories and an allow list of named agents the designer may choose.
- **Clocks:** definitions in the regulatory clock framework (spec 0426), with a `source` and `asOf` on each.
- **Metrics:** `src/main/evaluation/metrics/{notification_timing,drill_record}.ts` beside shared metrics.

## Security and privacy

As spec 0448: files only in the scenario folder, no network connectors in this field. Guardrails run locally; rejected outputs are not logged beyond the category. No real personal data, no real incident data. Exports carry the exercise marking.

## Testing

Guardrail tests (a corpus of allowed incident-management injects passes; a corpus of disallowed detail requests is rejected; pack content with disallowed categories fails to load); clock tests (immediate, 24 hours, seven-day and 30-day arithmetic across weekends and exercise time jumps); alarm series tests (alarm time, acknowledgment, warming curve consistency); inventory discrepancy tests; golden images for each figure; drill record tests (all required elements present in the AAR); metric tests with worked examples; example projects generated end to end with the local model before release and reviewed against the guardrail.

## Tasks

1. **#868** Research labs domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#869** Lab safety toolkit templates and format knowledge (FR-3).
3. **#870** Content guardrails: no agent handling detail in generated material (FR-4).
4. **#871** Notification clocks and matrix (FR-5, FR-6).
5. **#873** Freezer alarm, inventory and access log figures and simulators (FR-7, FR-8).
6. **#877** Structured decisions (FR-9).
7. **#881** Metrics, drill records and core capabilities (FR-10, FR-11).
8. **#885** Document library pack (FR-12).
9. **#888** Examples (FR-13).
10. **#892** Reuse in other domains and user guides (FR-14, FR-15).

## Open questions

- **Biosafety review.** Recommendation: a biosafety officer with select agent program experience reviews the templates, clocks, guardrail rules and examples before release.
- **Clock sources.** The seven-day Form 3 deadline and the immediate notifications were read from the regulation text; the NIH 30-day rule was read through the program's summary and institutional policies. Recommendation: open the NIH Guidelines PDF and the Appendix G text when building the pack, and re-check the draft policy's status at each release.
- **Form 3 discrepancy.** One training slide treated a Form 3 as late after three days; the regulation says seven calendar days. Recommendation: use the regulation and add a note that the program's current guidance should be checked.
- **Guardrail scope.** Recommendation: start with a conservative deny list and allow list, reviewed by the biosafety officer, and loosen only with their approval.
