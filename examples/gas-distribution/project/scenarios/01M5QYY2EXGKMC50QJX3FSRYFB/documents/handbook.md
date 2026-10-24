# Controller / Evaluator (C/E) Handbook
## Ghost Pressure — SCADA vs. Field Gauges & Life Safety

Exercise Date: [Date] · Location: Corwin Valley Gas Company, City of Corwin, Lake Haven County, Pennsylvania · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber-physical overpressure incident at Corwin Valley Gas Company, where a malicious command to regulator setpoints PC-21 and PC-22 was executed via a compromised integrator account, creating a dangerous false sense of normalcy in the control room. The scenario tests the organization’s ability to recognize a critical discrepancy between SCADA data and field measurements, manage a cascading loss of trust in digital systems, and make a high-consequence life safety decision to shut in Pressure District 7 despite no alarms and no upstream disruption. The exercise unfolds in four phases over four hours: (1) The Sighting (0:00–1:00) – detecting and validating the pressure discrepancy; (2) Loss of Control (1:00–2:00) – confirming the cyber breach and managing public panic; (3) Manual Operation (2:00–3:00) – authorizing the shutdown of 5,120 customers under emergency conditions; and (4) Restoration & Verification (3:00–4:00) – verifying physical safety and returning to controlled operations. Evaluators should watch for the team’s adherence to C1, C3, C4, C7, and C16: the prioritization of field gauges over SCADA, the correct use of manual isolation procedures, the proper escalation of cyber incidents to TSA and CISA, and the avoidance of premature restoration of SCADA without forensic verification. The decision to shut in the district must be based on field evidence, not SCADA, and must be made under pressure with full awareness of life safety implications.

The exercise emphasizes the critical role of cross-functional coordination under stress, particularly between Gas Control, Field Operations, and Cybersecurity. Evaluators should assess whether the Incident Commander recognizes the urgency of the field data, whether the Cybersecurity Coordinator correctly isolates the network and preserves evidence, and whether the Public Information Officer manages media and social media without compromising operational security. The final phase tests the team’s ability to follow the phased return to control as outlined in C7 and C8, ensuring that no further action is taken until field gauges confirm nominal pressure and SCADA is verified as trustworthy.

**Objectives:**
- **Trust in Data:** Demonstrate the ability to resolve conflicting pressure data between SCADA and field gauges by validating the field report and overriding the false SCADA display to initiate emergency isolation.
- **Command Authority:** Demonstrate the ability to authorize a district-wide shutdown of Pressure District 7 despite conflicting data and external pressure to maintain service, based on field evidence and life-safety risk.
- **Cyber-Physical Containment:** Demonstrate the ability to isolate the OT network from the business network and disable remote access via the jump host after identifying unauthorized commands from a compromised integrator account.
- **Public Trust Management:** Demonstrate the ability to issue a timely, accurate evacuation notice and media statement that acknowledges the overpressure risk while correcting false reports of explosions, to prevent panic and maintain public confidence.

**Plan sections exercised:**
- Corwin Valley Gas Company — Gas… › Section 4 › 4.2 Classification
- Corwin Valley Gas Company — Gas… › Section 6 › 6.3 Actions
- Corwin Valley Gas Company — Cybe… › Section 4
- Corwin Valley Gas Company — Gas… › Section 3
- Corwin Valley Gas Company — Cybe… › Section 9
- Corwin Valley Gas Company — Gas… › Table of Contents
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout with six tables, each assigned to a team: Team A (IC), Team B (GCM), Team C (CYB), Team D (FOS), Team E (SEC), Team F (PIO).
- Gas Control (Team B) sits at the central table with direct access to the main screen and injects.
- Public Information Officer (Team F) sits at a rear table, isolated from the main group, to simulate the need to walk over for information and to emphasize the delay in external communication.
- Each team has a printed copy of their role’s responsibilities from C6 and a reference to C1, C3, C4, and C7.
- Equipment needs: projector for main-screen injects, whiteboard for ICS-201 tracking, printed inject deck (with tabs for phase and team), optional simulated radios/phones for field calls.
- Materials for players: printed inject deck, ICS-201 form, role-specific reference sheets, and a notepad for notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: you represent everyone outside the control room and field teams. If a player says, 'I call the sheriff,' you answer as the Corwin County Sheriff’s Office. If they say, 'I call Halden Automation,' you respond as the vendor. Your role is to provide realistic, time-accurate, and fact-based responses to player actions, not to guide them. Do not make it easy: if a player says, 'I would never trust SCADA again,' you must still require them to follow the policy and verify with field gauges, not just say 'I trust field.' You must enforce the 72-hour CISA reporting window, the need for a signed access request before vendor access, and the requirement for paper trip sheets for manual operations.

Managing Time: Use scripted time-jump announcements. At 1:00 and 2:00, announce: 'PAUSE EXERCISE. We are jumping forward 30 minutes. All teams, update your status based on new information.' This prevents time compression and ensures realism.

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond in character: 'This is a government-mandated system. We must use it until it’s proven compromised. The field gauges are the only trusted source now.' Do not explain policy—just enforce it.

Delivering injects: Do not explain. Say only: 'This just came in.' or 'This is on the main screen.' Let the players interpret the context.

This is an exercise: if a player says, 'I would never shut in a district,' you must still respond: 'The IC has authorized the shutdown. You must comply.' Do not say 'This is not real.'

REAL WORLD, REAL WORLD: If a player says, 'I would call the media,' you must respond: 'The PIO is handling media. You must not speak to reporters unless authorized.' Reinforce that real-world rules apply.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **TSA Pipeline Security Division (tsp-ops@tsa.dhs.gov)** — _Trigger: Player calls TSA to report the cyber incident or asks about network isolation._
  - Ask: "TSA has reviewed the jump host logs. The halden-support account was used to change PC-21-SP and PC-22-SP to 13 in. w.c. at 16:15. Do you have a signed access request from the Incident Commander to restore remote access?"
  - Ask: "TSA has not authorized any resumption of remote access. Do you have the memory image (ID: 0x9A2F) and the red evidence tag (CIRP Form 3) for forensic review?"
  - Ask: "The account has been permanently revoked. Do you have a new MFA credential issued to a CVG staff member before attempting remote access?"
  - Concede only when: Will accept a signed access request from the Incident Commander and a copy of CIRP Form 3 with the evidence tag.
- **CISA (report@cisa.gov or 888-282-0870)** — _Trigger: Player calls CISA to report the incident or asks about reporting requirements._
  - Ask: "CISA requires a report within 72 hours of identification. Have you submitted the report via the CISA portal or phone?"
  - Ask: "CISA has not received a report. Do you have the memory image from CVG-OT-JMP01 and the audit logs from 16:15 for forensic review?"
  - Ask: "CISA will not confirm the environment is secure until the forensic review is complete. Do you have a ticket number and a signed access request from the Incident Commander before attempting any restoration?"
  - Concede only when: Will accept a completed CISA report submission and a ticket number for tracking.
- **FBI Philadelphia Field Office (fbi.philadelphia@fbi.gov)** — _Trigger: Player calls FBI to report unauthorized access to OT systems._
  - Ask: "The FBI has been notified. Do you have a copy of the CISA report and the TSA incident designation for the investigation?"
  - Ask: "The FBI requires a full digital evidence package: memory image (ID: 0x9A2F), audit logs, and a signed access request. Do you have all three?"
  - Ask: "The FBI will not release any information to the media until the investigation is complete. Do you have a legal hold on all logs and evidence?"
  - Concede only when: Will accept a signed access request and a ticket number from CISA for coordination.
- **Halden Automation (support@haldenautomation.com)** — _Trigger: Player calls Halden Automation to request vendor support or restore access._
  - Ask: "Halden Automation has been notified. Do you have a ticket number from the Cybersecurity Coordinator for on-site forensic support?"
  - Ask: "The halden-support account has been revoked. Do you have a signed access request from the Incident Commander before attempting any configuration changes?"
  - Ask: "Halden will not restore any configuration until CISA and TSA confirm the environment is secure. Do you have the memory image and evidence tag for review?"
  - Concede only when: Will accept a signed access request and a ticket number from the Cybersecurity Coordinator.
- **Pennsylvania PUC (pa.puc.gov)** — _Trigger: Player calls the regulator to report the incident or asks about reporting requirements._
  - Ask: "The PUC requires a report within 24 hours of discovery. Have you submitted the report to the PUC via the official portal?"
  - Ask: "The PUC requires a copy of the CISA report and the TSA incident designation for regulatory review. Do you have those documents?"
  - Ask: "The PUC will not accept any report unless the NRC call has been made and the gas has been shut in for life safety. Do you have the NRC call confirmation?"
  - Concede only when: Will accept a copy of the CISA report and the NRC call log.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops team delayed the stop-service decision until I-12b forced it, and did not initiate manual isolation procedures until after the field confirmed overpressure three times. They failed to act on I-04b's odor-call surge, and did not issue paper trip sheets under EOP 6.4 until I-15, despite being instructed to do so in I-04. ☐ **Pass:** Ops team initiated manual verification and paper trip sheets per EOP 6.4 after I-04, and authorized the shutdown of Pressure District 7 in I-15 after confirming field evidence via I-12b. They followed the chain of command and coordinated field and control actions. ☐ **Excellence:** Ops team proactively activated EOP 6.4 for paper trip sheets and voice dispatch at I-04, prior to any inject, and initiated manual isolation procedures at I-12b upon receiving full field verification. They authorized the shutdown of Pressure District 7 in I-15 based on field evidence, not SCADA, and maintained coordination with field and control throughout. | I-04, I-04b, I-08, I-12b, I-15 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT team reset the controller after I-08b, destroying evidence and violating C9 and C16. They failed to collect a memory image of CVG-OT-JMP01 before powering it off, and did not isolate the OT network from IT until I-09, after the cyber incident was confirmed. ☐ **Pass:** IT team identified the unauthorized session on CVG-OT-JMP01 in I-03 and isolated the OT network from IT within 2 minutes. They collected a memory image of the jump host in I-11 and preserved the audit trail per C9 and C16, and confirmed forensic preservation with CISA and TSA. ☐ **Excellence:** IT team proactively collected a memory image of CVG-OT-JMP01 using 'volatility3' at I-11, prior to any external confirmation, and preserved the host in a locked cabinet with a red evidence tag per C9 and C8. They notified CISA and TSA immediately after evidence collection, and maintained full network isolation under C16. | I-03, I-09, I-11, I-18b, I-21 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO issued a fake emergency alert in I-13 based on a social media post, and did not correct misinformation until I-18b. They failed to activate the 'smell gas, act fast' campaign until I-08, and did not verify the report with field teams before issuing a statement. ☐ **Pass:** PIO issued the emergency alert via emergency alert system, TV, and website in I-08 after IC approval, and corrected the false explosion report in I-18b. They activated the 'smell gas, act fast' campaign and held all messaging until IC approval. ☐ **Excellence:** PIO proactively activated the 'smell gas, act fast' campaign at I-04b upon receiving the odor-call surge, and issued the emergency alert in I-08 after IC approval. They corrected misinformation in I-18b and maintained a consistent, accurate message to the public throughout. | I-04b, I-08, I-13, I-18b, I-20 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students did not cite any plan sections during the exercise. They failed to reference C1, C3, C9, C16, or C12 when making decisions. They did not mention CVG-CIRP-2026, CVG-CRM-2025, or C16 in any inject response. ☐ **Pass:** Students cited C1 (field gauges govern), C3 (preserve regulators and logs), C9 (collect memory image), C16 (isolation level I-4), and C12 (Level 3 triggered by odor calls) in their inject responses. They referenced CVG-CIRP-2026 Section 9 and CVG-CRM-2025 Section 6.3 when discussing cyber and configuration changes. ☐ **Excellence:** Students cited C1 (field gauges govern), C3 (preserve regulators and logs), C9 (collect memory image), C16 (isolation level I-4), and C12 (Level 3 triggered by odor calls) in their inject responses. They referenced CVG-CIRP-2026 Section 9 and CVG-CRM-2025 Section 6.3 when discussing cyber and configuration changes, and cited C8 (evidence preservation) and C7 (update plans) in the final review. | I-01, I-01b, I-03, I-04, I-07, I-09, I-10, I-11, I-18b, I-21 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method to rapidly surface key insights: ask each team to share three things that went well and three that broke or failed. Go around the room by team, write responses on a whiteboard for visibility. Tip: keep it fast—no debate, just capture raw feedback.

**Key Discussion Questions for Ghost Pressure:**
- **Trust:** When you heard Tech Jones report about 30 in. w.c. on the field gauge at RS-22, and PR-7B was showing 15 in. w.c. and rising, what made you decide to trust the field report over SCADA’s unchanged display? What evidence in C2 or C1 did you rely on to validate that field data? _(Objective: Trust in Data)_
- **The Gap:** At the moment you received the field report confirming overpressure at both RS-21 and RS-22, but SCADA still showed no alarms and no change in setpoints, what mental or procedural gap opened in your understanding of system integrity? How did that gap affect your decision to act? _(Objective: Trust in Data)_
- **The Call:** When Supervisor Oyelowo said, 'This is not a drill. We have a resident on Canal Street who says they saw a flash,' and requested immediate shutdown authorization, what changed in your assessment of risk? What in C3 or C1 determined your threshold for authorizing a shutdown despite no SCADA alarms? _(Objective: Command Authority)_
- **The Cut:** After identifying that the unauthorized command came via the integrator account halden-support on the OT jump host CVG-OT-JMP01, what immediate actions did you take to contain the cyber-physical breach? Which part of C1 did you follow to begin isolation and disable remote access? _(Objective: Cyber-Physical Containment)_
- **The Message:** When the public started reporting 'explosions' on social media due to false SCADA data showing normal pressure, what did you say in your first public statement to correct the record and maintain trust? How did C3 guide your timing and content for reporting to the National Response Center, PUC, and ONG-ISAC? _(Objective: Public Trust Management)_
<!-- /section:hotwash -->



*End of Handbook*

