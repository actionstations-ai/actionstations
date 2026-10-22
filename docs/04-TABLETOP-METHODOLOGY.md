# 04 — How the CSAAP Tabletops Were Built

This is the design method the generator must reproduce. It was derived from the hand-built Scenario 3 ("Flight to Nowhere") package in `reference/scenario-3/` and the fictional-airport doctrine in `reference/ncia/`. It follows HSEEP (DHS Homeland Security Exercise and Evaluation Program) conventions for discussion-based exercises, adapted for a classroom.

## 1. The project came first, then scenarios

The CSAAP project was set up as a **knowledge base**, and scenarios were authored *against* it:

1. **Course material** — the AAAE Certified Member body-of-knowledge modules (Finance & Administration; Planning, Construction & Environmental; Operations, Security & Maintenance; Communications & Community Relations) and six course slide decks that map each module to cybersecurity concerns (CIA triad, NIST CSF, TSA directives, OT systems like FIDS/BHS/PACS/airfield lighting). These define *what students are supposed to know* and therefore what an exercise should test.
2. **A fictional airport with real-looking doctrine** — North Coast International Airport (NCIA), Summit County, Ohio: a Part 139 Class I airport near Akron. Three plans were written for it so students have something to open and cite:
   - **Airport Emergency Plan (AEP)** — 14 CFR 139.325 structure, NIMS/ICS, EOC activation levels, hazard appendices including **Appendix 6: Cyber-Physical Incidents** (ALCS, PACS, AODB/FIDS, Fuel SCADA with response actions).
   - **Airport Security Program (ASP)** — 49 CFR 1542 structure, marked SSI (fictional), security areas, PACS architecture with VLANs and IP schema (`10.66.x.x`), failure-mode matrix, "Code Black" cyber protocol, vendor remote-access policy with an explicit *scenario hook*.
   - **Terminal Incident Response Plan (TIRP)** — 13 hazard sections with checklists; **Section 13** is cyber/IT failure with sub-scenarios for ransomware, access-control failure, and FIDS/BHS failure.
   - Plus a terminal map, and FEMA **ICS-201** and **ICS-203** forms (link: https://training.fema.gov/icsresource/icsforms.aspx).
3. The plans were seeded with **deliberate hooks** the scenarios later pull on: specific section numbers (TIRP 13.6, ASP 6.4), named systems and hostnames, generator gaps, the 15-minute PACS cache window, the no-24/7-vendor-VPN rule. **The generator should do the same in reverse: find hooks in the user's documents and build injects that force players to open the plan.**

## 2. Scenario package = five documents

Every scenario ships as a set. The generator's output schema mirrors these exactly.

| Document | Audience | Contents (from Scenario 3) |
|---|---|---|
| **Master Scenario Events List (MSEL)** | Facilitator | Header (title, location, duration, target audience); Scenario Overview (theme, threat, operational impact, *core plan sections tested*); Roles & Responsibilities; **Phases**, each with a goal and a table: Time · Inject ID · From · To · Event/Message · Expected Action |
| **Master Inject Deck** | Facilitator (printed, one per page) | Facilitator instructions (print, timing, target, "don't explain — just say 'this just came in'"); per inject: ID, hand-to role, time, **purpose tag**, format, full content, optional instructor note |
| **Controller/Evaluator Handbook** | Instructor | Exercise overview & objectives; room setup (U-shape, isolated PIO table, projector, whiteboard for ICS-201); Rules of Play (SimCell role, time jumps, handling artificialities); **Grading rubric** (4 metrics × Fail/Pass/Excellence with points); Hot Wash guide ("3-Up, 3-Down" + scenario-specific questions) |
| **Player Briefing Packet** | Students | Situation brief (time, weather, load, status board); the anomaly as players first see it; mission statement; **Team assignments & standing orders** (one table per team); Rules of engagement ("This is an exercise", "REAL WORLD" stop phrase, time jumps, artifacts are intelligence); blank ICS-201 with map sketch, situation summary, objectives, critical resource status table |
| **Inject media** | Players (handed/displayed) | PNG screenshots of tweets/posts, printed tickets/memos/logs, FIDS board image, photos for the main screen, audio for PA/radio |

## 2a. The method is domain-neutral (ADR-0014)

Scenario 3 is an airport cyber incident, but the method is not airport-specific and not cyber-specific. The generator reads the organization through a **domain profile** (`src/shared/domains/`: airport, transit, dam, water utility, energy utility, healthcare, campus, stadium/venue, port, municipal government, industrial plant, unmanned-systems operator, generic) that says what its facility, public and front line are called, which identifier categories its documents state, which systems and outside parties it has, what its places look like in a photo, and which inject types fit it. It reads the incident through a **threat family** (cyber, physical security, cyber-physical, UAS/drone, insider, natural hazard, infrastructure failure, mass gathering) that supplies the phase arc, the decision-point vocabulary, what a clue and a recovery hurdle are, and the outside party players must coordinate with. Everything below still holds; the four-phase arc named in §3 is the cyber family's. The other families keep four phases and one decision point but change what the phases are:

| Family | Phases (default) | The decision point | A clue is… |
|---|---|---|---|
| cyber | The Glitch · The Crisis · Manual Mode · Recovery & Verification | isolate / shut down / go dark; pay or not; wipe or preserve | a log line, a SIEM alert, a phishing header, an odd session |
| cyber_physical | Something Is Off · Loss of Control · Manual Operation · Restoration & Verification | take the system off automation or stop the process/service | an HMI value that disagrees with the field, a setpoint change with no operator |
| physical_security | The Anomaly · The Breach · Containment · Recovery & Return | lock down / evacuate / shelter vs. keep operating; hand the scene to LE | a badge log, a CCTV still, a cut fence, a plate |
| uas_drone | The Sighting · Persistent Incursion · Decision & Coordination · Resolution | halt operations under the overflight, **taken with law enforcement / the airspace authority** (the organization may not interfere with the aircraft) | a Remote ID broadcast, a detection track, an operator location estimate |
| insider | Oddities · The Pattern · Confrontation · Damage Control | suspend access and involve LE now, or watch; image the workstation | an after-hours badge event, a command history, a copied archive |
| natural_hazard | The Watch · Impact · Response · Stabilization & Recovery | evacuate / shelter / suspend; release or hold | a gauge reading, a field report, a forecast update |
| infrastructure_failure | Degradation · Cascade · Continuity Decision · Restoration | curtail service or run degraded; switch to backup now | a status screen, a maintenance log, an alarm history |
| mass_gathering | Build-up · The Surge · Control Decision · Dispersal & Recovery | stop admission / pause / evacuate an area | a CCTV still, a density count, a medical-call cluster |

The inject mix per phase (§3) keeps CORE_NARRATIVE, NOISE/RED_HERRING and PIO PRESSURE/MISINFORMATION for every family; the CLUE/TECH_HURDLE-to-the-technical-role rule applies to the cyber, cyber-physical and insider families (the others place clues with security or operations as the beats call for them). Noise and pressure injects come from the domain (a farebox jam, a boater's photo of the spillway, a nurse's anonymous post), never from the airport.

## 3. Scenario design pattern

Scenario 3 is a template for a good classroom TTX. Reproduce the pattern:

**Duration & tempo.** 4 exercise hours in 4 phases; real time compressed with Time Jumps. ~15 core injects + ~10 side injects (`b` suffix) ≈ one every 10–15 minutes of exercise time.

**Four-phase arc:**
1. **The Glitch** — ambiguity; tests reluctance to declare an incident. Small anomaly reported through a mundane channel (gate agent phone call). Includes one *noise* inject so IT practices triage.
2. **The Crisis** — business-as-usual becomes impossible. A time jump multiplies impact; a *red herring* splits resources; the *visual confirmation* inject goes on the main screen; *misinformation* hits the PIO; a *clue* reveals the vector; a stakeholder forces an official incident declaration and Unified Command.
3. **Manual Mode** — forces transition from digital to analog procedures. Forensics inject gives the "smoking gun"; the **decision point** (shut it down / go dark); physical-safety consequences (crowd crush, TSA stops); media pressure with a deadline.
4. **Recovery & Verification** — "trusting the data again." Restoration claim; tenant demands guarantees; verification-plan question; a *tech hurdle* delays recovery; tedious reconciliation; ENDEX.

**Role coverage.** Define 4–5 player roles (Ops Director/IC, IT Director, PIO, ASC/Security-LEO, Airline Liaison) and make sure every role receives injects in every phase. The PIO track (social, rumor, media deadline) is a first-class storyline, not garnish.

**Inject mix per phase.** At least: one CORE_NARRATIVE, one PRESSURE or MISINFORMATION for PIO, one NOISE or RED_HERRING, one CLUE/TECH item for IT; one DECISION_POINT somewhere in phases 2–3.

**Realism devices.** Concrete artifacts: ticket numbers, hostnames and IPs consistent with the ASP's schema, actual flight numbers, named local references (Browns tickets, Channel 5, Cleveland Moms Group), a script name (`random_gate_generator.ps1`), a SQL statement. Humor in the fake data ("Flight 666 to Purgatory") is fine and memorable; it is the *players'* data that must stay plausible.

**Doctrine citations.** The MSEL header lists the plan sections tested; expected actions reference them ("Activate Section 13.6"); the rubric's *Use of Doctrine* metric rewards students who cite sections. The generator must only cite sections that exist in the project documents — retrieve, don't invent.

**SimCell guidance.** The handbook tells the instructor how to play the outside world and to "not make it easy" (FBI asks for PCAP evidence). Generate 3–5 such mini-scripts per scenario.

**Grading rubric.** Four metrics (e.g., Operational Coordination 30, Technical Competence 30, Public Communication 20, Use of Doctrine 20), each with concrete Fail / Pass / Excellence behaviors tied to specific injects.

**Hot wash.** "3-Up, 3-Down" plus 3 scenario-specific discussion questions that hit the learning objectives (trust in data, Ops↔IT communication gap, insider as crime scene vs. tech ticket).

## 4. Authoring workflow that worked (and what the app should automate)

| Manual step | App equivalent |
|---|---|
| Read the plans, pick a cyber-physical system with a documented failure procedure | `ideate` stage: retrieve hazard appendices / checklists, propose scenarios keyed to specific sections |
| Pick a theme ("data integrity & public trust") and the sections to test | Scenario Overview with `coreSectionsTested[]` populated from retrieval |
| Define roles from the plan's org structure | `objectives_roles` stage reads EOC staffing / ICS positions from docs |
| Draft 4 phases with a goal each | `phase_plan` stage |
| Write the MSEL table phase by phase | `msel_phase` × 4 with the inject-mix constraints enforced by schema + critique |
| Expand ~60% of MSEL rows into full-page injects with a format | `inject_text` stage; the user picks which rows get media |
| Make tweet/FB/FIDS images by hand | template renderer + ComfyUI for photos |
| Write handbook, rubric, briefing | dedicated stages that read the MSEL so rubric behaviors reference actual inject IDs |
| Proofread for consistency (times, gates, IDs) | `critique` stage + deterministic lints |

## 4a. How the pipeline keeps the MSEL structurally sound

Prompts alone do not stop a local model from overfilling a phase, writing a player's decision as an inject or leaving rows after ENDEX. The pipeline checks and repairs these itself:

- **Mix completion stays within the phase size (#167).** When a phase lacks part of the inject mix (§3) or a role receives nothing, one extra `msel_phase` call asks for what is missing, but the phase never grows past its max row count (one row per 12 minutes, at least 4, plus 3). Spare NOISE / PRESSURE-type rows (ones whose removal opens no new gap) are rewritten first, keeping their id and time; new rows are added only while the phase has room. Gaps are asked as row-sized needs: a role covered by the PIO-pressure or technical-clue ask needs no separate row, and the remaining uncovered roles share one inject. When the first call itself writes more than the max, the lowest-value unlocked rows are dropped until the phase fits: spare NOISE / PRESSURE-type rows first, then other rows, latest first. A row is dropped only when another row keeps its tag and every role it addresses covered and the phase's mix gaps do not grow. Control cards (STARTEX, TIME_JUMP, ENDEX) and the DECISION_POINT are never dropped, and a TIME_JUMP that ends a phase stays where it is as the transition card.
- **Deterministic repairs (#174), after every `msel_phase` step and around the critique.** Exact repeats are dropped (same text once channel label, quotes and punctuation are removed, or the same quoted call word for word). One ENDEX row is kept. Rows outside their phase window are re-timed into it, spread between the last in-window row and the phase end. ENDEX moves to the latest row of its phase so nothing comes after it, and on equal times STARTEX and TIME_JUMP open and ENDEX closes. Locked rows are never moved or dropped. Player roles are capped at the number of entries in the brief's audience list; the operational, technical, public-information and security roles are kept first.
- **Structural lints feed the revision pass (#164, #174).** Besides the critique's error issues, the MSEL revision pass receives the rows that are outside their phase, after ENDEX, near-duplicates of an earlier row (`DUPLICATE_EVENT`), written in a player's voice (`INJECT_PLAYER_VOICE`: "This is the DOM…", a named player announcing "I have made the decision", "I'm declaring CODE …", whatever `from` says) or naming identifiers the facility facts do not list (`FACILITY_UNKNOWN_ID`, with the known list). After the repairs, any structural problem still left gets one more revision round before the scenario is marked ready; a row still in a player's voice then becomes a facilitator prompt with the player's words moved to the expected action.

## 4b. Repairing a finished scenario in place (#185, ADR-0015)

A scenario generated before a generator fix does not have to be regenerated to get it. `generate:repair` (job `repair-scenario`) runs the current checks on what is saved and changes only what they flag:

1. **MSEL, in code.** The deterministic repairs of §4a (exact repeats, one ENDEX kept last, rows re-timed into their phase). Recipient labels are re-resolved with the current matcher (a truncated "as" is ASO; one- and two-letter keys that match nothing are dropped). A phase over the density limit (more than one inject every 5 minutes, `DENSITY_HIGH`) is trimmed the §4a way, and rows the rubric links are never the ones dropped. The role cap is not applied: on a finished scenario the handbook, briefing and rubric already use every role.
2. **MSEL, with the model.** A phase that lacks an inject-mix tag (`MIX_*`) gets one mix call: spare rows rewritten first, a new row only below the density limit. Then the revision pass runs for the rows still flagged (§4a structural lints and unknown facility identifiers), once more for what is left, and a row still in a player's voice becomes a facilitator prompt. Unflagged rows are never sent for rewriting. The lints are recomputed; critique notes and inject warnings of live rows are kept.
3. **Injects.** Injects of rows the repair removed are deleted. Every other inject is re-checked with the current field and content checks: warnings that no longer apply are dropped without touching the inject file. `generate:injects` runs only for rows whose source, event, expected action or format changed, rows with no inject, and injects whose content still fails the checks.
4. **Media.** Rewritten injects render their card and voice again. Injects whose card is missing, failed (`INJECT_MEDIA_FAILED`, `INJECT_RENDER_INVALID`) or was drawn from fields that broke the template re-render the card; the media job repairs the fields first. Up to `aiStills` injects whose brief plans an AI still and that have none get one; a brief written before #177.4 has its setting anchor moved behind the scene first.

Everything else stays byte-identical, and the job's result lists each row and inject it changed. `scripts/make-example.mjs repair` drives the job for the bundled examples and writes the before/after warning counts and the file diff to `review/<key>/repair.json`.

## 5. Known gaps in Scenario 3 (so the generator does better)

- Some MSEL rows (I-01, I-02, I-03, I-05, I-08, I-10, I-11, I-13, I-14) have no deck page — the generator should default to a deck page for every row and let the user turn some off.
- Media was produced manually for only a handful of injects (I-02a, I-04, I-06, I-06b, I-10b). The app should make media cheap enough to produce for all social/visual/audio injects.
- Hand-off/role assignment uses the Player Briefing's team table; an ICS-203 pre-fill would be a nice addition.
- No facilitator timeline tool; the app's Facilitator Mode covers this.
