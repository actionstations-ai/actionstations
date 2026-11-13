# Controller / Evaluator (C/E) Handbook
## Aurora Over Texas — GIC, Conservative Operations & Timing Holdover

Exercise Date: [Date] · Location: Northern Lakes Transmission Operations primary control room, Duluth, Minnesota (backup control room at Virginia) · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) for Northern Lakes Transmission Operations (NLTO) in Duluth. It lasts four hours of exercise time, starting at 02:00 CDT on Tuesday, 16 March 2027. Six teams play: the Control Room Shift Supervisor, the Reliability Engineer, the Transmission Operations Manager, the Communications Manager, the UMRC Shift Manager and the Substation and Timing Engineer. No equipment is operated and no real systems are touched. Players talk through what they would decide, who they would call and what they would log, using the NLTO GMD operating procedure (NGDOP), the UMRC SOP (UGFNWC) and the NLTO Communications Plan.

The injects simulate a natural hazard, a severe geomagnetic storm. An X2.1 flare launches a fast halo CME. SWPC issues a G3 watch, then a CME arrival window of 11:00 to 17:00 CDT. The sudden impulse arrives at 13:24 CDT. Kp reaches 7 at 14:06, 8 at 15:10 and 9 (G5) at 17:47. Geomagnetically induced currents load the 345/230 kV autotransformers, reactive power swings across the Arrowhead and North Shore interfaces, and GNSS timing at three substations goes into holdover. All SWPC products are marked EXERCISE, carry UTC times and replay the Kp record of a real severe storm, shifted to these dates. The exercise gives no engineering advice on protection settings.

The phases use time jumps:
- **Phase 1, The Overnight Watch (0:00–1:00):** players apply Conditions 1 and 2 on the forecast and defer the six 345 kV outages, including the Hartley AT-1 replacement.
- **Phase 2, Shock Arrival (1:00–2:00):** players move through Conditions 2 to 4 and agree the transfer cuts on the UMRC bridge.
- **Phase 3, Iron Range T2 Decision (2:00–3:00):** players work through a line trip, a relay misoperation and lost GPS lock, and the Manager decides whether to take Iron Range T2 out of service.
- **Phase 4, Termination and Restoration (3:00–4:00):** players end the procedure on evidence, plan restoration and the spare-transformer move, and close notifications.

Evaluators should watch for:
- actions taken ahead of the Kp they trigger on, with the basis and time logged
- the 60-minute notification clock for the 14 entities, started and closed at every condition change
- no restoring switching without the reliability coordinator's agreement
- one consistent set of numbers (G level, duration, outages) from NLTO, the UMRC, SWPC products and Minnesota HSEM
- the Iron Range T2 decision made, recorded and communicated with new interface schedules before switching

**Objectives:**
- **Use of Doctrine:** Demonstrate the ability to apply NGDOP Conditions 1 through 4 ahead of the Kp they trigger on when SWPC lead time allows, including deferring the six planned 345 kV outages and the Hartley transformer replacement, bringing the Cloquet SVC and the Iron Range and Hartley capacitor banks on line, and logging the basis and time of each condition change and of the termination.
- **Decision Making:** Demonstrate the ability to decide whether to remove the Iron Range T2 autotransformer from service at 168 A neutral current with a gas alarm and a 108 C hot-spot reading, weighing the loss of the only spare stored at Hartley against system security and agreeing the related transfer cuts on the Arrowhead and North Shore interfaces with the UMRC.
- **Technical Analysis:** Demonstrate the ability to keep an accurate operating picture after the 16:20 line trip, the Hartley relay misoperation and the loss of lock at three substation GPS clocks, by identifying suspect PMU data, switching to the backup network time source and declaring holdover within the 24-hour holdover limit.
- **Communication:** Demonstrate the ability to notify all 14 NGDOP entities within 60 minutes of each condition change and to issue public statements under the NLTO Communications Plan that match the UMRC and SWPC on G level and duration, while answering the Mesabi Taconite Works furnace question and correcting posts that claim a nationwide blackout or a grid attack.

**Plan sections exercised:**
- NGDOP › 4. Conditions and actions
- NGDOP › 7. Time source
- NGDOP › 6. Entities told
- UGFNWC › 4. RC notification levels
- NLTO Communications Plan: Space… › 3. What NLTO says at each condition
- UGFNWC › 8. Ending and learning
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Main U-shape (the NLTO Duluth control room):** open end faces the projector screen, which plays the EMS/SCADA wall.
 - **Head of the U:** Team A, Control Room Shift Supervisor. They hold the supervisor's log and the NGDOP binder with the 14-entity tally sheet.
 - **Left arm:** Team B, Reliability Engineer, beside Team C, Transmission Operations Manager. Put the Manager nearest the door, as if called in.
 - **Right arm:** Team F, Substation and Timing Engineer. Put them closest to the screen because the timing and PMU screenshots are projected.
- **Side island, about 3 m from the U (the UMRC in central Iowa):** Team E, UMRC Shift Manager. They talk to the control room only over the "conference bridge": a table speakerphone, or by speaking out loud while facing away. This keeps the reliability coordinator outside the room, as it really is.
- **Rear table, behind the U and facing the wall (the NLTO communications office):** Team D, Communications Manager. They get no view of the screen and no copy of the inject deck. They must walk to the U to ask for the current condition, neutral-current numbers and G level. **Why:** the main risk in this scenario is NLTO, the UMRC, SWPC and the state putting out different numbers. Making the communications role physically fetch facts shows whether the control room briefs them, and whether they publish without checking.
- **SimCell table, front corner beside the screen:** controller and SimCell staff, with the inject deck, the phone and radio props and a clock showing both CDT and UTC.
- **Evaluator positions:** chairs outside the U, one behind Teams A and C, one between the island and the rear table.

**Equipment needs**
- Projector and screen for main-screen injects: EMS alarm lists, GIC trend, wide-area/PMU screen, SWPC product text.
- Whiteboard for the ICS-201-style situation summary. Include columns for current NGDOP condition, UMRC level, Kp/G level, interface flows against limits, neutral-current peaks, clocks in holdover, and notification clock with entities ticked out of 14.
- Printed inject deck in MSEL order, with STARTEX, TIME JUMP and ENDEX cards for reading aloud.
- Optional: two handsets or walkie-talkies, one labelled "Satellite phone" and one labelled "Duluth Harbor Terminal hotline", plus a speakerphone for the UMRC bridge.
- A wall clock or slide that shows both CDT and UTC.

**Materials for players:** NGDOP Section 4 condition table, UGFNWC Sections 4 and 6 extracts, NLTO Communications Plan Section 4, contact list (NLTO document Section 7), blank supervisor log sheets, the 14-entity notification tally sheet, name tents by team.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**The SimCell role**
You play everyone else in the world. If a student says "I call the sheriff", you answer as the deputy. Here that means:
- If they say "I call SWPC", you are the Boulder forecaster.
- If they say "I call Mesabi", you are Peter Lindgren.
- If they say "I call the transformer maker", you are the field engineer.

Answer only what that person would know, in their voice and in their own interest. Never step out of character to coach. If a player calls a party that has no script, improvise in that party's interest and note the call for the evaluators.

**Do not make it easy**
Real outside parties are busy, partly informed and want something. Make players earn every answer.

Example from this scenario: at I-10 (16:20 CDT), the Hartley crew foreman offers to close CB 3H12 "in ten minutes, we're just standing around". Play him as helpful and keen, and press: "Give me the word, Control." Do not hint that NGDOP 4 Condition 3 cancels switching to restore a tripped line unless the reliability coordinator agrees. Do not hint at the unexplained 21 Z1 target on 3H22. If they say yes without a UMRC agreement, let it stand and let the evaluators record it.

In the same way, Mesabi wants a guarantee of power through 17:00. A reporter wants a number of customers out. Neither accepts "we're monitoring".

**Managing Time**
The narrative moves from 02:00 CDT Tuesday to 06:00 CDT Wednesday in four hours. Use the TIME JUMP cards (I-04, I-08, I-13) and the facilitator notes in I-02, I-03 and I-15. When a discussion has run its course, or the room is stuck, read:

> "PAUSE EXERCISE. We are jumping forward 30 minutes. It is now [time] CDT, [time] UTC. Here is what has changed: [Kp, neutral currents, interface flows, notification tally]. Anything you said you would do has been done unless you tell me otherwise. RESUME."

After a jump, update the whiteboard before you resume. If a team has an open notification clock, tell them how many minutes are left; do not tell them who is missing.

**Handling artificialities**
When a student says "I wouldn't use that system" or "We don't really do it that way", say:

> "Understood. Tell me what you would use and I'll note it for the hot wash. For today, assume this is the tool and the information you have. What do you do next?"

Write the point down and move on. Do not argue the realism.

**Delivering injects**
Do not explain. Say "This just came in." or "This is on the main screen."
- Hand printed items to the named recipients only.
- Read phone calls aloud in character.
- Put alarms and SWPC products on the projector.
- Do not interpret a product. A WARSUD is not "the storm is here", and a WARK08 is not "Kp 8 right now". Let players read the message code, serial number and UTC times themselves.
- The Communications Manager at the rear table gets media and social items in hand. They get the screen content only if they walk over or someone briefs them.

**"This is an exercise" and "REAL WORLD, REAL WORLD"**
Every SWPC product, card and outbound message in play is marked EXERCISE. If a player drafts something that could leave the room (an email, a post, a call to a real number), it must begin "THIS IS AN EXERCISE".
Anyone who has a real emergency or real operational message says "REAL WORLD, REAL WORLD" and play stops at once. Examples: a genuine SWPC alert, a real control-room call to an on-call participant, a medical issue. Resume only when the controller announces "Exercise resumes" and restates the scenario time.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **NOAA Space Weather Prediction Center (SWPC) forecaster on duty, Boulder, Colorado (the weather / hazard authority)** — _Trigger: A player calls or emails SWPC to ask when the CME will arrive, how bad it will get, or when the storm will end (most likely after I-01, I-03, I-07 or I-15)._
  - Ask: ""Our discussion gives 1600 to 2200 UTC for arrival, uncertain by several hours. I can't narrow that for you. What decision are you trying to make, and what's your procedure's trigger?""
  - Ask: ""You're asking me if it's G3 or G4 right now. Which product are you reading? Give me the message code and serial number. I won't confirm a level off a news screenshot.""
  - Ask: ""We forecast the space weather. Whether your transformers or relays can take it is your engineering call. I can't advise on that.""
  - Ask: ""'When does it end' isn't something I can promise. WARK08 is valid to 0300 UTC, and storms run hours to a day. Are you quoting our valid times or making up an end time for the public?""
  - Concede only when: Once the player quotes a specific product by code and serial, the forecaster restates its valid times in UTC and the scale level it carries.
  - Concede only when: If the player says the decision depends on lead time, the forecaster explains that a K-index 7 warning may come only 30 to 90 minutes before the Kp is observed and that a sudden impulse means the main storm may follow within minutes to hours. This supports acting on the watch.
  - Concede only when: In Phase 4, if the player asks about end conditions rather than an all-clear, the forecaster confirms that no geomagnetic warning is active after WARK05 expires. The forecaster says there is no second CME in the current discussion and that products will be issued if that changes.
- **Minnesota Department of Public Safety, Homeland Security and Emergency Management (HSEM) duty officer (651-555-0140. The same character also passes on questions from St. Louis County / City of Duluth emergency management, the county and city emergency management agency.** — _Trigger: NLTO notifies HSEM at Condition 4 (NGDOP 4 asks for a call with the state duty officer), or a player calls back about the HSEM draft public messages in I-07, I-12b or I-16b._
  - Ask: ""My 18:30 update says 'Severe (G4), expected to end by 22:00.' The county wants to know if they should open warming centers tonight. Are any Minnesotans without power, yes or no, and how many?""
  - Ask: ""The UMRC told me Emergency at 15:14. Your notice says Condition 4. My governor's office doesn't know what either means. Give me one sentence a county EM can read out.""
  - Ask: ""Social media is saying Hartley was a cyberattack. Are you telling me it wasn't? On what basis? If you won't put that in writing, I can't either.""
  - Ask: ""I need your wording by 05:45 or my 06:00 update goes out as drafted. Who signed off on what you're giving me?""
  - Concede only when: If NLTO sends written wording that matches the UMRC level and the current SWPC product (G level, duration stated as 'several hours to a day', outage count), HSEM uses NLTO's wording and drops its own end time.
  - Concede only when: If NLTO gives a named contact and a next-update time, HSEM agrees to hold county inquiries and route them through that contact.
  - Concede only when: If NLTO confirms in writing that there are no customer outages, HSEM's 06:00 update says 'storm ended; no customer outages reported in the NLTO footprint'. It names NLTO as the source and makes no claim about the cause of the Hartley trip.
- **Mesabi Taconite Works duty manager Peter Lindgren (218-555-0127 (directly connected industrial customer)** — _Trigger: I-02b (morning call) or I-10b (17:30 call), or any time NLTO calls Mesabi with a condition notice under the Communications Plan Section 4._
  - Ask: ""Yes or no: will you guarantee me power through 17:00? I've got 180 MW of pellet lines and an indurating furnace that takes eight hours to bring back cold.""
  - Ask: ""You said you'd keep me posted. My voltage blinked at 16:20 and I heard it from my electrician, not you. Why?""
  - Ask: ""If I take 90 MW off and you black me out anyway, I've lost a day of pellets. What exactly are you asking me to do, and who's paying for it?""
  - Ask: ""Is it getting worse or better? Give me a number I can tell my plant manager in fifteen minutes.""
  - Concede only when: If NLTO states the current condition and what NLTO has done, and asks Mesabi to keep power factor correction in service and report any load change (the Communications Plan Section 4 notice), Mesabi agrees and gives a direct callback number for the shift lead.
  - Concede only when: If NLTO gives a firm time for its next call and keeps to it, Mesabi holds off on a furnace decision until that call.
  - Concede only when: Mesabi does not accept a guarantee or an instruction to shut the furnace. If NLTO declines to give either and explains the risk honestly, Mesabi makes its own business call and says so on the record.
- **Transformer manufacturer field service engineer for the Iron Range T2 single-phase large-core bank (SimCell, on speakerphone)** — _Trigger: I-12 at 17:47, or any time the Reliability Engineer or Manager calls the manufacturer about T2's neutral current, gas alarm or hot-spot temperature, or about moving the Hartley spare._
  - Ask: ""Before I say anything: what's the serial number, what's your service agreement or ticket number, and who's authorizing this call on your side?""
  - Ask: ""Hydrogen rising at 108 C under DC bias is the pattern we see before winding damage. Do you have a trend of the DGA and the hot spot, with times, or just the alarm? Has anyone drawn an oil sample?""
  - Ask: ""I can't tell you it's damaged without an oil sample, and I won't tell you to keep it in or take it out. The call is yours. Who's making it?""
  - Ask: ""If it fails, a new unit is 14 to 18 months out. Your spare's at Hartley. Do you have a heavy-haul permit and a crane, or is that a week away?""
  - Concede only when: If NLTO gives a ticket number and a named authorizing manager, the engineer opens a priority case and agrees to review the DGA and temperature trend once it is sent in writing.
  - Concede only when: If NLTO draws an oil sample and logs the time, the engineer commits to interpreting the lab result in the morning and advising on returning the unit to service.
  - Concede only when: With a signed service request, the engineer will confirm the spare's nameplate compatibility and send rigging and transport notes for the Hartley spare.
- **Northland 6 News assignment desk / producer (555-0147). Also used for the Gulf Coast Herald reporter calling from Texas.** — _Trigger: I-03b, I-07 or I-16b, or the Communications Manager calls back a media slip._
  - Ask: ""We go live at 11:58. Are the lights going out in Duluth today, yes or no?""
  - Ask: ""People in San Antonio are filming aurora and saying Minnesota's grid is down. How many of your customers are out right now? I file at 16:00. I'll say NLTO didn't respond if I don't hear back.""
  - Ask: ""The state's draft says G3 ending at 18:00, and the SWPC site says G4. Which is it? And was Hartley a hack, yes or no?""
  - Ask: ""Can I get someone on camera at 06:10? A name and a title, not a spokesperson email.""
  - Concede only when: If the Communications Manager gives a short, attributable statement that names the condition, what NLTO has done, and a next-update time before the deadline, the outlet runs NLTO's quote rather than the social posts.
  - Concede only when: If NLTO sends the same G level and wording as the state (HSEM) and the current SWPC product, the producer drops the 'conflicting reports' angle.
  - Concede only when: If NLTO commits to the 06:10 live slot with a named spokesperson, the producer gives the questions in advance.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination & Transformer Risk Decision (30 Points)** | ☐ **Fail:** Ops (TOM/CRSS) let the Hartley AT-1 crew start or left the 06:30 go/no-go open at I-02, made transfer cuts at I-05 and I-06 without agreeing them on the UMRC bridge, and at I-12 either made no logged decision on Iron Range T2 or opened it before the RCSM had the new Arrowhead and North Shore schedules and Taconite Ridge had its 20 minutes' notice. ☐ **Pass:** Ops deferred all six 345 kV outages and kept the Hartley spare untouched at I-02. At I-05 and I-06 they applied the 10 percent and then the further 10 percent cuts plus 200 MW of reserve, as agreed with the RCSM. At I-12 the TOM made a logged T2 decision on the RE's evidence (168 A, gas alarm, 108 C), and if T2 was removed, agreed the 540/320 MW schedules and redispatch with the RCSM first. ☐ **Excellence:** Ops called Taconite Ridge and pre-briefed the RCSM on a possible T2 outage when Iron Range AT2 neared 150 A at I-06, before I-12 forced the decision. At I-12 the TOM weighed the risk to T2 against the only spare (with 345-1 out at Hartley) out loud and recorded the spare's use in the log. The TOM also asked for the MN HSEM call and kept NLTO-OP-12 ready without invoking it. | I-02, I-05, I-06, I-10, I-12 |
| **Metric 2: Grid Situational Awareness & Timing Integrity (30 Points)** | ☐ **Fail:** Ops/IT acted on unverified data: they changed flows or switched on Lakeshore's report at I-05b, trusted the PMU angle step or let the crew reclose 345-1 at I-10, switched clocks without a plan or blamed the expired licence at I-11, or declared the Iron Range and Cloquet clocks restored at I-14. ☐ **Pass:** CRSS checked the one-line, SCADA and the UMRC outage schedule at I-05b. At I-09, TIME named the three suspect sites and PMU feeds, switched them one at a time to the Duluth backup network time source with CRSS agreement, and logged each holdover start against the 24-hour limit. At I-10 CRSS used breaker status and MW at both line ends to show that 345-1 was open and 345-2 had bad status, and held 345-1 open. RE logged the relay misoperation and changed no protection settings. ☐ **Excellence:** TIME flagged the North Shore GNSS degradation and had the backup source ready at I-06, before lock was lost at I-09. CRSS marked the PMU angles suspect on the 16:30 UMRC call without being asked. At I-14, TIME logged the 16:06 and 16:09 Wednesday deadlines with a first-light site-visit plan and switched nothing during the 345-1 restoration. | I-05b, I-09, I-10, I-11, I-14 |
| **Metric 3: Entity Notification & Public Communication (20 Points)** | ☐ **Fail:** PIO (COM) released statements that gave an end time, used the word 'outage' with no confirmed loss of load, or carried a G level that did not match SWPC and the UMRC (I-07, I-12b). PIO left the G5, blackout, cyberattack or second-CME claims out of the rumor log, or commented on security. Ops missed the 60-minute entity clock at I-06b or I-16 and did not phone the entities that had not acknowledged. ☐ **Pass:** PIO logged each rumor and issued statements that matched the current SWPC product and the UMRC notice on G level and duration ('several hours to a day'), referred storm questions to SWPC, and met the 16:00 deadline at I-07. Ops and the RCSM reached Baraga and Duluth Harbor Terminal before 16:10 at I-06b and reached all 14 entities before 04:36 at I-16. Ops gave Mesabi the facts and no guarantee, leaving the furnace decision with the plant. ☐ **Excellence:** PIO flagged the state's G3/18:00 and G4/22:00 wording as mismatches with the MN HSEM duty officer before release (I-07, I-12b), so both statements carried the same numbers. PIO corrected the co-op G5 post at I-03b without speaking for the co-op and passed the discrepancy to the CRSS for the RC call. At I-16b PIO prepped the Director for the 06:10 interview with EMS-verified customer numbers. | I-03b, I-06b, I-07, I-12b, I-16b |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Ops applied each NGDOP 4 condition only after the Kp was observed: Condition 2 waited for WARSUD at I-04 and Condition 4 waited for ALTK08 rather than WARK08 at I-06. Ops logged no basis or time for each change, and at I-15 agreed to terminate on Kp alone. ☐ **Pass:** CRSS declared and logged Condition 1 at I-01 and applied the Condition 2 actions early at I-03 (Cloquet SVC and the Iron Range and Hartley banks on line). CRSS declared Condition 3 at I-05 and Condition 4 on WARK08 at I-06, logging the basis and time each time. At I-12 the TOM cited NGDOP 5. At I-15 CRSS held termination until all NGDOP 8 conditions were met at 03:36, and the RCSM recorded under UGFNWC 8 that TOP agreement was outstanding. ☐ **Excellence:** Ops and the RC cited specific sections by number as they acted: NGDOP 4 'actions taken before the condition when SWPC gives lead time' at I-03, UGFNWC 4 with its 15-minute send rule and UGFNWC 5 acknowledgment tracking at I-01, and NLTO Communications Plan 5 for rumors. At I-15 CRSS told the bridge before the 02:15 call that the neutral-current condition would not be met until 03:36. | I-01, I-03, I-06, I-12, I-15 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** 3-Up, 3-Down asks the room for three things that went well and three things that broke or failed during the exercise. Go around the room one team at a time (control room, reliability engineering, communications, management) so every team gets a turn, and write each item on the whiteboard in two columns before you start the discussion questions.

**Key Discussion Questions for Aurora Over Texas:**
- **Ahead of the Kp:** You had the G3 Watch from Monday night, the 02:10 CME discussion with an 11:00–17:00 arrival window, and the 13:24 sudden impulse, but Kp 7 wasn't observed until 14:06. NGDOP 4 says to take a condition's actions before the condition is reached when SWPC gives lead time. At what time did you actually defer the six 345 kV outages and the Hartley transformer replacement, and bring the Cloquet SVC and the Iron Range and Hartley capacitor banks on line? Did you act on the forecast, or wait for the Kp to show up before you moved? Which condition change has no logged time or basis, and what stopped you writing it down? _(Objective: Use of Doctrine)_
- **The Call:** At 17:47 (I-12), Iron Range T2 read 168 A neutral current with an H2 gas alarm and a 108 C hot spot. The manufacturer said it was 'the pattern we see before winding damage' but couldn't confirm it without an oil sample. Your only spare was at Hartley, where 345-1 was out and the relay status was unclear. Did you remove T2 or keep it in service, and how long did the decision take? Did the reliability engineer's view of the transformer and the Shift Manager's view of system security reach the same answer, or did one side overrule the other? Did UMRC have your new Arrowhead (540 MW) and North Shore (320 MW) schedules, and the Taconite Ridge gas units on 20 minutes' notice, before anyone opened a breaker? What information would have let you make the call faster? _(Objective: Decision Making)_
- **Trust:** After the 16:20 line trip, the Hartley relay misoperation and the loss of lock at three substation GPS clocks, when did you stop trusting the PMU data and the timestamps in front of you? Who spotted that the data were suspect, and how was that passed to the operators: as evidence that changed the operating picture, or as a ticket for someone to look at later? When did you switch to the backup network time source and declare holdover, and did everyone know the 24-hour holdover limit and when that clock started? _(Objective: Technical Analysis)_
- **The Gap:** At 15:44 (I-06b), the UMRC acknowledgment report showed Baraga Wind Farm had not acknowledged, and your own Condition 4 tally had 12 of 14 entities ticked, with Baraga and Duluth Harbor Terminal blank and the 60-minute clock running out at 16:10. Baraga said they never saw the Warning or the Emergency. How did you find the gap: by checking actively, or because UMRC's report pointed it out? What should the two entities have been doing for the storm while they were in the dark? Separately, Mesabi called at 07:35 and again at 17:30 (I-10b) wanting a straight answer about the indurating furnace. Did anyone actually keep them posted as promised that morning, and what did you tell them you could and couldn't guarantee? _(Objective: Communication)_
- **One Set of Numbers:** At 07:55 (I-03b), before you knew how big the storm would get, Northland 6 asked whether the lights would go out in Duluth, while a post claiming a G5 storm at noon had 2,300 shares. What did you tell the public then? At 17:50–17:53 (I-12b), G5 was real, a post claimed a nationwide blackout, another called the 16:20 Hartley trip a cyberattack, and MN HSEM's draft said 'G4, ending by 22:00 CDT.' Did your statement match SWPC and UMRC on the G level and on duration (storms last from several hours to a day)? Did you correct HSEM's draft, and how did you answer the cyberattack claim without guessing? When did you first bring in the state emergency management duty officer, as NGDOP Condition 4 calls for, and did you wait too long? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Space weather**: NOAA Space Weather Prediction Center watches, warnings and alerts, the G, S and R scales, Kp and flux series, GNSS error and timing holdover, and decisions scored by the clocks that matter: grid operating procedures applied before storm onset and time source failover before holdover expires. For any organization that has to operate through a geomagnetic storm, a radiation storm or a radio blackout: utilities, telecom, aviation, farms, rail, ports and satellite operators.
  - Data sources: swpc-realtime, ncei-swpc-archive, usgs-geomag
  - Reference documents: NOAA Space Weather Scales (G, S and R); Geomagnetic Monitoring in the Mid-Atlantic United States (Fact Sheet 2021-3001); National Space Weather Strategy; National Space Weather Action Plan; Space Weather Phase 1 Benchmarks; The Solar Cycle, Geology, and Geoelectric Hazards for Power Grids (Fact Sheet 2024-3036); Reducing the Risk from Geomagnetic Hazards (Fact Sheet 177-97); Resilient PNT Conformance Framework, Version 2.0; 2024 Space Weather Tabletop Exercise report summary; EOP-010-1, Geomagnetic Disturbance Operations; TPL-007-4, Transmission System Planned Performance for Geomagnetic Disturbance Events
<!-- /section:toolkits -->
