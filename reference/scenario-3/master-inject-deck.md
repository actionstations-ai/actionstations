# Master Inject Deck
## Scenario 3: "Flight to Nowhere"

**Instructions for Facilitator:**
- **Print:** Print each inject on a separate page.
- **Timing:** Deliver the inject at the specific exercise time listed.
- **Target:** Hand the paper to the specific role indicated (e.g., IT, Ops, PIO).
- **Style:** Do not explain the inject. Just say, "This just came in," or "This is on the main screen."

> Injects that had rendered image media in the original package: I-02a, I-04, I-06, I-06b, I-10b (PNG files — see `injects/README.md`).

---

## Phase 1: The Glitch (Exercise Hour 0:00 – 1:00)

### [INJECT I-02a] — Hand to IT Director
Time: 0:20 · Type: **[NOISE]** (Distraction) · Format: Helpdesk Ticket Printout

> **Ticket #:** 4492 · **Priority:** Low
> **Subject:** Vending Machines in Concourse B
> **Message:** "The Coke machines at Gate B2 and B6 just spit out all their cans at once. There is soda everywhere. Maintenance needed for cleanup. Is this a cyber thing?"

### [INJECT I-04] — Hand to PIO
Time: 0:55 · Type: **[PRESSURE]** (Social Media) · Format: Printout of a Tweet

> A screenshot of a tweet from user @TravelGuy99. Profile pic: generic angry man in sunglasses. Handle: @TravelGuy99. Timestamp: 4 mins ago.
> **Text:** "NCIA is a joke! Boards say my flight is at Gate A1. I walked to A1 and it's empty. App says A12. Now I'm gonna miss my flight! #Fail #NCIA #Cleveland"
> **Image:** A photo taken inside the terminal showing a FIDS screen listing "DL1245 to Atlanta – Gate A1 – ON TIME" next to an empty gate area.
> **Metrics:** 12 Retweets, 45 Likes.

---

## Phase 2: The Crisis (Exercise Hour 1:00 – 2:00)

### [INJECT I-05b] — Hand to Ops Director
Time: 1:10 · Type: **[RED HERRING]** (Resource Drain) · Format: Radio Call Transcript

> **Source:** Parking Garage Manager
> **Message:** "Ops, we have a Fire Alarm in the Long Term Parking Deck, Level 3. Smoke reported near the elevator bank. Requesting Fire Department response immediately."
>
> *(Instructor Note: This forces Ops to split resources between the cyber issue and a physical fire alarm.)*

### [INJECT I-06] — Display on Main Screen
Time: 1:15 · Type: **[CORE NARRATIVE]** (Visual Confirmation) · Format: Visual Projection / Image

> A photo of the main Flight Information Display System (FIDS) board in the central atrium. Most flights look normal, but several lines are glaringly wrong:
>
> | Flight | Dest | Time | Gate | Status |
> |---|---|---|---|---|
> | UA 666 | PURGATORY | NOW | ALL | BOARDING |
> | DL 000 | NOWHERE | 00:00 | B13 | DELAYED |
> | AA 123 | DALLAS | 10:00 | Z99 *(does not exist)* | CANCELLED |

### [INJECT I-06b] — Hand to PIO
Time: 1:20 · Type: **[MISINFORMATION]** (Rumor Control) · Format: Facebook Post Printout

> **Source:** "Cleveland Moms Group" (Public Group) · **User:** Karen S.
> **Text:** "My sister works at the airport and she just texted me. She said ISIS has taken over the control tower. They are crashing planes into the terminal! GET OUT NOW! Share this!!!"
> **Metrics:** 400 Shares in 5 minutes.

### [INJECT I-07] — Hand to Ops Director
Time: 1:30 · Type: **[CORE NARRATIVE]** (Operational Failure) · Format: Memo / Email Printout

> **FROM:** BHS Control Room (Duty Manager) · **TO:** Airport Operations Center (AOC)
> **SUBJECT:** URGENT: BHS CRITICAL FAILURE
>
> Ops,
> We have a major issue. The Sortation Allocation Controller (SAC) has lost its mind. At 10:28 AM, the system began routing ALL bags destined for Concourse A (Delta/United) to the "Manual Encode" pier in the basement.
> **Impact:** The Manual Encode pier is overwhelmed. The belts are jammed. **Status:** We have engaged the Emergency Stop (E-Stop) on Belts 1, 2, and 3 to prevent bag damage. **Result:** No bags are moving to aircraft. We are dead in the water.
> We need you to authorize a switch to "Manual Operations" immediately. We need 20+ staff down here to move bags by hand or we will miss every slot.
> — BHS Duty Manager

### [INJECT I-08b] — Hand to IT Director
Time: 1:40 · Type: **[CLUE]** (Attribution) · Format: Email Forward

> **From:** Kyle (Summer Intern – Ops) · **To:** IT Helpdesk · **Subject:** Uh oh...
> "Hey guys, I think I messed up. I clicked a link in an email yesterday that said 'Free Browns Tickets' on the Ops workstation (OPS_INTERN_03). My computer has been acting weird since. I didn't say anything because I didn't want to get fired. Is this related?"

---

## Phase 3: Manual Mode (Exercise Hour 2:00 – 3:00)

### [INJECT I-09] — Hand to IT Director
Time: 2:00 · Type: **[CORE NARRATIVE]** (Forensics) · Format: Technical Log Printout

```
SYSTEM LOG: AODB_SQL_MASTER
IP: 10.66.0.10
OS: Windows Server 2019

10:03:12 [WARN] Failed Login: User 'ADMIN' from IP 192.168.1.55 (Workstation: OPS_INTERN_03)
10:03:13 [WARN] Failed Login: User 'ADMIN' from IP 192.168.1.55
10:03:14 [WARN] Failed Login: User 'ADMIN' from IP 192.168.1.55
10:03:15 [INFO] Successful Login: User 'ADMIN' from IP 192.168.1.55
10:04:00 [INFO] SERVICE STOPPED: 'FIDS_Data_Stream'
10:04:05 [INFO] FILE UPLOAD: 'random_gate_generator.ps1' (Size: 45KB)
10:05:00 [CRIT] EXEC: UPDATE flight_schedule SET gate = RAND(), dest = 'PURGATORY' WHERE status = 'ACTIVE';
10:05:01 [INFO] Rows Affected: 142
10:06:00 [INFO] SERVICE STARTED: 'FIDS_Data_Stream'
```

### [INJECT I-10b] — Hand to Security / LEO
Time: 2:20 · Type: **[CONFUSION]** (Physical Security Impact) · Format: Phone Message Slip

> **Source:** TSA Screening Manager
> **Message:** "We are trying to verify boarding passes, but the scanners are rejecting everyone because the flight data doesn't match the bar codes. The line is backing up past the atrium. People are getting crushed. We are going to stop screening completely until you fix the data."

### [INJECT I-11b] — Hand to PIO
Time: 2:35 · Type: **[DISTRACTION]** (Public Sentiment) · Format: Tweet with Video Printout

> **Handle:** @ConspiracyTruth
> **Message:** "Look closely! The screens aren't hacked. They are coded messages for the deep state! 'PURGATORY' = Operation P. The airport is a black site! Storm the doors!"
> **Video:** Shaky footage of people yelling at a blank screen. (0:07)

### [INJECT I-12] — Hand to PIO
Time: 2:45 · Type: **[PRESSURE]** (Media) · Format: Phone Message Slip

> **WHILE YOU WERE OUT**
> **TO:** Public Information Officer · **FROM:** Assignment Desk, Channel 5 News (ABC Affiliate) · **TIME:** 11:45 AM
> **MESSAGE:** "We are getting viewer photos of 'Flight 666' on your boards. We also have a source in the terminal saying the baggage system is hacked. We are going live at Noon (15 minutes). We are running with the headline: 'CYBER TERROR AT NCIA: IS IT SAFE?' We need a statement NOW."

---

## Phase 4: Recovery (Exercise Hour 3:00 – 4:00)

### [INJECT I-13b] — Hand to Ops Director
Time: 3:10 · Type: **[OPERATIONAL FRICTION]** (Tenant Relations) · Format: Radio Call Transcript

> **Source:** United Airlines Station Manager
> **Message:** "I see you rebooting the screens. If you put bad data up there again, I will pull my staff from the counters. I need a written guarantee that the data is 100% accurate before I open my gates."

### [INJECT I-14b] — Hand to IT Director
Time: 3:20 · Type: **[TECH HURDLE]** (Recovery Failure) · Format: Server Error Message

> "Error 404: Backup Tape Library Not Mounted. Restoration Failed. Please insert Tape Set #44-B manually."

### [INJECT I-15] — Hand to All
Time: 3:45 · Type: **[END GAME]** · Format: FIDS Screen

> **Image:** The board flickers and resets. "UA 1245 to Chicago – ON TIME".
> **Message:** ENDEX.

*End of Master Inject Deck*
