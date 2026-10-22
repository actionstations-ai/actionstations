# Controller / Evaluator (C/E) Handbook
## pH on the Edge — Caustic Overfeed & Public Health

Exercise Date: [Date] · Location: Riverside Water Treatment Plant, Millbrook, Carver County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) simulating a cyber-physical incident at the City of Millbrook Department of Water & Sewer, where a remote-support session through an unapproved DosaTech ScreenBridge agent on MBW-HMI-02 results in a malicious increase of the NAOH-FC-203 caustic feed setpoint to 38 mg/L — exceeding the PLC hard limit of 40 mg/L and causing a pH rise to 9.3 in Zone 1. The HMI falsely reports normal values, creating a critical mismatch between digital control and physical reality, triggering a public health emergency. The exercise spans four phases over four hours: (1) The Sighting (0:00–1:00) tests initial recognition of anomalous data and incident validation; (2) Loss of Control (1:00–2:00) evaluates coordination across technical, regulatory, and public communication teams amid spreading crisis; (3) Manual Operation (2:00–3:00) challenges the team to make a high-consequence decision to halt automation and fall back to manual control; and (4) Restoration & Verification (3:00–4:00) tests verification of physical safety and phased return to automatic control under forensic and regulatory constraints. Evaluators should watch for: failure to recognize the HMI/physical data mismatch, premature return to automatic control, unauthorized disclosure of attack details, premature public statements, and failure to preserve forensic evidence. The team must balance operational urgency with procedural integrity, regulatory compliance, and public trust.

**Objectives:**
- **Control System Integrity:** Demonstrate the ability to detect and respond to a mismatch between HMI data and field instruments, prioritizing physical evidence over screen displays when a hard-wired safety switch has not tripped and lab results indicate a hazardous condition.
- **Public Health Decision-Making:** Demonstrate the ability to declare a Level 3 emergency and issue a Do Not Drink advisory within 2 hours of confirming lab results showing finished-water pH above 9.5, based on the Water Quality Manager's verification and the Director's approval.
- **Cyber-Physical Incident Response:** Demonstrate the ability to isolate the control system, engage the FBI/CISA liaison, and prevent further remote access while preserving evidence, despite the network being compromised.
- **Public Information Consistency:** Demonstrate the ability to release a pre-scripted, fact-based advisory through MillbrookAlert, the website, and social media within 45 minutes of the advisory decision, using approved language and avoiding speculation.

**Plan sections exercised:**
- City of Millbrook Department of… › Section 7 › 7.1 Setpoint Limits (chemical feed and pumping)
- ERP › Section 4 › 4.4 Level 3 — Public Health Emergency
- ERP › Section 11 › 11.3 Known Remote-Access Risk
- ERP › Section 5 › 5.3 External Reporting Clocks
- City of Millbrook Department of… › Section 5 › 5.2 Sequence
- ERP › Section 5 › 5.4 Pre-Scripted Messages
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape layout: The Control Room (Team A: Operations) sits at the front-facing table, with the SCADA/IT team (Team B) to the right, Public Information (Team C) to the left, Water Quality (Team D) behind the IC, and Security (Team E) at a rear table. The regulator liaison (Team F) sits at a separate, isolated table at the back, near the exit, to simulate external coordination.
- All teams must use the same HMI screen mockup and lab report printouts. The ICS-201 form is posted on a whiteboard at the front.
- The Public Information Officer (PIO) must walk to the back table to receive external calls, simulating a real-world delay and friction in information flow.
- Equipment needs: Projector for inject display, whiteboard for ICS-201, printed inject deck (with time-stamped slips), optional simulated radios/phones for field communications.
- Materials for players: Printed inject deck, HMI screen mockup, lab report printouts, ICS-201 form, access to the ERP and Public Communications Plan (MDWS-PCP-2026) documents.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell — you play everyone outside the room. If a player says 'I call the sheriff,' you answer as the Sheriff's Deputy. You are not a coach; you do not suggest actions, explain procedures, or clarify roles. Do not make it easy: if a player says 'I call CISA,' you do not say 'They’re on the line.' Instead, say 'The CISA line is busy. Try again in 10 minutes.' If a player says 'I call the vendor and they say yes,' you must respond as the vendor: 'We cannot begin until the signed access request is uploaded and approved.'

Managing Time: At the 30-minute mark, say: 'PAUSE EXERCISE. We are jumping forward 30 minutes. The lab has confirmed pH 9.3 and caustic 38 mg/L. The control system is isolated, but the HMI still lies. The public is demanding answers. RESUME.'

Handling artificialities: If a player says 'I wouldn’t use that system,' respond as the character: 'That’s not a valid workaround. The system is compromised, and you must follow the approved path. Do not bypass the chain of custody.'

Delivering injects: Say only 'This just came in.' or 'This is on the main screen.' Do not explain the context or reveal the full narrative.

This is an exercise: If a player says 'I want to know what happened,' respond: 'This is an exercise. We are not revealing the full history. Focus on your role.'

REAL WORLD, REAL WORLD: If a player says 'I’d never do that in real life,' say: 'REAL WORLD, REAL WORLD. This is a real-life scenario. You must act as if it were happening now.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Ohio EPA DDAGW Central District (Regulator Liaison)** — _Trigger: Player calls 'Ohio EPA' or 'DDAGW' and says 'We’re in a public health emergency.'_
  - Ask: "Do you have the lab results preserved and uploaded to the DDAGW-ELR-2026 portal?"
  - Ask: "Have you notified the state drinking-water program via phone within 1 hour of final verification?"
  - Ask: "Do you have the full audit log from the DosaTech ScreenBridge session, including the fake vendor name and no MFA?"
  - Concede only when: Will accept a signed access request and a lab report upload confirmation.
  - Concede only when: Will approve the advisory lift if two clean sample rounds are submitted.
  - Concede only when: Will confirm receipt of the forensic evidence package (SEC-4 form and image) within 24 hours.
- **CISA / FBI Cyber Incident Liaison (via WaterISAC)** — _Trigger: Player says 'We’ve preserved the evidence and want to report it to CISA.'_
  - Ask: "Do you have the full forensic image of MBW-HMI-02, including the DosaTech Session Log (10.200.144.122)?"
  - Ask: "Has the chain of custody (SEC-4 form) been completed for all evidence?"
  - Ask: "Can you confirm the attacker used a fake vendor name and bypassed MFA via an unapproved path?"
  - Concede only when: Will accept a WaterISAC report with the incident reference MDWS-2026-0014.
  - Concede only when: Will provide attribution support after full forensic review.
  - Concede only when: Will confirm when CISA has assigned an incident number and opened a case.
- **Kessler Controls (Approved Vendor)** — _Trigger: Player says 'We need remote access to fix the PLC.'_
  - Ask: "Do you have a signed Kessler Controls access request (F-4) on file?"
  - Ask: "Is the vendor’s remote-access portal configured to allow sessions only after a signed request and chain of custody verification?"
  - Ask: "Do you have a ticket number for the session and a valid MFA token?"
  - Concede only when: Will only begin a session if the signed access request is uploaded and approved.
  - Concede only when: Will accept a ticket number and a copy of the WQ approval for remote work.
  - Concede only when: Will not proceed without a verified chain of custody and no prior unapproved access.
- **Carver County Emergency Operations Center (EOC)** — _Trigger: Player says 'We need mutual aid.'_
  - Ask: "Have you submitted the OHWARN mutual-aid request via the MDWS-OHWARN-2026 portal?"
  - Ask: "Is the incoming staff onboarding checklist (Section 8.4) complete and signed?"
  - Ask: "Do you have a confirmed ETA for the incoming operators?"
  - Concede only when: Will confirm the EOC has activated and is tracking the mutual-aid deployment.
  - Concede only when: Will accept a signed onboarding checklist for incoming staff.
  - Concede only when: Will update the EOC dashboard once the team is on-site and cleared.
- **Local TV Station (Channel 4 News)** — _Trigger: Player says 'We have a media inquiry.'_
  - Ask: "Do you have a draft statement approved by the Director and WQ?"
  - Ask: "Is the media statement consistent with the Public Communications Plan (MDWS-PCP-2026)?"
  - Ask: "Can you confirm that no internal approvals were bypassed to release the statement?"
  - Concede only when: Will broadcast the statement if it matches the approved template.
  - Concede only when: Will follow up with a live segment if the statement is released and verified.
  - Concede only when: Will not publish a statement if it contradicts lab data or regulatory guidance.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops delayed the stop-service decision until I-09 forced it, and failed to initiate the HMI-field mismatch protocol immediately after I-01; delayed notifying the WQ Manager and SCADA / IT Security Manager until I-04, despite the field gauge (AIT-302) showing pH 9.3 and the physical sensation of bitter water. ☐ **Pass:** Ops immediately acknowledged the field report in I-01, ordered the operator to trust the field gauge (AIT-302) and physical sensation, and initiated the HMI-field mismatch protocol per EOP 7.1; notified the WQ Manager and SCADA / IT Security Manager promptly after I-01. ☐ **Excellence:** Ops immediately recognized the HMI-field mismatch in I-01, ordered the operator to trust the field gauge (AIT-302) and physical sensation, and initiated the HMI-field mismatch protocol per EOP 7.1 before any inject forced it; proactively ordered the manual override on PLC-02 via local panel before I-03, preventing further escalation. | I-01, I-02, I-03, I-04, I-09 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT reset the controller after I-08b, destroying evidence; failed to preserve the session recording on MBW-HMI-02 after I-05, despite C3 requiring that no HMI or PLC be powered off unless life safety requires it. ☐ **Pass:** IT confirmed the unauthorized remote access via DosaTech ScreenBridge in I-05, isolated the control network, disabled remote-access gateways (MBW-JUMP-01, MBW-FW-01), and preserved the audit log and session recording on MBW-HMI-02 per C3; confirmed the forensic image capture in I-21c. ☐ **Excellence:** IT immediately isolated the control network and disabled remote-access gateways upon detecting the DosaTech ScreenBridge session in I-05, preserved the session recording on MBW-HMI-02 and MBW-JUMP-01, and initiated SEC-4 chain-of-custody before any action was taken; confirmed the forensic image capture in I-21c and engaged FBI/CISA liaison via WaterISAC before any vendor access was attempted. | I-05, I-10c, I-12, I-19a, I-21c |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO released a public statement before the advisory was approved by the Director and WQ in I-17; failed to use the pre-scripted template in I-12, instead posting a reactive message to social media. ☐ **Pass:** PIO used the pre-scripted template in I-12 to broadcast the MillbrookAlert message; submitted the draft advisory in I-17 for sign-off by IC and WQ; confirmed the release of the final statement in I-19g after Director approval. ☐ **Excellence:** PIO immediately activated the pre-scripted template in I-12 to broadcast the MillbrookAlert message within 10 minutes of I-01; submitted the draft advisory in I-17 for sign-off; confirmed the release of the final statement in I-19g after Director approval; maintained consistency across all channels using MDWS-PCP-2026, Section 10. | I-12, I-17, I-19g, I-21c |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite any plan section by number; did not reference EOP 7.1, ERP Section 4.4, or MDWS-PCP-2026 when making decisions, despite the documents explicitly naming them. ☐ **Pass:** Students cited EOP 7.1 to justify the HMI-field mismatch protocol; referenced ERP Section 4.4 to declare the Level 3 — Public Health Emergency; cited MDWS-PCP-2026, Section 10 to justify the public statement language. ☐ **Excellence:** Students cited EOP 7.1, Section 7.1 Setpoint Limits (chemical feed and pumping) to justify trusting field instruments over HMI; referenced ERP Section 4.4 to declare the Level 3 — Public Health Emergency; cited MDWS-PCP-2026, Section 10 to justify the public statement language; cited C3 (Section 11.3 Evidence) to justify preserving the session recording and not powering off the HMI. | I-01, I-04, I-06, I-12, I-17, I-19g, I-21c |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, write responses on a whiteboard to capture real-time insights. Tip: Encourage concise, actionable feedback to focus the debrief on learning.

**Key Discussion Questions for pH on the Edge:**
- **Trust:** When did you first begin to distrust the HMI data, and what specific piece of evidence—field instrument, grab sample, or hard-wired switch—shifted your confidence from screen to reality? How did that moment align with the requirements in EOP 4.3 and C2 for independent safety systems? _(Objective: Control System Integrity)_
- **The Gap:** At the moment when the HMI showed normal operation but AIT-302 and grab samples indicated pH was rising toward 9.5, what process did you use to close the gap between digital and physical evidence? What would have made that verification faster or more certain? _(Objective: Control System Integrity)_
- **The Call:** When you made the call to declare a Level 3 emergency and issue the Do Not Drink advisory, what criteria from Section A.4.2 and C4 did you rely on to confirm the condition was hazardous? How did you ensure the Water Quality Manager’s verification and the Director’s approval were properly documented and time-stamped? _(Objective: Public Health Decision-Making)_
- **The Vendor:** When did you decide to bring in the system vendor, and what triggered that decision? What elements of C3’s revised protocols (e.g., no remote access without approval, forensic chain of custody) were violated by the attacker, and how did your team’s actions reflect those rules? _(Objective: Cyber-Physical Incident Response)_
- **The Message:** When you released the pre-scripted advisory through MillbrookAlert and social media, what parts of the approved language from C3’s template did you use, and what did you adjust under pressure? How did you ensure consistency across all public channels, and what would have made that process more reliable? _(Objective: Public Information Consistency)_
<!-- /section:hotwash -->



*End of Handbook*

