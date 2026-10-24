# Controller / Evaluator (C/E) Handbook
## Ghost Line — SCADA Deception & Chlorine Release

Exercise Date: [Date] · Location: Teague Valley Chemical Company, Corbin Falls Works, Corbin Falls, Teague County, West Virginia · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) simulating a cyber-physical incident at the Teague Valley Chemical Company, Corbin Falls Works, involving a malicious manipulation of the control system during a chlorine release. The scenario, titled *Ghost Line*, tests the facility’s ability to detect and respond to a field-screen discrepancy that indicates unauthorized remote access and system tampering. Players assume roles from the Incident Command System (ICS) and must navigate a spreading physical hazard (chlorine plume) while verifying the integrity of the control system, making high-consequence operational decisions, and managing regulatory, community, and law enforcement expectations.

The exercise unfolds in four phases over 4 hours, starting at 09:00. Phase 1 (0:00–1:00) focuses on early recognition of a cyber-physical anomaly and the initiation of OT triage. Phase 2 (1:00–2:00) tests escalation to a General Emergency, coordination with mutual aid, and regulatory reporting under pressure. Phase 3 (2:00–3:00) centers on the critical decision to disconnect automation and manually close the release valve, balancing life safety and operational risk. Phase 4 (3:00–4:00) validates the restoration process, including the SIS validation plan, the PSSR and the conditions for restart. Evaluators should watch for timely recognition of system anomalies, adherence to the ICS structure, proper use of the remote-access log and MOC requirements, correct handling of SIS logic integrity, and the absence of premature restart decisions. The shift must not override the SIS reset prohibition (C7, Section 11) or bypass verification steps (C8, Play 4).

**Objectives:**
- **Field vs. Screen Integrity:** Demonstrate the ability to trust field observations over control-system displays when a process release continues despite a DCS indication of isolation, and to initiate a cyber-incident triage under Section 11 of the RMP.
- **Cyber-Physical Coordination:** Demonstrate the ability to activate the OT Engineer and FSO roles in parallel with the EHS Manager and PIO to report to CISA, FBI, and regulators, and to manage the dual response of emergency operations and cyber-investigation.
- **Regulatory Notification Discipline:** Demonstrate the ability to report a chlorine release to the NRC, WV SERC, LEPC, and OSHA with factual data only, and to avoid speculation on cause or health impact, per the holding statement template and Section 9 of the RMP.
- **Siren and Community Activation:** Demonstrate the ability to declare a General Emergency, sound sirens S-1 to S-6, and initiate the CAER-Text and community line updates within 30 minutes of the first release call, as required by Section 8.

**Plan sections exercised:**
- RMP › Section 11
- RMP › Section 5 › 5.1 Order of calls in a General Emergency
- RMP › Section 5 › 5.1 Order of calls in a General Emergency
- Teague Valley Chemical Company,… › Section 6 › Play 4 — Release with a possible cyber cause
- Teague Valley Chemical Company,… › Section 7
- RMP › Annex C
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape layout: Control Room (CCR) at front, Emergency Operations Center (EOC) behind, with team tables in a semi-circle.
- Team A (Command): Front center table, labeled 'Incident Commander'.
- Team B (Operations): Right of Command, labeled 'Operations Superintendent'.
- Team C (Technical): Left of Command, labeled 'OT Engineer'.
- Team D (Compliance): Behind Command, labeled 'EHS Manager'.
- Team E (Security): Back right, labeled 'Security Officer'.
- Team F (Communications): Back left, labeled 'Public Information Officer'.
- Isolate the Public Information Officer (PIO) at a rear table to simulate delayed access to situational awareness and external information, forcing them to walk forward for updates — this tests information control and media coordination under pressure.

Equipment needs:
- Projector to display injects on main screen (e.g., social media posts, emails, regulator calls).
- Whiteboard for the ICS-201 form, updated in real time.
- Printed inject deck (laminated, with tabs for phase and role).
- Optional: Simulated handheld radios on OPS-1 and ERT-1 channels, and a landline phone for external calls.

Materials for players: Printed RMP, EOP, and inject deck (one per team).
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: you play everyone in the world outside the control room and EOC. If a player says, 'I call the sheriff,' you respond as the Teague County Sheriff’s Office dispatcher. You are not a player; you are the environment. Your role is to react to player actions, not to guide them.

Do not make it easy. If a player says, 'I call CISA and they send a team,' you do not say, 'They’re already on their way.' Instead, respond: 'CISA has not assigned a team yet. They are reviewing your report and will contact you within 4 hours.' This preserves realism and challenges players to act, not wait.

Managing Time: At the end of each phase, use the scripted time-jump announcement to advance the timeline. Say: 'PAUSE EXERCISE. We are jumping forward 30 minutes. The situation has evolved. RESUME.' Use the injects to reflect changes (e.g., increased plume size, new detector alarms, new regulator contacts).

Handling artificialities: If a player says, 'I wouldn’t use that system,' you must not explain or correct. Respond as the character: 'This is not a suggestion. The system is compromised. You must follow the EOP and secure the devices per TVCC-CFW-OTSEC-2026.' Do not validate or challenge the player’s internal logic.

Delivering injects: Do not explain injects. Use standard phrases: 'This just came in.' or 'This is on the main screen.' For emails, say: 'Email received.' For radio calls, say: 'Radio call incoming.'

This is an exercise: When a player says, 'This is not real,' respond: 'REAL WORLD, REAL WORLD.' Do not break character. Never say 'This is a simulation.' Never clarify a rule.

When a player says, 'I want to call the media,' you respond as the PIO’s line: 'The media line is open. Please state your name and affiliation.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **CISA (Cybersecurity and Infrastructure Security Agency) — Joint Cyber Response Team** — _Trigger: Player calls CISA via the corporate hotline (1-800-627-7997) or asks for CISA contact_
  - Ask: "What was the unique ticket number assigned to your report?"
  - Ask: "Do you have preserved logs from TVC-JMP-01, TS-EWS-01, and EWS-01 showing the unauthorized session and the logic mismatch?"
  - Ask: "Have you documented the chain of custody for the jump host and SIS controller since the incident?"
  - Concede only when: Will accept a signed access request and a ticket number from the corporate IT portal.
  - Concede only when: Will provide a preliminary cyber-incident report within 4 hours after receiving the evidence.
  - Concede only when: Will assign a joint cyber response team lead to coordinate with your forensic team.
- **FBI WMD Coordinator (FBI Field Office, Charleston)** — _Trigger: Player calls the FBI Charleston Field Office (304-555-0160) or references the FBI in a report_
  - Ask: "What is the official FBI case number assigned to this incident?"
  - Ask: "Have you secured the evidence locker at the Site Control Room under chain-of-custody Form OT-3?"
  - Ask: "Can you confirm that no one has accessed the TVC-JMP-01, TS-EWS-01, or EWS-01 since the devices were disconnected?"
  - Concede only when: Will confirm the case number and assign a lead agent within 2 hours.
  - Concede only when: Will collect the evidence locker at 14:00 as per the schedule.
  - Concede only when: Will provide a joint investigative report upon completion of forensic analysis.
- **Ridgeline Automation — OT System Vendor (Integrator for DeltaV DCS and Triconex SIS)** — _Trigger: Player contacts Ridgeline Automation via email or calls for remote SIS logic validation_
  - Ask: "What is the ticket number for your remote access session to TVC-JMP-01?"
  - Ask: "Do you have a signed access request on file for the session that occurred at 08:58:12?"
  - Ask: "Can you confirm that the SIS logic on TS-EWS-01 was not updated without an approved MOC?"
  - Concede only when: Will provide remote SIS logic validation and proof testing only after a signed access request and ticket number are received.
  - Concede only when: Will accept a photo of the jump host TVC-JMP-01 with the cable snipped as evidence of isolation.
  - Concede only when: Will not restore vendor access until the firewall rule F-1 and account F-3 gaps are closed.
- **National Response Center (NRC) — Federal Release Reporter** — _Trigger: Player reports a release to the NRC via Form 401 (1-800-627-7997)_
  - Ask: "Have you submitted the release report via the NRC Form 401, and is the submission timestamped?"
  - Ask: "Do you have a copy of the initial release estimate (about 1,100 lb) and the wind direction data from the EOP 5.1?"
  - Ask: "Is the report submitted to the NRC, WV SERC, LEPC, and DEP on the same day, per 40 CFR 302.4?"
  - Concede only when: Will acknowledge receipt of the report within 1 hour.
  - Concede only when: Will provide a confirmation of submission to the federal registry.
  - Concede only when: Will not issue a final status until the EHS Manager confirms the final release estimate and no residual risk.
- **Teague County Emergency Operations Center (OEM) — Shelter-in-Place Authority** — _Trigger: Player calls or requests a shelter-in-place order from Teague County OEM_
  - Ask: "Have you requested a shelter-in-place order via the TC-MUTUAL-1 interoperability channel?"
  - Ask: "Do you have the current fence-line detector data (AT-904 and AT-905) and plume trajectory from the EHS Manager?"
  - Ask: "Is the request submitted to the OEM via the official CAER-Text system?"
  - Concede only when: Will issue a shelter-in-place order only after receiving the EHS release estimate and detector data.
  - Concede only when: Will confirm the order via CAER-Text to all schools and emergency management.
  - Concede only when: Will not lift the order until the EHS Manager confirms the release is stopped and air monitoring is below 0.1 ppm.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Field vs. Screen Integrity (30 Points)** | ☐ **Fail:** Ops failed to act on the field report when the DCS showed ESD-310 closed but the loader reported a continuing release; delayed the manual closure order until I-18b forced it, violating C3's 'Field over screen' rule. ☐ **Pass:** Ops recognized the field-screen discrepancy at I-01 and immediately reported it to the IC and OT Engineer; confirmed the ERT’s field report at I-09 and maintained the manual closure order under field authority, per C3. ☐ **Excellence:** Ops immediately declared a field-screen discrepancy at I-01, initiated the manual closure order before any inject, and directed the ERT to maintain field watch on HV-312, acting on C3’s 'Field over screen' principle before any inject confirmed it. | I-01, I-09, I-10, I-18b, I-19 |
| **Metric 2: Cyber-Physical Coordination (30 Points)** | ☐ **Fail:** IT failed to activate the OT Engineer and FSO roles in parallel with EHS and PIO; delayed the FBI and CISA calls until I-13 and I-12, missing the 30-minute window for dual reporting. ☐ **Pass:** IT activated the OT Engineer and FSO roles at I-02 and I-05b, respectively; coordinated the CISA and FBI reports via I-12 and I-13, and maintained parallel reporting to regulators and law enforcement as required by Section 11 and Play 4. ☐ **Excellence:** IT activated the OT Engineer and FSO roles immediately at I-02 and I-05b, and initiated CISA and FBI contact before any inject; reported to CISA and FBI via the corporate hotline and field office prior to I-08 and I-13, demonstrating proactive cyber-physical coordination. | I-02, I-05b, I-08, I-12, I-13 |
| **Metric 3: Regulatory Notification Discipline (20 Points)** | ☐ **Fail:** EHS used speculative language in the NRC report (I-16) by stating 'cause under investigation' and including a release rate estimate, violating the facts-only template and Section 9 of the RMP. ☐ **Pass:** EHS submitted the NRC, SERC, LEPC, and OSHA reports using the holding statement template (Annex B, Form ERP-8) with only factual data, as required by I-16 and Section 9. ☐ **Excellence:** EHS submitted the NRC, SERC, LEPC, and OSHA reports using the facts-only template (Annex B, Form ERP-8) within 10 minutes of the General Emergency declaration, and avoided any speculation on cause or health impact, per Section 9 and C6. | I-07, I-12, I-16, I-23 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students failed to cite any RMP or EOP section by number during the exercise; did not reference C3, C6, or TVCC-CFW-OTSEC-2026 in their communications, despite multiple injects that required it. ☐ **Pass:** Students cited specific plan sections by number: OT referenced C3 and TVCC-CFW-OTSEC-2026 at I-03 and I-11; EHS cited Section 9 and Annex B, Form ERP-8 at I-16; IC cited Section 11 and Play 4 at I-18. ☐ **Excellence:** Students proactively cited RMP and EOP sections by number before any inject: OT cited C3 and TVCC-CFW-OTSEC-2026 at I-02; EHS cited Section 9 and Annex B at I-07; IC cited Section 11 and Play 4 at I-01, demonstrating mastery of doctrine prior to the decision point. | I-01, I-02, I-03, I-07, I-11, I-12, I-16, I-18, I-23 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, and write each response on a whiteboard to create a visible, shared reflection. Encourage concise, specific feedback.

**Key Discussion Questions for Ghost Line:**
- **Field vs. Screen Integrity:** When you saw the DCS show ESD-310 closed but the field still reported a continuing release, what moment did you first decide to trust the field over the screen? What evidence in the logs or on the ground made that shift in trust possible? _(Objective: Field vs. Screen Integrity)_
- **Cyber-Physical Coordination:** At I-11, when the OT Engineer confirmed a logic mismatch and unauthorized session, who made the call to activate the FSO and EHS Manager roles? What would have allowed you to activate CISA, FBI, and regulatory reporting faster, based on the RMP and Play 4? _(Objective: Cyber-Physical Coordination)_
- **Regulatory Notification Discipline:** After the EHS Manager’s NRC report was submitted, what prevented you from including the word 'cyber' or 'hacked' in the holding statement? How did the template and Section 9 of the RMP guide your language under pressure? _(Objective: Regulatory Notification Discipline)_
- **Siren and Community Activation:** The sirens were to be sounded within 30 minutes of the first release call. When did you actually confirm the CAER-Text and community line were updated? What step in the chain delayed that confirmation, and how could the process be hardened? _(Objective: Siren and Community Activation)_
- **The Call to Action:** At I-18, the IC asked whether to keep automation or go manual. What was the final decision, and what document or procedure (e.g., C1, Section 14) did you rely on to justify the restart path? What would have changed if the PSSR had not been signed? _(Objective: Field vs. Screen Integrity)_
<!-- /section:hotwash -->



*End of Handbook*

