# Controller / Evaluator (C/E) Handbook
## Digital Lockdown — Cyber Incident & School Continuity

Exercise Date: [Date] · Location: Halverson Unified School District, Halverson, Brandt County, Oregon · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a full-spectrum cyber incident at Halverson Unified School District, focusing on a ransomware attack that compromises core systems, exfiltrates sensitive student data, and triggers cascading operational and public safety crises. The scenario unfolds over four hours, progressing from initial anomalies to full EOC activation, manual operations, and recovery verification. The exercise tests leadership under pressure, system integrity management, inter-agency coordination, and crisis communication. Evaluators should closely monitor for timely recognition of cyber indicators, adherence to the Incident Command System (ICS), proper escalation to the Policy Group for closure and communication decisions, and the use of verified data (e.g., 05:00 offline roster) over compromised systems. Watch for delayed declarations, over-reliance on digital systems despite corruption, and failure to isolate networks to prevent further compromise.

The arc begins at 06:30 with subtle anomalies—unusual file access, a mismatched student status, and a spoofed internal email. By 07:30, systems are encrypted, a ransom note is distributed, and a fake 911 call triggers a lockdown. The Policy Group must decide on school closure and family notification. The manual mode phase (08:00–09:00) tests physical safety, evacuation, and accountability using only the 05:00 roster. The final phase (09:00–10:00) verifies recovery through forensic validation, vendor coordination, and regulatory reporting. Evaluators must assess whether decisions are evidence-based, legally sound, and aligned with HUSD-CIRP-2026 and EOP 4.3.

**Objectives:**
- **System Integrity:** Demonstrate the ability to assess and contain a multi-system cyber incident involving data exfiltration, encryption, and spoofed communications, prioritizing the protection of student and staff data as defined in FERPA and Oregon breach-notice laws.
- **Trust in Data:** Demonstrate the ability to validate and rely on offline, pre-incident student rosters and accountability records during a system-wide outage, ensuring accurate reunification and safe student movement during an evacuation.
- **Crisis Leadership:** Demonstrate the ability to make rapid, coordinated decisions on school closure, ransom negotiation, legal reporting, and family notification under pressure, balancing legal, ethical, and operational imperatives.
- **Inter-Team Coordination:** Demonstrate the ability to synchronize actions across the Policy Group, EOC, Technology, Communications, and Student Services teams during a cascading incident involving cyberattack, false alarm, and physical safety response.

**Plan sections exercised:**
- Halverson Unified School Distric… › Section 7
- EOP › Section 6 › 6.3 Offline Rosters
- EOP › Section 4 › 4.1 Standard Response Actions
- Halverson Unified School Distric… › Section 6 › 6.2 Actions
- EOP › Table of Contents
- EOP › Section 7
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout simulating the Halverson Unified District Emergency Operations Center (EOC) at central office.
- Team A (Operations/Incident Commander): Front-center table, facing the main screen.
- Team B (Policy Group): Adjacent to Operations, slightly elevated, for decision-making authority.
- Team C (School Site): Near the front, facing the main screen, for real-time site coordination.
- Team D (Law Enforcement): To the side, near the EOC operations wall, for tactical updates.
- Team E (Technology): Central, near the main screen, with access to a printed inject deck and whiteboard for ICS-201.
- Team F (Communications): Isolated at a rear table, away from the main EOC flow, to simulate delayed information access.
- Why isolate the PIO? To test information control and verification; the PIO must walk to the EOC to confirm facts before issuing statements, preventing premature or inaccurate messaging.

Equipment needs: Projector for main-screen injects (e.g., email headers, social media posts), whiteboard for ICS-201 and timeline, printed inject deck (laminated, labeled by time), optional simulated radios/phones for role-playing.

Materials for players: Printed inject deck, role-specific briefing sheets, ICS-201 form, 05:00 offline roster (printed), CIRP Form 4 (blank), and a notepad.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: everyone outside the EOC. If a student says 'I call the sheriff,' you answer as the Brandt County Sheriff’s office. If a staff member says 'I contact CISA,' you respond as the CISA Cyber Incident Response Team (CIRT) Lead.

Do not make it easy. If a player says, 'We’ll just call the vendor and fix it,' respond as the vendor: 'We need a signed access request and a ticket number. No exceptions.' This prevents players from assuming default cooperation.

Managing Time: Use the scripted time-jump announcement: 'PAUSE EXERCISE. We are jumping forward 30 minutes. Resume when the facilitator says.' This maintains pacing and prevents drift.

Handling artificialities: If a player says, 'I wouldn’t use that system,' respond as the role: 'I know it’s not ideal, but it’s the only one that works now. We have to use it until we restore the network.' Do not correct or justify the system’s flaws—stay in character.

Delivering injects: Say only: 'This just came in.' or 'This is on the main screen.' Do not explain, interpret, or add context.

This is an exercise: All injects are real within the scenario’s logic. No one knows more than the information provided.

REAL WORLD, REAL WORLD: When a player says, 'This isn’t real,' respond: 'REAL WORLD, REAL WORLD. This is a real incident. We’re acting now.' This reinforces immersion and prevents role-breaking.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **CISA Cyber Incident Response Team (CIRT) Lead** — _Trigger: Player calls CISA or references CISA in a response_
  - Ask: "Do you have the HUSD-VPN01 device preserved as evidence? No? Then you’ve destroyed the chain of custody. We cannot assist you until it’s secured."
  - Concede only when: We will dispatch a forensic team to collect the full device image within 24 hours, but only if you provide a signed preservation notice and no reboot occurs.
- **Tyler Munis Vendor Support** — _Trigger: Player contacts Tyler Munis for payroll restore_
  - Ask: "Do you have a signed access request from Legal Counsel and CFO? No? Then you cannot restore payroll. We will not proceed without it."
  - Concede only when: We will begin the payroll restore once the signed access request is received and approved by both Legal and Finance.
- **Brandt County Sheriff's Office** — _Trigger: Player contacts the sheriff for law enforcement response_
  - Ask: "Do you have a confirmed active threat on site? No? Then we will not dispatch a full team. We need a threat assessment from the SRO or a 911 call with verified injury."
  - Concede only when: We will send a patrol car to Halverson High School to secure the perimeter and confirm no active threat, but only if you provide a verified student count and location.
- **Channel 6 News Desk** — _Trigger: Player contacts media for statement_
  - Ask: "Do you have a statement approved by the Policy Group and Legal Counsel? No? Then you cannot speak to us. We need a quote now."
  - Concede only when: We will hold the live interview for 30 minutes if you provide a verified statement by 08:30.
- **Oregon Department of Education (State Assessment Coordinator)** — _Trigger: Player contacts state for testing window confirmation_
  - Ask: "Can you confirm the 05:00 offline roster is accurate and no student was left behind? No? Then we cannot extend the test window. We need proof."
  - Concede only when: We will extend the state assessment window by two days if you submit a signed verification from the Assessment Coordinator and the Policy Group by 09:00.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops failed to initiate EOP Section 6.4: School-Day Continuity after I-07b, delaying the pause of testing and manual accountability; delayed declaring S3 High severity until I-07, after system-wide encryption was confirmed. ☐ **Pass:** Ops activated EOP Section 6.4: School-Day Continuity after I-07b and used the 05:00 offline roster for accountability; declared S3 High severity per C2 after I-07. ☐ **Excellence:** Ops initiated EOP Section 6.4: School-Day Continuity and declared S3 High severity under C2 before I-07b, using I-03 and I-04 to anticipate system failure and manually activate the roster-based accountability protocol. | I-03, I-04, I-07b, I-07, I-08b, I-09 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** CTO reset the controller after I-08b, destroying evidence; failed to preserve HUSD-VPN01 as directed by CISA in I-19, instead attempting to reboot it. ☐ **Pass:** CTO preserved HUSD-VPN01 as evidence per CISA in I-19; confirmed file integrity via hash verification in I-18b; submitted CIRP Form 4 in I-21. ☐ **Excellence:** CTO preserved HUSD-VPN01 as evidence before I-19 and proactively submitted CIRP Form 4 for verification sign-off after I-18b, using forensic logs to validate recovery before network reconnection. | I-08b, I-12, I-18b, I-19, I-21 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO issued a correction on ParentSquare after I-08b but failed to publish a Spanish version within two hours as required by EOP Annex C; delayed issuing a media statement until I-14. ☐ **Pass:** PIO issued a public correction on ParentSquare and Facebook within 10 minutes of I-08b; used the EOP Annex C statement to deny injury claims in I-14; activated rumor control protocol in I-20b. ☐ **Excellence:** PIO issued a multilingual ParentSquare alert with the 05:00 roster as the only verified source within 15 minutes of I-08b, including Spanish, Russian, Vietnamese, and Marshallese versions; posted a video from the EOC control room to demonstrate manual verification and prevent misinformation. | I-08b, I-14, I-20b, I-02b |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Ops failed to cite EOP Section 6.3 or C5 when addressing data sensitivity in I-08b; did not reference C3 for chain of custody or evidence preservation. ☐ **Pass:** Ops cited EOP Section 6.3 and C5 to confirm that IEPs, health logs, and custody files are FERPA and safety-critical; referenced C3 to preserve firewall logs and photograph ransom notes. ☐ **Excellence:** Ops cited C3 (evidence preservation) and C5 (data sensitivity) before I-08b to justify preserving HUSD-VPN01 and photographing the ransom note; referenced EOP Section 6.3 and C5 in I-20b to validate the 05:00 roster as the only trusted source. | I-03, I-07, I-08b, I-12, I-18b, I-19, I-20b |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask each team in rotation to share three things that went well and three that broke or failed during the exercise. Write responses on a whiteboard to visualize patterns and drive discussion. Encourage concise, actionable feedback.

**Key Discussion Questions for Digital Lockdown:**
- **Trust:** At the moment when you received the fake closure email from 'chris.morales@halversonusd.example' (I-08), how did you assess whether to trust the sender, the message content, and the digital signature—especially given that the domain was valid but the source IP was from a compromised appliance? What would have made you question it sooner? _(Objective: Trust in Data)_
- **The Gap:** When the SIS went read-only and you had to rely on the 05:00 offline roster to verify student locations (I-07b), what gaps emerged between the official system and the trusted offline record? How did this moment expose a weakness in your verification process, and what would have made you more confident in the offline data? _(Objective: Trust in Data)_
- **The Call:** At the 2:30 I-16 decision point, you had to choose between isolating the network (risking HVAC) or keeping it online (risking further compromise). What factors determined your final choice, and how did the roles of the CTO, DSS, and Legal Counsel shape the decision? What would have allowed you to decide faster and with more confidence? _(Objective: Crisis Leadership)_
- **The Evidence:** When the Veeam backup verification confirmed that HUSD-FS02 data matched pre-incident baseline (I-18b), how did you use that evidence to validate system integrity? Was it treated as a technical confirmation, a legal safeguard, or a leadership signal—and how did that affect your actions afterward? _(Objective: System Integrity)_
- **The Vendor:** Given that the attacker exploited an unpatched VPN appliance and a shared local admin password (I-12), what internal processes or external vendor contacts were missing that could have prevented this breach—and when should you have engaged the vendor or cyber task force to accelerate recovery? _(Objective: Inter-Team Coordination)_
<!-- /section:hotwash -->



*End of Handbook*

