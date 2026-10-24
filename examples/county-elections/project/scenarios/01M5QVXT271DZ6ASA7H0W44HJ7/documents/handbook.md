# Controller / Evaluator (C/E) Handbook
## Ghost Poll Pads — VoterTrack Compromise & Public Trust

Exercise Date: [Date] · Location: Lisle County Board of Elections, Carrow, Lisle County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber incident involving credential theft, data tampering, and public trust erosion at the Lisle County Board of Elections. The scenario centers on a phishing compromise of a voter registration clerk’s account, resulting in unauthorized alterations to 1,186 voter records in the VoterTrack system, spoofed communications to poll workers, and the spread of misinformation through official and social channels. The exercise unfolds over four 60-minute phases: Phase 1 (0:00–1:00) tests early recognition of anomalies and forensic awareness; Phase 2 (1:00–2:00) challenges unified command under pressure and public misinformation response; Phase 3 (2:00–3:00) demands high-stakes decisions on system isolation and manual operations; and Phase 4 (3:00–4:00) focuses on verification, trust restoration, and recovery under external scrutiny. Evaluators should watch for delayed incident declaration, failure to isolate compromised systems, inconsistent messaging, lack of forensic preservation, and resistance to manual operations despite clear risk.

The SimCell must maintain operational realism: no hand-holding, no explanations, and no validation of internal decisions. Watch for over-reliance on external partners, failure to invoke litigation holds, and absence of a unified public narrative. The SimCell must enforce the EOP’s chain of custody, preserve logs, and uphold the PIO’s exclusive media role. Critical gaps include not halting data flows after compromise, not verifying external claims, and not securing forensic evidence before system rebuilds.

**Objectives:**
- **Credential Integrity:** Demonstrate the ability to detect and isolate a compromised user account in VoterTrack by verifying login patterns, disabling access, and initiating forensic preservation of logs within 15 minutes of first anomaly report.
- **Pollbook Accuracy:** Demonstrate the ability to validate and correct pollbook data for Polling Location 6 using a trusted, air-gapped copy of the VoterTrack export, ensuring no unauthorized changes are applied during the emergency load.
- **Public Trust Management:** Demonstrate the ability to issue a unified public statement via the PIO that corrects a viral misinformation claim about voter deletion, using the EAC/CISA communications guide and citing verified data from the Voter Registration Manager.
- **System Containment:** Demonstrate the ability to isolate the VoterTrack database from the network and block external data exfiltration by disabling the forwarding rule and revoking API access from the compromised account within 10 minutes of confirmation.

**Plan sections exercised:**
- Lisle County Board of Elections… › Section 5
- Lisle County Board of Elections… › Section 6
- Lisle County Board of Elections… › Annex B
- Lisle County Board of Elections… › Section 10
- Lisle County Board of Elections… › Section 6 › 6.4 Impersonation of the Board
- Lisle County Board of Elections… › Section 10
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout with four main tables: Operations (CEO, Dep), IT/Security (IT, VSM, Sec), Communications (PIO), and Voting Systems (VSM, IT).
- Operations team at the front, facing the main screen and facilitator.
- IT/Security team seated together, near the back, with access to a whiteboard for ICS-201.
- Communications team at a rear table, isolated from main discussion, to simulate the PIO’s need to walk to the Operations Center for updates.
- Voting Systems team at a side table, adjacent to IT.
- Equipment needs: projector for injects, whiteboard for ICS-201, printed inject deck, optional simulated radios/phones.
- Materials for players: printed EOP sections (C1–C8), inject deck, ICS-201 form, fake hotline call sheet.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell — the world outside the room. If a player says, 'I call the sheriff,' you respond as the Lisle County Sheriff’s Office election liaison, Lt. Ray Duchesne, or as the 911 dispatcher. Do not make it easy: if a player says, 'I call CISA,' you respond with the regional Election Security Advisor (CISA Region 5) — not a helpful analyst, but a busy official who demands a ticket number and an EOP citation. For example, if a player says, 'We’ll just use the state database to fix it,' you reply, 'That data is not available to you — only the Secretary of State’s office can grant access. You must submit a formal request under C3.'

Managing Time: Use scripted time jumps. At 1:00 and 2:00, say: 'PAUSE EXERCISE. We are jumping forward 30 minutes. The situation has escalated. RESUME.'

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond: 'That’s not your call. The EOP requires you to use the air-gapped workstation (LCBOE-PB01) to rebuild the pollbook. You must follow protocol.'

Delivering injects: Say only, 'This just came in,' or 'This is on the main screen.' Do not explain. Do not clarify.

This is an exercise: remind players that real decisions have real consequences. If a player says, 'We’ll just call the media,' respond: 'The PIO is the only authorized voice. You must wait for her approval.'

REAL WORLD, REAL WORLD: If a player says, 'This is just a drill,' reply: 'This is not a drill. The system is compromised. Your actions are being recorded for federal review.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **CISA Region 5 Election Security Advisor** — _Trigger: Player calls CISA (555-0158) or says 'We need CISA help'_
  - Ask: "Do you have a CISA Incident Response Ticket (IRT) number?"
  - Ask: "Has the Secretary of State been notified per C3?"
  - Ask: "Can you provide a write-protected log image from LCBOE-FS01 for forensic review?"
  - Concede only when: Will accept a CISA IRT number and a signed EOP Section 7 compliance form.
  - Concede only when: Will provide a CISA incident advisory if you submit a validated report within 1 hour.
  - Concede only when: Will expedite a security assessment if you confirm the chain of custody log (COOP-DR-5) is intact.
- **VoterTrack Vendor (Tallgrass Civic Software) – KnowInk Support** — _Trigger: Player calls 555-0166 or says 'We need vendor help to restore VoterTrack'_
  - Ask: "Do you have a signed access request from the Director and Legal Officer?"
  - Ask: "Is Ticket #TICK-2026-1125 submitted?"
  - Ask: "Can you provide the hash of the trusted 10/28 export from LCBOE-PB01?"
  - Concede only when: Will restore service only after a signed access request and ticket number are submitted.
  - Concede only when: Will provide a forensic recovery tool if you confirm the transaction log is corrupted.
  - Concede only when: Will validate the air-gapped export hash before processing any data.
- **Ohio Secretary of State – Election Security Office** — _Trigger: Player calls 555-0141 (main line) or says 'We need state approval'_
  - Ask: "Have you declared CIRP 2 per EOP Section 5?"
  - Ask: "Can you provide the chain of custody log (COOP-DR-5) for the VoterTrack backup?"
  - Ask: "Is the statewide database in sync with your local corrections?"
  - Concede only when: Will confirm CIRP 2 status and provide a secure portal for data verification.
  - Concede only when: Will accept a written timeline of the incident and preserved logs from LCBOE-FS01.
  - Concede only when: Will issue a public statement endorsing your verification process if you submit a full report within 24 hours.
- **FBI Election Crimes Coordinator (Cincinnati Field Office)** — _Trigger: Player calls 555-0140 (hotline) and says 'We need the FBI to investigate'_
  - Ask: "Do you have a litigation hold in effect under C1?"
  - Ask: "Can you provide the MFA approval logs from Nina Ruiz’s phone (iPhone13-773A)?"
  - Ask: "Is the forwarding rule to 'nruiz@phishmail.net' documented in the forensic image?"
  - Concede only when: Will assign a special agent if you submit a preserved log image and a signed EOP Section 7 form.
  - Concede only when: Will not take jurisdiction unless you confirm the chain of custody (COOP-DR-5) is intact.
  - Concede only when: Will assist in criminal prosecution only if you provide a full timeline and evidence package.
- **Local News Reporter (The Carrow Courier)** — _Trigger: Player says 'We’ll issue a statement' or 'We’ll talk to media'_
  - Ask: "When is your media statement due?"
  - Ask: "Can you confirm your statement has been approved by the PIO and Legal Officer?"
  - Ask: "Do you have a quote from the Director for publication?"
  - Concede only when: Will publish your statement only if you provide a signed approval from the Director and PIO.
  - Concede only when: Will run a follow-up story if you submit a verification report within 2 hours.
  - Concede only when: Will not report on unverified claims, but will ask for a quote on the 1,186 record discrepancy.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops team delayed the stop-service decision until I-09 forced it, and did not initiate forensic preservation of logs from LCBOE-SQL01 and LCBOE-FS01 until after I-08b confirmed the compromise. ☐ **Pass:** Ops team disabled the compromised account 'nruiz@lislevotes.example' and isolated VoterTrack within 10 minutes of I-03, and confirmed the chain of custody for the air-gapped Pollbook build workstation LCBOE-PB01 after I-16. ☐ **Excellence:** Ops team initiated forensic preservation of logs from LCBOE-SQL01 and LCBOE-FS01 before I-08b, and confirmed the trusted copy on LCBOE-PB01 was unaltered and hash-matched prior to I-16. | I-03, I-03b, I-08b, I-16, I-20 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT team reset the controller after I-08b, destroying evidence of the attacker’s session, and failed to block phish.cisa.gov.lislevotes.example at the firewall until after I-08b. ☐ **Pass:** IT team confirmed the unauthorized session from IP 10.100.45.12 in I-14, blocked external data exfiltration via the forwarding rule in I-08b, and isolated the results website from the internet after I-08. ☐ **Excellence:** IT team detected the unauthorized session from IP 10.100.45.12 in I-14, confirmed the absence of a physical device and MFA prompt, and preserved logs in write-protected image on LCBOE-FS01 before I-09. | I-03, I-08b, I-14, I-20 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO issued a holding statement before verifying data with the Voter Registration Manager, and used the phrase 'no one was deleted' in I-17, which contradicted C3’s directive to say only what is known. ☐ **Pass:** PIO issued a unified public statement per C3 and the EAC/CISA Communications Guide after verifying data with Beth Saylor in I-21, and cited the verified status of the 1,186 records as falsely marked. ☐ **Excellence:** PIO issued a unified public statement using the EAC/CISA Election Infrastructure Incident Response Communications Guide (Section 7.2) before I-17, and confirmed the video in I-17 was fake using the rover team’s report. | I-17, I-21, I-22, I-25 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite EOP Section 5 or COOP-DR-1 when declaring CIRP 2 in I-11, and did not reference C3 for the public statement format. ☐ **Pass:** Students cited EOP Section 5 and COOP-DR-1 when declaring CIRP 2 in I-11, and referenced C3 for the public statement format in I-22. ☐ **Excellence:** Students cited EOP Section 5 and COOP-DR-1 when declaring CIRP 2 in I-11, referenced C3 for the public statement format in I-22, and cited COOP-DR-5 for the forensic log preservation in I-20. | I-09, I-11, I-20, I-21, I-22 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, and write each response on a whiteboard to visually capture insights. This helps identify strengths and gaps quickly and ensures collective ownership of the debrief.

**Key Discussion Questions for Ghost Poll Pads:**
- **Trust:** At the moment you received the I-03 inject about 1,186 edits from an unauthorized IP, when did you first stop trusting the system or the report? What signals made you question the integrity of the data or the user account? _(Objective: Credential Integrity)_
- **The Gap:** When you learned that Nina Ruiz’s MFA was approved but she was not physically present, and that no local login event occurred — at what point did you realize the system was compromised not by insider error, but by credential theft? How did that shift your understanding of the threat and your response? _(Objective: Credential Integrity)_
- **The Call:** At the I-15 decision point, you were asked to choose between isolating VoterTrack and risking operational delay, or keeping it running and risking false ballot issuance. What evidence or authority did you rely on to decide to isolate the system — and what would have made you decide faster, if you had to make that call under pressure? _(Objective: System Containment)_
- **The Evidence:** During the manual pollbook rebuild, you used an air-gapped copy of the VoterTrack export. At what point did you treat that evidence as trusted, and when did you begin to question it? How did you verify its integrity, and what would have made you more confident in the data before applying it? _(Objective: Pollbook Accuracy)_
- **The Statement:** When you issued the public statement to correct the viral claim about voters being deleted, what sources did you use to validate the truth? How did you ensure the PIO’s message aligned with verified data from the Voter Registration Manager, and what would have made that process faster or more reliable under real-time pressure? _(Objective: Public Trust Management)_
<!-- /section:hotwash -->



*End of Handbook*

