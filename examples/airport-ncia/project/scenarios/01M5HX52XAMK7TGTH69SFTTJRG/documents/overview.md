# Master Scenario Events List (MSEL)

**Scenario 3: "Flight to Nowhere" (Data Integrity & FIDS)**
Location: North Coast International Airport (NCIA) · Duration: 4 Hours
Target Audience: Airport Operations, IT/Cybersecurity, Public Safety, Public Information (PIO).

## Scenario Overview

**Theme:** Data Integrity, Public Trust, and Crowd Management.

**The Threat:** A malicious actor has gained access to the airport's "Airport Operational Database" (AODB), which feeds data to the Flight Information Display Systems (FIDS), Baggage Handling System (BHS), and the automated Public Address (PA) system.

**The Operational Impact:** Passengers are misinformed, directed to the wrong gates, or told their flights are cancelled when they aren't. This causes crowding, missed flights, and potential safety hazards.

**Core TIRP Sections Tested:**
- Section 1.4.5: Communication Systems (Using alternative methods).
- Section 4: Repopulation (Managing passenger flow).
- Section 13.6: FIDS / BHS System Failure (Technical response).

## Roles & Responsibilities (For Students)

- **Ops Director (Incident Commander):** Manages the physical terminal and passenger safety.
- **IT Director (Technical Lead):** Manages the investigation and system restoration.
- **Public Information Officer (PIO):** Manages social media and press inquiries.
- **Airport Security Coordinator (ASC):** Monitors crowd temper and physical security.
- **Airline Liaison:** Represents the frustration of the tenant airlines (Skyline, HWK Air, etc.).

## Phase 1: The Glitch (Hour 0:00 – 1:00)

Goal: To test initial problem identification and the reluctance to declare an incident.

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 0:00 | START | Facilitator | All | STARTEX (Start Exercise). Current time: 09:00 AM on a busy Thursday. Weather is clear. Passenger load is high due to a holiday weekend. | Establish baseline operations. Review TIRP Section 13. |
| 0:15 | I-01 | Airline Rep | Ops | Phone Call: "Hey Ops, this is Skyline at Gate B4. The screen above the gate says this flight is going to 'Miami', but my flight is going to 'Minneapolis'. Passengers are confused. Can you fix the typo?" | Ops logs a ticket with IT. IT likely treats this as a minor display error/glitch. |
| 0:20 | I-02a | Helpdesk | IT | Ticket #4492 (Noise): Vending machines in Concourse B are spitting out soda cans randomly. | IT ignores or deprioritizes (correctly). Ops calls maintenance. |
| 0:30 | I-02 | IT Helpdesk | IT Lead | Ticket Update: "We checked the FIDS server. The data stream from the AODB is actually sending 'Miami'. It's not a display error; the source data changed." | IT investigates the AODB logs. Ops assumes it's a one-off database error. |
| 0:45 | I-03 | TSA | Ops | Radio Call: "Ops, TSA Checkpoint. We have passengers scanning boarding passes for a HWK Air flight to Chicago, but the FIDS board in the lobby lists that flight as 'Cancelled'. They are arguing with my TSOs." | Ops must verify flight status with HWK Air directly. Realize the data on screens contradicts reality. |
| 0:55 | I-04 | Social Media | PIO | Tweet (@TravelGuy99): "NCIA is a joke! Boards say my flight is at Gate A1. I walked to A1 and it's empty. App says A12. Now I'm gonna miss my flight! #Fail" | PIO monitors sentiment. Ops realizes the error is spreading to multiple flights. |

## Phase 2: The Crisis (Hour 1:00 – 2:00)

Goal: To escalate the situation to a point where "Business as Usual" is impossible.

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 1:00 | I-05 | Facilitator | All | SCENARIO JUMP: It is now 10:00 AM. The errors are multiplying. 20% of flights on the big board show incorrect times or gates. | Activate Section 13.6 (FIDS Failure). Ops should consider putting "Whiteboard Teams" on standby. |
| 1:10 | I-05b | Parking | Ops | Radio Call (Red Herring): Fire alarm reported in the Long Term Parking Deck. | Ops dispatches Fire to garage but keeps Police/Ops focused on the terminal issues. |
| 1:15 | I-06 | Automated PA | All | Audio/Visual Inject: The terminal PA system announces: "Attention passengers. Flight 666 to Purgatory is now boarding at all gates." FIDS screens show the same. | CRITICAL DECISION POINT: Ops must silence the PA system immediately. IT must disconnect the PA server from the network. |
| 1:20 | I-06b | Social Media | PIO | Facebook Post: Viral rumor claiming ISIS has taken over the control tower and planes are crashing. | PIO must issue an immediate "Myth Busting" statement denying physical threats to aircraft. |
| 1:30 | I-07 | BHS Control | Ops | Phone Call: "Ops, Baggage Control here. The sortation logic is corrupted. The system is sending all bags for Concourse A (Skyline/HWK Air) to the 'Manual Encode' pier in the basement. The belt is jammed." | Ops coordinates with Airlines to initiate manual baggage handling. Massive delays expected. |
| 1:40 | I-08b | IT Helpdesk | IT Lead | Email Forward: Intern admits to clicking a phishing link ("Free Ironclads Tickets") on workstation OPS_INTERN_03. | IT identifies "Patient Zero" and begins isolating that workstation to stop the attack vector. |
| 1:45 | I-08 | Airline Rep | Ops | Face-to-Face: (Angry) "Our pilots are refusing to push back because their electronic flight bags are syncing with your airport data, and it's feeding them bad gate info. We are grounding all flights until you confirm your data is clean." | Ops must declare an official Incident. Establish Unified Command. |

## Phase 3: Manual Mode (Hour 2:00 – 3:00)

Goal: To force the transition from digital tools to analog/manual procedures.

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 2:00 | I-09 | IT Lead | Ops | Technical Update: "We have found unauthorized admin access in the AODB SQL database. Someone is running a script (random_gate_generator.ps1) that randomizes gate assignments." | DECISION POINT: Ops must authorize a total shutdown of FIDS. The terminal screens go black. |
| 2:15 | I-10 | Facilitator | Ops | Visual Inject: Show a photo of a crowded terminal with blank screens. Passengers are crowding around airline counters demanding info. Noise levels are high. | Ops deploys staff with megaphones and whiteboards (Section 13.7 Checklist). PIO puts out "Go to your airline app" messaging. |
| 2:20 | I-10b | TSA | Ops | Phone Call: TSA screening is stopping because boarding pass data doesn't match the system. Lines are backing up dangerously. | Ops/LEO must manage the crowd crush at the checkpoint. Ops may ask TSA to move to "manual ID check" mode. |
| 2:30 | I-11 | Security | Ops | Radio Call: "Crowd crush situation at Gate C4. Two flights were directed there by the old screen data. Passengers are fighting over seats." | Ops directs Police to C4. Priority shifts to crowd control and safety over flight operations. |
| 2:45 | I-12 | Media | PIO | Phone Call: "Channel 5 News here. Going live in 15 minutes. We are reporting this is 'Cyber Terror'. Comment now or we run with it." | PIO must issue a holding statement that calms the public without confirming details they don't have yet. |

## Phase 4: Recovery & Verification (Hour 3:00 – 4:00)

Goal: To manage the complex process of "trusting the data" again.

| Time | Inject ID | From | To | Event / Message | Expected Action |
|---|---|---|---|---|---|
| 3:00 | I-13 | IT Lead | Ops | Technical Update: "We have isolated the compromised server and restored the AODB from a backup taken at 04:00 AM. We believe the data is clean." | IT requests permission to bring FIDS back online. |
| 3:10 | I-13b | Airline Rep | Ops | Threat: "If you turn those screens on and they show bad info again, I am pulling my staff. I need a guarantee." | Ops hesitates. Asks IT for a verification plan. |
| 3:15 | I-14 | Ops | IT | Operational Query: "Before we turn the screens on, how do we know the script isn't still hidden?" | IT and Ops devise a testing plan (e.g., turn on one single screen at a remote gate to verify). |
| 3:20 | I-14b | Server | IT | Error Message: "Backup Tape Library Not Mounted." Restoration hits a snag. | IT must troubleshoot or find an alternate backup source. Delaying recovery. |
| 3:30 | I-15 | Airlines | Ops | Coordination: "We need to manually verify every flight in the system before you publish it." | A tedious "data reconciliation" process begins between Airport Ops and Airlines. |
| 3:45 | END | Facilitator | All | ENDEX (End Exercise). The screens are successfully restored. | Move to Hot Wash / Debrief. |
