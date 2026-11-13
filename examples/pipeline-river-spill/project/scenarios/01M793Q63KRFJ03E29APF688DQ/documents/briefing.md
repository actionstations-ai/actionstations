# Player Briefing Packet
## Ditch to Intake — Prairie Line River Crossing Release & Water Intakes

Location: Ironbark Pipeline Control Center (Tulsa) and the Mill Ridge Station incident command post, Prairie Line Kansas River crossing, Prairie Bend County, Kansas · Exercise Duration: 4 Hours
Current Time: 05:45 AM (Exercise Time) · Weather: Clear and warm across Tulsa and Prairie Bend County, Kansas, with a light south wind just after sunrise and a hot June afternoon expected.

### 1. Situation Brief

It is 05:45 Central Daylight Time on Tuesday 8 June 2027. In the Ironbark Pipeline Control Center in Tulsa, day-shift supervisor Nadia Kowalczyk has just finished the shift handover. The Prairie Line is carrying about 31,000 barrels a day of medium sour crude from Hollis Gathering Terminal to Wabash Junction Terminal. Pressure at the milepost 214.3 Kansas River crossing is steady at about 880 psi. Mill Ridge Station (MP 213.1) and Sandhill Valve (MP 215.6) both show OPEN and can be operated remotely. The PLC-2 console is busy with routine work: Wabash Junction has a tank gauge recalibration booked for 07:30 and wants tickets signed off early. On-call Qualified Individual Teresa Holloway is reachable by page. Prairie Spill Response Cooperative is running a normal weekday from its Topeka, Wichita and Kansas City sites. Downstream, the Prairie Bend Rural Water District (river mile 11) and the Sterling Bluff Water Department (river mile 34) are drawing river water as usual for early-summer demand. The Kansas River is running at about 8,500 cfs, with a surface current near 2 knots.

- Prairie Line SCADA and computational pipeline monitoring (PLC-2 console, Tulsa Control Center): GREEN: normal throughput, about 880 psi at MP 214.3, no active alarms on the Prairie Bend segment
- Remote block valves: Mill Ridge Station (MP 213.1) and Sandhill Valve (MP 215.6): GREEN: both OPEN and remotely available
- Kansas River flow, current and wind data feeding the trajectory model: GREEN: about 8,500 cfs, current near 2 knots, light south wind; data feeds current
- Prairie Spill Response Cooperative: river boom, boats and crews (Topeka, Wichita, Kansas City): GREEN: routine weekday readiness, duty manager on call
- Downstream intakes: Prairie Bend Rural Water District (mile 11) and Sterling Bluff intake and treatment SCADA: GREEN: both intakes open, treatment normal, Sterling Bluff storage full
- IMT call-out, Joint Information Center contacts and claims line readiness: GREEN: on-call rosters current, no open incidents

**The Anomaly:** **05:52 — Tulsa Control Center, PLC-2 console**

The Prairie Line controller turns around in his chair to talk to shift supervisor Nadia Kowalczyk. The console has just logged a pressure rate-of-change alarm at the MP 214.3 crossing (881 psi falling to 835 psi over two minutes). At the same time it flagged a small computational pipeline monitoring flow imbalance of 1.8% on the MP 196–231 segment, with medium confidence and no location given. No pump has tripped, no valve has moved and no maintenance work order is open on the segment.

The controller says: *"Nadia Kowalczyk, I've got a rate-of-change and an imbalance at the river crossing. Could be a transient. Do I hold rate?"*

**YOUR MISSION:** Keep the Prairie Line running safely and reliably, and keep the downstream community's trust, while you investigate and resolve any abnormal condition on the Prairie Bend segment. You will have to balance speed against verification. You need to act and notify before the facts are confirmed, but every estimate, decision and message must stay inside your team's authority and match the plan.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Qualified Individual / Incident Commander (Ironbark)**— Qualified Individual / Incident Commander (Ironbark) | You own plan activation, the IMT activation level, funding up to $5 million and the contract with Prairie Spill Response Cooperative. You also hold Ironbark's seat in any Unified Command. | **Activate: decide the IMT level based on what could be in the water, not on a confirmed volume.** **Commit: release funds and put the OSRO in motion immediately, because hours lost arguing over cost are not recovered.** **Lane: Ironbark pays and proposes. It does not close intakes, fisheries or ramps, and it does not authorize burning or dispersants. Bring your objectives to the Unified Command.** |
| **Team B: Control Center Shift Supervisor**— Control Center Shift Supervisor | You own line operation, shutdown and valve isolation, the SCADA and computational pipeline monitoring data, and the first report as the person in charge. | **Shut Down: if you cannot rule out a leak within 10 minutes, stop the line and close the block valves. Do not restart the line to test it.** **Report: as the person in charge, make the required external report on time. Do not wait for anyone's approval to make the call.** **Record: log every alarm, valve time, estimate and call as it happens, giving volumes as a barrel range with their SCADA basis and never a cause.** |
| **Team C: Environmental Unit Leader**— Environmental Unit Leader | You own the trajectory, the ICS 232 Resources at Risk ranking, the sampling plan and coordination with the trustee agencies. | **Windows: give every arrival estimate as an earliest-to-latest window with the model run time, and rerun it when flow or observations change.** **Rank: protect drinking water intakes first, then listed species and sensitive habitat, and show your reasoning on the ICS 232.** **Evidence: keep crews out of sensitive wildlife areas until the trustee agency directs the work, and recommend reopening anything only on test results.** |
| **Team D: Public Information Officer / Joint Information Center**— Public Information Officer (Joint Information Center) | You own Ironbark's messages through the Joint Information Center, media and resident inquiries, and the claims line. | **Clear: release nothing until the Joint Information Center has cleared it, even if outside news gets ahead of you.** **One Number: use only the single agreed barrel range and its basis, and never round it down to sound smaller.** **Truth over Reassurance: never say the water is safe to drink. Send drinking water questions to the utilities and the state, and send claimants to the claims line.** |
| **Team E: OSRO Duty Manager (Prairie Spill Response Cooperative)**— OSRO Duty Manager (Prairie Spill Response Cooperative) | You own the cooperative's responders, boats, vacuum trucks and river boom at the Topeka, Wichita and Kansas City sites, measured against your Tier 1 and Tier 2 commitments. | **Real ETAs: report real arrival times for crews and boom, even when they fall short of what the IMT hopes for.** **Angle: in a current of about 2 knots, angle the boom to deflect oil to collection points. Never set it square across the flow.** **Escalate: call in Tier 2 and subcontractors early, and put scarce boom where the Unified Command's priorities direct, not wherever the first caller asks.** |
| **Team F: Water Department Director (Sterling Bluff)**— Director (Sterling Bluff Water Department) | You own the decisions to close and reopen the Sterling Bluff intake, supply for 41,000 customers, and direct notice to critical-care customers. | **Own the Call: the intake decision is yours, not Ironbark's, and outside pressure does not change that.** **Close Early: if you close, have the gate shut and the line drained at least 1 hour before the earliest arrival in the trajectory window.** **Critical Customers: call the dialysis center, the medical center and the nursing homes directly before any public notice, and reopen only on test evidence.** |

### 3. Rules of Engagement

- Start and end every radio, phone and chat message in this room with "This is an exercise", so that nobody in the Control Center, the cooperative or the utilities mistakes a scenario call for a real pipeline emergency.
- If a real emergency happens at any time, including a real alarm on a live console, say "REAL WORLD, REAL WORLD". The exercise stops immediately so everyone can deal with the real event.
- The facilitator may announce "Time Jump: it is now [time]" to skip ahead. When that happens, treat the board, the river and your resources as they would stand at the new time.
- Treat printed injects (alarm printouts, chat logs, tickets, photos, news posts and reports) as real intelligence, because they are the only way the situation will reach you.

### 4. Incident Briefing Form (ICS-201)

Use this form to log the situation as it evolves. This is your "Board of Record."

**1. Incident Name:** ________________ · **2. Incident Number:** ______ · **3. Date/Time Initiated:** ________

**4. MAP SKETCH** — (Sketch the facility layout. Mark affected areas, command post, staging.)

**5. CURRENT SITUATION SUMMARY AND HEALTH AND SAFETY BRIEFING** — (What do we know? What is broken? What is the hazard to people?)

**7. CURRENT AND PLANNED OBJECTIVES**
1. _____
2. _____
3. _____

**8. CURRENT AND PLANNED ACTIONS** — | Time | Action |

**10. CRITICAL RESOURCE STATUS**

| Resource | Status (Green/Yellow/Red) | Notes |
|---|---|---|
| Prairie Line SCADA and leak detection with the Mill Ridge and Sandhill remote block valves | | |
| Kansas River flow, current and wind data feeding the trajectory model | | |
| Prairie Spill Response Cooperative boom, boats and crews | | |
| Aerial and drone surveillance of the leading edge | | |
| Prairie Bend Rural Water District intake (mile 11) | | |
| Sterling Bluff intake, treatment SCADA and 36-hour storage | | |
| JIC messaging, claims line and public mood | | |

*End of Briefing Packet*
