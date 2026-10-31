# Controller / Evaluator (C/E) Handbook
## Ghost Pumps — Infusion Pump Integrity and Clinical Trust

Exercise Date: [Date] · Location: Ottawa River Regional Medical Center, Toledo, Lucas County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber-physical incident involving unauthorized changes to infusion pump drug libraries and network scanning that compromise patient safety and system trust. The scenario centers on a ransomware-like attack through stolen vendor credentials, resulting in altered pump safety limits, loss of central telemetry, and cascading operational and communication challenges. The exercise spans four phases over 4 hours, beginning at 14:20, with a focus on decision-making under pressure, evidence preservation, interagency coordination, and disclosure to families and the public. Evaluators should watch for adherence to HICS roles, timely activation of Level 2 status, proper use of downtime procedures, the handling of high-alert medication events, and the chain of evidence preservation before any system restoration. Key gaps to identify include premature system reconnection, failure to validate logs, and inappropriate public statements.

The arc moves from initial detection (Phase 1) through network isolation decisions (Phase 2), containment trade-offs (Phase 3), and verification and recovery planning (Phase 4). The exercise tests the ability to balance patient safety against operational continuity, manage external reporting, and maintain transparency with families and media. The core challenge is not just technical but organizational: when to trust systems again, how to explain the failure, and who must approve what before action.

Evaluators must monitor whether roles are correctly delegated, whether the ISO leads evidence preservation, whether the CNO implements safe downtime procedures, and whether the PIO avoids premature or unverified statements. The exercise ends with a decision point on reconnecting monitoring, testing the team’s ability to plan for recovery under uncertainty.

**Objectives:**
- **Cyber-Physical Risk:** Demonstrate the ability to recognize a device-integrity incident from clinical and technical signs and to assign high-alert infusions a safe manual process.
- **Isolation Decision:** Demonstrate the ability to make the device-network isolation decision jointly (Information Security, Clinical Engineering, Nursing, the CMO and the AOC), with the clinical costs stated before the decision.
- **Evidence and Reporting:** Demonstrate the ability to preserve evidence and to report to the manufacturer, the FDA, the FBI, CISA and H-ISAC on the clocks the plans name.
- **Patient and Public Communication:** Demonstrate the ability to disclose to an affected family before the public does and to hold a statement to confirmed facts.

**Plan sections exercised:**
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or islands layout simulating the Hospital Command Center (HCC), Room A-114, with a central main screen and whiteboard.
- Team A (Command): AOC and HCC leadership at the front-center table.
- Team B (Technology): ISO and IT staff at the front-left table.
- Team C (Clinical): CNO and nursing leadership at the front-right table.
- Team D (Infrastructure): CE and Clinical Engineering at the back-left table.
- Team E (Communications): PIO at a rear table, isolated from the main HCC to simulate delayed access to information; must walk to the HCC for updates, reinforcing the need for coordination.
- Equipment needs: Projector for main-screen injects, whiteboard for ICS-201 and timeline, printed inject deck, optional simulated radios/phones for roleplay.
- Materials for players: One printed HCC binder per team, access to inject deck and EOP references.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: you represent everyone outside the hospital who the players might call. When a player says 'I call the sheriff', you answer as the local law enforcement contact. Do not explain. Do not guide. Do not make it easy.

Do not make it easy: If a player says, 'We would never disconnect the telemetry server,' respond as the CE: 'Then you’re choosing to keep a networked device that was scanned by an attacker, and you’re not doing anything to stop the data flow. That’s not a safe choice.'

Managing Time: Use the scripted time-jump announcement to shift time. Say: 'PAUSE EXERCISE. We are jumping forward 30 minutes. All players, update your timelines and status. RESUME.'

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond as the role: 'Then you’re not using the system we’ve been trained to use. That’s a policy violation. I need to know what you’re doing instead.'

Delivering injects: Say 'This just came in.' or 'This is on the main screen.' Do not explain the source or context.

This is an exercise: When a player says, 'This isn’t real,' respond: 'In this room, it is real. You are making decisions that will affect lives. Act as if it is.'

REAL WORLD, REAL WORLD: When a player says, 'I’d call the FBI in real life,' respond: 'Then you’re not in the exercise anymore. This is not real life. You are making decisions under a controlled scenario. Stay in the room.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Pump maker incident response lead** — _Trigger: ISO calls the pump maker's security desk_
  - Ask: "Do you have the logs preserved from the session broker and the pump server? No? Call me back when you have evidence."
  - Ask: "Do you have a signed copy of the library 4.2.2 that shows it was not issued by you? No? Then you cannot claim it was not authorized."
  - Ask: "Do you have a record of the vendor portal breach date and the account that was compromised? No? Then you cannot confirm the credential theft."
  - Concede only when: Will accept preserved logs and a written timeline.
  - Concede only when: Will provide a signed statement of the library’s origin and a copy of the vendor portal breach report.
  - Concede only when: Will send a forensic engineer to assist with the root-cause analysis if the hospital provides access to the session broker and pump server.
- **FBI Cleveland Field Office duty agent** — _Trigger: ISO calls the FBI_
  - Ask: "Have you preserved the session broker logs and the pump server memory image? No? Then you’ve destroyed evidence."
  - Ask: "Do you have the source IP address 203.0.113.77 and the timestamps for the scan? No? Then you’re not ready for federal investigation."
  - Ask: "Can you confirm the account pumplink-support was not used in any other known incident? No? Then you’re not a priority for our cyber squad."
  - Concede only when: Will accept preserved logs and a timeline of system changes.
  - Concede only when: Will assign a cyber agent to review the forensic package within 24 hours if the hospital provides a complete chain of custody.
  - Concede only when: Will not block the hospital’s access to the vendor’s emergency patch if the hospital provides a signed affidavit of evidence preservation.
- **Ohio Department of Health (regulator)** — _Trigger: ISO or AOC reports to the state_
  - Ask: "Have you reported this to the state within 24 hours? No? Then you are in violation of 42 CFR 390.300."
  - Ask: "Do you have a record of the 41 pumps that were compromised? No? Then you cannot prove you have the capacity to prevent future incidents."
  - Ask: "Is the patient safety report filed with the state’s healthcare reporting system? No? Then you are not compliant with HHS cybersecurity performance goals."
  - Concede only when: Will accept a completed breach assessment worksheet (45 CFR 164.402) within 48 hours.
  - Concede only when: Will defer the on-site review if the hospital provides a signed timeline and a copy of the forensic report.
  - Concede only when: Will not issue a citation if the hospital confirms all high-alert infusions were reviewed and documented.
- **Channel 11 reporter Laura Chen** — _Trigger: PIO receives media inquiry_
  - Ask: "Do you have a statement from the CNO on the insulin event? No? Then you’re not ready to talk."
  - Ask: "Can you confirm the pump was changed to 4.2.2? No? Then you’re not telling the truth."
  - Ask: "When will you release a full statement to the public? No? Then you’re not in control of the narrative."
  - Concede only when: Will accept a quote from the CNO on patient safety if cleared by the ISO and CPO.
  - Concede only when: Will delay airtime if the hospital provides a verified timeline of the incident.
  - Concede only when: Will not use the word ‘hacked’ unless the hospital confirms it in writing.
- **Health-ISAC (information sharing partner)** — _Trigger: ISO contacts Health-ISAC_
  - Ask: "Have you shared the threat indicator (203.0.113.77) with Health-ISAC? No? Then you’re not protecting the healthcare sector."
  - Ask: "Do you have a record of the vendor portal breach on March 9? No? Then you’re not participating in collective defense."
  - Ask: "Is your network segmented from the device network? No? Then you’re not following the HHS guidance on medical device security."
  - Concede only when: Will accept a signed report of the incident and a copy of the forensic findings.
  - Concede only when: Will share threat intelligence with the hospital if the hospital provides a signed NDA.
  - Concede only when: Will not notify other members until the hospital confirms the incident is contained.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops failed to convene the joint decision team (ISO, CE, CNO, CMO, AOC) within 5 minutes of I-05, delayed the stop-service decision until I-09 forced it, and did not state the clinical cost of isolation before choosing full network isolation. ☐ **Pass:** Ops convened the joint team by I-05, made the isolation decision with full discussion of clinical cost (e.g., loss of central telemetry, manual lab reporting), and documented the decision in the incident log per EOP Section 5. ☐ **Excellence:** Ops proactively convened the joint decision team at I-04 after the first near-miss, anticipated the isolation decision point, and pre-identified clinical risks (e.g., loss of central telemetry, manual lab reporting) for inclusion in the decision framework before I-05. | I-04, I-05, I-10, I-19 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT failed to preserve the pump server and session broker after I-03, reset the controller after I-08b, destroying evidence, and did not block the vendor account or source IP before I-08. ☐ **Pass:** IT preserved ORRMC-PUMP01 and ORRMC-VSB01 per EOP Section 3, blocked the account pumplink-support and the source IP 203.0.113.77 after I-03, and confirmed logs were captured before rebuilding. ☐ **Excellence:** IT immediately isolated ORRMC-PUMP01 and ORRMC-VSB01 after I-03, captured memory and logs before any rebuild, and initiated forensic imaging of the broker and server as a precaution, per C3 and EOP Section 3. | I-03, I-08, I-16, I-18 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO failed to disclose to an affected family before the public did, released a statement before the CMO cleared it, and confirmed a cause in the social media response. ☐ **Pass:** PIO disclosed to an affected family before I-09, released a holding statement approved in advance (EOP Section 10), and did not confirm a cause or patient event in any public response. ☐ **Excellence:** PIO proactively contacted the family of ICU 3 South bed 3 before I-13, confirmed the CMO had met with them, and issued a public statement only after the CMO, ISO, and CPO cleared it, per C4 and EOP Section 10. | I-09, I-13, I-14, I-17 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite EOP Section 3 for the Cyber 2 classification, did not reference C3 for manufacturer reporting, and did not mention EOP Section 5 for the isolation decision process. ☐ **Pass:** Students cited EOP Section 3 to justify the HCC activation and Cyber 2 classification, referenced C3 for reporting to the manufacturer and FDA, and cited EOP Section 5 to justify the joint decision process. ☐ **Excellence:** Students cited EOP Section 3 (Cyber 2 classification), C3 (manufacturer reporting), and EOP Section 5 (joint decision process) in every major decision point, including I-05, I-10, and I-19, and referenced C4 for media control. | I-02, I-03, I-05, I-07, I-08, I-10, I-16, I-18 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, and write each response on a whiteboard to create a shared visual record. Keep the discussion focused on actions, decisions, and communication.

**Key Discussion Questions for Ghost Pumps:**
- **Trust:** At the moment when Clinical Engineering reported that 41 pumps were on an unapproved library (I-02) and that telemetry had dropped (I-02), what caused you to stop trusting the system’s integrity, and what evidence made you believe the technical report over the clinical observation? _(Objective: Cyber-Physical Risk)_
- **The Gap:** When the nurse supervisor reported that one-to-one observation was now required for 12 high-risk patients (I-11), and that portable monitors were unavailable, how did you assess the gap between the technical plan and the actual bedside capability? What would have let you decide faster to bring in a vendor or external support? _(Objective: Isolation Decision)_
- **The Call:** When the family posted on social media that 'a nurse just told me the pump gave her too much medicine' (I-17), what made you decide to contact the family before the public did? What information were you allowed to share, and what would have changed your timing? _(Objective: Patient and Public Communication)_
- **The Evidence:** After Anil Desai reported that six high-alert infusions had started on the compromised pumps (I-06), you were asked whether to review all six by hand. What criteria did you use to decide that the evidence was not reliable enough to trust, and when did you decide to report to the FDA and CISA under EOP 4.3 and C3? _(Objective: Evidence and Reporting)_
- **The Plan:** When the ISO proposed to reconnect only the monitoring network after rebuilding the telemetry server (I-19), what factors influenced your decision to accept or reject that plan? How did the plan name (EOP 4.3) and the clock on the plan guide your timing for approval? _(Objective: Isolation Decision)_
<!-- /section:hotwash -->



*End of Handbook*

