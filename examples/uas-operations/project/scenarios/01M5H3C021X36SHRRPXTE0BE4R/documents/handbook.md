# Controller / Evaluator (C/E) Handbook

## Ghost Flight at Birch Hollow — GNSS Spoofing & Command Hijack

Exercise Date: [Date] · Location: Harwick UAS Operations Group, Birch Hollow Range, Harwick, Calder County, New York · Duration: 4 Hours

<!-- section:overview -->

### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber-physical incident involving GNSS spoofing and unauthorized command injection during a multispectral UAS campaign at the Birch Hollow Range. The scenario tests the team’s ability to recognize conflicting telemetry, manage cascading system failures, make high-consequence decisions under pressure, and coordinate with regulators, law enforcement, and clients. The incident began when UAS-11 experienced uncommanded position jumps, loss of RTK and GNSS fixes, and a second GCS appeared in telemetry—all linked to a compromised 915 MHz C2 link from a rogue RF emitter. The exercise unfolds in four phases over four hours: (1) The Sighting (0:00–1:00), focusing on incident recognition and declaration; (2) Loss of Control (1:00–2:00), testing interagency coordination and evidence preservation; (3) Manual Operation (2:00–3:00), where the team must decide whether to fall back to manual control to prevent a lake landing; and (4) Restoration & Verification (3:00–4:00), evaluating formal reporting, forensic verification, and data integrity confirmation.

Evaluators should watch for: adherence to HUOG-ERP and ISP protocols, timely and accurate incident declaration, proper use of ICS-201 for documentation, preservation of GCS and radio state, correct escalation to the FSDO and NTSB, and compliance with data release policies under HUOG-ISP Section 7.5. Pay close attention to whether the team recognizes and acts on the GCS firmware mismatch (03.2026-C vs. baseline 03.2026-B), verifies the RTK base integrity, and maintains chain-of-custody for evidence like the RF jammer. The team must not release data to the client without verification, and must not bypass the ASO for regulatory reporting.

**Objectives:**

- **Command Integrity:** Demonstrate the ability to verify and restore command authority over a flight system after a suspected GNSS spoofing and unauthorized command injection, using telemetry logs and radio state preservation.
- **Cyber-Physical Trust:** Demonstrate the ability to resolve conflicting data between the GCS, DAA-1, and aircraft telemetry during a cyber-physical incident, prioritizing field observations and forensic preservation.
- **Interagency Coordination:** Demonstrate the ability to synchronize reporting and action with law enforcement (CCSO), base safety, the FSDO, and the client (CP&L) while maintaining regulatory compliance and data integrity.
- **Incident Response Continuity:** Demonstrate the ability to maintain operational continuity under a cascading failure of C2 links, RTK base, and GNSS, by activating pre-defined emergency procedures and preserving evidence.

**Plan sections exercised:**

- ISP › Section 9 › 9.1 C2 link compromise, interference or GNSS spoofing
- ISP › Section 5 › 5.2 Link monitoring
- ISP › Table of Contents
- ERP › Section 11 › 11.3 Records
- SITE › 9. Contacts (exercise numbers)
- ERP › Section 10 › 10.3 Social media and trainees

<!-- /section:overview -->

<!-- section:room -->

### 2. Room Setup & Logistics

- U-shape or island configuration simulating the flight operations center / mission control room
- Team A (Operations): Front-center table, with IC and RPIC
- Team B (Systems / Cyber): Center-left, with TL and GCS operators
- Team C (Safety): Center-right, with ASO and VO
- Team D (Communications): Rear-left, with PIO and Corporate Communications liaison
- Team E (Security): Rear-center, with Sec and base safety rep
- Team F (Client): Rear-right, with SPO and client liaison
- Isolate the public-information role (PIO) at a rear table to simulate delayed access to information and force deliberate coordination
- Equipment needs: Projector for main-screen injects, whiteboard for ICS-201 documentation, printed inject deck, optional simulated radios/phones
- Materials for players: Printed role sheets, inject deck, ICS-201 form, HUOG-ERP and ISP references

<!-- /section:room -->

<!-- section:rules -->

### 3. Rules of Play (Instructor Guide)

You play everyone else in the world: if a trainee says 'I call the sheriff', you answer as the deputy. Do not make it easy—when a trainee says 'I wouldn’t use that system', you do not explain the policy. Instead, you reply as the role: 'That system is approved for this test. You must use it unless the IC declares a standdown.'

Managing Time: Use the scripted time-jump announcement: 'PAUSE EXERCISE. We are jumping forward 30 minutes. Continue from the current inject. RESUME.' Use this exactly as written.

Handling artificialities: When a trainee says 'I wouldn’t use that system', you respond only as the character: 'The system is in the baseline. You must use it unless the IC declares a standdown.' Do not correct or explain.

Delivering injects: Say only: 'This just came in.' or 'This is on the main screen.' Do not explain, interpret, or expand.

This is an exercise: If a trainee says 'We’re not actually in a crisis,' respond: 'REAL WORLD, REAL WORLD. This is real. Act as if lives, data, and compliance are at stake.'

REAL WORLD, REAL WORLD: Repeat as needed to reinforce that this is not a simulation for them—the consequences are real for the Group, the client, and the community.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Managed SOC (SecureWatch MSSP)** — _Trigger: The Systems & Cybersecurity Lead (TL) says, 'I need a forensic report on the GCS-02 and the RTK base.'_
  - Ask: "Do you have the full telemetry and link logs preserved from before power-off?"
  - Ask: "Is the baseline image (03.2026-B) on the NAS and hash-verified?"
  - Ask: "Was the forensic imaging completed on the laptop drive and vehicle log, and is the chain-of-custody documented?"
  - Concede only when: Will accept a signed access request and a hash comparison report from the vendor.
- **FAA Harwick FSDO** — _Trigger: The Aviation Safety Officer (ASO) says, 'I’ve reported to the FSDO.'_
  - Ask: "Have you submitted the flight logs and telemetry within 24 hours as required?"
  - Ask: "Can you confirm whether the aircraft departed from an unauthorized location?"
  - Ask: "Is the flight outside the authorized test area and during a public event at the adjacent Harwick Fairgrounds?"
  - Concede only when: Will accept the full telemetry packet and a signed log of the submission timestamp from the ASO.
- **CP&L Program Office (Client)** — _Trigger: The Client Liaison (SPO) says, 'The client wants a status update on D-3.'_
  - Ask: "Is the data for Deliverable D-3 confirmed as usable?"
  - Ask: "Have you preserved the raw hyperspectral data and the calibration tarps status?"
  - Ask: "Has the Systems & Cybersecurity Lead verified the integrity of the data pipeline?"
  - Concede only when: Will accept a signed verification from the TL and a copy of the incident log from the NAS.

<!-- /section:rules -->

<!-- section:rubric -->

### 4. Evaluation & Grading Rubric

| Metric                                             | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Linked injects                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Metric 1: Command Integrity (30 Points)**        | ☐ **Fail:** Ops delayed the stop-service decision until I-09 forced it; failed to order the RPIC to hold UAS-11 in attitude mode after I-08b, allowing uncommanded flight; did not confirm telemetry consistency before authorizing manual control. ☐ **Pass:** Ops ordered the RPIC to hold UAS-11 in attitude mode after I-01 and I-11; confirmed telemetry consistency from RTK-1 and DAA-1 logs before authorizing manual control in I-20; preserved GCS-02 and radio state throughout. ☐ **Excellence:** Ops preemptively ordered the RPIC to switch to attitude mode at I-01, citing ISP Section 9.1; immediately initiated telemetry correlation between RTK-1, DAA-1, and aircraft logs; confirmed GCS-02 state preservation before I-11b and I-17b, preventing evidence loss. | I-01, I-08, I-11, I-17b, I-20   |
| **Metric 2: Cyber-Physical Trust (30 Points)**     | ☐ **Fail:** IT reset the controller after I-08b, destroying evidence; failed to compare aircraft GNSS logs with RTK-1 and DAA-1 logs; relied on the Payload Operator's HMI instead of forensic logs. ☐ **Pass:** IT verified the RTK-1 and DAA-1 logs against aircraft telemetry; confirmed the home point change was triggered by a spoofed GPS signal from 10.17.40.11 in I-11; compared firmware hashes in I-13b and confirmed mismatch. ☐ **Excellence:** IT proactively compared aircraft GNSS logs with RTK-1, DAA-1, and SV-1/SV-2 logs before I-11; identified the spoofed GPS signal from 10.17.40.11 in I-11; confirmed the remote session from 192.168.100.22 in I-17b using full log correlation, preventing misattribution.                                               | I-08, I-11, I-13b, I-17b, I-24b |
| **Metric 3: Interagency Coordination (20 Points)** | ☐ **Fail:** PIO issued a public statement in response to I-15 before General Manager approval; failed to notify Harwick Police Department and CCSO per C4 before I-04. ☐ **Pass:** PIO forwarded I-06 and I-15 to Corporate Communications and the ASO per HUOG-ERP Section 10.3; notified CCSO and Harwick Police Department via C4 contact list after I-04; confirmed FSDO contact (585-555-0177) was used in I-12. ☐ **Excellence:** PIO immediately forwarded I-06 and I-15 to Corporate Communications and the ASO; notified CCSO and Harwick Police Department per C4 contact list before I-04; confirmed FSDO contact (585-555-0177) was used in I-12 and maintained chain of custody for all external reports.                                                                 | I-04, I-06, I-12, I-16, I-28    |
| **Metric 4: Use of Doctrine (20 Points)**          | ☐ **Fail:** Trainees did not cite any plan section when reporting I-06; failed to reference HUOG-ISP Section 9.1 when declaring the incident in I-05. ☐ **Pass:** Trainees cited HUOG-ISP Section 9.1 in I-05 when declaring the incident; referenced HUOG-ERP Section 11.3 for log maintenance; used C4 contact list to report to CCSO and FSDO. ☐ **Excellence:** Trainees cited HUOG-ISP Section 9.1 and HUOG-ERP Section 11.3 in I-05 to declare the incident; referenced C4 contact list to report to CCSO and FSDO; cited HUOG-ISP Section 7.5 in I-27 to justify client notification; used C4 for all external reporting.                                                                                                                                                       | I-05, I-06, I-12, I-16, I-27    |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->

### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room team by team, and write each response on a whiteboard to visualize the feedback. This helps surface both strengths and gaps in real time.

**Key Discussion Questions for Ghost Flight at Birch Hollow:**

- **Trust:** At the moment you received I-02, when did you stop trusting the telemetry from the GCS-02, DAA-1, and RTK-1, and what evidence made you switch from 'system says' to 'field says'? _(Objective: Cyber-Physical Trust)_
- **The Gap:** When you saw the unauthorized remote session from IP 192.168.100.22 in I-17b, what did you treat as evidence and what did you treat as a ticket to action? What would have made you decide to isolate the GCS-02 sooner, based on C1 and C2? _(Objective: Command Integrity)_
- **The Call:** At I-20, when you had to choose between keeping automation and risking a lake landing or switching to manual/attitude mode, what factors tipped the balance? What would have let you decide faster, and which part of the EOP (e.g. C3, C4) should have triggered that decision earlier? _(Objective: Incident Response Continuity)_
- **The Vendor:** The compromised 915 MHz link originated from a vehicle with RF equipment. When did you first consider bringing in the system vendor and the law enforcement (CCSO) contact, and what evidence would have triggered that step before the field report (I-23)? _(Objective: Interagency Coordination)_
- **The Plan:** The flight path change was not in the Kit Log (FOM-4). When did you realize that the standard operating procedure in C4 (Lakeshore Flight Area) was being bypassed, and how did you reconcile operational pressure with compliance under C3? _(Objective: Incident Response Continuity)_

<!-- /section:hotwash -->

_End of Handbook_
