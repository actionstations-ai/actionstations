# Controller / Evaluator (C/E) Handbook
## Silent Calls — CAD/AVL Integrity & Service Continuity

Exercise Date: [Date] · Location: Rook County Public Safety Center, 250 West Jefferson Street, Halden, Rook County, Indiana · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber incident that compromises the CAD system, ALI data, and call-handling infrastructure at Rook County Emergency Communications District (RCECD). The scenario centers on a coordinated cyberattack involving credential theft, malware beaconing, and spoofed calls, leading to system instability, public misinformation, and a surge in silent and malicious 10-digit calls. The exercise is structured in four phases over 4 hours: (1) The Glitch (0:00–1:00), testing early recognition of anomalies; (2) The Crisis (1:00–2:00), testing declaration of a critical incident under pressure; (3) Manual Mode (2:00–3:00), testing transition to paper-based dispatch; and (4) Recovery & Verification (3:00–4:00), testing restoration of trust and verification of clean recovery. Evaluators should watch for delays in incident declaration, hesitation in switching to manual operations, failure to preserve evidence, and missteps in external communications — especially the handling of the fake hostage call and social media misinformation.

The exercise emphasizes the tension between maintaining system uptime and ensuring data integrity, with key decision points around firewalling CAD-FW01, activating the GateKeeper TDoS-strict rule set, and verifying recovery via cross-checks with field units. The SimCell must reflect real-world urgency, technical constraints, and external stakeholder demands, particularly from law enforcement, vendors, and regulators. Success is measured by timely action, evidence preservation, and coordinated escalation — not just technical fixes, but decisions that protect public trust.

**Objectives:**
- **Communication:** Demonstrate the ability to coordinate the activation of the GateKeeper TDoS-strict rule set and the rerouting of 911 calls to Tamarack County Communications via OPS-DR-2, ensuring continuity of emergency call handling under cyber-induced service degradation.
- **Decision Making:** Demonstrate the ability to declare a Level 1 — Critical incident and authorize evacuation to the backup PSAP using OPS-DR-5, based on CAD freeze, ALI corruption, and sustained silent call flood.
- **Technical Analysis:** Demonstrate the ability to manually initiate firewalling at CAD-FW01 (CYB-DR-1) and validate system isolation from the compromised network segment, preventing further lateral movement.
- **Use of Doctrine:** Demonstrate the ability to activate manual dispatch using run cards (RCECD-F-11) and maintain call-handling continuity under degraded CAD and ALI conditions, per RCECD-OPS-2026.

**Plan sections exercised:**
- Rook County Emergency Communicat… › Section 5 › T-2 Contain
- Rook County Emergency Communicat… › Annex B
- Rook County Emergency Communicat… › Section 11
- Rook County Emergency Communicat… › Section 5
- Rook County Emergency Communicat… › Table of Contents
- Rook County Emergency Communicat… › Section 1
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout simulating the dispatch floor, with six role-specific tables:
 - Table A: Incident Commander (911 Director)
 - Table B: Floor Supervisor (Communications Supervisor)
 - Table C: Technical Lead (911 Systems Manager)
 - Table D: Radio System Manager (COML)
 - Table E: Law Enforcement Liaison (Patrol Commander)
 - Table F: Public Information Officer (PIO)
- The PIO (Table F) must be seated at a rear table, isolated from the main floor, to simulate the need to walk across the room for information and coordination.
- Equipment needs:
 - Projector for displaying injects on a central screen
 - Whiteboard for tracking ICS-201 and call status
 - Printed inject deck (laid out by facilitator)
 - Optional: simulated radios and phones for role immersion
- Materials for players: Printed role cards, RCECD-OPS-2026 operating procedures, run card (RCECD-F-11), map book, and ICS-201 form.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell — you play everyone outside the 911 center. If a player says 'I call the sheriff,' you answer as the sheriff's office. You are not a neutral observer; you represent the real-world entities that interact with RCECD. Do not make it easy. For example, if a player says 'We’ll call Northwind Telecom,' you might respond: 'We’re not calling them yet — you need a ticket number and a signed access request first. No one calls us without that.'

Managing Time: Use the scripted time-jump announcement to advance the timeline: 'PAUSE EXERCISE. We are jumping forward 30 minutes. All systems are still under pressure. RESUME.' Use this to maintain momentum and prevent players from drifting.

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond in character: 'I know it’s not ideal, but we’re still using it until the Technical Lead confirms the recovery. We need to keep the line open.'

Delivering injects: Do not explain. Say only: 'This just came in.' or 'This is on the main screen.' Do not clarify the source or meaning — let the players interpret.

This is an exercise: All injects are real in context. No one says 'this is just a drill.' The players must assume every call, email, or alert is a real event.

REAL WORLD, REAL WORLD: If a player says, 'This is just an exercise,' respond: 'No. This is real. We’re on the air. You’re in charge.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **FBI Indianapolis Field Office — Cyber Division (TDoS, Swatting, Extortion)** — _Trigger: A player contacts the FBI via the 911 Director or the County Information Security Officer_
  - Ask: "Do you have the logs preserved? No? Call me back when you have evidence."
  - Ask: "Is the ALI data corruption confirmed to be from a malicious actor? If not, you’re not my priority."
  - Ask: "What is your timeline for reporting to CISA? We need that within 12 hours."
  - Concede only when: Will accept preserved logs and a written timeline.
  - Concede only when: Will provide a TDoS pattern analysis if you send the ANI list and time windows.
  - Concede only when: Will defer to CISA for federal coordination if you confirm the cyber incident is active and not a false positive.
- **GateKeeper Voice Security (10-digit call-screening appliance vendor)** — _Trigger: A player contacts GateKeeper to report the silent call flood or to request rule set changes_
  - Ask: "You’re trying to activate TDoS-strict rule set? That’s not a standard feature. What’s your ticket number?"
  - Ask: "The rule set is not enabled by default — you need a signed access request from the Technical Lead."
  - Ask: "If you don’t have the ticket number, I can’t assist. We only respond to authorized requests."
  - Concede only when: Will enable TDoS-strict rule set if you provide a signed access request (RCECD-OPS-2026, Section 5, T-2 Contain).
  - Concede only when: Will provide a report on call pattern matching if you send the ANI list and time window.
  - Concede only when: Will block ANI 555-0105 and 555-0106 if you confirm they’re from spoofed sources.
- **Tamarack County Communications (Mutual Call-Taking Partner)** — _Trigger: A player contacts Tamarack to confirm rerouting or to report call flow_
  - Ask: "We’ve been taking calls on SIP trunk group A since 19:00. What’s your verification plan for the 17 corrupted calls?"
  - Ask: "How do you know our system is clean? We need a log of your forensic image and backup restore."
  - Ask: "If you’re not using our ring-down line, we’re not accepting calls — you’re not in MCTA-2025 yet."
  - Concede only when: Will continue to route calls under MCTA-2025 if you confirm your verification plan is complete.
  - Concede only when: Will provide a call-source analysis if you send the ANI list and time window.
  - Concede only when: Will accept your forensic image (REC-01) if you provide a signed access request and a hash verification.
- **State ESInet Network Operations Center (NOC)** — _Trigger: A player contacts the NOC to report 911 call delivery issues or to request overflow routing_
  - Ask: "You’re reporting a TDoS pattern on 911 trunks? What’s your call-source analysis?"
  - Ask: "We need your ANI list and time window for verification. No report without that."
  - Ask: "If you don’t have a signed access request from the Technical Lead, we can’t escalate."
  - Concede only when: Will confirm overflow routing to Tamarack County under MCTA-2025 if you provide the ANI list and time window.
  - Concede only when: Will provide a call-source analysis if you send the forensic logs and ANI list.
  - Concede only when: Will accept your SIEM alert as a valid incident report if you include the RCECD-OPS-2026, Section 5, T-2 Contain reference.
- **RespondCAD Support (Keystone Public Safety)** — _Trigger: A player contacts RespondCAD to report CAD freeze, unit status issues, or to request a restore_
  - Ask: "You’re reporting a CAD freeze? What’s your ticket number?"
  - Ask: "You need a signed access request from the Technical Lead to restore. No one calls us without that."
  - Ask: "If you don’t have a ticket number, we can’t help. We only respond to verified requests."
  - Concede only when: Will begin restore from the 02:00 backup of CAD-DB01 if you provide a signed access request and a hash verification.
  - Concede only when: Will provide a forensic report on the session from RCECD-POS09 if you send the SIEM alert and log hash.
  - Concede only when: Will accept your forensic image (REC-01) if you confirm it was captured before the restore.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops Supervisor failed to open Position 12 and move the Position 7 police dispatcher to call taking only after I-13, delaying manual dispatch initiation; Technical Lead delayed firewalling at CAD-FW01 (CYB-DR-1) until I-07, despite the SIEM alert in I-01b and the ALI corruption confirmed in I-08. ☐ **Pass:** Ops Supervisor opened Position 12 and moved the Position 7 police dispatcher to call taking only after I-13; Technical Lead initiated firewalling at CAD-FW01 (CYB-DR-1) in response to the SIEM alert in I-01b and confirmed isolation in I-07. ☐ **Excellence:** Ops Supervisor proactively opened Position 12 and moved the Position 7 police dispatcher to call taking only before I-13, in anticipation of manual dispatch; Technical Lead initiated firewalling at CAD-FW01 (CYB-DR-1) immediately after the SIEM alert in I-01b, preventing further lateral movement. | I-01b, I-07, I-13 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT Lead failed to initiate forensic preservation of CAD-MDS01 on REC-01 before I-08 and delayed the forensic audit until I-08, missing the opportunity to document evidence before system corruption was confirmed; reset the controller after I-08b, destroying evidence. ☐ **Pass:** IT Lead initiated forensic audit of CAD-MDS01 and captured evidence on REC-01 per RCECD-OPS-2026, Section 5, T-2 Contain; confirmed forensic image integrity in I-08b and I-15b. ☐ **Excellence:** IT Lead proactively captured forensic image of CAD-MDS01 on REC-01 immediately after the SIEM alert in I-01b, preserving evidence before any data corruption was confirmed; confirmed forensic integrity and documented chain of custody in RCECD-F-21 per C4. | I-01b, I-08, I-15b |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO failed to activate the alternate 10-digit emergency number (555-0100) via WEA and social media after I-14, allowing misinformation to persist; responded to the fake number 555-0177 by issuing a correction only after the media broadcast in I-14b. ☐ **Pass:** PIO activated the alternate 10-digit emergency number (555-0100) via WEA and social media after I-14b; issued official correction to the fake number 555-0177 and confirmed service continuity. ☐ **Excellence:** PIO proactively activated the alternate 10-digit emergency number (555-0100) via WEA and social media immediately after I-14, preventing misinformation spread; issued a public correction before any media broadcast on the fake number. | I-14 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite RCECD-OPS-2026, Section 5, T-2 Contain when initiating firewalling at CAD-FW01 (CYB-DR-1) in I-07; failed to reference EOP 4.3 when activating swatting verification protocol in I-03. ☐ **Pass:** Students cited RCECD-OPS-2026, Section 5, T-2 Contain when initiating firewalling at CAD-FW01 (CYB-DR-1) in I-07; referenced EOP 4.3 when activating swatting verification protocol in I-03. ☐ **Excellence:** Students cited RCECD-OPS-2026, Section 5, T-2 Contain before initiating firewalling at CAD-FW01 (CYB-DR-1) in I-07, and referenced EOP 4.3 before activating swatting verification protocol in I-03, demonstrating proactive adherence to doctrine. | I-01b, I-07, I-08, I-11, I-16 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed, going around the room to ensure all voices are heard. Write each response on a whiteboard to create a shared visual record.

**Key Discussion Questions for Silent Calls:**
- **Trust:** At the moment you received the SIEM alert (I-02), when did you first stop trusting the CAD system’s integrity, and what specific evidence triggered that loss of trust? _(Objective: Communication)_
- **The Gap:** When you saw the ALI data integrity report (I-08), what gap emerged between operations' understanding of the technical situation and the actual state of the network? How did that gap affect your decisions? _(Objective: Decision Making)_
- **The Call:** At Decision Point I-12, when the structure fire from Marlow was waiting to be dispatched, what would have allowed you to make the switch to manual dispatch using run cards (RCECD-F-11) faster, and what would have let you trust that manual dispatch could maintain service continuity? _(Objective: Use of Doctrine)_
- **The Vendor:** When Tamarack County Communications called at I-16b to confirm their call routing and no data corruption, what information or confirmation would have let you decide to activate the backup PSAP (OPS-DR-5) sooner? _(Objective: Communication)_
- **The Evidence:** After the forensic log (I-10b) confirmed unauthorized admin access via stolen credentials, did you treat that evidence as a technical alert or as a trigger to initiate the cyber incident response protocol? What changed your mind? _(Objective: Technical Analysis)_
<!-- /section:hotwash -->



*End of Handbook*

