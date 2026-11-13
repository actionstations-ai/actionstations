# Controller / Evaluator (C/E) Handbook
## Cold Storage — EHR Storage Failure & Downtime Continuity

Exercise Date: [Date] · Location: Lakemont Community Hospital, Duluth, St. Louis County, Minnesota · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) for Lakemont Community Hospital, Duluth. It runs four hours of exercise time on a no-fault basis. Players talk through what they would decide and do. Nobody touches a live system, and all patients and record numbers are fictional. The scenario, "Cold Storage", starts at 02:40 on Tuesday, February 9, 2027. It covers an unplanned loss of the Lakechart EHR and the interface engine, and the work of running safe care on paper overnight. It ends before the database is restored and before return to normal is declared.

The injects simulate an **infrastructure failure**. At 02:10 a storage controller at the primary data center failed. Controller B could not take over, and the Hermantown secondary is 40 minutes behind. There is no attacker, but the room does not know that. The injects deliver the stale 23:20 downtime viewer, a growing interface backlog with an 8-hour source hold limit, late vendor callbacks, critical results and a cabinet count that doesn't match, an identity overlay, an unexplained service-account login, and staff, social media and a local TV station all saying "hack."

The exercise runs in four phases:
- **Phase 1, Spinning Screens (0:00–1:00):** players work the first-hour checklist in section 4 of the downtime plan, declare a downtime level and get every unit onto procedures within 60 minutes.
- **Phase 2, The Odd Login (1:00–2:00):** players keep patients safe on paper while handling the SOC alert inside the 60-minute window for ruling a security cause in or out.
- **Phase 3, Divert or Hold Open (2:00–3:00):** this phase holds the exercise's one decision point, the 2-hour decision on whether to divert. Players also confirm or revise the level once the login is explained.
- **Phase 4, Replay in Order (3:00–4:00):** players restore in a safe order. ADT and identity checks come first, each message class gets a replay, hold or discard decision, and Lakechart stays closed to clinicians until the lab interface is validated.

Evaluators should watch for these things:
- **Time stamps:** declaration time, the time each unit reported on procedures, and whether the units that hadn't reported were chased after 15 minutes.
- **Vendor case numbers:** whether they were logged on the command board.
- **Security call:** whether the Security Officer made an explicit, written decision instead of letting the level drift.
- **Critical results:** whether they were phoned with read-back and logged within 60 minutes.
- **Downtime registrations:** whether D-numbers and the possible overlay went to HIM.
- **Message decisions:** whether each class had a named decision-maker.
- **Opening the EHR:** whether the team refused to open Lakechart early.
- **Public statements:** whether every one was cleared with the Incident Commander and matched what was actually known.

**Objectives:**
- **Decision Making:** Demonstrate the ability to declare and later revise the Lakechart downtime level, choosing between Level 3 and Level 4 while the 03:30 service-account login is unexplained, and to decide within 2 hours, with the ED Medical Director, whether to divert elective admissions or ambulances.
- **Use of Doctrine:** Demonstrate the ability to put every unit on paper downtime procedures within 60 minutes of the overhead page and to keep patients safe on paper, including phoning the critical potassium of 6.9 and the positive blood culture with read-back and a Critical Result Call Log entry within 60 minutes, and holding the ZZ-Trauma and Carlson identities apart.
- **Technical Analysis:** Demonstrate the ability to sequence the restore and decide, message class by message class, whether to replay, hold or discard the 31,000 queued messages under IS-14-C section 2 (ADT first, decisions logged), and to refuse to open Lakechart to clinicians before the lab results interface is validated.
- **Communication:** Demonstrate the ability to issue staff, family and media statements that are cleared by the Incident Commander and match what is known, including a holding statement that answers the 'hospital was hacked' claims from staff, a local TV reporter and a community Facebook post without confirming or ruling out a security cause before the Privacy and Security Officer decides.

**Plan sections exercised:**
- Lakemont Community Hospital — In… › 3. Downtime levels
- Lakemont Community Hospital — In… › 4. First hour checklist
- IS-14-A › 3. Laboratory
- Lakemont Community Hospital — Cl… › 2. Interface classes
- IS-14-C › 1. Before the EHR opens
- Lakemont Community Hospital — In… › 8. Communication
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Layout:** Use islands of tables, not a U-shape. Each island stands for a real place, so players have to physically carry information between them, the way it moves on the night.
- **Island 1, Boardroom command center (HCC, 2nd floor, ext. 5520):** Team A (Administrator on Call / Incident Commander) and Team E (Privacy and Security Officer). The ICS-201 whiteboard and command board stand next to this island. Vendor case numbers, the downtime level and its time stamp, and the decision log go here.
- **Island 2, IS downtime command post (Help Desk wall, ext. 5500):** Team B (Clinical Systems Lead). Put a printed "status dashboard" sheet here showing queue depth per class and the RED/AMBER/GREEN status, with the words written next to each color.
- **Island 3, clinical operations:** Team C (Night House Supervisor / CNO) and Team D (Laboratory and Pharmacy Managers) sit side by side. Tape the unit downtime tracker, the Critical Result Call Log and the Downtime Medication Log here.
- **Rear table, alone: Team F (Public Information Officer).** Put it at the back of the room, away from the command board. The PIO has to walk to Island 1 to get facts and to get every statement cleared by the IC. The walk makes visible the gather, verify, coordinate and disseminate cycle, and it shows whether the PIO is speaking from rumor or from what the command center actually knows.
- **SimCell table:** at the front side, facing the islands, with the inject deck and phones. The controller plays every outside caller from here.
- **Evaluator positions:** one evaluator standing near Island 1, one moving between Islands 2 and 3, one at the PIO table. They do not sit at player tables.

**Equipment needs**
- A projector and screen for main-screen injects: the STARTEX and TIME JUMP cards, dashboard snapshots, the Facebook posts and the Northland 6 chyron.
- A whiteboard (or flip chart) for the ICS-201 and the command board: level, declaration time, vendor case numbers and open items with their owners.
- The printed inject deck, one copy per controller, sorted by MSEL time, with the handout injects cut and ready to hand over.
- Optional: simulated phones or radios (two handsets, or labeled "phone" cards) so callers can "ring" a specific team.
- A wall clock or countdown timer showing exercise time.

**Materials for players:** name tents by role, the downtime plan (sections 2–8) and the Clinical Systems plan (sections 4–5), the stale 23:20 downtime census, blank downtime order sheets, the D-number pad, the Critical Result Call Log, the Downtime Medication Log, and pens and sticky notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**Your role: the SimCell**
You play everyone else in the world. If a player says "I call the sheriff," you answer as the deputy. In this scenario, if a player says "I call Northpine," you are Dale Rusk on the priority-one line. If they say "I call dispatch," you are the Duluth dispatcher. Answer as that person would at 3 a.m. in February: tired, busy and protecting their own interests. Players should never get information from you as "the instructor." They get it from a caller, a screen or a piece of paper.

**Do not make it easy**
Real organizations do not answer on the first ring, and they do not solve the players' problem for them. Example from this scenario: when the Clinical Systems Lead calls Northpine at 03:00, the auto-reply promises a callback in 30 minutes. Do not call back until 1:15 on the MSEL (I-08), 55 minutes later. When Dale Rusk calls, he offers the hosted web and printing failover only. He repeats that the locally hosted database is Lakemont's own infrastructure team's job. If players ask "can you just restore it?", the answer is no. Do the same with Dr. Sofia Lindgren at I-17b. He pushes hard to open Lakechart on the Hermantown copy. Do not back down unless the players give a reason based on the lab validation and the master patient index.

**Managing time**
Read the time-jump cards word for word. Script:
> "PAUSE EXERCISE. We are jumping forward 30 minutes. It is now 03:40 on Tuesday, February 9. Lakechart and the interface engine are still RED, DOWN. The interface monitor shows about 9,535 messages held at source. The source hold runs out at about 10:10. Whatever you decided before the pause has happened. Anything you did not assign has not happened. RESUME."

Use the same pattern for I-11 (04:40) and I-16 (05:40). If a phase is running long, let the current discussion finish and then jump. Do not cut off the Phase 3 diversion decision. If a team is stuck, deliver the next inject early rather than coaching.

**Handling artificialities**
When a player says "I wouldn't use that system" or "We'd never let it get that far," answer:
> "Understood. Note that in the parking lot for the hot wash. For today, the situation is as presented. What do you do next?"

Write the comment down. It is often a real finding about the downtime plan. Do not argue the scenario's technical facts. The array log says what it says.

**Delivering injects**
Do not explain. Say "This just came in." or "This is on the main screen." Hand paper injects to the named recipient only, and let them decide whether to share. Never add hints about what an inject "means." The svc-rptexport login (I-07) should stay ambiguous until the SOC update at I-15.

**Exercise conventions**
- Every spoken or written outside contact during play begins and ends with "This is an exercise." That includes any real call or email a player has to make to a real number.
- If something real happens (an actual outage, a medical emergency in the room, a real page that needs action), anyone says **"REAL WORLD, REAL WORLD."** All play stops at once until the controller announces "RESUME EXERCISE."

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Northpine EHR priority-one support (senior engineer Dale Rusk, case P1-20270209-0417) and Relaywell Integration after-hours on-call engineer (ticket RW-88213): the vendors whose services are down** — _Trigger: The Clinical Systems Lead opens or chases a case. Northpine answers through I-02 and calls back at I-08. Relaywell calls back at I-16/I-17. Also triggered when any player asks a vendor to 'just fix it' or to release queued messages._
  - Ask: "Northpine: "What's your case number? I've got three P1s tonight. Who's your named technical contact, and is your infrastructure team actually on the array right now? I can't touch a database that sits in your data center.""
  - Ask: "Northpine: "You want the hosted web and print failover? I need that request in writing from someone authorized to sign for Lakemont, plus a site contact and dock access for the hardware tech. Who signs?""
  - Ask: "Relaywell: "I've got about 31,000 messages in my store. I won't release a single channel until you tell me replay, hold or discard for each class, in writing, with a name on it. Which goes first?""
  - Ask: "Relaywell: "138 of those orders belong to patients you've discharged or moved since 23:20, and about 700 are already done on paper. Do you want me to replay them anyway? Your call, not mine.""
  - Concede only when: Northpine runs the hosted web and printing failover, and pushes the hardware partner for a firm arrival time, once the case number is logged and a written authorization with a named site contact is received.
  - Concede only when: Relaywell releases ADT first and holds every other class, once the CSL gives a written decision for each class with the decision-maker named.
  - Concede only when: Relaywell exports the list of stale orders and results for the 6 discharged or transferred patients, so they can be discarded with a count, once the team says who will reconcile them.
- **Regional health information exchange operations desk and the Minnesota Department of Health (MDH) infectious disease epidemiologist: partner agencies that depend on Lakemont's outbound feeds** — _Trigger: I-12b arrives, or the CSL or LPM contacts the HIE or MDH about the silent ADT, results and ELR feeds. Also triggered if no one has told partners about the outage by 04:30._
  - Ask: "HIE: "Your feed has been silent since 02:10. I can buffer 72 hours, but three member hospitals and two care-coordination programs want a restore time by 08:00 for our partner bulletin. 'Unknown' won't satisfy them. What do I tell them?""
  - Ask: "HIE: "When you replay, are you sending me stale orders and duplicate registrations? I don't want your D-numbers spreading through the exchange.""
  - Ask: "MDH: "Our ELR queue from you went quiet at 02:10. You have a positive blood culture working up. How are reportable results getting to me tonight? Who is phoning or faxing them, and when?""
  - Ask: "MDH: "Is this a significant disruption to patient care? Nobody from Lakemont has told the department yet.""
  - Concede only when: The HIE accepts a 'next update by' time instead of a restore time, and holds the buffer, once the CSL commits to a named contact and an update schedule.
  - Concede only when: The HIE agrees to hold ingestion of replayed ADT until Lakemont confirms its identity check passed, if asked.
  - Concede only when: MDH accepts manual case reports by phone or fax through the reporting portal, and takes the Laboratory Manager's callback number, once a named person is assigned to report.
- **Duluth dispatch (St. Louis County ambulance routing) and the North Shore Bluffs Medical Center house supervisor** — _Trigger: I-12, the diversion decision point. Also triggered at any time a player says 'we go on diversion' or 'call the neighbors.'_
  - Ask: "Dispatch: "Lakemont, yes or no on diversion? I have a chest pain with ST changes 12 minutes out. If you divert, he goes to North Shore Bluffs, 40-plus minutes tonight with the ice on 61. Is that what you want?""
  - Ask: "Dispatch: "Diversion for what, and until when? Everything, or just electives? When do you reassess? I need a time.""
  - Ask: "North Shore Bluffs: "We're at 94 percent with four boarders and a CT down. I'll take criticals, not a steady stream and not your electives. Who's your physician-to-physician contact if I accept one?""
  - Concede only when: Dispatch accepts a limited diversion (electives only, or specific categories) with a reassessment time and a callback number.
  - Concede only when: North Shore Bluffs accepts named critical transfers with a physician-to-physician call, once Lakemont confirms what records travel with the patient while the EHR is down.
- **Northstar Managed Security SOC analyst (ticket NSM-27-00562) and Harborline Cyber Risk breach coach (the cyber insurer's counsel panel)** — _Trigger: The SOC calls at I-07 and updates at I-15. The breach coach calls at I-18. Also triggered when the Security Officer or IC asks either party about breach status or about disabling svc-rptexport._
  - Ask: "SOC: "Do you want svc-rptexport disabled, yes or no? I need that from the Security Officer by name. If I kill it and it's your backup job, that's on you.""
  - Ask: "SOC: "Have you preserved the event logs on the Hermantown host and the array? If someone pulls hardware before you've captured them, I can't tell you anything later.""
  - Ask: "Breach coach: "Before anyone says 'breach': was there unauthorized access to PHI, yes or no, and on what evidence? If yes, discovery was overnight and the clock is running. If no, write down why and when you decided.""
  - Ask: "Breach coach: "Your infrastructure team wants to ship the failed controller. Did security clear that, and is it in your decision log?""
  - Concede only when: The SOC disables or watches the account on the Security Officer's written order, and sends the full correlation (I-15) once asked for evidence, not reassurance.
  - Concede only when: The breach coach accepts a documented 'security cause ruled out' determination, with the evidence, time and decision-maker, and agrees no HIPAA notification clock is triggered on these facts. This may support compliance; the compliance office decides.
  - Concede only when: The breach coach approves removal of the failed controller once the logs are confirmed preserved and the release is logged.
- **Morning producer, Northland 6 News (local TV news desk)** — _Trigger: I-14 (phone slip at 05:30) and I-19 (call at 06:31 after the live chyron). Also triggered if the PIO calls the station first._
  - Ask: ""We're hearing from several of your staff that you were hacked. Was it a cyberattack, yes or no? We go live at 06:30 and we'll run it with or without you.""
  - Ask: ""Were patient records exposed? Is the ER open right now? If ambulances are being sent elsewhere, people need to know that this morning.""
  - Ask: ""Can I get that on the record from a named spokesperson? 'We're looking into it' means I say you declined again at 7:00.""
  - Ask: ""Your own nurses are telling families 'probably.' Why should viewers believe you over them?""
  - Concede only when: The producer runs the hospital's line ('equipment failure, no evidence of an attack, ER open, patients being cared for on paper') at 7:00 if it comes on the record from a named spokesperson before the deadline.
  - Concede only when: The producer updates the chyron and online story away from 'hack' when given a clear, attributable statement of what is known, what is not known and when the next update comes.
  - Concede only when: The producer agrees to a scheduled follow-up call time instead of door-stepping staff, if the PIO gives a direct number and commits to an update time.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Downtime Command & Clinical Operations Coordination (30 Points)** | ☐ **Fail:** Ops (IC/CNO) left the downtime level undeclared after STARTEX, let Pediatrics and Behavioral Health go unreported past I-03 without calling them, and swung to Level 4 or dismissed the alert at I-07 based on the room's opinions. The divert/stay-open decision was not made until Dr. Sofia Lindgren forced it at I-12, or it was never logged. ☐ **Pass:** Ops declared at least Level 3 at STARTEX by overhead page, ext. 5505 and the Downtime Alert group, opened the Boardroom command center and logged the declaration time. They called the unreported units at I-03, held the level as provisional on the facts at I-07, and logged the divert/stay-open decision with Dr. Sofia Lindgren, the reasoning and the time at I-12. At I-15 they confirmed Level 3 and wrote the reason on the board. ☐ **Excellence:** Ops put the 04:42 rule-in/rule-out deadline and the 2-hour diversion deadline on the command board before I-06 and I-11 prompted them. They called North Shore Bluffs and dispatch about capacity before I-12 and set ED staffing for either option ahead of time. They also assigned float RNs as paper runners before the result backlog showed up at I-13. | START, I-03, I-07, I-12, I-15 |
| **Metric 2: Restore Engineering & Interface Replay Judgement (30 Points)** | ☐ **Fail:** IT failed over to the 01:30 Hermantown copy or began a controller swap or volume rebuild before the Security Officer released the storage (I-01, I-08, before I-18). At I-17 they released queued messages in bulk without class-by-class decisions, or opened Lakechart to clinicians at I-17b before lab results were validated. ☐ **Pass:** IT logged scope, vendor case numbers, the missed callbacks and the 10:10 hold limit on the board (I-01, I-02, I-08) and left the failed array untouched until it was released at I-18. At I-17 they set replay, hold or discard for each class with ADT first, and logged every discard by class, count and decision-maker. At I-17b they refused to open Lakechart, sent the 4 failed ADT records to HIM for manual merge, and held results until the LPM had validated them. ☐ **Excellence:** IT escalated the missed Northpine 03:30 callback before Dale Rusk called at I-08. They drafted the class-by-class replay plan before Relaywell asked for it at I-17, including the 6 discharged or transferred patients, the roughly 700 orders already done on paper and the ZZ-Trauma and Carlson overlays. They also set the LPM's analyzer-and-armband validation sample as a written gate before the ED Medical Director pushed to open the chart. | I-01, I-08, I-17, I-17b, I-18 |
| **Metric 3: Public, Staff & Bedside Communication (20 Points)** | ☐ **Fail:** PIO stayed silent through I-04 and I-10, or released wording the IC had not cleared. The wording confirmed 'hack' or said 'not a cyberattack' before the Security Officer decided, and Northland 6 went live at I-19 with 'did not respond' while bedside staff had no approved wording. ☐ **Pass:** PIO wrote holding statements under 150 words at I-04, I-10 and I-14 covering what is known, what is not known, what is being done and the next update time. Each was cleared by the IC before release and neither confirmed nor ruled out a security cause. The same wording went to unit managers for the bedside, and after the 06:15 determination the PIO released an IC-cleared update describing an equipment failure (I-19). ☐ **Excellence:** PIO had an IC-cleared statement and bedside wording ready before the Med-Surg manager asked at I-10, and responded to Northland 6 well before the 06:30 air time at I-14. At I-15/I-18 the PIO updated the intranet banner, bedside script and community-group reply as soon as the Security Officer decided, without waiting for I-19, and asked the station to correct the 'hack' framing. | I-04, I-10, I-14, I-19 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students acted without citing the plans. Units missed the 60-minute target in IS-14 section 3, and the potassium of 6.9 or the positive blood culture at I-09 was not phoned with read-back and a Critical Result Call Log entry within 60 minutes. The shared MRN for the Carlsons was kept in use at I-09b, and the after-action measures at END were not given. ☐ **Pass:** Students cited the plan sections by number: IS-14 section 3 for the level and the 60-minute unit target, IS-14 section 4 items 5–7 for the lab/pharmacy reports, the security rule-in/rule-out and the diversion decision, and IS-14 section 8 for MDH notice. At I-09 both criticals were phoned with read-back, logged and checked against the armband. At I-09b Wendell got a D-number with handwritten name and date of birth, and at END the CSL listed the IS-14-C section 8 measures and set the 14-day hot wash. ☐ **Excellence:** Students cited specific sections before injects forced them. Under IS-14 section 4 item 6 they started the 60-minute security clock at declaration, and they had the D-number and ZZ-Trauma tracking in place at I-03. They raised the hydromorphone count mismatch openly at I-09. At END they tied return to normal to IS-14-A section 11 reconciliation, with hourly counts, owners and dates, and named Steering Committee tracker owners for corrective actions. | I-03, I-09, I-09b, I-12, END |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask the room for three things that went well and three things that broke or failed during the Lakechart outage. Go around the room one team at a time (command, IS, clinical, lab/pharmacy, communications), write every item on the whiteboard in two columns, and don't debate any item until all teams have spoken.

**Key Discussion Questions for Cold Storage:**
- **Trust:** At I-01 (02:49), Ananya told you the downtime viewer banner read 'Data current as of 23:20' and that every census and MAR was 3 hr 20 min old. When did you stop trusting those printouts, and what did you tell the units to do about the missing 00:00 and 02:00 med passes and the patients admitted after 23:20? Did anyone treat the viewer as current because it was 'up'? _(Objective: Use of Doctrine)_
- **The Level:** From 03:30 to 06:15 the service-account login was unexplained. Under the First Hour Checklist, item 6, that meant handling it as a suspected security incident after 60 minutes. Did you declare Level 3 or Level 4, who decided, and did you revise the level when I-15 showed RPTEXPORT-NIGHTLY-BKP was to blame and that controller A failed 80 minutes before the login? What would have let you make that call faster? _(Objective: Decision Making)_
- **The Call:** At I-12, Dr. Sofia Lindgren asked you to divert or stay open. You had two D-number traumas with a crossmatch pending, a STEMI 12 minutes out, and a 40-plus-minute route on icy Highway 61 to North Shore Bluffs, which was at 94 percent. What did you decide, did you make it inside the 2-hour window, and how much did hearing from the receiving hospital change your choice? _(Objective: Decision Making)_
- **The Gap:** The engine held 31,000 queued messages, and source systems could hold them for only 8 hours. Did you decide replay, hold or discard for each message class, starting with ADT and logging each decision? Who refused to open Lakechart to clinicians before the lab results interface was validated? And how did you keep the ZZ-Trauma and D-number identities from colliding with replayed results? _(Objective: Technical Analysis)_
- **What We Said:** Staff, a local TV reporter and a Facebook post were calling this a hack, and at I-12b the HIE wanted a firm restore time by 08:00 while MDH asked how reportable results like the positive blood culture would reach them. What did you say publicly and to partners before you knew the cause? Did the Incident Commander clear every statement, and did you avoid confirming or ruling out a security cause before the Security Officer decided? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Clinical systems**: The records and messaging systems of a care organization: EHR screens in normal, degraded and read-only states, downtime reports and paper forms, interface status and HL7 and FHIR message views, results backlogs and reconciliation worklists. Used by health informatics, healthcare, nursing and pharmacy exercises. Every patient is synthetic.
  - Reference documents: Health Industry Cybersecurity Practices (HICP), main document; CMS State Operations Manual Appendix Z: Emergency Preparedness; Fact Sheet: Ransomware and HIPAA; CISA Tabletop Exercise Package: Healthcare and Public Health Sector
- **Media environment**: The news cycle and social feeds around an incident: wire alerts, articles and broadcast segments, social posts whose reach and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. Simulated spread and sentiment are teaching models, not predictions. All outlets, handles and people are fictional.
  - Data sources: gdelt
  - Reference documents: FCC report on the Hawaii false alert (2018): a correction case study
<!-- /section:toolkits -->
