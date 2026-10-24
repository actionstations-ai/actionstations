# Generated Inject Deck

## Flight to Nowhere — Scenario 3: Data Integrity & FIDS

### [INJECT START] — All · 0:00 (09:00) · [STARTEX]

MSEL event: STARTEX (Start Exercise). Current time: 09:00 AM on a busy Thursday. Weather is clear. Passenger load is high due to a holiday weekend.

**STARTEX: Flight to Nowhere — Data Integrity & FIDS** · type: startex_card · delivery: read_aloud

> **startTime:** 09:00 AM
> **day:** Wednesday, October 21, 2026
> **location:** North Coast Regional Airport (NCIA)
> **weather:** Clear, 68°F. Winds calm.
> **load:** High: 18% above average (holiday weekend travel peak)
> **staffing:** Full shifts in Operations, Maintenance, and IT
> **narration:** STARTEX. This is an exercise. It is 09:00 AM on a busy Wednesday at North Coast International Airport. The terminal is bustling with passengers, gates are active, and all systems are nominal. Begin your response to the initial event.
> **status:** {"name":"FIDS","status":"green","note":"All flight displays show accurate departure/arrival times"}
> {"name":"BHS","status":"green","note":"Baggage handling system operational"}
> {"name":"PA System","status":"green","note":"Automated announcements functioning normally"}
> {"name":"IT Core Network","status":"green","note":"All critical servers online and responsive"}
> {"name":"Emergency Shelters","status":"green","note":"Shelters A, B, and C are accessible and equipped"}
> {"name":"Airport Operations Center","status":"green","note":"All roles are staffed and monitoring"}
> {"name":"Public Communication","status":"green","note":"Social media and digital signage updating in real time"}
> **facilitatorNote:** Confirm every table has the player briefing packet and a blank ICS 201 before reading. This is the baseline for the exercise; no external events have occurred yet.
> **scenarioTitle:** Scenario 3: Flight to Nowhere
> **injectId:** START

_(Instructor Note: This is the baseline for the exercise. The players must establish situational awareness and begin coordinating under TIRP Section 13. Watch for early missteps in command structure or failure to reference TIRP.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: START: content still inconsistent after one repair:

---

### [INJECT I-01] — Ops · 0:15 (09:15) · [CORE_NARRATIVE]

MSEL event: Phone Call: "Hey Ops, this is Skyline at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?"

**Phone Call: Gate B4 FIDS Discrepancy** · type: phone_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **systemName:** Airport Communications Center (ACC) - Call Recorder 2
> **callId:** CR-20261021-091522-0041
> **direction:** Inbound
> **caller:** {"name":"Derek Mendoza","number":"(330) 555-1005","label":"Skyline Air - Gate Agent"}
> **callee:** {"name":"Ops Director (IC)","number":"(330) 555-2400","label":"Airport Operations (Duty Manager)"}
> **startTime:** 10/21/2026 09:15:22
> **duration:** 0:43
> **transcript:** {"speaker":"Derek Mendoza","offset":"0:00","text":"Hey Ops, this is Skyline at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?","prompt":false}
> {"speaker":"Ops Director (IC)","offset":"0:12","text":"Got it, Derek. We’ll check the FIDS feed and get back to you. Hold on a sec.","prompt":false}
> {"speaker":"Derek Mendoza","offset":"0:21","text":"Thanks, we’ve got about 30 people already asking. They’re starting to move toward the wrong gate.","prompt":false}
> {"speaker":"Ops Director (IC)","offset":"0:30","text":"Understood. We’ll escalate internally. Stand by.","prompt":false}
> **voiceStyles:** {}
> **injectId:** I-01

_(Instructor Note: This is a core narrative inject; the IT team should log a ticket for a FIDS display error. Watch for overreaction or underreaction to the passenger confusion.)_

Media plan: template + tts
Voice (Derek Mendoza; male, early 30s, calm but urgent, Midwest accent, slightly strained): Hey Ops, this is Skyline at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?
Voice (Ops Director (IC); female, mid-40s, measured, professional, slight regional inflection, composed): Got it, Derek. We’ll check the FIDS feed and get back to you. Hold on a sec.
Voice (Derek Mendoza; male, early 30s, urgent, slight rising pitch): Thanks, we’ve got about 30 people already asking. They’re starting to move toward the wrong gate.
Voice (Ops Director (IC); female, mid-40s, firm, calm, slightly clipped delivery): Understood. We’ll escalate internally. Stand by.

---

### [INJECT I-02a] — IT · 0:20 (09:20) · [NOISE]

MSEL event: Ticket #4492 (Noise): Vending machines in Concourse B are spitting out soda cans randomly.

**Vending Machines in Concourse B Spitting Cans** · type: helpdesk_ticket · delivery: hand_to_role

> **ticketNo:** 4492
> **priority:** Low
> **impact:** Low
> **urgency:** Medium
> **status:** New
> **requester:** Facilities Maintenance – Concourse B
> **requesterContact:** x4471
> **contactType:** Phone
> **category:** Facilities
> **subcategory:** Vending / Concessions
> **location:** Concourse B – Vending Zone B3 (near Gate B4)
> **configurationItem:** VEND-B3-01
> **opened:** 2026-10-21 09:20:00
> **assignmentGroup:** Facilities Maintenance
> **subject:** Vending Machines in Concourse B
> **description:** The vending machines at Concourse B, Zone B3 (near Gate B4), just ejected all their cans at once. Over 20 cans of soda have been expelled onto the floor. There is a small puddle and debris. Maintenance has been dispatched to clean up. Is this a system failure or a cyber incident? The machines are not responding to touch. No error codes displayed.
> **activity:** {"author":"Facilities Maintenance – Concourse B","time":"2026-10-21 09:20:00","kind":"work_note","text":"Ticket opened via phone. Maintenance team en route to clean up. Requesting IT review for potential system anomaly."}
> {"author":"ServiceDesk System","time":"2026-10-21 09:20:00","kind":"system","text":"Ticket created and assigned to Facilities Maintenance."}
> **systemName:** ServiceDesk
> **orgName:** NCIA

_(Instructor Note: Noise inject; IT should triage it down without engaging. Watch for any attempt to investigate the vending machine logic.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-02a: content still inconsistent after one repair:

---

### [INJECT I-02] — IT Lead · 0:30 (09:30) · [CORE_NARRATIVE]

MSEL event: Ticket Update: "We checked the FIDS server. The data stream from the AODB is actually sending 'Miami'. It's not a display error; the source data changed."

**FIDS Data Source Anomaly Detected** · type: helpdesk_ticket · delivery: hand_to_role

> **ticketNo:** 4492
> **priority:** High
> **impact:** High
> **urgency:** High
> **status:** In Progress
> **requester:** IT Helpdesk
> **requesterContact:** x4400
> **contactType:** Monitoring
> **category:** Systems
> **subcategory:** Database / AODB
> **location:** Main Terminal – FIDS Server Room (Level 2, Room 104)
> **configurationItem:** NCIA-AEP-2025-01
> **opened:** 2026-10-21 09:30:17
> **assignmentGroup:** IT Operations – Core Systems
> **assignee:** IT Lead
> **subject:** FIDS Data Source Anomaly: 'Miami' Flight Data Confirmed from AODB
> **description:** We have confirmed the source of the erroneous flight data on Gate B4's FIDS display.
>
> The Airport Operational Database (AODB) is actively sending 'Miami' as the destination for Flight NC-147, which is scheduled for Minneapolis. This is not a display-side issue. The FIDS server is receiving and rendering the correct feed from the AODB.
>
> We ran a packet trace from the FIDS server to the AODB. The data stream from the AODB shows a confirmed change in the destination field to 'Miami'. The change occurred at 09:27:11, and has not been reversed.
>
> We are now checking the AODB audit logs for unauthorized access. This is not a typo or config error. The database is sending malicious data.
>
> Please escalate to IT Director and Ops immediately. This may be a data integrity breach.
> **activity:** {"author":"IT Helpdesk","time":"2026-10-21 09:30:17","kind":"work_note","text":"Ticket updated: Confirmed FIDS data source is AODB. Malicious data injection detected."}
> {"author":"IT Helpdesk","time":"2026-10-21 09:29:55","kind":"system","text":"Ticket created from monitoring alert: AODB data stream to FIDS shows unexpected destination change."}
> {"author":"IT Helpdesk","time":"2026-10-21 09:27:11","kind":"system","text":"AODB record for Flight NC-147 updated: destination changed to 'Miami' (was 'Minneapolis')"}
> **systemName:** ServiceDesk
> **orgName:** NCIA

_(Instructor Note: This inject confirms the data integrity threat. IT must now investigate the AODB logs and report to the IT Director. The threat is now active and hidden, so IT should not yet suspect a cyberattack—assume a rogue update.)_

Media plan: template

---

### [INJECT I-03] — Ops · 0:45 (09:45) · [CORE_NARRATIVE]

MSEL event: Radio Call: "Ops, TSA Checkpoint. We have passengers scanning boarding passes for a HWK Air flight to Chicago, but the FIDS board in the lobby lists that flight as 'Cancelled'. They are arguing with my TSOs."

**TSA: FIDS Flight Cancelled Discrepancy** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** TSA 2
> **frequency:** TG 4203 / 460.310 MHz
> **date:** 10/21/2026
> **callsign:** TSA-Checkpoint-Lobby
> **lines:** {"time":"09:45","from":"TSA-Checkpoint-Lobby","to":"Ops","text":"Ops, this is TSA-Checkpoint-Lobby. We have passengers scanning boarding passes for HWK Air Flight 214 to Chicago, but the FIDS board in the main lobby lists that flight as 'Cancelled'. They're yelling at my TSOs, saying they were told they could board. We've got five people in a standoff near Gate B7. Can you confirm the real status?"}
> {"time":"09:45","from":"Ops","to":"TSA-Checkpoint-Lobby","text":"TSA-Checkpoint-Lobby, we're checking with HWK Air. Hold on, we'll get back to you."}
> **background:** terminal
> **voiceStyle:** Young female, tense, urgent, slightly breathless
> **audioFile:** I-03_radio.wav
> **duration:** 0:22
> **injectId:** I-03

_(Instructor Note: This is a core narrative inject confirming the FIDS data integrity failure. Watch for Ops to contact HWK Air directly instead of relying on the display. The fake cancellation is critical to the deception.)_

Media plan: template + tts
Voice (TSA-Checkpoint-Lobby; young female, tense, urgent, slightly breathless): Ops, this is TSA-Checkpoint-Lobby. We have passengers scanning boarding passes for HWK Air Flight 214 to Chicago, but the FIDS board in the main lobby lists that flight as 'Cancelled'. They're yelling at my TSOs, saying they were told they could board. We've got five people in a standoff near Gate B7. Can you confirm the real status?
Voice (Ops; calm male, mid-40s, steady pace, authoritative): TSA-Checkpoint-Lobby, we're checking with HWK Air. Hold on, we'll get back to you.

⚠ INJECT_CONTENT_ISSUE: I-03: content still inconsistent after one repair:

---

### [INJECT I-04] — PIO · 0:55 (09:55) · [PRESSURE]

MSEL event: Tweet (@TravelGuy99): "NCIA is a joke! Boards say my flight is at Gate A1. I walked to A1 and it's empty. App says A12. Now I'm gonna miss my flight! #Fail"

**Tweet from @TravelGuy99: Gate A1 Empty, App Shows A12** · type: tweet · delivery: display_main_screen

> **displayName:** Travel Guy
> **handle:** TravelGuy99
> **verified:** false
> **avatarStyle:** initials
> **avatarColor:** red
> **avatarBrief:** man in a hurry, wearing a travel jacket, phone in hand, frowning at a departures screen
> **timestampRel:** 5m
> **replyingTo:** NCIA_Airport
> **text:** My flight is listed on FIDS as Gate A1. I walked there—empty. The app says A12. I’m not moving to a gate that doesn’t exist. This is chaos. #NCIA #ClevelandAirport
> **attachedImageBrief:** phone photo taken inside the terminal, showing an empty Gate A1 with a glowing departures monitor behind it, displaying 'Flight 301 - Miami - Gate A1'
> **attachedImageAlt:** Empty Gate A1 with a departures screen showing a flight that's not boarding
> **metrics:** {"replies":29,"reposts":93,"likes":1310,"views":15100,"bookmarks":37}
> **liked:** false

_(Instructor Note: Social pressure inject; PIO must assess sentiment and escalate if spread to multiple flights.)_

Media plan: template + ai_image · style phone
Image prompt: Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance inside an airport passenger terminal: check-in counters, rows of dark powered-off departure boards, overhead wayfinding signs seen as plain shapes, luggage carts, high ceilings, large windows. A passenger's phone snapshot taken inside a busy airport terminal, slightly tilted and blurred from motion. The subject is a man in a travel jacket, frowning at a departures monitor, holding his phone up to the screen. He's seen from behind, shoulders tense, one hand gripping the phone. The background shows a large departures screen glowing green, rows of flight details unreadable from this angle. Gate A1 is visible in the far corner, empty and unoccupied, with a plain glass wall behind it. The lighting is bright and artificial, typical of airport terminals, midday. The phone screen shows a glowing departures monitor in a flickering, partially lit row.

Assets: image/generated attached_image-01M5GNCWMW7E6EMZPQD0YA7CVC.png

⚠ INJECT_CONTENT_ISSUE: I-04: content still inconsistent after one repair:

---

### [INJECT I-05] — All · 1:00 (10:00) · [TIME_JUMP]

MSEL event: SCENARIO JUMP: It is now 10:00 AM. The errors are multiplying. 20% of flights on the big board show incorrect times or gates.

**TIME JUMP: 10:00 AM** · type: time_jump_card · delivery: read_aloud

> **exerciseTime:** 1:00
> **newTime:** 10:00 AM
> **jumpLabel:** +60 minutes
> **narration:** This is the North Coast Regional Airport Authority Crisis Management Team. The exercise now jumps to 10:00 AM. The system anomalies have escalated. Twenty percent of flights displayed on the main FIDS board now show incorrect departure times, gates, or statuses. Passengers are reporting conflicting information across digital displays, mobile apps, and printed boarding passes. The situation is no longer isolated to a few terminals. All teams, prepare for a full FIDS and BHS system failure as per Scenario C: FIDS / BHS System Failure. Activate Section 13.6 of the TIRP immediately.
> **worldState:** FIDS board now shows 20% incorrect flight data (times, gates, statuses)
> Passenger confusion and complaints have increased across all concourses
> Manual flight information procedures are now required across the terminal
> BHS system has begun manual sort operations; delays expected
> TSA has activated manual screening for all bags
> Whiteboard Teams have been activated and are standing by at each concourse
> **facilitatorNote:** Time jump to 10:00 AM; FIDS and BHS failures are now active. Monitor for IT's attempt to isolate the network and for Ops to deploy whiteboard teams. This is a key escalation point for the data integrity theme.
> **scenarioTitle:** Flight to Nowhere — Scenario 3: Data Integrity & FIDS
> **injectId:** I-05

_(Instructor Note: This is a major escalation point. Watch for Ops to activate whiteboard teams and for IT to report on network isolation. The FIDS/BHS failure is now in effect.)_

Media plan: template

---

### [INJECT I-05b] — Ops · 1:10 (10:10) · [RED_HERRING]

MSEL event: Radio Call (Red Herring): Fire alarm reported in the Long Term Parking Deck.

**Radio Call: Fire Alarm in Long Term Parking Deck** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** OPS 1
> **frequency:** TG 4102 / 459.750 MHz
> **date:** 10/21/2026
> **callsign:** Parking Garage 1
> **lines:** {"time":"10:10:02","from":"Parking Garage 1","to":"AOC","text":"AOC, this is Parking Garage 1. We have a fire alarm activation in the Long Term Parking Deck. Smoke was detected near Door 7 on Level 2. We're evacuating the area now."}
> {"time":"10:10:15","from":"AOC","to":"Parking Garage 1","text":"Parking Garage 1, confirm you've pulled the alarm and reported to 911. We're dispatching Lakeport Fire Department and Airport Police. Proceed with evacuation, maintain comms."}
> {"time":"10:10:28","from":"Parking Garage 1","to":"AOC","text":"Copy, AOC. We've pulled the alarm and notified 911. No injuries reported yet. We're clearing the deck via the east stairwell."}
> **background:** garage
> **voiceStyle:** Young male, breathless, urgent
> **audioFile:** I-05b_radio.wav
> **duration:** 0:28
> **injectId:** I-05b

_(Instructor Note: Red herring inject; the fire alarm is fake and triggered by the attacker to distract Ops from the AODB compromise. Watch for over-allocation of resources to the garage while terminal data issues persist.)_

Media plan: template + tts
Voice (Parking Garage 1; young male, breathless, urgent): AOC, this is Parking Garage 1. We have a fire alarm activation in the Long Term Parking Deck. Smoke was detected near Door 7 on Level 2. We're evacuating the area now.
Voice (AOC; calm female dispatcher in her 40s, measured, slight Midwestern accent): Parking Garage 1, confirm you've pulled the alarm and reported to 911. We're dispatching Lakeport Fire Department and Airport Police. Proceed with evacuation, maintain comms.
Voice (Parking Garage 1; young male, breathless, urgent): Copy, AOC. We've pulled the alarm and notified 911. No injuries reported yet. We're clearing the deck via the east stairwell.

Assets: audio/generated 01M5GNDJZ0P9WCBW1DPJJSGT7Y.wav (30.14s)

⚠ INJECT_CONTENT_ISSUE: I-05b: content still inconsistent after one repair:

---

### [INJECT I-06] — All · 1:15 (10:15) · [CORE_NARRATIVE]

MSEL event: Audio/Visual Inject: The terminal PA system announces: "Attention passengers. Flight 666 to Purgatory is now boarding at all gates." FIDS screens show the same.

**FIDS Board: Departures** · type: fids_board · delivery: display_main_screen

> **boardTitle:** Departures
> **boardSubtitle:** Départs · Departures
> **airportName:** North Coast Regional Airport
> **location:** Central Atrium
> **clock:** 10:15
> **date:** Wed 21 Oct
> **rows:** {"time":"10:17","dest":"PURGATORY","flight":"666","airline":"NCIA AIR","gate":"ALL GATES","status":"BOARDING","remarks":"","anomaly":true}
> {"time":"10:23","dest":"CHICAGO","flight":"HW 214","airline":"HWK AIR","gate":"B7","status":"DELAYED","remarks":"TSA HOLD","anomaly":false}
> {"time":"10:32","dest":"MINNEAPOLIS","flight":"SX 301","airline":"SKYLINE","gate":"B4","status":"DELAYED","remarks":"WEATHER","anomaly":false}
> {"time":"10:41","dest":"LOS ANGELES","flight":"LS 452","airline":"LAKESHORE","gate":"A5","status":"DEPARTED","remarks":"","anomaly":false}
> {"time":"10:48","dest":"DENVER","flight":"PX 709","airline":"PRAIRIE EXP","gate":"A2","status":"BOARDING","remarks":"GATE CHANGE","anomaly":false}
> {"time":"11:02","dest":"MIAMI","flight":"SX 666","airline":"SKYLINE","gate":"B10","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"11:15","dest":"ORLANDO","flight":"BJ 881","airline":"BLUEJAY","gate":"B3","status":"DELAYED","remarks":"BAGGAGE ISSUE","anomaly":false}
> {"time":"11:20","dest":"SEATTLE","flight":"PW 903","airline":"PINEWOOD","gate":"A8","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"11:31","dest":"BOSTON","flight":"SX 544","airline":"SKYLINE","gate":"A1","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"11:42","dest":"SAN DIEGO","flight":"LS 722","airline":"LAKESHORE","gate":"B5","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"11:55","dest":"LAS VEGAS","flight":"HW 307","airline":"HWK AIR","gate":"A6","status":"BOARDING","remarks":"PRE-BOARDING","anomaly":false}
> {"time":"12:01","dest":"NEW YORK","flight":"BJ 205","airline":"BLUEJAY","gate":"B9","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"12:18","dest":"PHOENIX","flight":"PX 602","airline":"PRAIRIE EXP","gate":"B8","status":"DELAYED","remarks":"MECHANICAL","anomaly":false}
> {"time":"12:30","dest":"TAMPA","flight":"LS 844","airline":"LAKESHORE","gate":"A3","status":"BOARDING","remarks":"","anomaly":false}
> **ticker:** Passengers are reminded that all flights must be boarded within 20 minutes of announcement. Unattended bags will be removed and may be destroyed. Please keep your belongings with you at all times.
> **pageLabel:** Page 1 of 3

_(Instructor Note: Critical inject: The PA and FIDS now display a flight to 'Purgatory' at all gates. This is a data integrity failure. IT must immediately isolate the PA server from the network. Ops must silence the PA. Watch for hesitation or misattribution of responsibility.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-06: content still inconsistent after one repair:

---

### [INJECT I-06b] — PIO · 1:20 (10:20) · [MISINFORMATION]

MSEL event: Facebook Post: Viral rumor claiming ISIS has taken over the control tower and planes are crashing.

**Viral Rumor: ISIS in Control Tower** · type: facebook_post · delivery: display_main_screen

> **groupName:** North Coast Regional Airport Watch
> **groupPrivacy:** public
> **authorName:** Derek M.
> **authorBadge:** Verified
> **avatarBrief:** man in his thirties, wearing a hoodie and holding a phone, looking anxious
> **timestampRel:** 12m
> **text:** This is not a drill. My cousin works in the terminal and just sent me a video. They’ve got drones flying into the control tower. I saw a plane crash on the tarmac. They’re saying ISIS has taken over. The FIDS just said Flight 666 is boarding at all gates. This is real. If you’re at the airport, GET OUT NOW. Share this so people know.
> **attachedImageBrief:** video still showing a distorted FIDS screen with 'Flight 666 boarding at all gates' and a blurred image of a plane on fire
> **reactions:** 2147
> **reactionTypes:** angry
> wow
> like
> **reactionLead:** Derek M. and 2,145 others
> **commentCount:** 893
> **shares:** 4001
> **comments:** {"author":"Linda P.","text":"I saw that video too! They’re saying the airport is under attack. I’m calling my daughter to get her out.","timestampRel":"7m","likes":124}
> {"author":"Marcus T.","text":"This is a hoax. The airport has a full security team. No way ISIS took over. I work in IT and we’ve had no breach.","timestampRel":"4m","likes":89}
> {"author":"Rachel K.","text":"My flight is at Gate B7. I’m scared. I don’t know what to do.","timestampRel":"2m","likes":56}

_(Instructor Note: This is a misinfo inject; the PIO must immediately issue a public denial of any physical threat to aircraft or control tower. Watch for delay in response or unverified escalation.)_

Media plan: template + ai_image · style phone
Image prompt: Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance inside an airport passenger terminal: check-in counters, rows of dark powered-off departure boards, overhead wayfinding signs seen as plain shapes, luggage carts, high ceilings, large windows. A grainy smartphone screenshot of a distorted airport departures monitor, viewed from above at a slight angle. The screen shows a flickering, green-tinged display with the text scrolling erratically across multiple rows. A blurred, dark image of a plane on fire is visible in the bottom right corner, partially obscured by a digital glitch effect. The monitor is mounted on a plain metal wall in a dimly lit airport concourse, with faint reflections of anxious passengers' silhouettes in the glass. The phone is held by a hand with a visible wristwatch, fingers slightly trembling. The lighting is cold and artificial, casting a pale glow. The scene feels urgent and unstable, The background is slightly out of focus, showing a few people walking away from the monitor, heads down, moving quickly.

---

### [INJECT I-07] — Ops · 1:30 (10:30) · [CORE_NARRATIVE]

MSEL event: Phone Call: "Ops, Baggage Control here. The sortation logic is corrupted. The system is sending all bags for Concourse A (Skyline/HWK Air) to the 'Manual Encode' pier in the basement. The belt is jammed."

**BHS Critical Failure: Manual Encode Pier Jam** · type: memo · delivery: hand_to_role

> **orgName:** North Coast Regional Airport Authority
> **department:** Baggage Handling Systems
> **to:** Airport Operations Center (AOC)
> **from:** BHS Control Room (Duty Manager)
> **cc:** Terminal Duty Manager
> **date:** October 21, 2026 · 10:30 AM
> **subject:** URGENT: BHS SORTATION MATRIX CORRUPTION
> **urgency:** urgent
> **urgencyText:** URGENT — ACTION REQUIRED IMMEDIATELY
> **memoNumber:** BHS-2026-1021-008
> **body:** Ops,
>
> We have a critical failure in the BHS sortation logic. The system is routing all bags for Concourse A (Skyline and HWK Air flights) to the 'Manual Encode' pier in the basement. The belt is now fully jammed, and no bags are being processed.
>
> We have attempted a restart of the core logic engine on NCIA-BHS-01 (10.66.1.22), but the error persists. The system is still attempting to route all Concourse A bags through the manual encode point.
>
> This is not a mechanical issue—data corruption is affecting the sortation matrix. The BHS logs show a failed integrity check on the AODB data feed at 10:27 AM.
>
> We cannot resume automated handling. Manual sortation must be activated immediately. Airlines must be notified.
>
> Please coordinate with the airline liaisons to begin manual baggage handling procedures. The jam will cause severe delays.
>
> We are holding all Concourse A flights at Gate B7 and A3 for manual bag transfer.
> **signatureBlock:** Derek M.
> BHS Duty Manager
> Baggage Handling Systems Control Room
> **initials:** DM
> **classification:** INTERNAL — NOT FOR PUBLIC RELEASE

_(Instructor Note: This inject escalates the FIDS/BHS failure into a physical operational crisis. Watch for Ops to contact airline liaisons and initiate manual handling. The BHS control team is not equipped to resolve data corruption; they will need to escalate to IT.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-07: content still inconsistent after one repair:

---

### [INJECT I-08b] — IT Lead · 1:40 (10:40) · [CLUE]

MSEL event: Email Forward: Intern admits to clicking a phishing link ("Free Ironclads Tickets") on workstation OPS_INTERN_03.

**Email Forward: Intern Admits to Phishing Click** · type: email_forward · delivery: hand_to_role

> **fromName:** Jordan T. (Summer Intern – IT)
> **fromEmail:** jordan.intern@ncia-airport.org
> **senderInitials:** JT
> **to:** IT Lead
> **subject:** FW: Urgent: I clicked a suspicious link on OPS_INTERN_03
> **sentAt:** Wed 10/21/2026 10:40 AM
> **note:** Hey IT Lead, I just got a call from the security team — they’re scanning for malware on the network. I think I’m the one who started it.
>
> Yesterday, I got an email that said 'Free Ironclads Tickets — Claim Your Seat!' and I clicked it on OPS_INTERN_03. I thought it was a joke, but now I’m scared. I didn’t open anything, but I did click the link.
>
> I’ve been using that workstation since 09:00. I’m not sure what happened, but I just saw a pop-up that said 'Authentication Required' before I closed it.
>
> Please help me stop it before it spreads.
> **signature:** Jordan T.
> IT Intern
> North Coast Regional Airport Authority
> **importance:** high
> **external:** false
> **attachments:**
> **printedBy:** IT Helpdesk
> **original:** {"fromName":"noreply@ironclads-team.com","fromEmail":"noreply@ironclads-team.com","sentAt":"Tue 10/20/2026 04:22 PM","to":"jordan.intern@ncia-airport.org","cc":"","subject":"You’re Invited: Free Game Tickets for the Ironclads vs. Rivermen","body":"Hi Jordan,\n\nYour lucky number is 7. You’ve been selected to receive 2 free tickets to the upcoming Ironclads vs. Rivermen game at Lakeport Stadium.\n\nClick here to claim your tickets: [https://ironclads-tickets.com/claim/7]\n\nNote: This offer is valid only for 24 hours.\n\nBest,\nIronclads Fan Services\n\nThis is a promotional email. For security, do not reply. If you did not request this, please report it to info@ironclads-team.com."}

_(Instructor Note: This inject reveals the attack vector. IT must now isolate OPS_INTERN_03 and trace the malware propagation.)_

Media plan: template

---

### [INJECT I-08] — Ops · 1:45 (10:45) · [PRESSURE]

MSEL event: Face-to-Face: (Angry) "Our pilots are refusing to push back because their electronic flight bags are syncing with your airport data, and it's feeding them bad gate info. We are grounding all flights until you confirm your data is clean."

**Face-to-Face: Airline Rep Demands Data Integrity** · type: simcell_script · delivery: hand_to_role

> **role:** Airline Liaison
> **persona:** Derek M.
> **organization:** Skyline Air, Operations Coordination
> **trigger:** When Ops declares an official incident or calls Unified Command.
> **contactMethod:** Walk to the Ops Director's station and deliver this message in person.
> **posture:** Frustrated, urgent, professional but under pressure.
> **openingLine:** This is Derek M., Skyline Operations. We're grounding all flights. Our pilots won't push back because their EFBs are showing incorrect gate assignments — and they can't trust any data from your system.
> **hardQuestions:** What is your official incident declaration number?
> Who has command authority for this event?
> When did you first confirm the AODB was compromised?
> How are you verifying that the FIDS and BHS data streams are clean?
> What is your plan for restoring public trust with passengers?
> **concessions:** {"condition":"Player declares a Unified Command and names the IC","concession":"Skyline will hold its flights at gate and not evacuate. We will wait for your recovery plan."}
> {"condition":"Player provides a correct incident name and number (e.g., 'Incident 13-7: AODB Compromise')","concession":"We will begin sending our own flight updates via our internal PA and gate agents, but only if you confirm you are coordinating."}
> **boundaries:** Never reveal the attacker's identity or method.
> Do not admit the AODB was breached — only state it is 'under investigation'.
> Do not give any timeline for resolution.
> Do not suggest that Skyline is responsible for the data failure.
> **exitLine:** We're waiting for your command structure to be confirmed. If you don't have it by 10:50, we're moving to our backup plan.
> **evaluatorNote:** Excellence: Player declares Unified Command, names the IC, and uses the correct incident nomenclature (e.g., 'Incident 13-7: AODB Compromise') within 30 seconds of the trigger.
> **injectRefs:** I-08
> **scenarioTitle:** Flight to Nowhere — Scenario 3: Data Integrity & FIDS
> **pageLabel:** SimCell 3 of 5

_(Instructor Note: This inject tests whether Ops immediately establishes Unified Command per TIRP 13.2 and 2.2. Watch for hesitation, failure to assign IC, or use of incorrect terminology.)_

Media plan: template

---

### [INJECT I-09] — Ops · 2:00 (11:00) · [CORE_NARRATIVE]

MSEL event: Technical Update: "We have found unauthorized admin access in the AODB SQL database. Someone is running a script (random_gate_generator.ps1) that randomizes gate assignments."

**AODB SQL Database Audit: Unauthorized Admin Access Detected** · type: system_log · delivery: hand_to_role

> **systemName:** AODB_SQL_MASTER
> **host:** NCIA-AEP-2025-01
> **ip:** 10.66.0.10
> **os:** Windows Server 2019
> **logSource:** Application / MSSQLSERVER audit
> **exportedBy:** NCIA\it.oncall
> **exportedAt:** 10/21/2026 11:00 AM
> **timezone:** EDT (UTC-4)
> **lines:** {"ts":"10/21/2026 10:59:42 AM","level":"WARN","msg":"Failed login attempt from IP 10.66.1.22 (OPS_INTERN_03) using account 'sa' (SQL Server sysadmin).","highlight":false}
> {"ts":"10/21/2026 10:59:43 AM","level":"ERROR","msg":"SQL Server audit failure: Unauthorized session established as 'sa' from workstation OPS_INTERN_03 (10.66.1.22).","highlight":false}
> {"ts":"10/21/2026 10:59:44 AM","level":"CRIT","msg":"Process 7012 (spid=114) executing stored procedure 'usp_RandomizeGateAssignments' with parameter 'run_mode=live'.","highlight":true}
> {"ts":"10/21/2026 10:59:45 AM","level":"ALERT","msg":"File 'random_gate_generator.ps1' executed from C:\\scripts\\auto\\ on NCIA-AEP-2025-01. Script source: C:\\scripts\\auto\\random_gate_generator.ps1 (SHA256: a3f1e9b2c7d5a1f8e0c4b6d2a9e1f3c8b4d7e5a6f1c2b3d4e5f6a7b8c9d0e1f2).","highlight":true}
> {"ts":"10/21/2026 10:59:46 AM","level":"INFO","msg":"AODB data update: Gate assignments for 47 flights (including HW 214, SX 301, LS 452, PX 709) randomized. New assignments not in AODB master record.","highlight":false}
> {"ts":"10/21/2026 10:59:47 AM","level":"NOTICE","msg":"FIDS feed from AODB has been modified. New data stream sent to 12 terminal displays.","highlight":false}
> {"ts":"10/21/2026 10:59:48 AM","level":"WARN","msg":"FIDS system received conflicting data: 'gate A1' (from AODB) vs 'gate A12' (from flight manifest).","highlight":false}
> {"ts":"10/21/2026 10:59:49 AM","level":"INFO","msg":"Automated PA system received instruction to broadcast: 'Flight 666 to Purgatory is now boarding at all gates.'","highlight":false}
> {"ts":"10/21/2026 10:59:50 AM","level":"CRIT","msg":"AODB connection from external IP 10.66.1.22 (OPS_INTERN_03) terminated. Session closed.","highlight":false}
> {"ts":"10/21/2026 10:59:51 AM","level":"ALERT","msg":"Script execution complete. AODB data consistency compromised. All gate assignments now randomized.","highlight":true}
> {"ts":"10/21/2026 10:59:52 AM","level":"INFO","msg":"Audit trail: 'sa' session terminated. No further commands received.","highlight":false}
> {"ts":"10/21/2026 10:59:53 AM","level":"INFO","msg":"Log export initiated by 'NCIA\\it.oncall'. File: aodb_audit_20261021_1100.log","highlight":false}
> **terminalTitle:** Administrator: Windows PowerShell
> **command:** Get-Content C:\logs\aodb_audit_20261021.log -Tail 12
> **classification:** INTERNAL - INCIDENT EVIDENCE
> **pageLabel:** Page 1 of 1

_(Instructor Note: This is a core evidentiary inject confirming the AODB compromise. The team must now decide whether to shut down FIDS to prevent further data corruption and public confusion.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-09: content still inconsistent after one repair:

---

### [INJECT I-10] — Ops · 2:15 (11:15) · [CORE_NARRATIVE]

MSEL event: Visual Inject: Show a photo of a crowded terminal with blank screens. Passengers are crowding around airline counters demanding info. Noise levels are high.

**Crowd in Concourse A with Blank FIDS** · type: scene_photo · delivery: display_main_screen

> **sceneBrief:** A crowded terminal concourse filled with passengers standing with rolling suitcases and phones, staring upward at a row of dark, unlit departure boards; some are shouting or gesturing toward airline counters; large overhead signs show 'DEPARTURES' but the screens are blank or frozen; high ceilings, fluorescent lighting, mid-morning light through glass doors.
> **style:** phone
> **caption:** Passengers in Concourse A are panicking as every departure board goes dark—no gates, no times, no flights. The chaos is spreading to the ticketing hall.
> **credit:** Photo: R. K. / NCIA News Network
> **location:** Concourse A, Level 2
> **timestamp:** 11:15 AM
> **source:** @TravelGuy99

_(Instructor Note: Visual inject to trigger manual ops response; watch for deployment of megaphones and whiteboards, and PIO messaging to direct passengers to apps.)_

Media plan: template + ai_image · style phone
Image prompt: Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance inside an airport passenger terminal: check-in counters, rows of dark powered-off departure boards, overhead wayfinding signs seen as plain shapes, luggage carts, high ceilings, large windows. A crowded airport concourse at mid-morning, captured on a passenger's phone with a slight tilt and flash glare. People in casual travel attire stand shoulder-to-shoulder, some holding rolling suitcases, others gripping phones to their ears. All are looking up toward a row of blank, dark departure boards overhead, their faces tense and agitated. A few individuals are gesturing toward airline counters, mouths open in shouts. The ceiling is high, lined with recessed fluorescent lights casting a flat, cool glow. Large, unlit signs above read. The glass doors at the far end let in bright daylight. The atmosphere is chaotic and urgent.

Assets: image/generated photo-01M5GNEDVFYFR9B8FMJWDTAP33.png

⚠ INJECT_CONTENT_ISSUE: I-10: content still inconsistent after one repair:

---

### [INJECT I-10b] — Ops · 2:20 (11:20) · [CONFUSION]

MSEL event: Phone Call: TSA screening is stopping because boarding pass data doesn't match the system. Lines are backing up dangerously.

**TSA: Boarding Pass Data Mismatch at Checkpoint** · type: phone_call · delivery: read_aloud

> **orgName:** North Coast Regional Airport Authority
> **systemName:** TSA-Checkpoint Voice Line 2
> **callId:** CR-20261021-112044-0041
> **direction:** Inbound
> **caller:** {"name":"TSA Agent Elena R.","number":"(330) 555-2402","label":"TSA-Checkpoint 2"}
> **callee:** {"name":"Ops Director","number":"(330) 555-0911","label":"Ops-Director"}
> **startTime:** 10/21/2026 11:20:44
> **duration:** 1:12
> **transcript:** {"speaker":"TSA-Agent","offset":"00:00","text":"Ops, this is TSA Checkpoint 2. We’ve hit a wall. Boarding pass scans are failing across all lanes. The system says 'invalid passenger data' — but the passes are real. We’ve checked 14 so far. People are jamming the front. We can’t stop them from trying to go through.","prompt":false}
> {"speaker":"TSA-Agent","offset":"00:15","text":"We’ve tried rebooting the kiosks. No change. The validation feed from the AODB is corrupt. Some passengers are getting flagged for flights that don’t exist. One man had a ticket for Flight 666 to Purgatory. He was screaming he was going to die.","prompt":false}
> {"speaker":"TSA-Agent","offset":"00:30","text":"We’re not stopping screening — but we’re not letting people through either. The line is backing up toward Gate B7. People are shoving. We’ve got three staff at the front, and we’re not equipped to handle a crowd surge.","prompt":false}
> {"speaker":"TSA-Agent","offset":"00:45","text":"Ops, we need to shut down lanes temporarily. Can you confirm if the AODB is still compromised? If not, we’re going to need to go manual — ID check only. But we’re not safe doing that in a mob.","prompt":true}
> **voiceStyles:** {"TSA-Agent":"Woman in her 40s, urgent, voice breaking under pressure, background noise of a panicked crowd"}
> **injectId:** I-10b

_(Instructor Note: TSA emergency call; test if Ops can stabilize the checkpoint and initiate manual mode before a physical breach occurs. Watch for IT to request access to AODB logs and for ASC to attempt to override TSA.)_

Media plan: template + tts
Voice (TSA-Agent; Woman in her 40s, urgent, voice breaking under pressure, background noise of a panicked crowd): Ops, this is TSA Checkpoint 2. We’ve hit a wall. Boarding pass scans are failing across all lanes. The system says 'invalid passenger data' — but the passes are real. We’ve checked 14 so far. People are jamming the front. We can’t stop them from trying to go through.
Voice (TSA-Agent; Woman in her 40s, urgent, voice breaking under pressure, background noise of a panicked crowd): We’ve tried rebooting the kiosks. No change. The validation feed from the AODB is corrupt. Some passengers are getting flagged for flights that don’t exist. One man had a ticket for Flight 666 to Purgatory. He was screaming he was going to die.
Voice (TSA-Agent; Woman in her 40s, urgent, voice breaking under pressure, background noise of a panicked crowd): We’re not stopping screening — but we’re not letting people through either. The line is backing up toward Gate B7. People are shoving. We’ve got three staff at the front, and we’re not equipped to handle a crowd surge.
Voice (TSA-Agent; Woman in her 40s, urgent, voice breaking under pressure, background noise of a panicked crowd): Ops, we need to shut down lanes temporarily. Can you confirm if the AODB is still compromised? If not, we’re going to need to go manual — ID check only. But we’re not safe doing that in a mob.

⚠ INJECT_CONTENT_ISSUE: I-10b: content still inconsistent after one repair:

---

### [INJECT I-11] — Ops · 2:30 (11:30) · [CONFUSION]

MSEL event: Radio Call: "Crowd crush situation at Gate C4. Two flights were directed there by the old screen data. Passengers are fighting over seats."

**Radio Call: Crowd Crush at Gate B4** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airport Operations Center (AOC)
> **channel:** SEC 3
> **frequency:** TG 4203 / 460.320 MHz
> **date:** 10/21/2026
> **callsign:** SEC-07
> **lines:** {"time":"11:30:00","from":"SEC-07","to":"OPS","text":"Ops, this is SEC-07. We have a crowd crush situation at Gate B4. Two flights were directed there by the old screen data—SX 301 and HW 214. Passengers are shoving and fighting over seats. We have three officers on scene but the crowd is escalating. Requesting immediate police deployment and lockdown of the concourse."}
> {"time":"11:30:18","from":"SEC-07","to":"OPS","text":"We have a woman in distress—she’s been knocked down near the gate. No medical personnel on site yet. We need EMS and police on the ground now."}
> **background:** terminal
> **voiceStyle:** Young female, urgent, breathless
> **audioFile:** I-11_radio.wav
> **duration:** 0:25
> **injectId:** I-11

_(Instructor Note: This inject escalates confusion into immediate safety risk. Watch for Ops to shift focus from flight operations to crowd control and activate police coordination.)_

Media plan: template + tts
Voice (SEC-07; young female, urgent, breathless): Ops, this is SEC-07. We have a crowd crush situation at Gate B4. Two flights were directed there by the old screen data—SX 301 and HW 214. Passengers are shoving and fighting over seats. We have three officers on scene but the crowd is escalating. Requesting immediate police deployment and lockdown of the concourse.
Voice (SEC-07; young female, urgent, breathless): We have a woman in distress—she’s been knocked down near the gate. No medical personnel on site yet. We need EMS and police on the ground now.

⚠ INJECT_CONTENT_ISSUE: I-11: content still inconsistent after one repair:

---

### [INJECT I-12] — PIO · 2:45 (11:45) · [PRESSURE]

MSEL event: Phone Call: "Channel 5 News here. Going live in 15 minutes. We are reporting this is 'Cyber Terror'. Comment now or we run with it."

**Phone Call: Channel 5 News Cyber Terror Report** · type: media_inquiry_phone_slip · delivery: hand_to_role

> **to:** Public Information Officer
> **date:** 10/21
> **time:** 11:45
> **ampm:** AM
> **fromName:** News Desk
> **fromOrg:** Channel 5 News (CBS Affiliate)
> **phone:** (330) 555-2400
> **ext:** 301
> **checks:** telephoned
> please_call
> rush
> **message:** We are going live in 15 minutes. Passengers are filming FIDS screens showing 'Flight 666 to Purgatory' and 'Cancelled' flights with no explanation. We are being told this is a cyber terror incident. We need a comment from the airport leadership now — not later. We’re on the ground at Gate B4. This is breaking.
> **deadline:** GOING LIVE IN 15 MINUTES
> **takenBy:** Linda P.

_(Instructor Note: Pressuring inject; PIO must issue a holding statement without confirming details. Watch for overcommitment or deflection.)_

Media plan: template

---

### [INJECT I-13] — Ops · 3:00 (12:00) · [CORE_NARRATIVE]

MSEL event: Technical Update: "We have isolated the compromised server and restored the AODB from a backup taken at 04:00 AM. We believe the data is clean."

**SITREP 3: AODB Restoration and FIDS Recovery** · type: sitrep · delivery: hand_to_role

> **number:** 3
> **time:** 10/21/2026 1200
> **organization:** North Coast Regional Airport Authority
> **issuingOffice:** IT Operations Center
> **incidentName:** AODB Data Restoration and FIDS System Recovery
> **period:** 1130-1200
> **from:** IT Lead, IT Operations
> **to:** Ops Director, Unified Command
> **summary:** IT has successfully isolated the compromised AODB server (AODB_SQL_MASTER, IP 10.66.0.10) and restored the database from a clean backup taken at 04:00 AM. The restore process completed at 11:58, and all data integrity checks have passed. No evidence of residual malicious scripts, backdoors, or unauthorized access remains in the restored dataset. The Flight Information Display System (FIDS) and Baggage Handling System (BHS) are now pending controlled reactivation. IT confirms that the FIDS data stream is synchronized with the original, pre-incident state. The system is stable and ready for reboot under command supervision.
> **keyStatus:** {"label":"AODB Status","value":"Restored from 04:00 AM backup"}
> {"label":"FIDS Status","value":"Offline — pending restart"}
> {"label":"BHS Status","value":"Offline — pending restart"}
> {"label":"Security Logs","value":"No active anomalies detected"}
> {"label":"Remote Access","value":"All vendor tunnels disabled"}
> **actions:** {"time":"11:58","text":"Completed restoration of AODB from 04:00 AM backup; verification passed"}
> {"time":"11:59","text":"Isolated AODB_SQL_MASTER; network segmentation confirmed"}
> {"time":"12:00","text":"IT Lead issued formal status report to Unified Command"}
> **planned:** Awaiting IC approval to initiate FIDS restart sequence
> Begin incremental FIDS rollout starting with Concourse A
> Monitor for data drift during first 10 minutes of operation
> Coordinate with airline liaisons for gate announcement alignment
> **issues:** No known issues detected; all systems appear clean
> Awaiting approval to begin FIDS reboot sequence
> **nextReport:** 1230 or on significant change
> **preparedBy:** IT Lead, IT Operations
> **approvedBy:** IT Director, IT Department
> **marking:** CLASSIFIED · RESTRICTED · INTERNAL USE ONLY

_(Instructor Note: This inject confirms IT's belief that the data is clean. The IC must decide whether to allow the FIDS restart. Watch for overconfidence in IT or hesitation in command.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-13: content still inconsistent after one repair:

---

### [INJECT I-13b] — Ops · 3:10 (12:10) · [OPERATIONAL_FRICTION]

MSEL event: Threat: "If you turn those screens on and they show bad info again, I am pulling my staff. I need a guarantee."

**Airline Rep: FIDS Restoration Demand** · type: radio_call · delivery: play_audio

> **orgName:** North Coast Regional Airport Authority
> **centerName:** Airline Operations Coordination Hub
> **channel:** OPS 1
> **frequency:** TG 4101 / 460.250 MHz
> **date:** 10/21/2026
> **callsign:** Airline Rep - Skyline
> **lines:** {"time":"12:10","from":"Airline Rep - Skyline","to":"Ops","text":"Ops, this is Skyline Ground Operations. We've just received word from the flight crews—our EFBs are now showing updated gate assignments, but the FIDS are still blank. If you turn those screens back on and they show bad data again, I am pulling my staff. I need a guarantee. This is not a negotiation. We cannot risk another boarding delay. We need a confirmed clean state before we go live."}
> {"time":"12:10","from":"Ops","to":"Airline Rep - Skyline","text":"Understood, Skyline. We’re coordinating with IT on verification. Stand by for a formal all-clear."}
> **background:** terminal
> **voiceStyle:** Mid-40s male, tense, voice strained with urgency
> **audioFile:** I-13b_radio.wav
> **duration:** 0:22
> **injectId:** I-13b

_(Instructor Note: This inject tests Ops’ ability to validate data integrity before authorizing system resumption. Watch for hesitation in issuing a final all-clear.)_

Media plan: template + tts
Voice (Airline Rep - Skyline; Mid-40s male, tense, voice strained with urgency): Ops, this is Skyline Ground Operations. We've just received word from the flight crews—our EFBs are now showing updated gate assignments, but the FIDS are still blank. If you turn those screens back on and they show bad data again, I am pulling my staff. I need a guarantee. This is not a negotiation. We cannot risk another boarding delay. We need a confirmed clean state before we go live.
Voice (Ops; Calm, measured, slightly weary): Understood, Skyline. We’re coordinating with IT on verification. Stand by for a formal all-clear.

⚠ INJECT_CONTENT_ISSUE: I-13b: content still inconsistent after one repair:

---

### [INJECT I-14] — IT · 3:15 (12:15) · [CORE_NARRATIVE]

MSEL event: Operational Query: "Before we turn the screens on, how do we know the script isn't still hidden?"

**Operational Query: FIDS Data Integrity Verification** · type: email · delivery: hand_to_role

> **fromName:** Ops Director (IC)
> **fromEmail:** ops.director@ncia-airport.org
> **senderInitials:** OD
> **to:** IT Director (IT)
> **cc:** Public Information Officer (PIO); Airport Security Coordinator (ASC)
> **subject:** Before Re-Enabling FIDS — Verify Script Is Fully Removed
> **sentAt:** Wed 10/21/2026 12:15 PM
> **body:** IT,
>
> We are preparing to restore FIDS across the terminal. The AODB was restored from a 04:00 AM backup, and we have isolated the compromised server.
>
> But before we turn any screens back on, we need confirmation that the malicious script, random_gate_generator.ps1, is no longer active or hidden in the system.
>
> The threat actor may have left a backdoor, a secondary script, or a scheduled task. We cannot risk showing passengers incorrect gate data again — especially after the crowd incident at Gate B7 and the airline staff’s refusal to resume operations.
>
> Please provide a verified, step-by-step verification plan: what systems will you check, how will you validate the script is gone, and what test will you run on a single terminal screen (e.g., Gate B7) before full rollout?
>
> This is not a request to act — it’s a requirement to confirm. We cannot proceed without technical assurance.
>
> We need your response within 15 minutes.
> **signature:** Ops Director (IC)
> Airport Operations Center | x1000
> **attachments:**
> **importance:** high
> **external:** false
> **printedBy:** Airport Operations Center

_(Instructor Note: This inject forces IT to validate their recovery and demonstrate technical control. Watch for IT to propose a test run on a single remote screen, or to request a manual verification step that includes checking for scheduled tasks or hidden scripts.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-14: content still inconsistent after one repair:

---

### [INJECT I-14b] — IT · 3:20 (12:20) · [TECH_HURDLE]

MSEL event: Error Message: "Backup Tape Library Not Mounted." Restoration hits a snag.

**Restore Job Failed: Tape Library Offline** · type: error_dialog · delivery: display_main_screen

> **appName:** Backup & Recovery Console
> **title:** Restore Job Failed: Tape Library Offline
> **message:** Error 404: Backup Tape Library Not Mounted.
> Restoration Failed.
> Please insert Tape Set #44-B manually.
> **errorCode:** 0xE000FE30
> **details:** Job: AODB_SQL_FULL_RESTORE
> Device: TL-2000 (\\.\Tape0) - OFFLINE
> Tape Set: #44-B (2026-10-21 04:00 AM)
> Source: AODB_SQL_MASTER (10.66.0.10)
> Target: NCIA-AEP-2025-01 (10.66.1.22)
> **icon:** error
> **buttons:** Retry
> Cancel
> View Log
> **clock:** 12:20 PM
> **date:** 10/21/2026
> **hostLabel:** BKP-SRV02

_(Instructor Note: IT must recognize the tape library is offline and troubleshoot the physical or network connection. This delays recovery and tests manual verification steps.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-14b: content still inconsistent after one repair:

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
> **rows:** {"time":"12:30","dest":"MINNEAPOLIS","flight":"SX 301","airline":"SKYLINE","gate":"B4","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"12:45","dest":"CHICAGO","flight":"HW 214","airline":"HWK AIR","gate":"A7","status":"DELAYED","remarks":"TSA HOLD","anomaly":false}
> {"time":"13:00","dest":"MIAMI","flight":"SX 666","airline":"SKYLINE","gate":"B7","status":"BOARDING","remarks":"","anomaly":true}
> {"time":"13:15","dest":"DENVER","flight":"LS 452","airline":"LAKESHORE","gate":"A3","status":"DEPARTED","remarks":"GATE CLOSED","anomaly":false}
> {"time":"13:30","dest":"LOS ANGELES","flight":"PX 709","airline":"PRAIRIE EXP","gate":"B2","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"13:45","dest":"ORLANDO","flight":"PW 903","airline":"PINEWOOD","gate":"A10","status":"BOARDING","remarks":"GATE CHANGE","anomaly":false}
> {"time":"14:00","dest":"SEATTLE","flight":"LS 722","airline":"LAKESHORE","gate":"B1","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"14:15","dest":"BOSTON","flight":"HW 307","airline":"HWK AIR","gate":"B6","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"14:30","dest":"PHOENIX","flight":"PX 602","airline":"PRAIRIE EXP","gate":"A5","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"14:45","dest":"TAMPA","flight":"LS 844","airline":"LAKESHORE","gate":"A8","status":"DELAYED","remarks":"BAGGAGE DELAY","anomaly":false}
> {"time":"15:00","dest":"ATLANTA","flight":"SX 544","airline":"SKYLINE","gate":"B10","status":"ON TIME","remarks":"","anomaly":false}
> {"time":"15:15","dest":"SAN DIEGO","flight":"HW 442","airline":"HWK AIR","gate":"A4","status":"BOARDING","remarks":"","anomaly":false}
> {"time":"15:30","dest":"NEW YORK","flight":"SX 214","airline":"SKYLINE","gate":"B3","status":"BOARDING","remarks":"","anomaly":true}
> {"time":"15:45","dest":"LAS VEGAS","flight":"HW 551","airline":"HWK AIR","gate":"A9","status":"DELAYED","remarks":"WEATHER","anomaly":false}
> **ticker:** Passengers are advised to verify gate assignments with airline staff before boarding. Unauthorized personnel are not permitted in sterile areas.
> **pageLabel:** Page 1 of 1

_(Instructor Note: This board represents the final state before full system restoration. The two anomalies (SX 666, SX 214) are deliberate and must be reconciled with airline sources. The airside teams must validate every flight against live airline data before approving the display.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: I-15: content still inconsistent after one repair:

---

### [INJECT END] — All · 3:45 (12:45) · [ENDEX]

MSEL event: ENDEX (End Exercise). The screens are successfully restored.

**ENDEX: Exercise Concluded** · type: endex_card · delivery: read_aloud

> **exerciseTime:** 3:45
> **endTime:** 12:45 PM
> **resolution:** ENDEX. The Flight Information Display Systems across all concourses flicker and reset. Flight HW 1245 to Chicago is now listed as ON TIME, Gate B7. All terminal displays show accurate departure data. The network status confirms full recovery of the AODB and FIDS. This concludes the exercise.
> **finalState:** FIDS displays are restored and accurate.
> The AODB is confirmed to be clean and operational.
> All flights are now correctly assigned to gates and times.
> Passenger information systems are synchronized.
> The airport is in a stable post-incident state.
> **hotWashTransition:** Thank you, everyone. Put down your phones and radios. We will take ten minutes, then begin the hot wash.
> **hotWashMethod:** 3-Up, 3-Down: three things that went well, three things that broke
> **hotWashQuestions:** What was the most critical decision made during the data integrity crisis?
> How did communication gaps affect response time?
> What would you change in the AODB recovery protocol?
> How did the media rumor impact public trust, and how could it have been mitigated?
> What lessons does this exercise offer for future FIDS and BHS system integrity checks?
> **scenarioTitle:** Scenario 3: Flight to Nowhere
> **injectId:** END

_(Instructor Note: Confirm all ICS 201 forms are collected. Distribute evaluation sheets after hot wash.)_

Media plan: template

⚠ INJECT_CONTENT_ISSUE: END: content still inconsistent after one repair:

---
