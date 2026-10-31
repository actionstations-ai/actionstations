# Controller / Evaluator (C/E) Handbook
## Core Collapse — Mass Casualty Surge During a Network Outage

Exercise Date: [Date] · Location: Ottawa River Regional Medical Center, Toledo, Lucas County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a critical infrastructure failure at Ottawa River Regional Medical Center, where a core network switch failure triggers a cascading loss of clinical systems, including the EHR, lab, imaging, and secure messaging. The scenario unfolds during a mass casualty incident involving a multi-vehicle crash with a fuel tanker, placing the hospital under extreme operational stress. The exercise spans four hours, moving through phases of initial system downtime, first patient wave, capacity surge, and post-restoration record reconciliation. Evaluators should closely monitor the team’s adherence to HICS levels (Level 3 to Level 1), their use of downtime procedures, decisions on patient triage and expectant classification, and the management of identity duplication and data integrity during a partially restored EHR. Watch for gaps in communication between roles, especially on timing of system restoration, staff endurance, and external reporting obligations.

The scenario tests the organization’s ability to sustain care under paper-based operations, manage surge capacity, and make ethically complex decisions under pressure. Key performance indicators include the timely activation of HCC, proper use of downtime viewers and override supplies, and the handling of external pressures from EMS, media, and regulators. The exercise concludes with the challenge of reconciling paper and electronic records, emphasizing long-term data integrity and compliance with regulatory reporting timelines.

**Objectives:**
- **Surge on Downtime:** Demonstrate the ability to accept and treat a mass casualty incident with the EHR, laboratory and imaging interfaces unavailable, using Code Triage and the Patient Surge and Evacuation Annex.
- **Patient Identification and Tracking:** Demonstrate the ability to track patients on paper with trauma and DT- numbers without creating duplicate or crossed identities.
- **Capacity and Crisis Standards:** Demonstrate the ability to open surge space, move patients, request transfers and decide on crisis standards of care with physician leadership.
- **Return to the Record:** Demonstrate the ability to decide when a partly restored system may be used and how the paper record is reconciled.

**Plan sections exercised:**
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout with five distinct tables for the five roles: 
 - Team A (Command): Administrator on Call (AOC), Incident Commander
 - Team B (Technology): Director of IT (DIT), Infrastructure Branch
 - Team C (Clinical): Chief Nursing Officer (CNO), Operations Section
 - Team D (Medical Care): ED Medical Director (EDMD), Medical Care Branch
 - Team E (Communications): Public Information Officer (PIO), Communications Branch

- The PIO (Team E) must sit at a rear table, isolated from the main HCC, to simulate the need to walk to the HCC for information and approvals. This reinforces the real-world constraint that public communications must be cleared through the command structure.

- Equipment needs:
 - Projector for main-screen injects (e.g., status boards, media posts)
 - Whiteboard for the ICS-201 and real-time status tracking
 - Printed inject deck (laminated, indexed by time)
 - Optional: simulated radios/phones for realism (e.g., handheld for EMS, desk for switchboard)

- Materials for players: Printed role binders, inject cards, ICS-201 worksheet, downtime procedures manual, and a list of external contacts.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: you represent everyone outside the hospital who contacts the players. When a player says, 'I call the sheriff,' you respond as the sheriff’s office. When a player says, 'I notify CMS,' you answer as the CMS regional office. Never explain the system or the scenario. Respond only as the external party.

Do not make it easy. For example, if a player says, 'We’ve already reported to the FBI,' you must respond as the FBI agent: 'We haven’t received any report from you. Provide a formal incident report with your case number and contact details within 24 hours.'

Managing Time: Use the scripted time-jump announcement: 'PAUSE EXERCISE. We are jumping forward 30 minutes. [Insert time and context]. RESUME.'

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond as the external party: 'This is a real-world emergency. We are not here to debate policy. We need your response now.'

Delivering injects: Say only, 'This just came in,' or 'This is on the main screen,' when introducing an inject. Do not provide context or interpretation.

This is an exercise: Always remind players: 'This is an exercise. Do not use real contact details or call real agencies.'

REAL WORLD, REAL WORLD: When a player says, 'I’m not sure what to do,' reply: 'REAL WORLD, REAL WORLD. You are in a real emergency. Make a decision now.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Lucas County EMS Dispatch** — _Trigger: AOC says: 'We accept the first wave.'_
  - Ask: "EMS to Ottawa River: How many critical patients do you have on paper? Can you confirm a second wave will be received? We need to know if you’re still accepting."
  - Ask: "We have four other hospitals on standby. If you exceed capacity, we will divert the second wave to another facility. Confirm your acceptance now."
  - Concede only when: Will accept a written triage log and a status update every 30 minutes.
  - Concede only when: Will not divert if the hospital confirms it is at full capacity and has a recovery plan.
- **Ottawa River Regional Medical Center EHR Vendor (CareLine Systems)** — _Trigger: DIT says: 'We need to restore the EHR.'_
  - Ask: "We have not received a formal access request or ticket number. Please provide a signed access request and a ticket ID from your IT helpdesk."
  - Ask: "Do you have a forensic image of the server before the incident? We need to validate the integrity of the backup."
  - Ask: "Our support policy requires a signed service agreement and a verified patch level. What is your current version?"
  - Concede only when: Will provide remote support only after a signed access request and ticket number are received.
  - Concede only when: Will send a forensic analyst if the hospital provides a chain-of-custody log and a legal hold notice.
- **Ohio Department of Health (ODH) – Healthcare Emergency Response** — _Trigger: AOC says: 'We are reporting to ODH.'_
  - Ask: "We require a completed HHS-1004 form with patient counts, critical status, and resource needs. Where is it?"
  - Ask: "We have not received a formal report from you. Your status must be submitted within four hours of activation. What is your report number?"
  - Ask: "How do you verify that you are not missing any critical patients in the ED or ICU?"
  - Concede only when: Will accept a verbal update and a follow-up written report within six hours.
  - Concede only when: Will not issue a mutual aid request until the hospital confirms it is at Level 1 and has activated HICS.
- **Channel 11 Reporter Laura Chen** — _Trigger: PIO says: 'We’re preparing a statement.'_
  - Ask: "How many patients are dead? We have a family who says their relative is critical and no one will talk to them."
  - Ask: "We have a video of a paper tracking board visible from the ED door. Is that true?"
  - Ask: "Can you give us a name? We are on air in 15 minutes."
  - Concede only when: Will accept a statement that says 'the hospital is managing a surge and will not confirm individual cases.'
  - Concede only when: Will not publish any name or detail unless cleared by the HCC and CPO.
- **FBI Cleveland Field Office – Cyber Incident Response** — _Trigger: DIT says: 'We believe this is a ransomware attack.'_
  - Ask: "We have not received a formal cyber incident report. Provide your case number, the date of the attack, and a contact for the forensic team."
  - Ask: "Do you have preserved logs from the network core and firewall? We need to validate if this is a ransomware event."
  - Ask: "We require a chain-of-custody for all evidence, including disk images and memory dumps."
  - Concede only when: Will assign an on-site agent if the hospital provides a legal hold notice and a signed forensic access agreement.
  - Concede only when: Will not initiate a joint investigation until the hospital confirms it has engaged outside counsel and a forensic firm.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops roles failed to synchronize on surge activation: the AOC did not convene the HCC within 30 minutes of I-04, and the CNO did not activate the call-in tree until 10 minutes after I-02, delaying staffing for the ED and surgical teams. The Liaison Officer did not open a line to Lucas County EMA until 1:30, after I-08, missing the opportunity to coordinate patient diversion and resource requests in real time. ☐ **Pass:** The AOC convened the HCC within 30 minutes of I-04 and activated the call-in tree within 5 minutes of I-02. The Liaison Officer opened a line to Lucas County EMA and the regional healthcare coalition by 1:00, enabling timely coordination of patient diversion and staff requests. The CNO assigned three additional runners per Downtime Annex, Section 5, and the Surgical Pavilion activated ORs 3–5 for trauma after I-07. ☐ **Excellence:** The AOC convened the HCC within 15 minutes of I-04, activated the call-in tree immediately after I-02, and assigned a dedicated runner to the ED from Facilities to support triage. The Liaison Officer proactively contacted the regional healthcare coalition and Lucas County EMA before I-08, and the CNO deployed a pharmacist to the ED and PACU before I-13, anticipating medication errors. The AOC established a 15-minute reporting cycle for all sections by 1:00. | I-01, I-02, I-04, I-05, I-07, I-08, I-11, I-13 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** The Director of IT delayed the partial restore of C-212 despite having the March 10 backup config available, and did not verify the failure's non-malicious nature before proceeding. The EHR was used for charting after I-10 without a stable interface engine, creating a split record. The lab's hand-typed potassium result was accepted without a repeat, risking a critical medication error. ☐ **Pass:** The Director of IT chose to load the March 10 backup config onto C-212 to restore clinical VLANs within 10 minutes of I-01, and verified the failure was non-malicious via logs from both cores. The EHR was used only for read-only access after I-10, and the lab repeated the potassium stat and held both values until the result was confirmed. The Director of IT reported a stable interface engine by 22:30. ☐ **Excellence:** The Director of IT immediately loaded the March 10 backup config onto C-212 and verified the failure was non-malicious via logs from both cores within 5 minutes of I-01. The EHR was used only for read-only access after I-10, and the lab repeated the potassium stat and held both values until the result was confirmed. The Director of IT provided a real-time status update to the HCC every 15 minutes, and the interface engine was restored by 20:00. | I-01, I-05, I-10, I-18, I-21 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** The PIO released a statement to Facebook before confirming the hospital was open for emergencies, and did not consult the AOC or EDMD first. The PIO allowed a reporter to see the paper tracking board through the ED door for an hour, violating privacy policy. The AOC did not authorize a media statement until 2:35, after I-15. ☐ **Pass:** The PIO released a statement cleared by the AOC and EDMD after I-09, stating the ED was open and treating emergencies. The PIO told Lucas County EMS and the EMA to disseminate the same message. The paper tracking board was covered after I-20, and the CPO was notified of the exposure. The AOC approved the media statement within 10 minutes of I-15. ☐ **Excellence:** The PIO released a statement within 5 minutes of I-09, cleared by the AOC and EDMD, and directed the EMA and Lucas County EMS to echo the message. The paper tracking board was covered immediately after I-20, and the CPO was notified within 2 minutes. The PIO issued a holding statement for a potential media inquiry every 30 minutes, and the AOC approved a media briefing at 21:00. | I-09, I-15, I-20 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** The AOC did not cite any EOP section when activating Code Triage or declaring a Level 1 activation. The CNO did not reference Downtime Annex, Section 5 when assigning runners. The CMO did not cite Patient Surge and Evacuation Annex, Section 2 when authorizing crisis standards of care. The CPO did not reference C3 or C4 when reporting privacy violations. ☐ **Pass:** The AOC cited EOP Section 4 when convening the HCC and Patient Surge and Evacuation Annex, Section 3 when activating the family reunification center. The CNO cited Downtime Annex, Section 5 when assigning runners and C3 for emergency blood release. The CMO cited Patient Surge and Evacuation Annex, Section 2 for crisis standards of care. The CPO cited C3 and C4 for privacy disclosures and exposure. ☐ **Excellence:** The AOC cited EOP Section 4 and Patient Surge and Evacuation Annex, Section 3 for Code Triage activation and family reunification. The CNO cited Downtime Annex, Section 5 for runner assignment and C3 for emergency blood release. The CMO cited Patient Surge and Evacuation Annex, Section 2 for crisis standards of care and C4 for privacy policy. The CPO cited C3 and C4 for privacy violations and C2 for the after-action report. All decisions were documented in the HCC log with section references. | I-01, I-02, I-03, I-04, I-05, I-07, I-08, I-09, I-10, I-11, I-13, I-15, I-17, I-18, I-19, I-20, I-21 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the 3-Up, 3-Down method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, capture responses on a whiteboard, and emphasize that this is a no-blame, learning-focused discussion to surface key insights from the scenario.

**Key Discussion Questions for Core Collapse:**
- **Trust:** When did you first stop trusting the EHR or the lab report during the outage, and what evidence led you to make that decision instead of relying on the system? _(Objective: Surge on Downtime)_
- **The Gap:** At the 1:30 Facebook post, you had misinformation spreading while you were still assessing the actual status. What information did you need to decide whether to address the post publicly, and who should have made that call? _(Objective: Patient Identification and Tracking)_
- **The Call:** At 1:40, you received the IT memo recommending you stay on paper despite partial EHR recovery. What made you decide to keep using paper for orders, and how would a different decision have changed the workflow in the ED and ORs? _(Objective: Return to the Record)_
- **The Gap:** When the pharmacist reported duplicate antibiotic orders and tripled opioid pulls, what system or process failed to prevent those errors, and what immediate action could have closed that gap? _(Objective: Capacity and Crisis Standards)_
- **Trust:** When you were deciding whether to classify three patients as expectant at 2:55, what did you trust most—the clinical data, the ethics consult, or the pressure to use limited resources on 'saveable' patients—and how did that shape your decision? _(Objective: Capacity and Crisis Standards)_
<!-- /section:hotwash -->



*End of Handbook*

