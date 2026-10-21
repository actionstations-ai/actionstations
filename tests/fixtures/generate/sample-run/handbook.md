# Controller / Evaluator (C/E) Handbook

## Light Out — ALCS Cyber-Intrusion & Manual Lighting Response

Exercise Date: [Date] · Location: North Coast Regional Airport Authority · Duration: 4 Hours

<!-- section:overview -->

### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) simulating a cyber-intrusion into the Airfield Lighting Control System (ALCS) at North Coast Regional Airport Authority, resulting in the unauthorized manipulation of runway and taxiway lights. The scenario tests the organization’s ability to detect, respond to, and recover from a sophisticated cyberattack that exploits a policy-violating vendor remote access tunnel, disrupts critical aviation systems, and forces a transition to manual operations. The exercise is structured in four phases: (1) The Glitch (0:00–1:00), focusing on early anomaly recognition and avoiding premature incident declaration; (2) The Crisis (1:00–2:00), testing escalation, command coordination, and handling of cascading failures; (3) Manual Mode (2:00–3:00), evaluating manual procedures under pressure, physical safety, and media management; and (4) Recovery & Verification (3:00–4:00), assessing verification rigor, stakeholder trust, and controlled system restoration. Evaluators should monitor for timely recognition of remote access policy violations, proper use of manual lighting protocols (TIRP 13.3), adherence to ICS roles, and the ability to resist reactive decision-making when evidence is incomplete. The simulated failure of ALCS, PACS, and AODB/FIDS creates a high-stakes environment where trust in digital systems must be re-established through physical verification and forensic validation.

**Objectives:**

- **System Trust:** Demonstrate the ability to verify the integrity of critical infrastructure systems (ALCS) under duress, prioritizing physical observation and manual verification over untrusted digital telemetry.
- **Remote Access Policy:** Demonstrate the ability to enforce and uphold remote access control policies by identifying and terminating unauthorized vendor access tunnels during a cyber-incident.
- **Manual Procedures Under Pressure:** Demonstrate the ability to activate and sustain manual lighting operations using the Vault's physical control panel and hand-held signaling devices during a loss of automated system control.
- **Inter-Command Coordination:** Demonstrate the ability to synchronize actions between Technical Incident Command (IT) and Operational Incident Command (Airport Ops) to prevent conflicting directives during a cascading system failure.

**Plan sections exercised:**

- AEP › Part II › Appendix 6 › 6.2 Critical Systems & Impact
- ASP › Appendix F › F.2 Remote Access (Vendor Support)
- ASP › Appendix E
- TIRP › Section 13 › 13.3 General Operations
- TIRP › Section 1 › 1.4 Guidance Applicable for All Incident Plans
- TIRP › Section 13 › 13.2 Command Structure

<!-- /section:overview -->

<!-- section:room -->

### 2. Room Setup & Logistics

- U-shape layout simulating the Airport Operations Center (AOC), with the Incident Commander (IC) at the head.
- Team A (Airport Operations) at the front-left table.
- Team B (IT/Cybersecurity) at the front-right table.
- Team C (Public Information) at a rear table, isolated from the main AOC to simulate delayed information access—this forces PIO to walk to the AOC for updates, reinforcing the need for formal information handoffs.
- Team D (Security/LEO) at the back-left, near the exit.
- Team E (Airline Operations) at the back-right, adjacent to the exit.
- Equipment needs: Projector for main-screen injects (e.g., FIDS, ALCS status map), whiteboard for ICS-201, printed inject deck, optional simulated radios/phones for role immersion.
- Materials for players: Printed roles, inject deck, ICS-201 form, emergency contact list.

<!-- /section:room -->

<!-- section:rules -->

### 3. Rules of Play (Instructor Guide)

You are the SimCell: you play everyone outside the AOC. If a player says 'I call the FBI,' you answer as the FBI agent. Do not explain. Say 'This just came in.' or 'This is on the main screen.' Do not make it easy: if a player says 'We’ll just reboot the server,' you respond as the IT Director: 'That’s not how it works—rebooting from internal console without forensic validation could trigger a second exploit.' Manage time with scripted jumps: 'PAUSE EXERCISE. We are jumping forward 30 minutes. ... RESUME.' Handle artificialities with a scripted response: if a player says 'I wouldn’t use that system,' you reply: 'That’s not your call. You’re operating under TIRP 13.3. Manual procedures are the only safe option now.' Deliver injects as: 'This just came in' or 'This is on the main screen.' Always use 'REAL WORLD, REAL WORLD' to emphasize that this is not a simulation—when a player says 'We should go to the vault,' you say: 'REAL WORLD, REAL WORLD—vault access requires a dual-authorization and a log entry.' Use 'This is an exercise' only to clarify missteps, not to correct decisions.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **FBI Cyber Task Force Agent** — _Trigger: Player calls 'FBI Cyber Task Force' or says 'I need the FBI on this now'_
  - Ask: "Do you have a packet capture from the ALCS server during the 03:00–09:00 window?"
  - Ask: "Is there a signed access request for the Siemens tunnel (S-7734)?"
  - Ask: "Can you provide the CISA-issued alert number for this incident?"
  - Concede only when: Will accept a signed access request and preserved logs from the 03:00–09:00 window.
  - Concede only when: Will approve a manual verification process if the IT Director provides a written timeline and evidence of no lateral movement.
- **Siemens Vendor Support Desk** — _Trigger: Player calls 'Siemens Support' or says 'We need vendor help to fix ALCS'_
  - Ask: "What is your ticket number for the active tunnel (10.200.1.47)?"
  - Ask: "Do you have a signed access request for the 03:00–09:00 window?"
  - Ask: "Can you provide the vendor ID (S-7734) and a timestamped log of the tunnel's closure?"
  - Concede only when: Will provide a forensic package only if the access request is signed and the tunnel was closed before 03:00.
  - Concede only when: Will not assist unless the IT Director provides a ticket number and a written request.
- **Airline Station Manager (NCIA Air)** — _Trigger: Player says 'The airline wants a status update' or 'We need to know if we’re safe to board'_
  - Ask: "Do you have a written guarantee from the IT Director that ALCS is safe to restore?"
  - Ask: "Can you show me the recovery plan and timeline for full system restoration?"
  - Ask: "Have you confirmed the manual verification protocol was followed by all field teams?"
  - Concede only when: Will accept a recovery plan and a signed timeline from the IT Director.
  - Concede only when: Will allow boarding only after the FIDS board is manually updated and verified against a paper manifest.
- **TV Assignment Desk (Local News)** — _Trigger: Player says 'We need to talk to the media' or 'The news is asking for a quote'_
  - Ask: "Can you confirm that the airport is safe for passengers to board?"
  - Ask: "Is the ALCS manual panel under human control?"
  - Ask: "Do you have a statement from the Airport Director on the cyberattack?"
  - Concede only when: Will publish the official statement if it is received via the PIO.
  - Concede only when: Will not report on internal decisions unless a formal statement is issued.
- **Summit County Emergency Management Agency (EMA)** — _Trigger: Player says 'We need federal aid' or 'We need EMA on the scene'_
  - Ask: "Do you have a Unified Command activation notice?"
  - Ask: "Is the Airport Director in control of the emergency?"
  - Ask: "Can you provide the AEP 4.6 activation record?"
  - Concede only when: Will dispatch the Family Assistance Center if Unified Command is confirmed.
  - Concede only when: Will coordinate state/federal assets only after the Airport Director confirms the incident is under control and a recovery plan is in place.

<!-- /section:rules -->

<!-- section:rubric -->

### 4. Evaluation & Grading Rubric

| Metric                                             | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Linked injects                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops failed to activate manual lighting procedures until after the pilot reported an unsafe landing, delaying the 'Go Dark' decision until I-07 forced it. IT did not confirm network isolation before Ops issued manual control commands, creating a risk of conflicting directives. ☐ **Pass:** Ops activated manual lighting procedures after the pilot's report (I-07) and confirmed the 'Disconnect' order (I-11b) before initiating manual control. IT confirmed network isolation (I-12) prior to manual activation, ensuring no conflicting digital commands could override field actions. ☐ **Excellence:** Ops initiated manual lighting protocol (I-13) immediately after the pilot's report (I-07), and IT confirmed network isolation (I-12) and forensic status (I-10b) before manual control began—demonstrating proactive coordination under threat to flight safety.                                                               | I-07, I-11b, I-12, I-13, I-10b        |
| **Metric 2: Technical Competence (30 Points)**     | ☐ **Fail:** IT rebooted the ALCS server after I-08b, destroying critical forensic evidence. The absence of a user session and the presence of a non-authorized script execution path (I-17b) were not detected until after the reboot, violating AEP 6.3 and ASP Appendix F. ☐ **Pass:** IT preserved server logs and did not reboot the ALCS server until after forensic analysis confirmed no lateral movement (I-20b). The team confirmed the attacker used a stolen vendor credential (S-7734) via an active Siemens tunnel (I-11), and recovery began from a clean gold image (I-22). ☐ **Excellence:** IT identified the unauthorized Siemens vendor tunnel (I-03) and confirmed the attacker used a stolen credential (S-7734) before any reboot. Forensic analysis (I-20b) confirmed no lateral movement, and recovery began from a clean gold image (I-22) without rebooting the server—preserving evidence and following AEP 6.3 and ASP Appendix F. | I-03, I-08b, I-11, I-17b, I-20b, I-22 |
| **Metric 3: Public Communication (20 Points)**     | ☐ **Fail:** PIO issued a public statement (I-16) without verifying the content with IC and TIC, and later amplified a false claim about a ransomware group (I-24b) without correction, undermining credibility. ☐ **Pass:** PIO confirmed receipt of the official statement (I-16) and broadcast it via PA and emergency channel only after approval. When misinformation spread (I-24b), PIO issued a correction stating the attacker used a USB drive to manipulate the manual panel, not a digital exploit. ☐ **Excellence:** PIO issued a holding statement (I-03b) upon detecting social media noise and began drafting a public message before formal incident declaration. After the false claim (I-24b), PIO issued a timely correction emphasizing manual verification and ongoing control, demonstrating proactive, accurate public messaging.                                                                                                       | I-03b, I-16, I-24b, I-24              |
| **Metric 4: Use of Doctrine (20 Points)**          | ☐ **Fail:** Ops did not cite TIRP 13.3 or AEP 6.2 when activating manual lighting (I-13), and IT did not reference ASP Appendix F when terminating the vendor tunnel (I-03). The team failed to invoke doctrine during critical decision points. ☐ **Pass:** Ops activated manual lighting per TIRP 13.3 (I-13) and cited AEP 6.2 when halting aircraft movement (I-07). IT referenced ASP Appendix F when identifying the unauthorized vendor tunnel (I-03) and confirmed the attacker used a stolen credential (S-7734). ☐ **Excellence:** Ops cited TIRP 13.3 and AEP 6.2 when activating manual lighting (I-13) and halting aircraft movement (I-07). IT invoked ASP Appendix F to identify the unauthorized tunnel and AEP 6.3 to justify preserving logs and avoiding reboot. All key decisions were explicitly tied to doctrine sections.                                                                                                               | I-03, I-07, I-13, I-11, I-10b, I-22   |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->

### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** The '3-Up, 3-Down' method invites each team to share three things that went well and three areas that broke or failed during the exercise. Go around the room by team, capturing responses on a whiteboard. Use this to surface strengths and gaps quickly and ensure all voices are heard.

**Key Discussion Questions for Light Out:**

- **Trust:** When the lights flickered and then failed, what specific evidence did you use to decide that the ALCS telemetry was untrustworthy? At what point did you stop relying on the digital interface and switch to physical observation or manual verification? _(Objective: System Trust)_
- **The Gap:** When Security Officer 4 reported the locked door at Gate C12, did you initially assume it was connected to the ALCS failure? What information did you need to close the gap between the lighting and access control systems, and how did you obtain it? _(Objective: Inter-Command Coordination)_
- **The Insider:** When the Vault Guard reported the USB drive labeled 'Test_Firmware_V3.1' with a cracked casing, what did you immediately recognize about its origin? How did your understanding of vendor remote access policy shape your response to this physical artifact? _(Objective: Remote Access Policy)_
- **Manual Procedures Under Pressure:** After the ALCS server rebooted unexpectedly at 10:48, you were required to sustain manual lighting operations using the Vault’s physical control panel. What was the first action you took to establish confidence in the manual system, and how did you maintain consistency under time pressure? _(Objective: Manual Procedures Under Pressure)_
- **Decision Speed:** When the Airport Director declared a Level 2 Alert and activated Unified Command, what information did you wish you had available to make your next decision faster? What would have allowed you to decide more quickly on whether to proceed with manual operations or wait for a digital recovery? _(Objective: Inter-Command Coordination)_

<!-- /section:hotwash -->

_End of Handbook_
