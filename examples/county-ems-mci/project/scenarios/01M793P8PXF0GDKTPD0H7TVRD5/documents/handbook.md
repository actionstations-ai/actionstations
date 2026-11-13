# Controller / Evaluator (C/E) Handbook
## Open on Paper — Hospital Capacity Board & MCI Patient Flow

Exercise Date: [Date] · Location: Highway 21 and County Road K intersection near Brandt Lake, Larkfield County (with Larkfield Regional Medical Center (LRMC) MEDCOM, Brandt Lake, and the Brandt Lake High School reunification center) · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise for Larkfield County Emergency Medical Services, Brandt Lake Fire Department, the Larkfield County Communications Center and their hospital and coalition partners. It runs for 4 hours of exercise time, from 17:30 to 21:30 on Tuesday 20 October 2026. No units move and no patients are real. Players talk through the decisions, the radio traffic and the products they would make (the ICS-201, triage counts, the transport log, hospital call records and the public statement), and the SimCell answers for everyone outside the room. Patients are fictional and listed by tag number, age and sex only.

The injects simulate an **infrastructure failure** during a Level 2 MCI. A Tri-County Coach Lines charter bus, a diesel tanker and a car collide at Highway 21 and County Road K, leaving about 28 patients and seven trapped. At the same time, the LRMC MEDCOM capacity board that SOP-MC-02 section 2 and LCEMS MCI Plan section 6 depend on fails without anyone noticing. The board keeps showing Pinecrest Memorial as Open after Pinecrest has gone on Diversion. Then it shows every row green after a reload. Then it replays stale 16:55 values when the vendor restarts it. Two other limits make it worse: St. Brendan's has no CT, and LRMC can take only 3 Immediate patients in the first 30 minutes. Other pressures include a firefighter mayday, a diesel spill above the reporting threshold, rising pending calls in CAD and a social-media count of "40" that competes with command's 28.

**The arc:**
- **Phase 1, Rain, Diesel, Stale Data (0:00–1:00):** size-up, MCI declaration, command transfer, the mayday and the first clues that the board is stale.
- **Phase 2, The Wrong Door (1:00–2:00):** Oxbow Medic 41 is headed to a hospital on Diversion, and the count starts to split.
- **Phase 3, Board Off, Voice On (2:00–3:00):** the key decision is whether to drop the board and run destinations by voice roll call on MED 1, followed by the friction that manual workaround creates.
- **Phase 4, Trust, but Verify (3:00–4:00):** a phased, verified return to the board, reconciling every count, and the notifications to the Medical Examiner, Wisconsin DNR and Wisconsin Emergency Management before ENDEX.

**What evaluators should watch for:**
- Does anyone read the "Last updated" times and the red banner?
- Who confirms hospital status by voice, and when?
- Does every destination respect a hospital's stated limit, and is it logged with tag, priority, hospital, mode and reason?
- Do the tag count, transport log, hospital door counts and the PIO's number agree, or is the gap explained?
- Do command transfer, the mayday and the PAR follow the Brandt Lake Fire Department SOP while the Medical Group keeps working?

**Objectives:**
- **Use of Doctrine:** Demonstrate the ability to assign and log a destination for every tagged patient under SOP-MC-02 4 (no more than 3 Immediate patients to LRMC in the first 30 minutes, no more than one-third of Delayed patients to any one hospital, Air 7 to Lakeshore for head and burn injuries, and Minor patients by bus to Brandt Lake High School), even when St. Brendan's has Limited intake because its CT is down.
- **Technical Analysis:** Demonstrate the ability to spot that the LRMC MEDCOM capacity board shows a hospital as open when it is on Diversion, to confirm each hospital's real status by voice on MED 1, and to stop or redirect any ambulance already sent to the wrong door.
- **Decision Making:** Demonstrate the ability to keep command, the mayday and the personnel accountability report on LARK CMD 2 and LARK TAC 3 when the bus shifts at 18:20, while the Medical Group keeps triage, treatment and transport going under a second command position and dispatch logs every change in CAD.
- **Communication:** Demonstrate the ability to release one casualty count, approved by the IC and confirmed with MEDCOM, through a Joint Information Center within 45 minutes, against social media reports of 40 casualties, and to send families to the Brandt Lake High School reunification center and call-in line instead of the hospitals.

**Plan sections exercised:**
- SOP-MC-02: Medical Communication… › 4. Destination rules
- SOP-MC-02: Medical Communication… › 2. Hospitals and capabilities
- Larkfield County EMS: Mass Casua… › 6. Hospital notification and medical communications
- Brandt Lake Fire Department: Tec… › 3. Incident command and transfer
- Brandt Lake Fire Department: Tec… › 6. Mayday
- LCDERF › 6. Reunification and public information
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Layout:** set the tables as islands in a loose U, facing the main screen. Together they stand in for the Highway 21 Command post, the Communications Center and the LRMC MEDCOM desk.
- **Team A (IC, Battalion 1):** at the head of the U, nearest the whiteboard that holds the ICS-201.
- **Team B (Medical Group, Triage and Transportation Leaders):** on the left arm, next to Team A. They are close enough to talk face to face, as they would at the command post.
- **Team C (Dispatch Supervisor):** on the right arm, a little apart from the field teams so all their traffic has to go "over the radio." Give them the CAD pending-calls sheet.
- **Team D (LRMC MEDCOM nurse) and Team E (Healthcare Coalition Coordinator):** side by side at a separate island across the room from Team B. They stand for the hospital. Put the paper capacity board (a flip chart) at this table.
- **Team F (PIO Sandra Kowal):** alone at a table at the rear of the room, facing away from the main screen. The PIO has to walk over to get counts and approvals. This builds in the real gap between the JIC and the command post and shows whether the PIO goes looking for one confirmed number or repeats what the media hands them.
- **SimCell / controller table:** at the side, with a clear view of every table and a phone or radio prop. Put evaluators beside the tables they are scoring, not in the players' line of sight.

**Equipment needs**
- Projector and screen for main-screen injects: STARTEX, time-jump and ENDEX cards, capacity board screenshots and social-media posts.
- Whiteboard for the ICS-201, plus a second whiteboard or flip chart for the paper capacity board at MEDCOM.
- Printed inject deck in MSEL order, with handouts (I-08 screenshot and roll call sheet, I-14 tally, I-18 count reconciliation worksheet) pre-sorted by team.
- Optional simulated radios or phones labeled LARK DISP 1, LARK CMD 2, LARK TAC 3 and MED 1, plus one "telephone" for SimCell calls.
- Wall clock showing exercise time, and timer for the time jumps.

**Materials for players:** name tents by role; LCEMS MCI Plan sections 2 and 6; SOP-MC-02 sections 2 and 4; Brandt Lake Fire Department SOP sections 4 and 8; LCDERF section 5 contacts; blank ICS-201, triage count sheet, transport log, hospital call record and press release forms; pens and sticky notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**The SimCell role**
You play everyone else in the world. If a student says "I call the sheriff," you answer as the deputy. If they say "I call Pinecrest," you are the charge nurse with one doctor and a full lobby. If they key up MED 1 to Air 7, you are the flight crew looking at a 900-foot ceiling. Answer in the first person, in that character's voice and in that character's interest. Only give what the character would know at that exercise time. If players call someone who is not scripted, play them plainly and write down what you promised.

**Do not make it easy**
Make players earn every fact. Example from this scenario: at 18:36 (I-06), Transportation sends Oxbow Medic 41 to Pinecrest "because the board shows Open with 5 beds." If MEDCOM asks you, "Is Pinecrest open?", **do not** confirm it from the board and **do not** hint that it is wrong. Answer as the board does: "Board shows Pinecrest Open, 5 beds, last updated 16:55." Only a player who calls Pinecrest directly, or who reads the timestamp and banner out loud, gets the charge nurse saying "We've been on Diversion since 18:15." Likewise:
- The StatusGrid engineer does not fix the board because players ask nicely.
- The news director does not drop "40" until the JIC gives one number on the record.
- The Medical Examiner investigator does not leave without the tag record.

**Managing time**
Use the TIME JUMP cards (I-05 at 1:00, I-10 at 2:00, I-15 at 3:00). If a discussion stalls or runs long, cut it off with a time jump:
> "PAUSE EXERCISE. We are jumping forward 30 minutes. It is now [time]. Here is what has happened since: [read the card]. Hold your current decisions; we will capture them in the hot wash. RESUME."

Keep each phase to its hour. If a team gets ahead, deliver the next inject early. If a team is stuck, have a SimCell character call them with a nudge in character, not as a hint from you.

**Handling artificialities**
When a student says "I wouldn't use that system" or "We'd never rely on the board," answer:
> "Understood, and note that for the hot wash. For this exercise, the county uses the LRMC MEDCOM capacity board as written in SOP-MC-02 section 2 and LCEMS MCI Plan section 6. Play the problem as given: what do you do now that it is in front of you?"

If they ask for a resource that doesn't exist in the documents, say: "That isn't available tonight. What's your next move?"

**Delivering injects**
Do not explain. Say "This just came in." or "This is on the main screen." Hand the slip to the named team, read radio traffic in plain language with the channel and time, and step back. Do not tell players which injects are clues, red herrings or noise. The I-07b "phishing" email is delivered as straight as the real clues.

**Conventions**
- Every radio or phone message from the SimCell starts and ends with **"This is an exercise."**
- If anything real happens (a medical emergency, a fire alarm, a real call for a participant), anyone in the room says **"REAL WORLD, REAL WORLD"** and play stops at once. Resume only when the lead controller says "RESUME EXERCISE."

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **StatusGrid Health Systems on-call engineer (capacity board vendor, support@statusgrid.example). Also play the partners that depend on the board: the Oxbow County EMS duty officer and the Tamarack Medic 12 crew, whose MDT tablets show the board.** — _Trigger: MEDCOM, the coalition coordinator or LRMC IT calls StatusGrid about the stale board or the 'Auto-refresh failed' banner, or a mutual aid crew asks Dispatch why its tablet shows all four hospitals Open (from I-03 onward; scripted calls at I-09b, I-11, I-16 and I-17)._
  - Ask: "Engineer: "What's your support ticket number? I can't touch a production server without a ticket and a signed remote-access request from your IT on-call. Who at LRMC is authorizing this?""
  - Ask: "Engineer: "Did anybody change anything on your side since our 14:12 maintenance? Do you have the server alarm history saved, or did someone reboot it and wipe the log?""
  - Ask: "Oxbow duty officer: "My medics can't hear their patch traffic because you're reading statuses on MED 1. Put hospital status on your unit status board where my MDTs can see it. And who has the transport log? Medic 41 wants proof it was told to go to Pinecrest.""
  - Ask: "Engineer, when asked for a guarantee: "I can try again at 19:50, but I'm not promising anything. If you want to stop relying on the board, that's your clinical call, not mine. My job is to get it running again.""
  - Concede only when: Gives a firm restart window and explains the 16:55 replay risk, but only after MEDCOM gives a ticket number and LRMC IT sends a written remote-access approval.
  - Concede only when: Purges the replay queue before the 20:33 restart, and confirms that Pinecrest needs an on-site engineer (Milwaukee, about midnight), only if MEDCOM tells him the hospitals are flashing old values and asks for a row-by-row check.
  - Concede only when: Oxbow duty officer stops complaining once Dispatch gives a set time for the MED 1 roll call (for example every 15 minutes) and names who holds the transport log with Medic 41's 18:36 and 18:52 entries.
- **Pinecrest Memorial Hospital charge nurse, Wausau Road (critical access, 5 ED beds, one doctor)** — _Trigger: Anyone at MEDCOM, the coalition or the Medical Group calls Pinecrest to confirm status or offer a patient, or MEDCOM returns the cut-off 18:12 voicemail (I-03, I-07, I-17)._
  - Ask: ""I faxed our Diversion at 18:15. Who reads that fax? Why is your board still telling ambulances to come here?""
  - Ask: ""I've got nine walk-ins from your bus with no tags. Are they in your 28 or not? Who do I report them to, and how often?""
  - Ask: ""Your board says Open again at 20:47. Who checked that with me before your crews started trusting it?""
  - Ask: ""Families are at my front desk asking for names. Are you sending them here, or to the high school? Someone needs to tell me what to say.""
  - Concede only when: Agrees to report the door count to MEDCOM every 15 minutes by voice on a set schedule, once MEDCOM names a single contact and puts Pinecrest on voice-only status.
  - Concede only when: Gives a breakdown of the walk-ins (age, sex, rough priority, no names) that the coalition can match against the manifest, if the coalition asks for it through patient tracking and not through the media.
  - Concede only when: Will reopen to Minor transfers only after her supervisor approves and MEDCOM confirms by voice. She will not accept a board-only offer.
- **Channel 9 News news director (newsdirector@channel9news.example); also the assignment desk (news@channel9news.example)** — _Trigger: The PIO or IC answers a media inquiry, or the PIO calls Channel 9 back (I-04b, I-14, I-18), or the station has heard nothing from the JIC by 20:45._
  - Ask: ""We go live at the top of the hour. Is it 28, or is it 40? Pinecrest told our reporter nine. Give me one number on the record by 20:45, or we run 'at least 40.'""
  - Ask: ""Is the firefighter in your count? Is anyone dead? There's a gray tarp in that photo.""
  - Ask: ""Where should families go? LRMC is sending people away and Pinecrest says it's full. Do you have a phone number we can put on screen?""
  - Ask: ""Can I get the Chief on camera for 30 seconds, or is the county just going to read a statement?""
  - Concede only when: Drops '40' and airs the county number once the PIO gives one count on the record with a time, a named spokesperson and the reason it differs from the posts.
  - Concede only when: Runs the Red Cross reunification line 920-555-0195 and the Brandt Lake High School gymnasium location on screen if the PIO gives them in writing.
  - Concede only when: Holds off on 'someone died' until the 21:30 update if the PIO says a confirmed statement is coming after the Medical Examiner has been notified.
- **Medical Examiner's office investigator for Dr. Bernard Okoro (920-555-0196)** — _Trigger: The IC or Medical Group reports the death of LC-0428 to the Medical Examiner, or the investigator arrives at the command post (I-15, I-19). If no one calls by 20:45, the investigator calls the IC._
  - Ask: ""When was he tagged Expectant, who tagged him, and what time was the 20:22 reassessment? Is that written on the tag, or only remembered?""
  - Ask: ""Has anyone moved him or taken anything from his pockets? Who has stayed with him since 20:22?""
  - Ask: ""Has anyone released his name or said 'one dead' to the media or the Red Cross? That's not yours to release.""
  - Ask: ""Is your tag count of 28 final? I need to know there isn't a second deceased at Pinecrest or LRMC that you haven't told me about.""
  - Concede only when: Takes custody and signs for LC-0428 once given the tag, a written timeline (Expectant tag time, 20:22 reassessment, name of the attending paramedic) and the scene location.
  - Concede only when: Agrees the PIO may say 'one person has died' without a name, as long as the wording is agreed with the Medical Examiner first.
  - Concede only when: Will take a hospital-reported death by phone later if MEDCOM gives a named contact for each hospital.
- **Wisconsin DNR spill coordinator (with the Wisconsin Emergency Management duty officer, dutyofficer@wem-eoc.example, as a second voice)** — _Trigger: The IC or Hazmat reports the diesel release (it passed 25 gallons by 18:30, per Brandt Lake Fire Department SOP section 4), or the coalition sends the state its count. If no one reports the spill by 19:30, DNR calls the IC._
  - Ask: "DNR: "Your crews had over 25 gallons on the ground by 18:30. Why am I hearing about it now? What time did the release start, and when was the source plugged?""
  - Ask: "DNR: "Is the storm drain covered? Did any fuel reach the outfall? Who is the responsible party: the tanker carrier or the fuel company? Who signs for the fire department?""
  - Ask: "WEM duty officer: "I need your final patient count and hospital status for the state log. Does it match the field and the hospital reports? If not, tell me why in writing.""
  - Ask: "WEM duty officer: "You're Level 2. Are you asking for state resources through the coalition or not? I can't log a request nobody made.""
  - Concede only when: DNR will close the spill report once it has a signed fire department statement (about 40 gallons, plugged 19:15, drain covered) and the contractor's absorbent pickup is confirmed.
  - Concede only when: WEM will accept one reconciled count with a short note explaining the gap (9 untagged walk-ins at Pinecrest, the tanker driver who drove himself, LC-0417's double entry) if it comes from the coalition coordinator Greg Wilmot.
  - Concede only when: WEM gives a direct callback number for any request for state resources once the coalition confirms the request with the IC's approval.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Command, Mayday & Patient Flow Coordination (30 Points)** | ☐ **Fail:** IC lets the I-04 mayday take over every channel, with no RIT committed, no PAR on LARK CMD 2 and no second command position, so transports stop. Or DISP does not log the mayday, RIT and PAR times in CAD, and staffing and channel friction at I-11b/I-12 goes unresolved. ☐ **Pass:** IC commits the RIT, orders a PAR on LARK CMD 2, names a second command position at I-04, then ends the mayday on LARK CMD 2 after the I-06 PAR. MED keeps triage and transport running outside the collapse zone. DISP logs each time, and the I-11b float nurse, paper board and channel split are staffed as briefed. ☐ **Excellence:** IC names the Medical Group's second command position and the channel plan (CMD 2 command, TAC 3 tactical, MED 1 hospitals) during the I-01 transfer briefing, before the I-04 mayday forces it. At I-12, IC sets the order for the remaining Immediates and asks about a ground option to Lakeshore before Air 7's delay leaves patients waiting. | I-04, I-05, I-06, I-11b, I-12 |
| **Metric 2: Capacity Board Failure Analysis & Voice-Confirmed Destinations (30 Points)** | ☐ **Fail:** MEDCOM trusts the stale Pinecrest 'Open' row at I-03 and does not call Pinecrest, so Medic 41's wrong-door transport at I-06 goes unchallenged until the I-07 call forces it. Or MEDCOM/HCC treat I-07b as a cyberattack and shut the board down, or go back to the board when it turns green at I-16/I-17. ☐ **Pass:** MEDCOM marks Pinecrest UNCONFIRMED at I-03 and gets its status by voice. Transportation redirects Medic 41 at I-07 to St. Brendan's only after a voice acceptance. MEDCOM/HCC read the I-07b alarm history as a service failure (16:55 StatusSync stop). LC-0412 at I-11 and the Pinecrest cached row at I-17 are confirmed by voice on MED 1. ☐ **Excellence:** MEDCOM checks every row's timestamp at I-03, announces on MED 1 that the board may be stale and holds Pinecrest transports, so Medic 41 never leaves for the wrong door at I-06. MEDCOM declares voice roll call every 15 minutes before the I-11 decision point and runs the board side by side with voice after I-16 without being asked. | I-03, I-06, I-07, I-07b, I-11, I-17 |
| **Metric 3: Public Information, Casualty Count & Reunification (20 Points)** | ☐ **Fail:** PIO confirms or repeats '40' at I-04b, releases an unapproved number, talks about the mayday or the death before the IC approves it, or sends families to hospitals. No JIC release goes out before the I-14 20:45 deadline. ☐ **Pass:** PIO issues a holding statement with no number at I-04b and opens the JIC within 45 minutes. At I-09/I-14 the PIO releases only the IC-approved, MEDCOM-confirmed count (28 tagged plus the firefighter, reconciled with Pinecrest's walk-ins), corrects the figure of 40, and sends families to the Brandt Lake High School gym and 920-555-0195. At I-18 the PIO releases the reconciled total of 35. ☐ **Excellence:** PIO gets a count window from the IC and announces the reunification center and call-in line at I-04b, before the I-09 social media pressure. PIO asks the Red Cross and victim services for more call takers before the I-13 backlog, and has a reconciled count explaining the walk-ins and tanker driver ready before the I-18 desk asks. | I-04b, I-09, I-13, I-14, I-18 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Players do not cite plan sections. MED sends a fourth Immediate to LRMC within 30 minutes at I-06, routes the head-injury patient at I-12 by distance rather than to Lakeshore, or transports Minor patients to hospitals. ☐ **Pass:** Players cite SOP-MC-02 4 when holding further Immediates from LRMC at I-06, routing LC-0414/LC-0421 to Lakeshore by Air 7 and sending Minor patients by bus to Brandt Lake High School. HCC cites SOP-MC-02 5 for the LRMC-to-Lakeshore transfers at I-12, and the PIO cites SOP-MC-02 7 and LCDERF 6 on family referral. ☐ **Excellence:** MEDCOM restates the SOP-MC-02 4 limits (3 Immediate to LRMC in 30 minutes, one-third of Delayed per hospital, 8 Delayed to LRMC) at I-02 and tracks them on the paper board before I-12 forces it. HCC starts SOP-MC-02 5 surge transfers before LRMC threatens Limited intake, and every destination in the I-18 log has a tag, priority, mode and reason. | I-02, I-06, I-11, I-12, I-18 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** 3-Up, 3-Down: ask the room for three things that went well and three that broke or failed during the exercise. Go around the room one team at a time (Command, Medical Group/Transportation, MEDCOM, Dispatch, hospitals, PIO/JIC), write each item on the whiteboard in two columns, and don't allow debate until every team has spoken.

**Key Discussion Questions for Open on Paper:**
- **Trust:** At 18:10 (I-03), the capacity board showed Pinecrest OPEN with 5 beds. The data was last updated at 16:55, a red 'status feed timeout' banner was across the top, and no one from Pinecrest had called. Two minutes later the Pinecrest clerk's voicemail said walk-ins were arriving and 'nobody called us.' At what moment did you stop trusting the board? Who made that call out loud, and how long did it take to get a voice roll call on MED 1? Then at 18:58 (I-08), the page reload turned every row green with 'Last updated: --' and the banner was gone. Did anyone read that as recovery? If so, what told you it wasn't? _(Objective: Technical Analysis)_
- **The Gap:** At 19:35 (I-11), the StatusGrid engineer said the restart had failed with exit code 1067 and the board was wrong for both Pinecrest and St. Brendan's. At the same time, Transportation had LC-0412, just upgraded to Immediate, loaded on Tamarack Medic 12 with a tablet showing St. Brendan's Open. Did the vendor's technical report change what MEDCOM told the field, and did the field understand what 'StatusSync dropped' meant for them? What did you tell Medic 12, how long did that take, and was Medic 41's earlier trip toward Pinecrest ever stopped, redirected or logged as a poor-fit destination? _(Objective: Technical Analysis)_
- **The Destination:** Between 19:52 and 19:56 (I-12), the constraints piled up. St. Brendan's refused LC-0421, the head injury with a deficit. Air 7 could not be back at the LZ until 20:20. LRMC had taken 7 of its 8 allowed Delayed patients. Using SOP-MC-02 section 4, walk through where LC-0421 and your remaining Immediates and Delayed patients actually went, and whether each destination was logged with tag, priority, hospital, mode and reason. Did anyone ask the coalition to start the section 5 inpatient transfer from LRMC to Lakeshore before LRMC threatened to go to Limited intake at 20:30? What would have let you decide sooner? _(Objective: Use of Doctrine)_
- **The Paper Board:** At 19:45 (I-11b), the LRMC House Supervisor could spare only one float nurse for 90 minutes and no liaisons for the other hospitals. Two minutes later the Oxbow County duty officer complained that your status roll calls were blocking MED 1 and asked who had the transport log. While the bus shift at 18:20 was being worked, how did you keep command, mayday and PAR traffic on LARK CMD 2 and TAC 3, separate from the Medical Group's MED 1 traffic? Who owned the backup paper board? Did hospital statuses and every change get into CAD and onto the unit status board where mutual aid crews could see them? _(Objective: Decision Making)_
- **The Count:** At 18:22 to 18:25 (I-04b), @BrandtLakeBackroads had a post claiming 40+ hurt and a MAYDAY, with families heading to LRMC, and Channel 9 News was going live at 18:30 asking for a number and a hospital. What did you tell the public before you knew the real count? Who approved it, and was it checked with MEDCOM even though the board was stale? Did the Joint Information Center release one count within 45 minutes and send families to the Brandt Lake High School reunification center and call-in line rather than LRMC? Do the scene triage count, hospital door counts (including Pinecrest's walk-ins) and public count agree now? If not, how will the after action report explain the difference? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Mass casualty and triage**: Triage tags, patient lists, Medical Branch worksheets, treatment areas, the transportation log and hospital calls for a mass casualty incident, with the structured decisions a Medical Group makes: declare an MCI, name the triage method, assign a destination and close a hospital to arrivals. Stays at the coordination and decision level; it is not a patient simulator and not clinical guidance for a real incident.
- **Dispatch and command traffic**: The responders' view of dispatch: CAD incident detail, unit status board, pending calls, radio traffic across dispatch, command and tactical channels, station alerting and mutual aid requests, with the decisions of mutual aid, command transfer and a mayday. The 911 center's own view and CAD failure stay with the emergency communications domain.
  - Reference documents: Emergency Services Sector Tabletop Exercise, Situation Manual (CISA)
<!-- /section:toolkits -->
