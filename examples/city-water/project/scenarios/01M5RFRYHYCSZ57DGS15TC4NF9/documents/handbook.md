# Controller / Evaluator (C/E) Handbook
## Stale Signal — A Telemetry Outage, a Transmission-Main Break and a Boil-Water Decision

Exercise Date: [Date] · Location: Riverside Water Treatment Plant, 1400 River Road, Millbrook, Carver County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based tabletop exercise for the City of Millbrook Department of Water & Sewer. On the third morning of a heat wave, one failed 24-volt power supply in the Hilltop Tank radio cabinet takes out the repeater RP-1 and the cellular modem that should have backed it up; five remote sites, including Hilltop Tank, go stale on the HMI. Forty minutes later the 1968 Hilltop Transmission Main breaks near Summit Drive.

Phase 1 tests whether the team reads a main break from the plant’s own instruments and the first calls. Phase 2 is isolation and the hidden cost of holding Zone 2: the booster draws on Zone 1, where the hospital is. Phase 3 carries the decision point, the boil-water area without pressure data, and the IC-1 decision. Phase 4 holds Zones 2 and 3 together and gets the public notice right. Evaluators should watch for stale data treated as unknown, ERP 7.1 followed in order, the hospital and dialysis patients warned early, and the advisory area drawn by streets.

**Objectives:**
- **Telemetry Trust:** Keep the Control Room, the field crews, the lab and the PIO on one picture of the system while the HMI shows stale data, using radio DWS-1, field readings every two hours and the OT Plan 10.6 checklist.
- **Zone Isolation:** Decide, from incomplete pressure data, the area and timing of a Boil Water Advisory for the depressurized part of Zone 2 (ERP 7.1 and 9), and whether and when to open IC-1.
- **Boil Water Decision:** Recognize the main-break signature (ERP 6.6), isolate the break with the fewest valves, and manage the hydraulic trade-offs between Zone 2, Zone 1 and Zone 3.
- **Inter-Team Coordination:** Follow ERP 7.1, the OT Plan 10.6 stale-data checklist, the ERP 9.5 notification sequence and the DDAGW consultation, with critical customers called before the public.

**Plan sections exercised:**
- City of Millbrook Department of… › Section 8 › 8.3 Failure-Mode Matrix
- ERP › Section 4 › 4.4 Level 3 — Public Health Emergency
- City of Millbrook Department of… › Section 5 › 5.2 Sequence
- City of Millbrook Department of… › Section 10 › 10.3 Precautionary Advisory (tampering suspected at a storage facility)
- City of Millbrook Department of… › 2. Map of Record (described)
- City of Millbrook Department of… › Section 2
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- Five tables: Operations (IC) at the head, Distribution and SCADA / IT on either side, Water Quality / Lab and Public Information on the arms.
- A large printed map of Zones 1–3 with Hilltop Tank, the Hilltop Transmission Main, V-2410, V-2418, V-2422, Mill Road Booster Station, IC-1 and Northgate Reservoir; markers for the advisory area.
- A whiteboard “level board” for Hilltop Tank, Northgate Reservoir and Zone 1 pressure, updated only from field readings until telemetry returns.
- On the tables: ERP-1 logs, an ERP-2 decision record, ERP-3 sheets, the OT Plan 10.6 checklist and the PCP Boil Water template.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: field crews, the hospital, the County, Buckeye Telemetry, DDAGW, Public Health, customers and the press. Deliver injects with “This just came in.”

Until I-17 (08:25) nobody at the plant can see Zone 2. Give levels and pressures only when a player sends someone to read them, and only for that site.

If players start Mill Road Booster Station early, report Zone 1 pressure falling at the hospital sooner; if they open IC-1 early, BP-401 does not trip at I-18b — read I-18b as a warning instead.

DDAGW and Public Health advise and record. If players ask them to decide the advisory, ask back: “What area are you proposing, and on what basis?”

The phases run straight on; there is a status card at 2:00 only.

If a real emergency occurs, say “REAL WORLD, REAL WORLD” and stop the exercise.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Distribution field crews** — _Trigger: A player orders a valve closed, a booster started or a reading taken._
  - Ask: "Which valve first, and who goes to V-2418 with the machine?"
  - Ask: "If we close V-2422 instead, who calls the 1,800 extra customers?"
  - Ask: "Do you want us reading Hilltop every 30 minutes or every two hours?"
  - Concede only when: Carry out any order that names the valve or site and the reason.
- **Millbrook General Hospital facilities director** — _Trigger: DWS calls the hospital, or no one has by 07:00._
  - Ask: "Do I switch to tanker now? I need four hours’ notice and it costs us."
  - Ask: "What is my pressure going to be at noon?"
  - Concede only when: Holds on stored water and prepares the tanker switch once given a time for the next call.
- **City Manager (Gloria Tennant)** — _Trigger: The IC asks for approval of an advisory over 5,000 people._
  - Ask: "Why the whole zone — or why not the whole zone?"
  - Ask: "How long will it last, and when does Summit Drive reopen?"
  - Concede only when: Approves the advisory once told the area by streets, the basis and the lifting criteria.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Detection Without Telemetry (20 Points)** | ☐ **Fail:** Stale values were treated as current, or the main break was not recognized until crews reported it from the street. ☐ **Pass:** Stale tags were listed and Hilltop Tank checked by sight gauge after I-01; the break was named from the plant signature at I-05. ☐ **Excellence:** The team linked I-01, I-02 and I-09 to a single power supply, closed the cyber question quickly and kept two-hour field readings going until 08:20. | I-01, I-02, I-05, I-06, I-09 |
| **Metric 2: Isolation and Hydraulics (30 Points)** | ☐ **Fail:** Mill Road Booster Station was run without regard to Zone 1 suction; the hospital was not warned; IC-1 was opened without the dialysis notifications or not considered at all. ☐ **Pass:** The break was isolated with the fewest valves and the V-2418 problem handled by I-15; the hospital was warned at I-08; IC-1 was requested against the ERP 7.1 triggers with dialysis patients told first. ☐ **Excellence:** The team anticipated the BP-401 lockout before I-18b and the Northgate drawdown before I-21, and set trigger levels for each. | I-07b, I-08, I-15, I-16, I-17, I-18b, I-21 |
| **Metric 3: Advisory Decision (30 Points)** | ☐ **Fail:** No advisory decision was made, or one was made without DDAGW, Public Health, the City Manager’s approval or an ERP-2 record. ☐ **Pass:** At I-14 the Director and the Water Quality Manager decided the area with DDAGW and Public Health, recorded the basis on ERP-2 and called critical customers before release. ☐ **Excellence:** The area was drawn by streets and widened as I-17 and I-19 came in, and the PIO was given a realistic lifting time from the DDAGW criteria. | I-04, I-13, I-14, I-19, I-23 |
| **Metric 4: Public Information (20 Points)** | ☐ **Fail:** An advisory was announced before it was decided, or the I-20 draft went out with the wrong area or instructions. ☐ **Pass:** The PIO answered I-11 and I-12b with facts and next-update times and corrected the I-20 draft before release. ☐ **Excellence:** Notices used street boundaries and standard boil-water instructions, and the I-22 capital question was deferred without speculation. | I-03, I-11, I-12b, I-20, I-22 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Each team names three things that went well and three that did not; the facilitator writes them up and looks for the same issue in more than one team.

**Key Discussion Questions for Stale Signal:**
- **Running Blind:** How did you keep a picture of Zone 2 while the HMI showed stale data, and when did you first say “main break”? _(Objective: Technical Analysis)_
- **Zone 1 vs Zone 2:** When did the team see that starting Mill Road Booster Station would pull down Zone 1 and the hospital? What did you do about it? _(Objective: Technical Analysis)_
- **The Area:** How did you decide the boil-water area without pressure data, and what would have made you widen or shrink it? _(Objective: Decision Making)_
- **IC-1:** When did you open IC-1, and who told the dialysis patients about chloramine before it reached them? _(Objective: Use of Doctrine)_
- **One Power Supply:** One 24-volt supply took out five sites and the failover. What goes in the after-action report? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

