# Controller / Evaluator (C/E) Handbook
## Presumptive — Lot Trace, Holds & Recall Notification

Exercise Date: [Date] · Location: Pinecrest Fresh Cut, LLC — Plant 1 conference room and Recall Team bridge · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) for the Recall Team at Pinecrest Fresh Cut, LLC, Salinas. It runs four hours of exercise time, from 06:00 to 10:00 Pacific Time on Tuesday, October 12, 2027. Players do not move product, stop lines or send real notices. They talk through decisions, write them into the contact log and the reconciliation table, and say who they would call. You run the clock and the injects. As the SimCell, you also play everyone outside the room.

The injects simulate an **infrastructure failure** on top of a food safety signal. A presumptive E. coli O157:H7 result arrives on lot PF1-27278-L2-B. That result is a recall signal under PPHTRP 3, and under the PPHTRP 5 scope rules it covers five line 2 lots plus the Santa Lucia Growers Ranch 14 Block C raw lot. Several systems then fail at once:
- The MES-to-WMS interface queues hold messages, so Dallas still shows held lots as pickable.
- When the interface restarts, it replays an old release file and un-holds a lot.
- A manual re-label at the plant dock creates a lot code that does not exist (PF1-27279-L2-8), and that pallet is never put on hold.
- Rivermark Kits' paper receiving records leave 104 cases unmatched.

The result is three numbers in circulation: 38,600 (MES), 38,540 (WMS) and "about 40,000" (draft press release). Meanwhile CDPH, FDA, Cornerstone Grocers, Harvest Table Markets, a reporter and social media all push to go first.

The phases:
- **Phase 1, The Presumptive (0:00–1:00, 06:00–07:00):** signal, scope and hold notices.
- **Phase 2, Counts Don't Agree (1:00–2:00, 07:00–08:00):** one reconciliation table and confirmed physical holds.
- **Phase 3, Recall Before Confirmation (2:00–3:00, 08:00–09:00):** the President's decision on class, depth, lots, quantity and public warning (I-13), then holding the notification order.
- **Phase 4, Notify and Verify (3:00–4:00, 09:00–10:00):** customer notices, the interface replay fault, the misinformation post and General Counsel's end-game questions.

Evaluators should watch for these behaviors:
- Do players treat the presumptive as a signal and get hold notices to Plant 1 and the three DCs within 30 minutes (PFC-FS-04 2)?
- Do they widen scope when the lot boundaries are uncertain?
- Do they insist on **physical** hold confirmation rather than trusting a WMS status?
- Do they refuse to release any number that is not taken from the reconciliation table and checked against the MES (PLCTR 8)?
- Do they resist the red herring of killing the interface (I-07)?
- Do they keep the order: Plant and DCs, then customers, then the press release? Do they recognize that a CDPH announcement first triggers the one-hour rule?
- Do they keep the contact log (PFC-FS-04 6)?
- Do they give notice to Trellis Mutual within 24 hours (PPDNCC 8)?

**Objectives:**
- **Decision Making:** Demonstrate the ability to build and present a recall recommendation to the President (proposed class, depth, the five PF1 lot codes, quantity and whether a public warning is needed) on a presumptive E. coli O157:H7 result, before lab confirmation, as PPHTRP 4 requires.
- **Technical Analysis:** Demonstrate the ability to bring the MES (38,600 cases), the WMS export (38,540) and Rivermark Kits' paper receiving records into one reconciliation table, as PLCTR 8 requires, within the 4-hour internal trace target, and to deliver the FDA sortable spreadsheet within its 24-hour clock.
- **Communication:** Demonstrate the ability to keep the PFC-FS-04 2 notification order (plant and DCs, then FDA and CDPH, then customers, then the press release) while CDPH asks for the distribution list, a blogger posts early and a Central Coast Courier reporter calls before the release has retailer agreement.
- **Operational Coordination:** Demonstrate the ability to confirm physical holds at the Stockton, Phoenix and Dallas DCs within 4 hours, decide what to do with the Sonoran Cold Freight trailer near Tucson and the 2,100 cases already sent to Cornerstone stores, and allocate the roughly 60 percent replacement romaine supply among customers.

**Plan sections exercised:**
- PPHTRP › 4. Decisions and who makes them
- PFC-FS-04: Recall Notification,… › 2. Order and timing
- PLCTR › 4. Systems
- PLCTR › 5. What the trace produces
- PLCTR › 8. Reports of lot data
- PFC-FS-04: Recall Notification,… › 6. Regulators and public health
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Layout:** a U-shape representing the Recall Team bridge and command room. The open end faces the projector screen. Put a "Recall Coordinator" place card at the head of the U.
- **Team A, Food Safety and Quality (RECALL):** at the head of the U, beside the whiteboard. This seat owns the contact log and the decision brief for the President.
- **Team D, Traceability and Systems (TRACE):** left arm of the U, nearest Team A. This is the "systems desk." Give it the laptop or printouts showing the MES, the WMS export and the reconciliation table (REV B/REV C).
- **Team C, Logistics (LOG):** left arm, below TRACE. This is the transportation and warehouse desk. Put a DC status board for Stockton, Phoenix and Dallas and a printed I-10 lane map with the Sonoran Cold Freight trailer marked.
- **Team B, Supply Chain (VPSC):** right arm, opposite LOG, so allocation arguments happen across the room. Give it the spot-grower availability sheet.
- **Team E, Customer Service (CS):** right arm, below VPSC. Give it a customer call sheet for Harvest Table, Cornerstone, Westline and Rivermark, plus an acknowledgment tracker.
- **Team F, Communications (COMMS):** a separate rear table, about 4–5 m behind the U and facing away from the screen.
 - Why: in a real recall, communications is not on the trace data feed. It must ask the Recall Coordinator for confirmed facts before anything posts.
 - Isolating the table forces COMMS to walk over and get numbers. This exposes whether they publish "about 40,000" from the shared folder or wait for the reconciled figure.
- **SimCell / Controller table:** at the side, with a clear line of sight to every table. It holds the inject deck, the phone or radio, and a clock showing exercise time (PT).
- **Evaluators:** standing or seated on the outside of the U, one per two teams. COMMS gets its own evaluator.

**Equipment needs**
- Projector and screen for main-screen injects: time-jump cards, the WMS screenshot, the DC hold status board, the interface log and the social posts.
- Whiteboard set up as an ICS-201: situation summary, current objectives, organization (Teams A–F), resources, and a column for the **one** reconciled case count and lot list.
- Printed inject deck in MSEL order (STARTEX to ENDEX), with copies of each inject card ready to hand to the receiving team.
- Optional: two simulated radios (Stockton dock, Dallas DC) and a desk phone or mobile for SimCell calls on the bridge line (831) 555-0131, code 2200.
- Wall clock set to exercise time, and a large "EXERCISE TIME" placard for time jumps.

**Materials for players:** role cards; extracts of PFC-FS-04, PPHTRP, PLCTR and PPDNCC; a blank contact log; a blank reconciliation table; the recall letter template; the holding statement template; the customer acknowledgment tracker; pens and sticky notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**Your SimCell role**

You play everyone else in the world. If a student says "I call the sheriff," you answer as the deputy. In this exercise, that means you answer for anyone the players contact outside the room, including:
- Dwayne Pruitt, Plant 1 Manager
- the DC managers: Terrence Boyd in Dallas, Angela Whitfield in Phoenix, and Stockton
- Delia at Rivermark Kits
- Coastal Analytical Labs
- the Sonoran Cold Freight dispatcher
- CDPH Food and Drug Branch and FDA
- the Cornerstone and Harvest Table buyers and Westline
- the Central Coast Courier and KMBY Channel 8
- Trellis Mutual
- President Nathan Kowalczyk and General Counsel Renata Voss

When players say "I call X," pick up the phone in X's voice. Answer only what X would know. Want what X wants.

**Do not make it easy**

Outside parties do not do the players' work for them. They answer the question that was asked, and only that question.

Example from this scenario: after I-04, TRACE says, "The hold is in MES, so we're fine." As Terrence Boyd, you answer: "Not on my screen. It says AVAILABLE / PICKABLE, and my pickers are pulling. You want me to stop them? Tell me which lots, and do you want red tags and a physical count or not?"
- Dallas stays "held in system / not physically confirmed" until LOG explicitly orders a physical segregation and count.
- Do not reveal the 60-case Phoenix pallet (P-0417) before I-12. If players ask Phoenix to search by quantity and receipt date instead of by lot code, have the clerk find it earlier. Note that on the evaluator sheet.

**Managing time**

Hold a phase until it ends. Then read the time-jump card exactly:

> "PAUSE EXERCISE. Everyone stop talking and look up. We are jumping forward 30 minutes. It is now [time] Pacific Time, Tuesday, October 12, 2027. [Read the card's situation update.] Anything you were working on is where it would realistically be. If you assigned it, assume it is half done. If you didn't, it hasn't started. RESUME."

- For the scheduled jumps (I-06, I-11, I-16), say "one hour" and read the card.
- If a team stalls for more than 5 minutes, use a short 15-minute jump to move them on.
- At I-16, read back the recall decision time the players logged. If they logged none, use 08:30.

**Handling artificialities**

When a student says, "I wouldn't use that system," or "We'd never hand-key a lot code," answer:

> "Noted. Write it down for the hot wash. For today, this is the system you have and this is what it shows. What do you do now?"

Do not argue the realism. Do not change the inject.

**Delivering injects**

Do not explain. Say "This just came in," or "This is on the main screen." Hand the card to the named team, or read it in character.
- Never hint at the right answer, and never flag a red herring. I-07 (killing the interface) and the I-02b reefer alarm are delivered exactly like core injects.
- If players ask, "Is this important?", answer in character, or say, "You tell me."

**"This is an exercise"**

Every written product is marked EXERCISE PRODUCT. If players send anything outside the room, or anyone could mistake an exercise item for real, begin and end the message with "This is an exercise."

**"REAL WORLD, REAL WORLD"**

If a real emergency or real business issue interrupts play (a real recall, a real injury, a real call that someone must take), anyone says "REAL WORLD, REAL WORLD." All play stops at once. Deal with the real issue. Resume only when the controller announces "RESUME EXERCISE," with the exercise time.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **MES-to-WMS interface vendor support desk and the dependent DCs: Terrence Boyd at Dallas and Angela Whitfield's inventory clerk at Phoenix** — _Trigger: TRACE or LOG calls the interface vendor about the stuck queue (I-04), the security ticket PFC-IT-48213 (I-07) or the replay that un-held PF1-27279-L2-A (I-18), or asks the DCs to confirm holds._
  - Ask: "Vendor: "What's your ticket number and contract ID? I can't touch production without a signed change request from your system owner. Who signed change ticket PFC-IT-48230?""
  - Ask: "Vendor: "You want the interface killed? If I take it down, your hold messages stop too, and your DCs go back to paper. Who owns manual holds at three sites while it's down?""
  - Ask: "Vendor: "That replay file is from October 11 at 22:15. The interface did exactly what it was configured to do. Who set it to replay pending releases on restart? That's your configuration, not our defect.""
  - Ask: "Terrence Boyd: "Screen says AVAILABLE, tag says HOLD. You tell me which one wins, in writing, or my pickers go by the screen.""
  - Concede only when: Vendor will suspend replay of release messages and run the restart in manual-review mode, once it has a signed change request and a named Pinecrest approver.
  - Concede only when: Vendor will export the full interface message log for 10/11 to 10/12 so TRACE can preserve it for the reconciliation and the hot wash, if asked for it explicitly.
  - Concede only when: The DCs will treat red tags and physical segregation as the controlling hold, and pull D-2291 and P-0417 into quarantine, once LOG issues a written instruction that the physical tag overrides the WMS status.
- **CDPH Food and Drug Branch investigator** — _Trigger: The investigator's call at I-09, or RECALL or TRACE calling CDPH to give the PFC-FS-04 2 notification or to send the distribution list._
  - Ask: ""You had a presumptive at 05:50 and I'm hearing about it from you at what time? Why didn't you call us when you called FDA?""
  - Ask: ""I need ship-to level for California and Nevada: every store, every DC. A total doesn't help me match patients. When can I have it?""
  - Ask: ""Did any of this go to hospitals, schools or other institutions? Two of my cases could be in care settings.""
  - Ask: ""We may issue our own public statement this afternoon. If we go first, are your customers already notified?""
  - Concede only when: Will accept a partial distribution list now, marked as preliminary, with the gaps (60 cases, 104 Rivermark cases) labeled, if a named contact commits to a time for the update.
  - Concede only when: Will share the time of the state's public statement with the Recall Coordinator in advance, once the firm confirms its customer notification is under way.
  - Concede only when: Will coordinate with FDA rather than sending separate requests, once the firm names one point of contact and keeps a contact log.
- **FDA, District Recall Coordinator (Pacific region), with the Office of Inspections and Investigations records request** — _Trigger: RECALL calls FDA to report the signal or the recall decision, or TRACE replies to the I-09b records request._
  - Ask: ""You're calling this a Class I recall? The classification is our decision after our health hazard evaluation. What's your proposed strategy: depth, effectiveness check level, and how you'll reach the consignees?""
  - Ask: ""Your records request clock started when you received it. Will it be an electronic, sortable spreadsheet with lot code, quantity and unit, ship date, ship-from, ship-to and reference document? Who is your point of contact?""
  - Ask: ""Your total today was 38,600, the state heard something different, and a draft says 40,000. Which number is in your submission, and where does it come from?""
  - Ask: ""Are the co-packer's Caesar kits in scope? Who notifies their retail accounts, and when do I get that list?""
  - Concede only when: Will accept the firm's proposed strategy and a notice that says the class is not yet assigned, once given product description, lot codes, quantities, distribution list and a draft recall letter.
  - Concede only when: Will agree a reasonable extension for the 104 unmatched Rivermark cases only if the rest of the spreadsheet arrives on time and the gap is documented.
  - Concede only when: Will set the status report frequency on the call, if the Recall Coordinator asks for it.
- **Eddie Navarro, buyer, Cornerstone Grocers (140 Texas stores)** — _Trigger: The buyer's calls at I-03 and I-14, CS's notification call, or VPSC calling about replacement volume._
  - Ask: ""Is your romaine safe or not? Yes or no. My stores open in an hour.""
  - Ask: ""How many cases went to which of my 38 stores, by store? My people can't pull 'about 2,100.'""
  - Ask: ""Do I get credit at invoice or at retail for what I pull? And who pays for the labor, my people or your DC?""
  - Ask: ""I need 100 percent replacement by Thursday. Are you giving Harvest Table more than me?""
  - Concede only when: Will hold Pinecrest romaine from sale in all 140 stores at once, before a letter arrives, if CS gives the exact lot codes and a time when the written notice will come.
  - Concede only when: Will accept a written allocation below 100 percent (about 60 percent within 48 hours) and delay the move to the Yuma competitor, if VPSC puts in writing a documented, fair allocation rule and a date for full volume.
  - Concede only when: Will accept the written recall notice to the Cornerstone VP Food Safety as meeting the contract, once it arrives with store-level quantities from the reconciliation table.
- **Dana Ruiz, food and agriculture reporter, Central Coast Courier** — _Trigger: The I-15 phone slip, or COMMS or anyone returning the reporter's call._
  - Ask: ""I'm filing at 13:00. Is Pinecrest recalling romaine, yes or no? On the record.""
  - Ask: ""How many cases? I've been told about 40,000. Can you confirm that?""
  - Ask: ""Is the grower the Santa Lucia Growers ranch? Are the Reno illnesses tied to your product?""
  - Ask: ""CDPH says it may go public this afternoon. Why should readers hear it from the state before you?""
  - Concede only when: Will run a holding statement attributed to the company and note 'Pinecrest said it would update later today,' if COMMS gives one on the record before the deadline with a time for the next update.
  - Concede only when: Will hold the case count and the grower name if COMMS says on the record that the confirmed figure comes with the release, and calls back before 13:00.
  - Concede only when: Will correct 'about 40,000' to the confirmed figure in an update once COMMS provides the released number.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Containment & Physical Hold Coordination (30 Points)** | ☐ **Fail:** LOG accepts the Dallas WMS 'HELD' status as confirmed, leaves the Sonoran trailer rolling past the 08:45 dispatcher deadline in I-13b, or lets pallet P-0417 (I-12) or pallet D-2291 (I-18) stay in a pick wave or out of the cooler. VPSC promises Cornerstone 100 percent replacement in I-14 or gives no allocation rule. ☐ **Pass:** LOG orders a manual floor hold at Dallas after I-04, holds or reroutes the Tucson trailer to quarantine at 34–38°F and confirms it in writing in I-13b, and pulls P-0417 and D-2291 back into tagged cold quarantine when I-12 and I-18 reveal them. VPSC freezes outbound picks of the five lots and gives a written allocation rule for the roughly 60 percent replacement supply, filled only from lots Trace has cleared. ☐ **Excellence:** LOG orders physical find-tag-count at all three DCs and a hold on in-transit loads before I-04 shows the WMS gap, and moves Dallas labour onto the count before I-08 forces the choice. VPSC sets a priority-then-pro-rata allocation rule (hospitals and schools first) before Cornerstone's I-14 ultimatum, and LOG keeps a running confirmed-versus-system-only hold board through ENDEX. | I-04, I-08, I-12, I-13b, I-18 |
| **Metric 2: Traceability Reconciliation & Data Integrity (30 Points)** | ☐ **Fail:** TRACE drops the 60 missing cases or the 104 Rivermark cases from the table, accepts REV C's 38,556 in I-20, or takes the MES-to-WMS interface offline on the I-07 'compromise' ticket, which would stop holds reaching the DC pick faces. RECALL lets 38,540 or 'about 40,000' reach the President, CDPH or FDA. ☐ **Pass:** TRACE builds the sortable sheet with the MES 38,600 as the control figure and a Gaps tab after I-06, treats I-07 as a data-quality issue and keeps the interface up, and corrects the P-0417 lot code to PF1-27279-L2-B after I-12. In I-20, TRACE restores the table to 38,600 (Phoenix 3,820+5,820+60, Rivermark 2,496 plus 104 gap cases, Dallas marked system-only). TRACE confirms receipt of the I-09b FDA request with a named point of contact, and the FDA and CDPH sheets carry the same numbers. ☐ **Excellence:** TRACE opens the Gaps tab and asks the DCs for scan-exception and manual re-label reports before I-12 turns up P-0417, and asks IT to block replay files before I-18 shows the release. TRACE locks table revisions so the I-20 'cleanup' deletion cannot happen, and has a reviewed FDA spreadsheet ready well inside the 24-hour clock. | I-06, I-07, I-09b, I-12, I-20 |
| **Metric 3: Notification Order & Public Communication (20 Points)** | ☐ **Fail:** CS or COMMS confirms a recall, a grower, an illness count or a case figure to the Cornerstone buyer (I-03), Harvest Table (I-10b) or the Courier reporter (I-15), or posts the release before customers are notified and retailers agree. CS approves the Westline food bank donation in I-17 or fills letter quantities from REV B. ☐ **Pass:** COMMS gives holding statements that do not name the grower or give a count, pulls the 'about 40,000' draft and stops the leak after I-10b, and in I-19 identifies lot PF1-27284-L3-A as outside the five-lot scope. CS keeps the order of plant and DCs, then customers, then the press release, and sends URGENT letters with per-customer quantities from the signed-off table, a do-not-donate instruction, downstream-notice duties for Westline and Rivermark, and reply forms, all within 4 hours of the decision. ☐ **Excellence:** COMMS locks the shared draft folder and pre-clears holding lines with RECALL before I-10b exposes the leak, and RECALL asks CDPH about the timing of any announcement before the reporter raises it in I-15. CS sends Cornerstone written notice for the contract before I-20 points out the gap, and books callbacks to non-responders before ENDEX. | I-03, I-10b, I-15, I-17, I-19 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** RECALL waits for lab confirmation before holding product, misses the 06:20 hold-notice target after I-01, or gives the President a recommendation in I-13 with no class, depth, lot codes or reconciled quantity. Players cite no plan sections, and the Reportable Food Registry question in I-20 goes unanswered. ☐ **Pass:** RECALL logs 05:50 as the signal time under PPHTRP 3, sets the five-lot scope under PPHTRP 5 at I-02, and in I-13 recommends a proposed Class I, consumer-level recall with a public warning for 38,600 cases, noting that FDA assigns the class (PPHTRP 4.3). RECALL logs the decision time to start the PFC-FS-04 2 customer clock, and logs each CDPH and FDA contact as PFC-FS-04 6 requires. ☐ **Excellence:** Players name PPHTRP 4, PPHTRP 5, PFC-FS-04 2, PFC-FS-04 6, PLCTR 4, PLCTR 5 and PLCTR 8 by number as they make each decision. After the I-09 illness report, RECALL notes that the regulatory timeline is now shorter and plans the Reportable Food Registry entry and the FDA status-report date before General Counsel asks in I-20. | I-01, I-02, I-09, I-13, I-20 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask the room for three things that went well and three things that broke or failed during the exercise. Go around the room one team at a time (Recall Team, QA/traceability, logistics/DCs, customer service, communications) and write each answer on the whiteboard in two columns so the room can see patterns before the discussion questions start.

**Key Discussion Questions for Presumptive:**
- **Which Number Is Real:** At I-13 the President said, "Somebody tell me which number is real," after seeing 38,600 cases in the MES, 38,540 in the WMS export, and "about 40,000" in conversation. When did you stop trusting the MES-to-WMS interface? Who explained the 60-case gap to the decision-makers, and in what words? Did operations understand what the technical team was saying, and did the technical team understand what operations needed in order to act? What would have let you put one reconciled number in front of the President within the 4-hour trace target? _(Objective: Technical Analysis)_
- **The Paper Gap:** At I-05 and again in the I-10 fax, Delia at Rivermark Kits gave you handwritten clipboard entries like 'PF1-278-L2' with no shift letter, a crossed-out '27277?', and 104 unmatched cases. She also told you 3,850 Caesar kits had already shipped to national retail accounts. Did you treat those clipboard photocopies as evidence that needed to go into your reconciliation table, or as a ticket to close once the office manager sent a clean match? When she asked whether to hold everything with romaine or only the lots she could match, and whether you wanted her downstream customer list now or later, what did you answer and why? When did Rivermark become a partner on your trace instead of just a recipient of your hold notice? _(Objective: Technical Analysis)_
- **The Call:** At I-13, with a presumptive positive, three CDPH illnesses, and no confirmation for at least 24 hours, the President asked for your recommendation: class, depth, the five PF1 lot codes, quantity, and whether to issue a public warning. What did you actually recommend, and how confident were you in the lot codes and case count you gave? What were you waiting for that you didn't really need? Looking back, what information or pre-agreed decision rule would have let you make that call faster and with less argument? _(Objective: Decision Making)_
- **Who Hears First:** By I-19, a post showing a spinach bag labeled PF1-27284-L3-A had 1,100 shares. Channel 8 wanted confirmation before its noon show, CDPH wanted the distribution list, and Harvest Table would not agree to a press release unless it saw the text by 10:30 and the release said spinach was not included. What did you say publicly, or to reporters, before your facts were confirmed? Did you keep the order in PFC-FS-04 Section 2 (plant and DCs, then FDA and CDPH, then customers, then the press release), or did outside pressure decide who heard first? Did the lot codes and counts stay the same across every message you sent? _(Objective: Communication)_
- **Scarce Supply:** At I-14, Cornerstone demanded 100 percent replacement volume by Thursday and written confirmation by 10:00. You also had the Westline standing order for 6 hospitals and 4 school districts, only about 60 percent of normal volume available, and open questions about the Sonoran Cold Freight trailer near Tucson and the 2,100 cases already at Cornerstone stores. How did you decide who got the replacement romaine? Did the loudest customer set your priorities, or did public health? When did you get physical confirmation that product was on hold at the Stockton, Phoenix and Dallas DCs, as opposed to an email saying the hold was in place? _(Objective: Operational Coordination)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Supply chain and logistics**: Supply, shipment and recall expertise for exercises: the terms and records buyers, planners, logistics managers and recall teams use, the decisions they make (allocate, switch source, reroute, hold, recall, notify) and the clocks they are measured on. Works for any organization that depends on goods: a hospital's materials office, a utility's spare parts, a retailer, a school's food service, a manufacturer. Stays at coordination level: lots, quantities, dates, ship-to lists, notices. Every company, carrier and customer is fictional.
  - Data sources: openfda-food-enforcement, bts-freight-indicators, bts-faf-state-flows
  - Reference documents: Requirements for Additional Traceability Records for Certain Foods, final rule (FDA, 2022); 21 CFR part 7: Enforcement Policy, including recalls (2025 edition); Community Lifelines Implementation Toolkit, Version 2.1
- **Media environment**: The news cycle and social feeds around an incident: wire alerts, articles and broadcast segments, social posts whose reach and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. Simulated spread and sentiment are teaching models, not predictions. All outlets, handles and people are fictional.
  - Data sources: gdelt
  - Reference documents: FCC report on the Hawaii false alert (2018): a correction case study
<!-- /section:toolkits -->
