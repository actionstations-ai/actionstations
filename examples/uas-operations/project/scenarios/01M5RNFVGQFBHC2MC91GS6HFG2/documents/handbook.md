# Controller / Evaluator (C/E) Handbook
## Lost Link — A flyaway after a field firmware update

Exercise Date: [Date] · Location: Horton Field and the Millbrook Road hangar complex, Harwick, Calder County, New York · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based tabletop exercise for the Harwick UAS Operations Group. During pre-flight at Horton Field a crew accepts an OEM update prompt on GCS-01; five minutes after launch UAS-02 loses its link, does not return, and climbs through 400 ft toward the HWK Class C surface area with a regional jet on the approach. It comes down fourteen minutes later in a backyard greenhouse off Stony Creek Road.

Phase 1 tests the first minutes: the HUOG-FOM 9.2 flyaway sequence and the call to HWK Tower. Phase 2 is lawful recovery on private property, evidence and the cause. Phase 3 carries the decision point: what stays grounded with a client’s fixed outage window at stake, and the NTSB and Part 107.9 determinations. Phase 4 returns the fleet to baseline and closes with the homeowner, CCSO and the press. Evaluators should watch for the Tower call time, quarantine before power-off, recovery only with the deputy, grounding by evidence, and reporting decisions with reasons.

**Objectives:**
- **Communication:** Make the HUOG-FOM 9.2 and HUOG-ERP Section 6 calls in order — HWK Tower first, then the flight operations desk, the ASO, CCSO and Corporate Communications — and keep the six teams on one timeline.
- **Decision Making:** Decide, with the evidence available, which aircraft and ground control stations stay grounded and on what condition they return (decision point).
- **Technical Analysis:** Preserve the telemetry and link logs, quarantine GCS-01, and establish what the field update changed against the 03.2026-B baseline.
- **Use of Doctrine:** Follow HUOG-FOM 9.2, HUOG-ERP 8.1 and 6 and HUOG-ISP 9.4: recovery on private property only with a deputy, the FSDO the same day, and the NTSB and Part 107.9 determinations made on the facts.

**Plan sections exercised:**
- FOM › Section 6 › 6.4 ATC coordination
- ISP › Section 5 › 5.2 Link monitoring
- ERP › Section 8 › 8.1 Flyaway (HUOG-FOM 9.2 is the crew procedure; this section is the incident side)
- ERP › Section 11 › 11.3 Records
- FOM › Section 9 › 9.3 GNSS degradation or spoofing suspicion
- ERP › Section 2 › 2.4 Incident log
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- Six tables: Flight Operations (Incident Commander) at the head; Aviation Safety, Systems / Cybersecurity and Leadership around it; Fleet & Logistics and Corporate Communications on the arms.
- A map of Horton Field, Stony Creek Road and the HWK Class C surface area with a grease pencil for the track.
- One screen for STARTEX, the logs and the time-jump cards; printed injects for the rest.
- On the tables: the HUOG-FOM 9.2 card, the HUOG-ERP Section 6 notification table, a timeline sheet and a decision record.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: the crew, HWK Tower, the visual observer, CCSO, the homeowner, the FSDO, CP&L and the press. Deliver injects with “This just came in.”

Phase 1 runs in near real time: ask for the time each call is made and write it on the board.

The FSDO, HWK Tower and CCSO advise, assist and record. If players ask them to decide the grounding, ask back: “What does your evidence say?”

If the recovery team enters the property before the deputy arrives, have the homeowner call 911 again.

Time jumps at 1:00, 2:00 and 3:00.

If a real emergency occurs, say “REAL WORLD, REAL WORLD” and stop the exercise.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **HWK Tower** — _Trigger: The RPIC calls the Tower exercise line._
  - Ask: "Position, altitude, heading, and how much battery?"
  - Ask: "Can you bring it down? When will you know?"
  - Ask: "Call me back every two minutes."
  - Concede only when: Vectors arriving traffic and files its own report; never asks the Group to do anything to the aircraft it cannot do.
- **Stony Creek Road homeowner** — _Trigger: The recovery team arrives or calls._
  - Ask: "Who are you, and who pays for my greenhouse?"
  - Ask: "Is that battery going to catch fire?"
  - Ask: "Why did nobody tell me what was going on?"
  - Concede only when: Lets the team in with the deputy present once told what will happen and who to contact.
- **FAA Harwick FSDO duty inspector** — _Trigger: The ASO calls, or the FSDO calls at 10:10._
  - Ask: "Was the update approved? By whom?"
  - Ask: "Is the rest of your fleet on the same software?"
  - Concede only when: Accepts a written statement and the records; does not tell the Group what to ground.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: The First Ten Minutes (25 Points)** | ☐ **Fail:** HWK Tower was called late or not at all, or the timeline was not started; the General Manager heard after 15 minutes. ☐ **Pass:** The FOM 9.2 sequence ran after I-01 and the Tower was called by I-03, with traffic passed at I-04; Level 3 was declared. ☐ **Excellence:** The Tower call carried position, altitude, heading and battery time, and updates continued until the track ended. | I-01, I-02, I-03, I-04 |
| **Metric 2: Recovery and Evidence (20 Points)** | ☐ **Fail:** The team entered the property without the deputy or consent, or GCS-01 was powered off or used again before the logs were copied. ☐ **Pass:** Recovery waited for the deputy and consent (I-08b, I-10); the battery was handled as a fire risk; GCS-01 and GCS-03 were quarantined (I-02, I-05b). ☐ **Excellence:** The homeowner was given contacts and the claim process at once, and her complaint (I-18) was taken to the General Manager. | I-02, I-05b, I-08b, I-10, I-18 |
| **Metric 3: The Grounding Decision (35 Points)** | ☐ **Fail:** Aircraft that could carry the same update flew before their parameters were read back, or no decision was made before CP&L’s question. ☐ **Pass:** At I-12 Flight Operations and the General Manager, with the ASO, decided the grounding and the return-to-service condition from I-05 and I-11, told CP&L and recorded the basis. ☐ **Excellence:** The fleet audit at I-15b was used to return verified aircraft under a stated condition, and I-16’s measures were adopted or amended. | I-05, I-08, I-11, I-12, I-15b, I-16 |
| **Metric 4: Reporting and Public Information (20 Points)** | ☐ **Fail:** The NTSB or Part 107.9 question was decided without reasons, or Corporate Communications speculated about a hack or a diverted plane. ☐ **Pass:** The FSDO was told the same day (I-06); Part 107.9 applied after I-13 with NTSB recorded as not applicable; the media got confirmed facts (I-14, I-19). ☐ **Excellence:** Neighbors and the homeowner heard from the Group directly, and the public statement named the measures taken. | I-04b, I-06, I-06b, I-13, I-14, I-19 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Each team names three things that went well and three that did not; the facilitator writes them up and looks for the same issue in more than one team.

**Key Discussion Questions for Lost Link:**
- **The Call:** How many minutes passed between the lost link and the call to HWK Tower, and what did the Tower hear? _(Objective: Communication)_
- **The Prompt:** Why was an update prompt accepted in the field, and what stops it next time — procedure, configuration or both? _(Objective: Technical Analysis)_
- **Grounding:** What did you ground, on what evidence, and what did the decision cost the clients? _(Objective: Decision Making)_
- **Reporting:** How did you decide the NTSB and Part 107.9 questions, and who recorded the reasons? _(Objective: Use of Doctrine)_
- **The Neighbors:** What did the homeowner and the neighbors hear from the Group, and when? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

