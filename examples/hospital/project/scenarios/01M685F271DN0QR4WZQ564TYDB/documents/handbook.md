# Controller / Evaluator (C/E) Handbook
## Paper Charts — EHR Downtime and Trust in the Record

Exercise Date: [Date] · Location: Ottawa River Regional Medical Center, Toledo, Lucas County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber incident at Ottawa River Regional Medical Center, focusing on a ransomware attack that has encrypted the CareLine EHR database and disabled critical clinical systems. The scenario unfolds over four hours, beginning at 05:40 on March 3, 2026, and traces the hospital’s response from initial recognition of EHR failure through full activation of HICS, containment, and a prolonged downtime with data theft, medication near-miss, and public misinformation. The exercise emphasizes decision-making under pressure, the balance between patient safety and operational continuity, and the authority to declare and sustain a downtime level. Evaluators should monitor for timely activation of HICS, adherence to the EHR downtime protocol (including the Downtime Annex), the correct use of the HCC and IAP structure, the proper sequence of containment and evidence preservation, and the alignment of all actions with the EOP. Pay close attention to whether the Incident Commander declares a Level 1 activation, whether the ISO maintains control over forensic holds and external reporting, and whether the Public Information Officer releases only vetted facts. The exercise also tests the ability to manage conflicting priorities: restoring systems versus preserving trust, ensuring medication safety versus maintaining service delivery, and communicating truthfully under public pressure.

The arc of the phases is structured as follows: Phase 1 (0:00–1:00) centers on initial recognition, declaration of downtime, and first containment moves; Phase 2 (1:00–2:00) focuses on running the hospital on paper, including medication safety, surgery decisions, and ED diversion; Phase 3 (2:00–3:00) confronts the threat of stolen data, a real medication near-miss, and a realistic restore timeline; and Phase 4 (3:00–4:00) forces a choice between a rapid but unverified restore and a delayed but safe one, while managing breach reporting, staffing, and messaging. The players must navigate legal, clinical, and public trust implications, particularly around HIPAA, evidence preservation, and the 72-hour watch for re-infection.

**Objectives:**
- **Downtime Authority:** Demonstrate the ability to declare downtime and a Level 1 activation quickly, and to decide diversion and elective cases using the criteria in the EOP and the Patient Surge and Evacuation Annex.
- **Containment Versus Care:** Demonstrate the ability to weigh each isolation step against its effect on patients (viewer feed, interface engine, pump server) and to record who decided.
- **Medication and Record Safety:** Demonstrate the ability to keep medication administration safe on paper, with two-person checks and a plan to reconcile the record.
- **Truthful Public Position:** Demonstrate the ability to hold the facts-first rule: no claim about patient data until the Chief Privacy Officer clears it, and a restore never described as safe before the checks are done.

**Plan sections exercised:**
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout with five tables: Team A (Command) at front, Team B (Technology), Team C (Clinical), Team D (Infrastructure), and Team E (Communications) on the sides and rear.
- Team A (Command) sits at the front-facing table, adjacent to the facilitator and main screen.
- Team B (Technology) and Team C (Clinical) sit to the left and right of Command, respectively.
- Team D (Infrastructure) sits behind Team C, with access to the back wall.
- Team E (Communications) sits at a rear table, isolated from the main HCC; they must walk forward to receive information, simulating real-world separation from operational command.
- Equipment needs: projector for main-screen injects, whiteboard for ICS-201, printed inject deck, optional simulated radios/phones.
- Materials for players: printed role sheets, HCC binder, downtime packets, and inject deck.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell — the entire external world. When a player says, 'I call the sheriff,' you respond as the Lucas County EMA duty officer. When they say, 'I contact the FBI,' you respond as the FBI Cleveland Field Office cyber agent. Never explain, clarify, or ease the burden. Your role is to represent real-world actors who act in their own institutional interest, not to assist the players.

Do not make it easy. For example, if a player says, 'I’ll call CISA,' you do not say, 'Yes, they’re on the line.' Instead, you say, 'This is CISA’s cyber incident response team. We need a signed access request and a ticket number before we can assist.' This enforces the need for proper process and documentation.

Managing Time: At the time-jump injects (TJ-1, TJ-2, TJ-3), you must pause the exercise, announce the time jump, and then resume. Example: 'PAUSE EXERCISE. We are jumping forward 30 minutes. The hospital has now been on paper for 1 hour and 40 minutes. RESUME.'

Handling artificialities: If a player says, 'I wouldn’t use that system,' you must not correct them. Instead, say, 'Understood. I’ll note that for the after-action review.' This preserves realism and prevents players from assuming a perfect world.

Delivering injects: When delivering an inject, do not explain. Use phrases like, 'This just came in,' or 'This is on the main screen.' For example, when delivering I-03, say: 'This just came in from the managed detection service: a critical SIEM alert about a compromised administrator account.'

This is an exercise: If a player says, 'I know this is a drill,' you must not respond. If they ask, 'Is this real?' you must say, 'This is an exercise. REAL WORLD, REAL WORLD.' Repeat until they accept the context.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **FBI Cleveland Field Office Cyber Incident Response Team** — _Trigger: Player says: 'I contact the FBI.'_
  - Ask: "Do you have a signed access request and a ticket number from your EHR vendor?"
  - Ask: "Have you preserved the memory and disk images of ORRMC-SQL01 and ORRMC-SQL02?"
  - Ask: "Can you provide a copy of the ransom note and the timestamps from the managed detection service logs?"
  - Concede only when: We will begin a joint forensic review if you provide a signed access request and preserved logs.
  - Concede only when: We will notify the HHS Office for Civil Rights if you confirm a breach of 500 or more records.
- **EHR Vendor Incident Desk (CareLine Systems)** — _Trigger: Player says: 'I contact the EHR vendor.'_
  - Ask: "Do you have a clean backup point prior to 02:00?"
  - Ask: "Can you provide the immutable cloud copy of the EHR database and confirm it was not accessed?"
  - Ask: "Have you reset all credentials and rebuilt the domain controllers?"
  - Concede only when: We will begin a restore from the 02:00 cloud copy if you confirm the forensic hold is in place and the domain is rebuilt.
  - Concede only when: We will provide a post-restore validation package if you send the ticket number and a signed access request.
- **Lucas County Emergency Management Agency (EMA) Duty Officer** — _Trigger: Player says: 'I report to Lucas County EMA.'_
  - Ask: "Which hospitals can you divert to?"
  - Ask: "What is your current diversion status?"
  - Ask: "Can you confirm that the regional healthcare coalition has been notified?"
  - Concede only when: We will coordinate patient placement with the coalition if you confirm ED diversion and send a formal status update.
  - Concede only when: We will activate mutual aid through the Ohio Hospital Association if you report a full activation.
- **Ohio Department of Health (ODH) Public Health Liaison** — _Trigger: Player says: 'I report to the Ohio Department of Health.'_
  - Ask: "Have you assessed whether the breach affects 500 or more Ohio residents?"
  - Ask: "Have you preserved logs and notified HHS OCR?"
  - Ask: "Can you confirm the 60-day HIPAA breach clock started at 05:50?"
  - Concede only when: We will accept your preliminary breach assessment if you submit it within 24 hours.
  - Concede only when: We will not issue a public alert if you confirm no data was accessed — but only if you provide evidence.
- **Health-ISAC (Healthcare Information Sharing and Analysis Center)** — _Trigger: Player says: 'I contact Health-ISAC.'_
  - Ask: "Do you have a signed access request and a ticket number?"
  - Ask: "Have you preserved the network logs and firewall data?"
  - Ask: "Can you confirm the intruder did not access the device network?"
  - Concede only when: We will share threat intelligence if you provide a signed access request and a forensic report.
  - Concede only when: We will alert the national healthcare sector if you confirm a widespread compromise.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops team delayed the downtime declaration until I-01 forced it; failed to activate the overhead page and issue DT-number blocks immediately after the CNO made the call, and did not initiate paper medication administration using the 05:15 BCA-VIEW01 data until after the 06:00 dose was missed. ☐ **Pass:** Ops team activated downtime and issued the overhead page within 2 minutes of the CNO's decision at I-01; initiated paper medication administration using the BCA-VIEW01 05:15 data and established the second-person check for high-alert drugs. ☐ **Excellence:** Ops team activated downtime and issued the overhead page within 1 minute of the CNO's decision at I-01; proactively established paper medication administration using the BCA-VIEW01 05:15 data and deployed a second-person check for high-alert drugs before the 06:00 dose was due, and pre-identified scribes and runners for extended downtime. | I-01, I-04, I-05, I-13, I-22 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT team failed to isolate the EHR database servers immediately after I-02; delayed the forensic hold until I-03, and reset the compromised account only after the managed detection service reported it. ☐ **Pass:** IT team isolated the EHR database servers and disabled the compromised account within 5 minutes of I-03; initiated forensic triage and confirmed the immutable cloud copy was not compromised before proceeding to restore. ☐ **Excellence:** IT team isolated the EHR database servers and disabled the compromised account within 2 minutes of I-03; proactively initiated forensic triage, verified the immutable cloud copy was pre-intrusion (02:00), and began the clean-room build and credential reset in parallel before I-18, following EOP 4.3. | I-02, I-03, I-08, I-18, I-20 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO issued a draft statement in I-21 that claimed patient data was not accessed and that the hospital would be back to normal by tomorrow morning, violating the facts-first rule and the CPO’s directive to not claim data safety. ☐ **Pass:** PIO rejected the draft statement in I-21, corrected the misinformation from I-16, and issued a holding statement using the pre-approved cyber statement from EOP Section 10, confirming the disruption and stating that emergencies were being treated. ☐ **Excellence:** PIO rejected the draft statement in I-21, corrected the misinformation from I-16 within 5 minutes, and issued a holding statement using the pre-approved cyber statement from EOP Section 10; proactively updated the media log and prepared a draft for the CPO’s review before any public announcement. | I-07, I-11, I-16, I-21 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite EOP sections when making decisions; for example, they did not reference Section 4 for Level 1 activation or Section 5 for the downtime blood process. ☐ **Pass:** Students cited EOP Section 4 for Level 1 activation, Section 5 for the downtime blood process, and Section 8 for staffing during extended downtime, and referenced the Downtime Annex for reconciliation procedures. ☐ **Excellence:** Students cited EOP Section 4 for Level 1 activation, Section 5 for the downtime blood process, and Section 8 for staffing during extended downtime; referenced the Downtime Annex for reconciliation procedures and EOP 4.3 for the restore order; and cited Section 9 for the three checks before EHR release. | I-03, I-05, I-15, I-18, I-20 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise, going around the room to ensure all voices are heard; write each response on a whiteboard to create a shared visual record.

**Key Discussion Questions for Paper Charts:**
- **Trust:** At 0:20, the SIEM alert flagged a compromised admin account and a large data exfiltration. When did you stop trusting the EHR system and the report from IT, and what made you decide to act on that doubt rather than wait for confirmation? _(Objective: Downtime Authority)_
- **The Gap:** At 1:05, the ED leader asked for diversion due to missing lab and imaging data. What gap in understanding between operations and IT caused hesitation in that decision, and how could you have closed it faster? _(Objective: Containment Versus Care)_
- **The Call:** At 1:35, the surgical team faced a go/no-go decision with nine cases scheduled. Who made the call to proceed, and what evidence or process did you rely on to decide that it was safe to begin surgery despite the EHR being down? _(Objective: Medication and Record Safety)_
- **The Public Position:** At 1:15, a social media post spread fear about the ER being locked. When did you decide to speak publicly, and what facts were you required to hold before issuing a statement—especially given that the EHR was not yet restored? _(Objective: Truthful Public Position)_
- **The Evidence:** At 2:15, a heparin dosing error occurred because the paper packet did not include the ED dose. When did you treat the paper record as evidence, and when did you treat it as a ticket? What system or process should have caught that gap? _(Objective: Medication and Record Safety)_
<!-- /section:hotwash -->



*End of Handbook*

