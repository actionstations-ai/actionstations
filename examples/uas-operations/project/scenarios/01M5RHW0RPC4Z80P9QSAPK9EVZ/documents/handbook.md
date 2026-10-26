# Controller / Evaluator (C/E) Handbook
## Deadline Ransom — Ransomware on the NAS and the processing workstation before a client deadline

Exercise Date: [Date] · Location: Millbrook Road hangar complex (Hangars 1–3), Harwick, Calder County, New York · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based tabletop exercise for the Harwick UAS Operations Group, run as the Group’s 2026 cyber tabletop (“ransomware on the NAS ten days before CP&L Deliverable D-3” in HUOG-ISP). On Monday morning the processing team finds the NAS and a processing workstation encrypted. A ground control station that mounted the NAS this morning is infected, the backups are stale, and the controlled share was read and probably copied overnight.

Phase 1 tests recognition, containment and grounding. Phase 2 is scoping: what was read, which GCS can still fly, and the first client and press calls. Phase 3 carries the decision point, the client notification inside the four-hour window, and the discovery that the missing data may still exist. Phase 4 is recovery in order and keeping the fleet flying for the next client. Evaluators should watch for grounding by evidence, OB-1 kept offline until the MSSP clears it, verification before processing, client notification with facts, and the decision not to pay written down.

**Objectives:**
- **Data Integrity Verification:** Keep Leadership, the Systems & Cybersecurity Lead, Flight Operations, Payload & Calibration and Corporate Communications on one set of facts, and route every external statement through Corporate Communications (UC-CP-2025).
- **Client Notification Authority:** Within four hours of discovery, decide whether to notify CP&L and CVAC that deadlines are at risk and whether CP&L’s 24-hour exposure notice applies, on the evidence available (HUOG-ISP 9.3 step 4), and record the decision not to pay.
- **Operational Continuity vs. System Containment:** Contain the ransomware (isolate the Data VLAN at HUOG-FW01, ground every GCS that mounted the NAS during the infection window), scope which shares were read, and preserve evidence for the MSSP.
- **Incident Command Authority:** Recover in the HUOG-ISP 9.3 order from OB-1 and the off-site service once the MSSP confirms a clean environment, verifying restored data against manifests before any processing.

**Plan sections exercised:**
- ISP › Section 9 › 9.3 Ransomware on the NAS, the processing workstations or DC-HPC project storage
- ISP › Section 6 › 6.2 Backups
- ERP › Section 2 › 2.4 Incident log
- ERP › Annex A
- ERP › Section 10 › 10.3 Social media and trainees
- ISP › Section 1 › 1.3 Relationship to other plans
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- Five tables: Leadership at the head, Systems / Cybersecurity and Flight Operations on either side, Payload & Calibration and Corporate Communications on the arms.
- A whiteboard fleet board (GCS-01 to GCS-06 and their aircraft) and a backup board (OB-1, OB-2, off-site, payload SSDs).
- One screen for STARTEX, the logs and the time-jump cards; printed injects for the rest.
- On the tables: the HUOG-ISP Section 9.3 checklist, a paper incident log and a notification record.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: the processing analyst, crews, Fleet & Logistics, SecureWatch, the Compliance Officer, CP&L, CVAC, counsel and the press. Deliver injects with “This just came in.”

SecureWatch advises; the Group decides. If players ask the MSSP whether to notify clients or pay, answer: “That is the General Manager’s decision. What do you need from us to make it?”

If OB-1 is connected before 12:00, tell the Systems & Cybersecurity Lead that OB-1 now shows new .lck0 files.

Time jumps at 1:00, 2:00 and 3:00. At 2:00 remind the room the four-hour decision falls at about 13:00.

If a real emergency occurs, say “REAL WORLD, REAL WORLD” and stop the exercise.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **SecureWatch MSSP incident coordinator** — _Trigger: The Systems & Cybersecurity Lead calls the SOC or asks for a decision._
  - Ask: "Which hosts mounted the NAS since Saturday 22:15? I need a list, not a guess."
  - Ask: "Has anyone powered anything down or reimaged it?"
  - Ask: "Do you want us to open the FBI report? That is the General Manager’s call."
  - Concede only when: Gives the clean-environment confirmation at 12:00 if OB-1 has stayed in the safe.
  - Concede only when: Advises on recovery order and evidence; never decides on client notification or payment.
- **CP&L program manager** — _Trigger: The General Manager calls back or sends the notice._
  - Ask: "Was our data copied? Which data?"
  - Ask: "What date can you actually deliver D-3?"
  - Ask: "Who else knows?"
  - Concede only when: Accepts a revised date and a written notice that states facts and the next update time.
- **Channel 10 / Harwick Daily News** — _Trigger: Corporate Communications returns a call._
  - Ask: "Did you pay?"
  - Ask: "Is utility infrastructure imagery out there now?"
  - Ask: "Why didn’t your clients hear first?"
  - Concede only when: Run the Group’s statement if it is factual and on time.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Containment and Fleet Grounding (25 Points)** | ☐ **Fail:** A GCS that mounted the NAS kept flying, a host was reimaged or powered off without the MSSP, or OB-1 was connected before the clean confirmation. ☐ **Pass:** The Data VLAN was isolated after I-01, GCS-02 grounded at I-04, GCS-03 grounded at I-13 and OB-1 kept in the safe until 12:00. ☐ **Excellence:** The team asked “who else mounted the NAS?” at I-02, before the MSSP answered it, and moved the CVAC flight to equipment that could not have touched the NAS. | I-01, I-02, I-04, I-05, I-07, I-13 |
| **Metric 2: Client Notification Decision (30 Points)** | ☐ **Fail:** No decision on CP&L within the four-hour window, or CP&L learned of the possible exposure from someone else; the decision not to pay was not recorded. ☐ **Pass:** At I-11 the General Manager decided what CP&L and CVAC were told and when, on the evidence of I-08, with the basis recorded; the no-pay decision was written down at I-18. ☐ **Excellence:** The notice included the realistic delivery date from I-15b, the publication threat from I-18 and a next-update time, and the PL-02 question went to the Compliance Officer. | I-06, I-08, I-11, I-15, I-18 |
| **Metric 3: Recovery in Order (25 Points)** | ☐ **Fail:** Data was processed before it was verified, the payload SSDs were copied onto an infected host, or the restore skipped the calibration share. ☐ **Pass:** The restore followed HUOG-ISP 9.3 (I-14a); the SSDs stayed in custody (I-11b) and were read on the clean laptop (I-15b). ☐ **Excellence:** The team identified the payload media as the source of the missing days at I-10a and rebuilt their calibration from the paper sheets without delaying the rest. | I-10a, I-11b, I-14a, I-15b |
| **Metric 4: Communications (20 Points)** | ☐ **Fail:** Staff commented to the press, or Corporate Communications confirmed a ransom, a payment or stolen data before the General Manager approved. ☐ **Pass:** All media went through Corporate Communications with approved lines (I-07b, I-12, I-14b). ☐ **Excellence:** Clients heard from the Group before the press reported, and every answer carried a next-update time. | I-01b, I-07b, I-12, I-14b, I-15 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Each team names three things that went well and three that did not; the facilitator writes them up and looks for the same issue in more than one team.

**Key Discussion Questions for Deadline Ransom:**
- **Grounding:** How did you decide which ground control stations could fly, and how long did it take to know? _(Objective: Technical Analysis)_
- **The Four-Hour Call:** What did you tell CP&L, when, and what evidence was it based on? Would you make the same call again? _(Objective: Decision Making)_
- **The Backups:** The newest clean copy was three weeks old and the off-site job had been failing for ten days. Who should have known, and how? _(Objective: Use of Doctrine)_
- **The Missing Days:** The last three D-3 days survived only on payload media and paper sheets. What should the media and calibration-log rules be after today? _(Objective: Use of Doctrine)_
- **Who Heard First:** Did the clients hear from you before the press asked? What would have made that happen? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

