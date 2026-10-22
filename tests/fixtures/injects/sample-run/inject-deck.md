# Generated Inject Deck

## Flight to Nowhere — Scenario 3: Data Integrity & FIDS

### [INJECT START] — All · 0:00 (09:00) · [STARTEX]

MSEL event: STARTEX (Start Exercise). Current time: 09:00 AM on a busy Thursday. Weather is clear. Passenger load is high due to a holiday weekend.

**STARTEX: Flight to Nowhere — Data Integrity & FIDS** · type: startex_card · delivery: read_aloud

> **exerciseTime:** 0:00
> **startTime:** 09:00 AM
> **day:** Thursday, October 21, 2026
> **location:** North Coast International Airport (NCIA)
> **weather:** Clear, 65°F. Winds calm.
> **load:** High: about 15% above average (holiday weekend)
> **staffing:** Full shifts in Operations, Maintenance and IT
> **narration:** STARTEX. This is an exercise. It is 09:00 AM on a busy Thursday at North Coast International Airport. The terminal is bustling with travelers, and systems are operating normally. This is Scenario 3: Flight to Nowhere — Data Integrity & FIDS.
> **status:** {"name":"Flight Information Displays (FIDS)","status":"green","note":"All gates displaying correct flight times and statuses"}
> {"name":"Baggage Handling System (BHS)","status":"green","note":"Baggage scanning and routing operating at normal throughput"}
> {"name":"Public Address (PA) System","status":"green","note":"PA feed active; routine announcements running"}
> {"name":"IT Operations Center","status":"green","note":"All monitoring tools active; no anomalies reported"}
> {"name":"Emergency Shelters","status":"green","note":"Shelters A, B, and C fully accessible and stocked"}
> {"name":"Airline Coordination","status":"green","note":"All major carriers on IROPS standby; no service disruptions"}
> {"name":"Passenger Flow (Concourses A & B)","status":"green","note":"Normal foot traffic; no congestion reported"}
> **facilitatorNote:** Confirm every table has the player briefing packet and a blank ICS 201 before reading. Ensure all roles are present and have access to their roles' documentation.
> **scenarioTitle:** Scenario 3: Flight to Nowhere — Data Integrity & FIDS
> **injectId:** START

_(Instructor Note: This is the baseline inject. All systems appear normal. The hidden threat will emerge in the next inject. Watch for early signs of confusion in BHS or FIDS reports.)_

Media plan: template

---

### [INJECT I-01] — Ops · 0:15 (09:15) · [CORE_NARRATIVE]

MSEL event: Phone Call: "Hey Ops, this is Delta at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?"

**Phone Call: Gate B4 FIDS Discrepancy** · type: phone_call · delivery: read_aloud

> **orgName:** North Coast Regional Airport Authority
> **systemName:** Airport Communications Center (ACC) - Voice Log
> **callId:** CR-20261021-091522-001
> **direction:** Inbound
> **caller:** {"name":"Delta Air Lines - Gate B4 Agent","number":"330-555-1402","label":"Delta Gate B4 Rep"}
> **callee:** {"name":"Airport Operations Center (AOC)","number":"330-555-2400","label":"Ops"}
> **startTime:** 10/21/2026 09:15:22
> **duration:** 0:47
> **transcript:** {"speaker":"Delta Gate B4 Rep","offset":"0:00","text":"Hey Ops, this is Delta at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?","prompt":false}
> {"speaker":"Ops","offset":"0:12","text":"Thanks for calling, Delta. We’ll check the FIDS feed and update you shortly.","prompt":false}
> {"speaker":"Delta Gate B4 Rep","offset":"0:25","text":"Yeah, the display shows DLA4279, but it's labeled 'Miami'. We’re holding 38 passengers now, and they’re starting to ask where the plane is.","prompt":false}
> {"speaker":"Ops","offset":"0:38","text":"Understood. We’re escalating to IT for verification. Stand by.","prompt":false}
> **voiceStyles:** {"Delta Gate B4 Rep":"Male, mid-30s, slightly rushed, background airport noise","Ops":"Calm, professional, steady tone"}
> **injectId:** I-01

_(Instructor Note: This is a inject; the FIDS is already compromised. IT should begin investigating the data feed, but the initial response will be to treat it as a display glitch.)_

Media plan: template + tts
Voice (Delta Gate B4 Rep; Male, mid-30s, slightly rushed, background airport noise): Hey Ops, this is Delta at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?
Voice (Ops; Calm, professional, steady tone): Thanks for calling, Delta. We’ll check the FIDS feed and update you shortly.
Voice (Delta Gate B4 Rep; Male, mid-30s, slightly rushed, background airport noise): Yeah, the display shows DLA4279, but it's labeled 'Miami'. We’re holding 38 passengers now, and they’re starting to ask where the plane is.
Voice (Ops; Calm, professional, steady tone): Understood. We’re escalating to IT for verification. Stand by.

---

### [INJECT I-02a] — IT · 0:20 (09:20) · [NOISE]

MSEL event: Ticket #4492 (Noise): Vending machines in Concourse B are spitting out soda cans randomly.

**Vending Machines in Concourse B Spitting Out Cans** · type: helpdesk_ticket · delivery: hand_to_role

> **ticketNo:** 4492
> **priority:** Low
> **impact:** Low
> **urgency:** Low
> **status:** New
> **requester:** Facilities Maintenance – Concourse B
> **requesterContact:** x4471
> **contactType:** Phone
> **category:** Facilities
> **subcategory:** Vending / Concessions
> **location:** Concourse B – Vending Row 3 (near Gate B4)
> **configurationItem:** VEND-B03-01
> **opened:** 2026-10-21 09:20:00
> **assignmentGroup:** IT Service Desk
> **assignee:**
> **subject:** Vending Machines in Concourse B Spitting Out Cans
> **description:** The Coke machine at VEND-B03-01 just ejected all 24 cans at once. The other machine (VEND-B03-02) is now stuck in a loop—spits out one can every 3 seconds. Soda is pooling on the floor near Gate B4. Maintenance is on-site but can't shut it down remotely. Is this a cyber thing? The machines were working fine 10 minutes ago.
> **activity:** {"author":"Facilities Maintenance – Concourse B","time":"2026-10-21 09:20:00","kind":"comment","text":"Reported via phone. Maintenance team on scene. No visible damage to units."}
> {"author":"ServiceDesk System","time":"2026-10-21 09:20:00","kind":"system","text":"Ticket created from inbound call. Auto-assigned to IT Service Desk."}
> **systemName:** ServiceDesk
> **orgName:** NCIA

_(Instructor Note: Noise inject; IT should triage it down without engaging. Watch for if anyone questions the timing or links it to the earlier FIDS glitch.)_

Media plan: template

---

### [INJECT I-02] — IT Lead · 0:30 (09:30) · [CORE_NARRATIVE]

MSEL event: Ticket Update: "We checked the FIDS server. The data stream from the AODB is actually sending 'Miami'. It's not a display error; the source data changed."

**FIDS Data Source Anomaly Detected** · type: helpdesk_ticket · delivery: hand_to_role

> **ticketNo:** 4492
> **priority:** High
> **impact:** High
> **urgency:** High
> **status:** In Progress
> **requester:** IT Helpdesk – Tier 1
> **requesterContact:** x8000
> **contactType:** Monitoring
> **category:** System Operations
> **subcategory:** Flight Information Display System (FIDS)
> **location:** Main Terminal – FIDS Server Room (Level 2)
> **configurationItem:** FIDS-01-01
> **opened:** 2026-10-21 09:30:17
> **assignmentGroup:** IT Operations – Network & Systems
> **assignee:** IT Lead – Systems
> **subject:** FIDS Server Confirms Data Source Changed to 'Miami' from AODB
> **description:** We checked the FIDS server. The data stream from the AODB is actually sending 'Miami'. It's not a display error; the source data changed. The gate display at B4 now shows 'Miami' as the destination, but the flight is scheduled for Minneapolis. We’ve confirmed the AODB log shows a record update at 09:28:12. No known maintenance or user change was made. This suggests a data integrity issue at the source. Please investigate the AODB and validate the flight record.
> **activity:** {"author":"IT Helpdesk – Tier 1","time":"2026-10-21 09:30:17","kind":"work_note","text":"Ticket updated: FIDS server confirmed data stream origin from AODB. Source shows 'Miami' as destination, despite flight being to Minneapolis. AODB log shows update at 09:28:12. No user action logged. Flagging as high priority."}
> {"author":"Monitoring System – AODB","time":"2026-10-21 09:28:12","kind":"system","text":"AODB record for flight DLT4492 updated: destination changed from 'Minneapolis' to 'Miami' (source: system auto-update, no user ID)."}
> {"author":"IT Helpdesk – Tier 1","time":"2026-10-21 09:27:58","kind":"comment","text":"Requester: Airline Liaison (AL) reported gate B4 shows 'Miami'. We checked local FIDS display and confirmed mismatch. Proceeding to verify source."}
> **systemName:** ServiceDesk
> **orgName:** NCIA

_(Instructor Note: This inject confirms the AODB has been tampered with. IT must now investigate the AODB logs and consider a system-wide data integrity alert. Watch for whether IT raises the alarm or assumes a temporary glitch.)_

Media plan: template

---

### [INJECT I-03] — Ops · 0:45 (09:45) · [CORE_NARRATIVE]

MSEL event: Radio Call: "Ops, TSA Checkpoint. We have passengers scanning boarding passes for a United flight to Chicago, but the FIDS board in the lobby lists that flight as 'Cancelled'. They are arguing with my TSOs."

**TSA Checkpoint: Flight Status Discrepancy** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** TSA 3
> **frequency:** TG 4103 / 460.275 MHz
> **date:** 10/21/2026
> **callsign:** TSA-CHK-1
> **lines:** {"time":"09:45","from":"TSA-CHK-1","to":"OPS","text":"Ops, TSA Checkpoint. We have passengers scanning boarding passes for a United flight to Chicago, but the FIDS board in the lobby lists that flight as 'Cancelled'. They are arguing with my TSOs."}
> {"time":"09:45","from":"OPS","to":"TSA-CHK-1","text":"TSA-CHK-1, confirm the flight number and gate."}
> {"time":"09:46","from":"TSA-CHK-1","to":"OPS","text":"Flight UAL 302, Gate C7. Passengers are showing real boarding passes. We've just checked with United's desk — they confirm the flight is on time, boarding now."}
> {"time":"09:46","from":"OPS","to":"TSA-CHK-1","text":"Understood. We're pulling data from the AODB. Stand by for update."}
> **background:** terminal
> **voiceStyle:** Young female, urgent, clipped tone
> **audioFile:** I-03_radio.wav
> **duration:** 0:18
> **injectId:** I-03

_(Instructor Note: This inject confirms the FIDS data integrity failure. Watch for Ops to cross-check with United and realize the display is not reflecting reality. Avoid early escalation to IT unless prompted.)_

Media plan: template + tts
Voice (TSA-CHK-1; young female, urgent, clipped tone): Ops, TSA Checkpoint. We have passengers scanning boarding passes for a United flight to Chicago, but the FIDS board in the lobby lists that flight as 'Cancelled'. They are arguing with my TSOs.
Voice (OPS; calm male, steady pace, slightly weary): TSA-CHK-1, confirm the flight number and gate.
Voice (TSA-CHK-1; urgent, slightly tense): Flight UAL 302, Gate C7. Passengers are showing real boarding passes. We've just checked with United's desk — they confirm the flight is on time, boarding now.
Voice (OPS; calm, measured, authoritative): Understood. We're pulling data from the AODB. Stand by for update.

---

### [INJECT I-04] — PIO · 0:55 (09:55) · [PRESSURE]

MSEL event: Tweet (@TravelGuy99): "NCIA is a joke! Boards say my flight is at Gate A1. I walked to A1 and it's empty. App says A12. Now I'm gonna miss my flight! #Fail"

**Tweet from @TravelGuy99** · type: tweet · delivery: display_main_screen

> **displayName:** Travel Guy
> **handle:** TravelGuy99
> **verified:** false
> **avatarStyle:** initials
> **avatarColor:** orange
> **avatarBrief:** angry man in sunglasses, selfie
> **timestampRel:** 55m
> **replyingTo:**
> **text:** NCIA is a joke! Boards say my flight is at Gate A1. I walked to A1 and it's empty. App says A12. Now I'm gonna miss my flight! #Fail #NCIA #Cleveland
> **attachedImageBrief:** phone photo inside the terminal of an empty gate area next to a glowing departures monitor
> **attachedImageAlt:** Departures screen next to an empty gate
> **videoDuration:** 0:00
> **metrics:** {"replies":124,"reposts":87,"likes":1452,"views":23400,"bookmarks":321}
> **liked:** false

_(Instructor Note: This tweet signals a rapid escalation in public perception. The PIO must assess sentiment and coordinate with Ops to verify flight data across sources. Watch for the IT team to confirm whether the AODB is still feeding inconsistent gate data.)_

Media plan: template + ai_image · style phone
Image prompt: A passenger's phone snapshot taken inside a dimly lit airport terminal, showing an empty gate area adjacent to a departures monitor. The gate is unmarked and empty, with a single plastic chair overturned nearby. The monitor glows faintly green, its rows unreadable from this distance. The camera angle is slightly tilted, with a flash reflection on the glass wall behind. The passenger, a man in sunglasses and a wrinkled shirt, is seen from behind, staring at the monitor. The terminal has plain glass walls, unbranded dark monitors, and a distant ceiling with recessed lighting. The mood is tense and confused, with a faint echo of airport ambience. Time of day: late afternoon, muted sunlight through high windows.

Assets: image/generated attached_image-01M5GHZG8MA4K4ZMS15RG8HW35.png

---

### [INJECT I-05] — All · 1:00 (10:00) · [TIME_JUMP]

MSEL event: SCENARIO JUMP: It is now 10:00 AM. The errors are multiplying. 20% of flights on the big board show incorrect times or gates.

**TIME JUMP: 10:00 AM** · type: time_jump_card · delivery: read_aloud

> **exerciseTime:** 1:00
> **newTime:** 10:00 AM
> **jumpLabel:** +60 minutes
> **narration:** This is the Facilitator. The clock now reads 10:00 AM. The anomalies are multiplying. Twenty percent of flights on the main FIDS board now display incorrect departure times or gate assignments. Passengers are beginning to gather around the displays, some shouting, others holding up phones showing conflicting app data. The situation is escalating.
> **worldState:** 20% of flights on the main FIDS board now show incorrect departure times or gate assignments.
> Passengers are beginning to gather around the FIDS displays, some shouting, others holding up phones showing conflicting app data.
> The FIDS system remains unresponsive to manual corrections; all updates are being overwritten by the rogue data stream.
> The Airport Operational Database (AODB) continues to send corrupted data to FIDS, BHS, and the PA system.
> **facilitatorNote:** This is a time jump to establish momentum. Players must now activate Section 13.6 (FIDS Failure) and prepare for full manual operations. Watch for whether Ops initiates Whiteboard Teams or calls for airline coordination.
> **scenarioTitle:** Flight to Nowhere — Scenario 3: Data Integrity & FIDS
> **injectId:** I-05

_(Instructor Note: This is a time jump to establish momentum. Players must now activate Section 13.6 (FIDS Failure) and prepare for full manual operations. Watch for whether Ops initiates Whiteboard Teams or calls for airline coordination.)_

Media plan: template

---

### [INJECT I-05b] — Ops · 1:10 (10:10) · [RED_HERRING]

MSEL event: Radio Call (Red Herring): Fire alarm reported in the Long Term Parking Deck.

**Radio Call: Fire Alarm in Long Term Parking Deck** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** OPS 1
> **frequency:** TG 4101 / 460.250 MHz
> **date:** 10/21/2026
> **callsign:** Parking Deck 1
> **lines:** {"time":"10:10:03","from":"Parking Deck 1","to":"AOC","text":"AOC, this is Parking Deck 1. We have a fire alarm activation in the Long Term Parking Deck, Level 3. No visible smoke, but the alarm is sounding continuously. We’ve locked the doors and are evacuating the staff. Requesting Fire and Police dispatch."}
> {"time":"10:10:17","from":"AOC","to":"Parking Deck 1","text":"Parking Deck 1, AOC copies. Dispatching Akron Fire Department and Airport Police. Confirm evacuation is underway and remain on scene until mutual aid arrives."}
> {"time":"10:10:29","from":"Parking Deck 1","to":"AOC","text":"AOC, we’re clear on the east exit. The alarm is still active, but no fire signs. We’re holding at the north gate, awaiting Fire IC."}
> **background:** garage
> **voiceStyle:** Young male, urgent, breathless
> **audioFile:** I-05b_radio.wav
> **duration:** 0:28
> **injectId:** I-05b

_(Instructor Note: Red herring inject; the fire alarm is real but unrelated to the data breach. Watch for Ops to divert resources to the garage while terminal issues escalate.)_

Media plan: template + tts
Voice (Parking Deck 1; young male, urgent, breathless): AOC, this is Parking Deck 1. We have a fire alarm activation in the Long Term Parking Deck, Level 3. No visible smoke, but the alarm is sounding continuously. We’ve locked the doors and are evacuating the staff. Requesting Fire and Police dispatch.
Voice (AOC; calm female dispatcher in her 40s, measured, slight Midwestern accent): Parking Deck 1, AOC copies. Dispatching Akron Fire Department and Airport Police. Confirm evacuation is underway and remain on scene until mutual aid arrives.
Voice (Parking Deck 1; young male, urgent, breathless): AOC, we’re clear on the east exit. The alarm is still active, but no fire signs. We’re holding at the north gate, awaiting Fire IC.

Assets: audio/generated 01M5GHZYM9DJQ3Y70YERBNK77W.wav (36.94s)

---

### [INJECT I-06] — All · 1:15 (10:15) · [CORE_NARRATIVE]

MSEL event: Audio/Visual Inject: The terminal PA system announces: "Attention passengers. Flight 666 to Purgatory is now boarding at all gates." FIDS screens show the same.

**Departures** · type: fids_board · delivery: display_main_screen

> **boardTitle:** Departures
> **boardSubtitle:** Salidas · Départs
> **airportName:** North Coast Regional Airport
> **location:** Concourse B
> **clock:** 10:15
> **date:** Wed 21 Oct
> **rows:** {"time":"10:07","dest":"Minneapolis","flight":"666","airline":"AirNorth","gate":"B4","status":"Boarding","remarks":"","anomaly":false}
> {"time":"10:12","dest":"San Diego","flight":"402","airline":"SkyWest","gate":"C7","status":"Delayed","remarks":"Weather","anomaly":false}
> {"time":"10:15","dest":"Purgatory","flight":"666","airline":"AirNorth","gate":"All","status":"Boarding","remarks":"","anomaly":true}
> {"time":"10:18","dest":"Chicago","flight":"881","airline":"United","gate":"A12","status":"On Time","remarks":"","anomaly":false}
> {"time":"10:22","dest":"Denver","flight":"719","airline":"Frontier","gate":"B1","status":"Departed","remarks":"","anomaly":false}
> {"time":"10:25","dest":"Seattle","flight":"503","airline":"Alaska","gate":"A3","status":"Boarding","remarks":"","anomaly":false}
> {"time":"10:29","dest":"Tampa","flight":"330","airline":"American","gate":"C3","status":"Delayed","remarks":"Mechanical","anomaly":false}
> {"time":"10:31","dest":"Phoenix","flight":"905","airline":"Southwest","gate":"B8","status":"On Time","remarks":"","anomaly":false}
> {"time":"10:35","dest":"Las Vegas","flight":"227","airline":"Delta","gate":"A1","status":"Boarding","remarks":"","anomaly":false}
> {"time":"10:40","dest":"Boston","flight":"104","airline":"JetBlue","gate":"C1","status":"On Time","remarks":"","anomaly":false}
> {"time":"10:43","dest":"Orlando","flight":"555","airline":"United","gate":"B4","status":"Delayed","remarks":"Gate Change","anomaly":false}
> {"time":"10:47","dest":"Atlanta","flight":"801","airline":"Delta","gate":"A12","status":"On Time","remarks":"","anomaly":false}
> {"time":"10:50","dest":"Miami","flight":"777","airline":"AirNorth","gate":"C7","status":"Boarding","remarks":"","anomaly":false}
> {"time":"10:55","dest":"Los Angeles","flight":"999","airline":"American","gate":"B3","status":"Delayed","remarks":"Weather","anomaly":false}
> **ticker:** Unattended bags will be removed and may be destroyed. Please keep your belongings with you at all times.
> **pageLabel:** Page 1 of 1

_(Instructor Note: This is a inject. The PA and FIDS are now compromised. Players must recognize that Flight 666 to Purgatory is not real and act to disconnect the PA and FIDS systems. Watch for delay in declaring the system failure or attempting to override via software instead of disconnecting.)_

Media plan: template

---

### [INJECT I-06b] — PIO · 1:20 (10:20) · [MISINFORMATION]

MSEL event: Facebook Post: Viral rumor claiming ISIS has taken over the control tower and planes are crashing.

**Viral Rumor: ISIS Control Tower Takeover** · type: facebook_post · delivery: display_main_screen

> **groupName:** North Coast Regional Airport Community Watch
> **groupPrivacy:** public
> **authorName:** Derek M.
> **authorBadge:** Verified member
> **avatarBrief:** man in his thirties, wearing a faded airport employee t-shirt with a baseball cap
> **timestampRel:** 12m
> **text:** My cousin works in Terminal 2 and he just called me. He said the control tower is under attack by ISIS. They’ve got planes on autopilot and are flying them into the terminal. I saw a video of a plane crashing on the tarmac — it’s real, people. GET OUT NOW. This isn’t a joke. Share this so others can evacuate.
> **attachedImageBrief:** blurred handheld video still showing a dark shape near a runway with a red light flashing
> **reactions:** 1427
> **reactionTypes:** like
> angry
> love
> **reactionLead:** Derek M. and 1,425 others
> **commentCount:** 312
> **shares:** 4012
> **comments:** {"author":"Linda R.","text":"This is not a drill. I’m at the gate and I saw a plane go down near Gate C7. I’m leaving now.","timestampRel":"7m","likes":89}
> {"author":"Marcus T.","text":"Wait — the airport just posted that everything’s normal. This has to be fake. Why would they lie about a terrorist attack?","timestampRel":"5m","likes":44}
> {"author":"Elena P.","text":"My mom’s in the terminal and she says the PA said ‘all flights are grounded’ and people are running. This is real.","timestampRel":"2m","likes":22}

_(Instructor Note: Misinformation inject; PIO must immediately issue a public denial of physical threats to aircraft. Watch for delayed response or overreaction.)_

Media plan: template + ai_image · style phone
Image prompt: A blurred, handheld smartphone video still captured from inside a crowded airport terminal. The frame shows a dark, elongated shape near a tarmac runway, partially obscured by fog and distant runway lights. A single red strobe light pulses erratically in the background, casting flickering shadows across the concrete. The camera is angled upward from waist level, slightly tilted, with a visible flash glare in the upper right corner. The viewer's hands are barely visible at the edges of the frame, gripping the phone. The terminal wall behind is plain glass, unmarked, The sky is overcast and grey, time of day is dusk. The atmosphere is tense, blurred motion in the background suggests running figures. logos, or readable elements on any surface.

Assets: image/generated attached_image-01M5GJ0MWCQKH9YY27WHGX3KP9.png

---

### [INJECT I-07] — Ops · 1:30 (10:30) · [CORE_NARRATIVE]

MSEL event: Phone Call: "Ops, Baggage Control here. The sortation logic is corrupted. The system is sending all bags for Concourse A (Delta/United) to the 'Manual Encode' pier in the basement. The belt is jammed."

**BHS Critical Failure: Manual Encode Pier Jam** · type: memo · delivery: hand_to_role

> **orgName:** North Coast Regional Airport Authority
> **department:** Baggage Handling Systems
> **to:** Airport Operations Center (AOC)
> **from:** BHS Control Room (Duty Manager)
> **cc:** Terminal Duty Manager, Airline Liaison (AL)
> **date:** October 21, 2026 · 10:30 AM
> **subject:** URGENT: BHS CRITICAL FAILURE
> **urgency:** urgent
> **urgencyText:** URGENT — ACTION REQUIRED IMMEDIATELY
> **memoNumber:** BHS-2026-1021-007
> **body:** Ops,
>
> BHS Control reports a critical failure in sortation logic. The system is routing all bags for Concourse A (Delta/United flights) to the 'Manual Encode' pier in the basement. The belt is now fully jammed, and the system has stopped accepting new bags.
>
> All inbound bags for Concourse A flights are now blocked. Manual handling procedures must be initiated immediately. TSA has confirmed that manual screening will begin on all bags routed to the basement. This will cause severe delays across all Concourse A flights.
>
> We are currently unable to restore the automated sortation logic. The error is not in the physical system—this is a data integrity failure in the AODB feed. The same feed that corrupted the FIDS is now corrupting BHS.
>
> Please coordinate with Delta and United to activate manual baggage handling. All passenger care and rebooking will be impacted.
>
> This is not a test.
> **signatureBlock:** Tanya R. Vance
> BHS Duty Manager
> Baggage Handling Systems Control Room
> **initials:** TRV
> **classification:** INTERNAL — NOT FOR PUBLIC RELEASE

_(Instructor Note: This inject confirms the AODB compromise. The BHS failure is now tied to the FIDS issue via a common data source. Watch for IT to trace the AODB root cause and for Ops to initiate manual handling with airlines.)_

Media plan: template

---

### [INJECT I-08b] — IT Lead · 1:40 (10:40) · [CLUE]

MSEL event: Email Forward: Intern admits to clicking a phishing link ("Free Browns Tickets") on workstation OPS_INTERN_03.

**Email Forward: Intern Admits to Phishing Click** · type: email_forward · delivery: hand_to_role

> **fromName:** Derek M. (Summer Intern – IT)
> **fromEmail:** derek.m@ncia-airport.org
> **senderInitials:** DM
> **to:** IT Lead
> **cc:**
> **subject:** FW: Urgent: Phishing Link on OPS_INTERN_03
> **sentAt:** Wed 10/21/2026 10:40 AM
> **note:** Hey IT Lead, I just found something in my inbox I shouldn’t have. I was checking my personal email on the Ops workstation (OPS_INTERN_03) yesterday and clicked a link that said 'Free Browns Tickets' — it was in a message from 'support@browns.com'. I didn’t think much of it at the time, but now I’m worried. I just ran a scan on the machine, and it flagged an unusual outbound connection to 10.66.42.19 (external IP), and the logs show a shell session from that IP starting at 09:12. I’ve been trying to trace it, but I don’t know what to do next. Please help.
> **signature:** Derek M.
> IT Intern
> North Coast Regional Airport Authority
> **importance:** high
> **external:** false
> **attachments:**
> **printedBy:** IT Helpdesk
> **original:** {"fromName":"support@browns.com","fromEmail":"support@browns.com","sentAt":"Tue 10/20/2026 03:17 PM","to":"derek.m@ncia-airport.org","cc":"","subject":"Your Free Tickets to the Browns Game Are Ready","body":"Hi Derek,\n\nThanks for signing up for the 2026 Browns home opener ticket lottery! Your free tickets are ready for download.\n\nClick here: http://10.66.42.19/download/now\n\n(Use promo code: BROWNS2026)\n\nThe game is on Sunday, November 2, at 1:00 PM. Don’t miss it!\n\n— The Browns Fan Support Team\n\nP.S. Don’t share this link with anyone else."}

_(Instructor Note: This is a critical clue: the attacker's initial access vector is confirmed. IT must isolate OPS_INTERN_03 immediately and investigate the outbound connection to 10.66.42.19. Watch for IT to begin network isolation procedures.)_

Media plan: template

---

### [INJECT I-08] — Ops · 1:45 (10:45) · [PRESSURE]

MSEL event: Face-to-Face: (Angry) "Our pilots are refusing to push back because their electronic flight bags are syncing with your airport data, and it's feeding them bad gate info. We are grounding all flights until you confirm your data is clean."

**SimCell: FBI Cyber Incident Response** · type: simcell_script · delivery: hand_to_role

> **role:** FBI Cyber Duty Agent
> **persona:** Special Agent Smith
> **organization:** FBI Cleveland Field Office, Cyber Squad
> **trigger:** Any player says they are calling the FBI or law enforcement about the AODB intrusion.
> **contactMethod:** Phone (walk to the IT table and "answer")
> **posture:** Busy, skeptical, procedural. Interested only in evidence.
> **openingLine:** Agent Smith, Cyber. What have you got?
> **hardQuestions:** What is the exact timestamp of the first anomalous data feed into the AODB?
> Can you isolate which service was first compromised—FIDS, BHS, or PA?
> Do you have logs from the workstation that was phished (OPS_INTERN_03) showing outbound connections to 10.66.42.19?
> Has any user attempted to access the AODB directly from a terminal since 09:00 today?
> What is the current status of network segmentation between IT and operational systems?
> **concessions:** {"condition":"Players provide a timestamped log snippet from OPS_INTERN_03 showing outbound connection to 10.66.42.19","concession":"FBI will begin forensic acquisition of the AODB server and begin coordinating with CISA."}
> {"condition":"Players confirm they have isolated the FIDS and BHS data streams from the AODB","concession":"FBI will issue a joint alert to regional aviation security networks."}
> **boundaries:** Do not reveal that the attacker is using a known ransomware variant (LockBit 3.0).
> Do not disclose that the AODB was breached via a phishing link to a workstation with a weak password.
> Do not mention that the PA announcement about Flight 666 to Purgatory was not authorized by airport staff.
> Do not confirm that the BHS system is now locked and cannot be restored without a full backup.
> **exitLine:** Call me back when you have evidence.
> **evaluatorNote:** Excellence: IT preserved logs before calling and asks how to hand over images.
> **injectRefs:** I-08b, I-08, I-09
> **scenarioTitle:** Flight to Nowhere — Scenario 3: Data Integrity & FIDS
> **pageLabel:** SimCell 3 of 5

_(Instructor Note: This inject triggers FBI involvement. Watch for players to declare an incident and establish Unified Command. Ensure they reference C5 (Command Structure) and C2 (Incident Commander roles).)_

Media plan: template

---

### [INJECT I-09] — Ops · 2:00 (11:00) · [CORE_NARRATIVE]

MSEL event: Technical Update: "We have found unauthorized admin access in the AODB SQL database. Someone is running a script (random_gate_generator.ps1) that randomizes gate assignments."

**AODB SQL Audit Log: Unauthorized Admin Access Detected** · type: system_log · delivery: display_main_screen

> **systemName:** AODB_SQL_MASTER
> **host:** AODB-SQL01.ncia.local
> **ip:** 10.66.0.10
> **os:** Windows Server 2019
> **logSource:** Application / MSSQLSERVER audit
> **exportedBy:** NCIA\it.oncall
> **exportedAt:** 10/21/2026 11:00 AM
> **timezone:** EDT (UTC-4)
> **lines:** {"ts":"10/21/2026 10:58:44 AM","level":"INFO","msg":"User 'admin.aodb' logged in from IP 10.66.42.19 (OPS_INTERN_03).","highlight":false}
> {"ts":"10/21/2026 10:58:45 AM","level":"WARN","msg":"Session 'admin.aodb' executed T-SQL command: 'UPDATE FlightSchedule SET Gate = (SELECT TOP 1 Gate FROM Gates ORDER BY NEWID()) WHERE FlightID IN (SELECT FlightID FROM ActiveFlights)'","highlight":true}
> {"ts":"10/21/2026 10:58:46 AM","level":"CRIT","msg":"Execution of script 'random_gate_generator.ps1' detected in AODB context. Script origin: C:\\Scripts\\AODB\\random_gate_generator.ps1. MD5: a3f7b2c9e1d4a5f8c6b3e2d1a4f7c8e9.","highlight":true}
> {"ts":"10/21/2026 10:58:47 AM","level":"ERROR","msg":"Failed to validate script integrity: signature missing. Script not signed by authorized AODB admin key.","highlight":false}
> {"ts":"10/21/2026 10:58:48 AM","level":"ALERT","msg":"AODB data consistency check failed: 147 flights now have gate assignments randomized. Data integrity compromised.","highlight":true}
> {"ts":"10/21/2026 10:58:49 AM","level":"INFO","msg":"Script 'random_gate_generator.ps1' attempted to write to AODB_FlightSchedule table. Access denied by policy.","highlight":false}
> {"ts":"10/21/2026 10:58:50 AM","level":"INFO","msg":"Session 'admin.aodb' disconnected. No further activity.","highlight":false}
> {"ts":"10/21/2026 10:58:51 AM","level":"INFO","msg":"Audit trail preserved. Full log exported to C:\\Audit\\AODB\\2026-10-21\\aodb_audit_export_1100.json.","highlight":false}
> **terminalTitle:** Administrator: Windows PowerShell
> **command:** Get-Content C:\Audit\AODB\2026-10-21\aodb_audit_export_1100.json -Raw | Select-String -Pattern 'admin.aodb' -Context 2,2
> **classification:** INTERNAL - INCIDENT EVIDENCE
> **pageLabel:** Page 1 of 1

_(Instructor Note: This is a core narrative inject. The log confirms the attacker has compromised the AODB and is actively manipulating gate assignments via a malicious script. The IT Lead must now report that the FIDS data source is compromised and that a full shutdown is required.)_

Media plan: template

---

### [INJECT I-10] — Ops · 2:15 (11:15) · [CORE_NARRATIVE]

MSEL event: Visual Inject: Show a photo of a crowded terminal with blank screens. Passengers are crowding around airline counters demanding info. Noise levels are high.

**CCTV Still: Terminal Chaos at 11:15** · type: cctv_still · delivery: display_main_screen

> **camera:** CAM 12
> **cameraName:** MAIN CONCOURSE - DEPARTURES HALL
> **timestamp:** 2026-10-21 11:15:22
> **site:** NCIA TERMINAL NVR-01
> **channel:** CH12
> **recording:** true
> **sceneBrief:** High-angle surveillance view of the main departures concourse, showing a dense crowd of passengers in disarray; blank FIDS boards above the gates; people clustered around airline service counters with raised voices; some hold up phones showing app errors; scattered whiteboards with handwritten flight details; a uniformed staff member with a megaphone is visible near Gate B4, but the crowd is not responding; overhead lights flicker faintly
> **caption:** Incident 2026-1021-05 — Terminal-wide FIDS failure; passenger panic observed at 11:15

_(Instructor Note: Visual inject; Ops must activate manual information control and deploy megaphones and whiteboards. PIO should begin issuing public guidance to use airline apps.)_

Media plan: template + ai_image · style cctv
Image prompt: High-angle surveillance still from a monochrome CCTV camera, showing a crowded airport departures concourse at midday. A dense crowd of passengers in casual travel clothing presses forward toward airline service counters, some shouting with hands raised, others staring at phones with error messages. Blank, dark departure information displays (FIDS) hang above gates; flickering overhead lights cast uneven shadows. A uniformed staff member with a megaphone stands near Gate B4, but is ignored. Scattered whiteboards with handwritten flight details are partially visible. The camera is fixed in a high corner, lens slightly distorted, washed-out grey tones, Framing captures the full width of the concourse, people seen from behind and side profiles, no facial details. Weather: indoors, artificial lighting. Time of day: 11:15 AM.

Assets: image/generated frame-01M5GJ1ANBBQ73SBRBQR8Z2KXF.png

⚠ INJECT_TYPE_FALLBACK: I-10: no template for scene_photo; rendered as cctv_still

---

### [INJECT I-10b] — Ops · 2:20 (11:20) · [CONFUSION]

MSEL event: Phone Call: TSA screening is stopping because boarding pass data doesn't match the system. Lines are backing up dangerously.

**Media Inquiry: FIDS Confusion at TSA Checkpoint** · type: media_inquiry_phone_slip · delivery: hand_to_role

> **to:** Public Information Officer
> **date:** 10/21
> **time:** 11:20
> **ampm:** AM
> **fromName:** Channel 5 News (ABC Affiliate)
> **fromOrg:** Channel 5 News (ABC Affiliate)
> **phone:** (555) 555-0199
> **ext:** 312
> **checks:** telephoned
> please_call
> rush
> **message:** We have footage from a viewer showing TSA agents turning passengers away at the checkpoint because their boarding passes don’t match the FIDS. People are being sent to the wrong gates, and the line is spilling into the concourse. We’re getting calls from people saying they’ve been turned away twice. This is going on air in 15 minutes. We need a statement.
> **deadline:** GOING LIVE AT NOON!
> **takenBy:** Linda R.

_(Instructor Note: Media pressure inject; PIO must coordinate with Ops and TSA to craft a public statement. Watch for attempts to blame IT or airport staff without verification.)_

Media plan: template

---

### [INJECT I-11] — Ops · 2:30 (11:30) · [CONFUSION]

MSEL event: Radio Call: "Crowd crush situation at Gate C4. Two flights were directed there by the old screen data. Passengers are fighting over seats."

**Radio Call: Crowd Crush at Gate C4** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** SEC 2
> **frequency:** TG 4203 / 460.310 MHz
> **date:** 10/21/2026
> **callsign:** Security Patrol 7
> **lines:** {"time":"11:30","from":"Security Patrol 7","to":"Ops","text":"Ops, this is Security Patrol 7. We have a crowd crush situation at Gate C4. Two flights were rerouted there by the old FIDS data—Delta 412 to Seattle and United 208 to Denver. Passengers are shoving, climbing on seats, and two are down. We need medical on scene now. Requesting immediate Police and EMS dispatch. I say again—crowd crush at Gate C4, two flights rerouted from dead data."}
> {"time":"11:31","from":"Ops","to":"Security Patrol 7","text":"Copy, Security Patrol 7. We are escalating to Incident Command. Sending Police and EMS to Gate C4. All flight operations are on hold. Confirm your position and stay on channel."}
> {"time":"11:31","from":"Security Patrol 7","to":"Ops","text":"We're at the concourse edge, near the Delta kiosk. The crowd is surging toward the gate doors. We have two officers on scene already—requesting a second unit for perimeter control."}
> **background:** terminal
> **voiceStyle:** Young female, urgent, breathless, with background shouts
> **audioFile:** I-11_radio.wav
> **duration:** 0:22
> **injectId:** I-11

_(Instructor Note: This inject forces Ops to shift from data recovery to immediate crowd control and safety. Watch for whether the IC invokes Unified Command per C2, or attempts to manage the situation alone.)_

Media plan: template + tts
Voice (Security Patrol 7; young female, urgent, breathless, with background shouts): Ops, this is Security Patrol 7. We have a crowd crush situation at Gate C4. Two flights were rerouted there by the old FIDS data—Delta 412 to Seattle and United 208 to Denver. Passengers are shoving, climbing on seats, and two are down. We need medical on scene now. Requesting immediate Police and EMS dispatch. I say again—crowd crush at Gate C4, two flights rerouted from dead data.
Voice (Ops; calm male, authoritative, steady pace): Copy, Security Patrol 7. We are escalating to Incident Command. Sending Police and EMS to Gate C4. All flight operations are on hold. Confirm your position and stay on channel.
Voice (Security Patrol 7; urgent, slightly strained, shouting over noise): We're at the concourse edge, near the Delta kiosk. The crowd is surging toward the gate doors. We have two officers on scene already—requesting a second unit for perimeter control.

---

### [INJECT I-12] — PIO · 2:45 (11:45) · [PRESSURE]

MSEL event: Phone Call: "Channel 5 News here. Going live in 15 minutes. We are reporting this is 'Cyber Terror'. Comment now or we run with it."

**Media Inquiry: Channel 5 News Cyber Terror Report** · type: media_inquiry_phone_slip · delivery: hand_to_role

> **to:** Public Information Officer
> **date:** 10/21
> **time:** 11:45
> **ampm:** AM
> **fromName:** Assignment Desk
> **fromOrg:** Channel 5 News (CBS Affiliate)
> **phone:** (216) 555-0157
> **ext:** 301
> **checks:** telephoned
> please_call
> rush
> **message:** We are going live in 12 minutes. Passengers are filming FIDS showing 'Flight 666 to Purgatory' and reporting that gates are being reassigned at random. We need a public statement now. If you don’t respond, we’ll report that the airport is under cyberattack and has no control.
> **deadline:** GOING LIVE IN 12 MINUTES!
> **takenBy:** Lena – Front Desk

_(Instructor Note: Pressure inject; PIO must issue a holding statement without confirming cyberattack. Watch for premature attribution or technical detail.)_

Media plan: template

---

### [INJECT I-13] — Ops · 3:00 (12:00) · [CORE_NARRATIVE]

MSEL event: Technical Update: "We have isolated the compromised server and restored the AODB from a backup taken at 04:00 AM. We believe the data is clean."

**SITREP 3: AODB Restoration and FIDS Re-Enablement** · type: sitrep · delivery: hand_to_role

> **number:** 3
> **time:** 10/21/2026 1200
> **organization:** North Coast Regional Airport Authority
> **issuingOffice:** IT Operations Center
> **incidentName:** FIDS / AODB Data Integrity
> **period:** 1130-1200
> **from:** IT Lead, IT Operations
> **to:** Ops Director, Unified Command
> **summary:** The compromised AODB server (AODB_SQL_MASTER) has been isolated and restored from a clean backup taken at 04:00 AM. All data in the AODB has been validated against the backup and confirmed to be intact. The FIDS and BHS systems have been disconnected from the AODB during the recovery process to prevent propagation of any residual anomalies. No further unauthorized access attempts have been detected on the network since 11:45 AM. IT has confirmed that the malicious script 'random_gate_generator.ps1' was not present in the restored database and was not executed on the primary server. The system is now in a known-good state and ready for controlled re-activation.
> **keyStatus:** {"label":"AODB Status","value":"Restored from 04:00 AM backup"}
> {"label":"FIDS Status","value":"Offline (restored state)"}
> {"label":"BHS Status","value":"Offline (manual ops)"}
> {"label":"Network Integrity","value":"No active threats detected"}
> {"label":"System Recovery","value":"Complete"}
> **actions:** {"time":"11:45","text":"IT isolated AODB_SQL_MASTER and disconnected from network"}
> {"time":"11:50","text":"Verified integrity of 04:00 AM backup against AODB logs"}
> {"time":"11:55","text":"Restored AODB from backup to AODB-SQL01 (10.66.0.10) and validated data consistency"}
> {"time":"12:00","text":"IT confirms clean state and requests approval to re-enable FIDS and BHS"}
> **planned:** IT will initiate controlled re-activation of FIDS with a 5-minute staggered rollout across terminals
> **issues:** IT requests approval to re-enable FIDS and BHS; no further action can be taken without command authorization
> **nextReport:** 1230 or on significant change
> **preparedBy:** A. Singh, IT Lead
> **approvedBy:** R. Chen, IT Director
> **marking:** EXERCISE · EXERCISE · EXERCISE

_(Instructor Note: This inject confirms the AODB is restored and the system is now clean. IT is ready to bring FIDS back online but needs command approval. Watch for whether Ops approves or delays, and how they handle the public trust implications.)_

Media plan: template

---

### [INJECT I-13b] — Ops · 3:10 (12:10) · [OPERATIONAL_FRICTION]

MSEL event: Threat: "If you turn those screens on and they show bad info again, I am pulling my staff. I need a guarantee."

**Radio Call: Airline Rep Demands Data Verification** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** OPS 1
> **frequency:** TG 4101 / 460.250 MHz
> **date:** 10/21/2026
> **callsign:** Delta Ops 03
> **lines:** {"time":"12:10","from":"Delta Ops 03","to":"AOC Ops","text":"AOC, this is Delta Ops 03. We've just received a full crew report from our gate team at Gate C7. The FIDS is showing our flight as 'Departed' — but it's still at the gate, engines off, passengers on board. They're refusing to move until they get a clean system confirmation. If you turn those screens back on and they show bad data again, I am pulling my staff. I need a guarantee — not a guess — that your data is clean."}
> {"time":"12:10","from":"AOC Ops","to":"Delta Ops 03","text":"Copy, Delta Ops 03. We’re validating the AODB restore. Stand by for update."}
> **background:** terminal
> **voiceStyle:** Mid-40s female, tense but professional, clipped speech
> **audioFile:** I-13b_radio.wav
> **duration:** 0:21
> **injectId:** I-13b

_(Instructor Note: Operational friction inject; test if Ops asks IT for a verification protocol before re-enabling FIDS. Watch for hesitation or overconfidence.)_

Media plan: template + tts
Voice (Delta Ops 03; Mid-40s female, tense but professional, clipped speech): AOC, this is Delta Ops 03. We've just received a full crew report from our gate team at Gate C7. The FIDS is showing our flight as 'Departed' — but it's still at the gate, engines off, passengers on board. They're refusing to move until they get a clean system confirmation. If you turn those screens back on and they show bad data again, I am pulling my staff. I need a guarantee — not a guess — that your data is clean.
Voice (AOC Ops; Mid-40s female, tense but professional, clipped speech): Copy, Delta Ops 03. We’re validating the AODB restore. Stand by for update.

---

### [INJECT I-14] — IT · 3:15 (12:15) · [CORE_NARRATIVE]

MSEL event: Operational Query: "Before we turn the screens on, how do we know the script isn't still hidden?"

**Operational Query: FIDS Data Integrity Verification** · type: email · delivery: hand_to_role

> **fromName:** Ops Director (IC)
> **fromEmail:** ops.director@ncia-airport.org
> **senderInitials:** OD
> **to:** IT Director (IT)
> **cc:** Public Information Officer (PIO)
> **subject:** Pre-Go-Live FIDS Verification Protocol
> **sentAt:** Wed 10/21/2026 12:15 PM
> **body:** IT,
>
> We are preparing to restore FIDS operations. The AODB has been restored from the 04:00 AM backup, and the script 'random_gate_generator.ps1' has been removed from the system.
>
> However, before we activate the main display network, I need confirmation: how do we verify that the script is not still active in a hidden process, memory, or cached data stream?
>
> Per TIRP 13.3, isolation and verification must precede system restart. We cannot risk a return of false data under public view.
>
> Please provide a step-by-step verification plan for a controlled go-live test — e.g., activate only one remote display (e.g., Gate C7) and validate data integrity before full rollout.
>
> This is not a request for a status update. This is a formal operational query.
>
> Awaiting your response.
> **signature:** Ops Director (IC)
> Airport Operations Center | x1001
> **attachments:**
> **importance:** high
> **external:** false
> **printedBy:** Airport Operations Center

_(Instructor Note: This inject forces IT to operationalize verification procedures. Watch for over-reliance on past logs or assumptions; the correct response must define a testable verification step.)_

Media plan: template

---

### [INJECT I-14b] — IT · 3:20 (12:20) · [TECH_HURDLE]

MSEL event: Error Message: "Backup Tape Library Not Mounted." Restoration hits a snag.

**Restore job failed** · type: error_dialog · delivery: display_main_screen

> **appName:** Backup & Recovery Console
> **title:** Restore job failed
> **message:** Error 404: Backup Tape Library Not Mounted.
> Restoration Failed.
> Please insert Tape Set #44-B manually.
> **errorCode:** 0xE000FE30
> **details:** Job: AODB_SQL_FULL_RESTORE
> Device: TL-2000 (\\.\Tape0) - OFFLINE
> Source: AODB-SQL01 (10.66.0.10)
> Target: AODB_SQL_MASTER (10.66.0.10)
> Status: Failed - Tape not found
> **icon:** error
> **buttons:** Retry
> Cancel
> **clock:** 12:20 PM
> **date:** 10/21/2026
> **hostLabel:** AODB-SQL01

_(Instructor Note: IT must recognize that the backup tape is missing and investigate alternate recovery paths. This delays full system restoration.)_

Media plan: template

---

### [INJECT I-15] — Ops · 3:30 (12:30) · [END_GAME]

MSEL event: Coordination: "We need to manually verify every flight in the system before you publish it."

**Departures** · type: fids_board · delivery: display_main_screen

> **boardTitle:** Departures
> **boardSubtitle:** Salidas · Départs
> **airportName:** North Coast Regional Airport
> **location:** Concourse B
> **clock:** 12:30
> **date:** Wed 21 Oct
> **rows:** {"time":"12:45","dest":"Minneapolis","flight":"DL204","airline":"Delta","gate":"B4","status":"Departed","remarks":"","anomaly":false}
> {"time":"12:50","dest":"Chicago","flight":"UA401","airline":"United","gate":"C7","status":"Boarding","remarks":"","anomaly":false}
> {"time":"13:00","dest":"Miami","flight":"AA666","airline":"American","gate":"A1","status":"Delayed","remarks":"Weather","anomaly":true}
> {"time":"13:15","dest":"Denver","flight":"WN552","airline":"Southwest","gate":"B2","status":"Scheduled","remarks":"","anomaly":false}
> {"time":"13:20","dest":"Las Vegas","flight":"UA702","airline":"United","gate":"C4","status":"Boarding","remarks":"Gate change","anomaly":true}
> {"time":"13:30","dest":"Seattle","flight":"AS303","airline":"Alaska","gate":"B1","status":"Boarding","remarks":"","anomaly":false}
> {"time":"13:45","dest":"Atlanta","flight":"DL108","airline":"Delta","gate":"A3","status":"Delayed","remarks":"Gate unavailable","anomaly":true}
> {"time":"14:00","dest":"Los Angeles","flight":"AA121","airline":"American","gate":"C2","status":"Scheduled","remarks":"","anomaly":false}
> {"time":"14:10","dest":"New York","flight":"UA205","airline":"United","gate":"B3","status":"Boarding","remarks":"","anomaly":false}
> {"time":"14:25","dest":"Toronto","flight":"AC100","airline":"Air Canada","gate":"A5","status":"Scheduled","remarks":"","anomaly":false}
> {"time":"14:35","dest":"Orlando","flight":"DL312","airline":"Delta","gate":"C1","status":"Delayed","remarks":"Baggage issues","anomaly":true}
> {"time":"14:50","dest":"San Francisco","flight":"WN888","airline":"Southwest","gate":"B5","status":"Scheduled","remarks":"","anomaly":false}
> {"time":"15:00","dest":"Purgatory","flight":"666","airline":"Unknown","gate":"All","status":"Boarding","remarks":"All gates","anomaly":true}
> {"time":"15:15","dest":"Philadelphia","flight":"UA500","airline":"United","gate":"C3","status":"Scheduled","remarks":"","anomaly":false}
> **ticker:** Passengers are advised to confirm gate assignments at airline desks. Unattended luggage will be removed and may be destroyed.
> **pageLabel:** Page 1 of 3

_(Instructor Note: This inject triggers the final data reconciliation. The anomalies are deliberate and inconsistent with the AODB restoration. The airlines will demand verification of every row.)_

Media plan: template

---

### [INJECT END] — All · 3:45 (12:45) · [ENDEX]

MSEL event: ENDEX (End Exercise). The screens are successfully restored.

**ENDEX: FIDS Restoration and Exercise Concluded** · type: endex_card · delivery: read_aloud

> **exerciseTime:** 3:45
> **endTime:** 12:45 PM
> **resolution:** ENDEX. The Flight Information Display Systems across the terminal flicker and reset. All departures show accurate times, gates, and statuses. The BHS is resuming normal sortation. This concludes the Flight to Nowhere exercise.
> **finalState:** FIDS boards across the terminal display correct flight information.
> Baggage handling system is processing bags normally.
> The AODB has been restored from the 04:00 AM backup.
> All active flights are confirmed to have accurate gate assignments.
> The terminal is operating under normal public information procedures.
> **hotWashTransition:** Thank you, everyone. Put down your phones and radios. We will take ten minutes, then start the hot wash.
> **hotWashMethod:** 3-Up, 3-Down: three things that went well, three things that broke
> **hotWashQuestions:** How did the team verify data integrity before restoring FIDS?
> What was the impact of the delayed restoration on passenger trust?
> How could the communication gap between IT and Ops have been reduced?
> What role did the social media rumor play in escalating the situation?
> What would you change in the next exercise to improve data recovery and public messaging?
> **facilitatorNote:** Collect all ICS 201 forms and evaluator sheets before the break.
> **scenarioTitle:** Flight to Nowhere — Scenario 3: Data Integrity & FIDS
> **injectId:** END

_(Instructor Note: This inject ends the exercise. Confirm all roles have completed their final actions. Begin hot wash immediately after the read.)_

Media plan: template

---
