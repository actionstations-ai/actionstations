# Controller / Evaluator (C/E) Handbook
## Ransomware Riptide — Ransomware at City Hall and the Island Decision

Exercise Date: [Date] · Location: Riverside Water Treatment Plant, Millbrook, Carver County, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based tabletop exercise for the City of Millbrook Department of Water & Sewer. Ransomware detonates on the City’s business network on a Monday morning; billing, the AMI head-end, the file server and the backup server are lost. The same service account reaches toward the control network through the two paths the OT plan already lists as finding F-5 — the FW-R-17 backup rule and the MBWSCADA → MILLBROOK trust — and stages a payload on the hot-standby SCADA server to run at noon. The plant itself keeps running; the exercise is about the decisions around it.

Phase 1 tests recognition and the first moves of OT Plan 10.5. Phase 2 turns on the islanding decision and whether the plant can stay in automatic. Phase 3 runs the plant on local control and carries the decision point: how recovery will be done, and DWS’s recommendation on the actor’s offer. Phase 4 confirms water quality, makes the reports and plans a rebuild that will take days. Evaluators should watch for the 30-minute islanding decision, evidence preservation (no reboots), answers about water safety that cite sample results, and Customer Service being kept in the loop.

**Objectives:**
- **Communication:** Within 15 minutes of the first report, move DWS coordination to phone and radio DWS-1 (ERP Section 5: assume the City email tenant and MBW-FS-01 are read by the intruder) and keep the Control Room, Customer Service and the PIO on one set of facts.
- **Decision Making:** Decide within 30 minutes of the SIEM alert whether to island the control network (OT Plan 10.3), and decide on the evidence whether the plant stays in automatic with an operator watching MBW-HMI-01 or moves to manual operations (ERP 7.5.1), with the staffing that requires.
- **Technical Analysis:** Find and close the paths from the MILLBROOK domain into the control network (FW-R-17, FW-R-14 and the MBWSCADA trust) without powering off or reimaging the affected hosts (OT Plan 10.7), and establish which recovery copies survive.
- **Use of Doctrine:** Run the OT Plan 10.5 ransomware checklist, the Section 12 reporting clocks (CISA, FBI, Ohio EPA DDAGW, WaterISAC, the insurance carrier) and the Customer Service workarounds, and answer “is the water safe?” from sample results.

**Plan sections exercised:**
- City of Millbrook Department of… › Section 1 › 1.3 Scope
- ERP › Section 7 › 7.5 Cyber Incident
- ERP › Section 5 › 5.4 Pre-Scripted Messages
- City of Millbrook Department of… › Section 5 › 5.2 Sequence
- City of Millbrook Department of… › Section 12
- City of Millbrook Department of… › Section 2
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- Five tables in a U: Operations (IC) at the head, SCADA / IT to its right, Water Quality / Lab to its left, Public Information and Customer Service on the arms.
- The PIO and Customer Service sit furthest from the IC so that information has to be carried to them.
- One screen for STARTEX, the time-jump cards and the system logs; printed injects for everything else.
- Two handheld radios labeled DWS-1 for the Control Room and the field; a desk phone for the SimCell.
- On each table: ERP-1 log sheets, ERP-3 bench sheets, the OT Plan 10.5 checklist and the printed critical-customer list.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You are the SimCell: City IT, the Mayor, the press, customers, the response firm, the integrator and every agency. Deliver injects with “This just came in.” Do not explain them.

City IT is competent and fast, but it does not know what the plant depends on. Make the SCADA / IT Security Manager say it. If anyone proposes rebooting or reimaging a SCADA host, ask who signed off on losing the evidence (OT Plan 10.7).

I-18 depends on what the players did: if MBW-SCADA-SRV02 was disconnected before 12:00, read it as written; if not, read the SMB lines as connected and report renamed files on MBW-HMI-03.

Agencies advise, assist and receive reports. If a player asks CISA, the FBI or DDAGW for permission to reconnect, or whether the water is safe, answer with a question back: “What do your samples say?”

Time jumps at 1:00, 2:00 and 3:00: “Pause. It is now 10:00 (11:00, 12:00).” Read the card, then ask each team for status before resuming.

If a real emergency occurs, say “REAL WORLD, REAL WORLD” and stop the exercise.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **City IT Director (Kevin Marsh)** — _Trigger: A player asks City IT to reset accounts, restore from backup or contact the actor._
  - Ask: "Which plant logons use a MILLBROOK account? I need a list before I reset anything."
  - Ask: "MBW-BKP-01 held every copy we had. What do you want rebuilt first, the plant or billing?"
  - Ask: "The City Manager asks whether DWS can live without the SCADA servers for a week. Can you?"
  - Concede only when: Breaks the trust or blocks FW-R-14 as soon as DWS names what depends on it.
  - Concede only when: Leaves the SCADA hosts powered on when told they are evidence.
  - Concede only when: Does not contact the actor; payment is the City Manager’s and counsel’s decision.
- **CISA regional contact / FBI cyber task force** — _Trigger: DWS reports the incident (OT Plan 12)._
  - Ask: "Did the actor reach the control network, or only the business network? What is your evidence?"
  - Ask: "Was any equipment operated without authorization? That changes our clock."
  - Ask: "Have the affected hosts been powered off or reimaged?"
  - Concede only when: Offers incident assistance and indicators once given the account name, the hosts and the times.
  - Concede only when: Advises and receives reports; does not tell DWS when to reconnect or whether the water is safe.
- **Ohio EPA DDAGW district engineer** — _Trigger: The Water Quality Manager notifies DDAGW, or no one has by 12:30._
  - Ask: "Can you still monitor chlorine, pH and turbidity? How, and how often?"
  - Ask: "Your monthly operating report is due Friday. Will it be complete?"
  - Ask: "Is the plant in manual? Who is staffing it overnight?"
  - Concede only when: Accepts paper bench sheets and a written timeline.
  - Concede only when: Agrees the report can be filed from paper records with a note on the outage.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Island Decision and Plant Operations (30 Points)** | ☐ **Fail:** The control network was not islanded until after the noon payload, or the plant went to manual without a staffing and relief plan; MBW-EWS-01 or MBW-SCADA-SRV02 was rebooted or powered off. ☐ **Pass:** The SCADA / IT Security Manager had FW-R-17, FW-R-22 and FW-R-14 disabled after I-02 and the IC approved islanding by I-06; the plant went to manual or local control with two operators per shift and a relief plan by I-12. ☐ **Excellence:** FW-R-14 or the trust was closed before I-06b; MBW-SCADA-SRV02 was disconnected but kept running before 12:00; the IC recorded each step and the basis of the I-11 recommendation on ERP-1. | I-02, I-03, I-06, I-06b, I-10, I-11, I-12 |
| **Metric 2: Evidence, Recovery and Reporting (25 Points)** | ☐ **Fail:** Hosts were reimaged or “cleaned”; no CISA or DDAGW notification was made; the team recommended restoring the existing SCADA servers without knowing whether they were clean. ☐ **Pass:** Evidence was preserved per OT Plan 10.7; CISA and the FBI were notified after I-10 and DDAGW after I-19; the recommendation at I-11 was to rebuild from clean media and not to pay. ☐ **Excellence:** The team also secured the PLC-02 program from the cabinet and the integrator’s laptop under supervision (I-22) and named WaterISAC and the insurance carrier in its notification list. | I-10, I-11, I-18, I-19, I-22 |
| **Metric 3: Public Information (25 Points)** | ☐ **Fail:** The PIO confirmed the ransom note or a breach, said “no contamination” without a result, or issued a boil-water advisory in answer to the rumor. ☐ **Pass:** The holding statement was used from I-04; the rumor at I-14 was answered with the approved line and the sample facts; the I-18b question was answered with the law-enforcement line. ☐ **Excellence:** The PIO coordinated with the County EMA PIO, gave a next-update time each time and used the noon sample results from I-19 before Channel 4 went live. | I-04, I-07b, I-08, I-14, I-18b |
| **Metric 4: Customer Service and Critical Customers (20 Points)** | ☐ **Fail:** Customer Service waited for systems to return; Carver Kidney Center heard nothing from DWS; disconnections were left to run Tuesday. ☐ **Pass:** Customer Service switched to paper at I-01, the Water Quality Manager called Carver Kidney Center back within 15 minutes (I-13) and disconnections were suspended at I-20. ☐ **Excellence:** Critical customers were called before they called in, and Customer Service fed complaint patterns to the Control Room throughout. | I-01, I-07, I-08b, I-13, I-20 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Each team names three things that went well and three that did not; the facilitator writes them on the whiteboard and looks for the same issue showing up in more than one team.

**Key Discussion Questions for Ransomware Riptide:**
- **The Path:** When did you learn the business-side account had logged on to MBW-EWS-01, and how long until FW-R-17, FW-R-14 and the trust were closed? What slowed it down? _(Objective: Technical Analysis)_
- **The Island:** Who decided to island the control network, on what evidence, and was it written on ERP-1? What would have happened at 12:00 if MBW-SCADA-SRV02 had still been connected? _(Objective: Decision Making)_
- **Is the Water Safe?:** What did you tell the Mayor, the dialysis center and Channel 4, and what sample results was each answer based on? _(Objective: Communication)_
- **The Backups:** MBW-BKP-01 held every recovery copy the City had and the PLC-02 logic was never backed up. What should change in OT Plan Section 9 before the next exercise? _(Objective: Use of Doctrine)_
- **Customer Service:** What did Customer Service need from Operations, the lab and the PIO that it did not get, and how long did it take to get it? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

