# Player Briefing Packet
## Stale Signal — A Telemetry Outage, a Transmission-Main Break and a Boil-Water Decision

Location: Riverside Water Treatment Plant, 1400 River Road, Millbrook, Carver County, Ohio · Exercise Duration: 4 Hours
Current Time: 05:30 (Tuesday, July 14) (Exercise Time) · Weather: Clear and already warm; forecast high 97°F

### 1. Situation Brief

It is the third morning of a July heat wave. Demand is near 14 MGD against a plant rated at 16.0 MGD. The Riverside Water Treatment Plant is in automatic with one operator in the Control Room; the day shift arrives at 06:00 and Distribution has a crew on call. Hilltop Tank filled overnight to 33 feet. Telemetry to the remote sites runs through the Hilltop repeater RP-1, with a cellular backup for Hilltop Tank itself.

- Treatment plant: Automatic; HSP-1 and HSP-2 running
- Demand: Near 14 MGD
- Hilltop Tank: 33 ft
- Telemetry: All sites reporting
- Zones 1–3 pressure: Normal
- Staffing: One operator; day shift at 06:00; Distribution on call

**The Anomaly:** 05:35 — The HMI flags Orchard Standpipe, Northgate, Mill Road Booster Station and the Orchard Wellfield as stale, and Hilltop Tank too, even though Hilltop should have switched to its cellular backup.

**YOUR MISSION:** Keep water flowing to all three zones in the heat, find and isolate whatever is wrong while you cannot see your system, protect the hospital and dialysis patients, and tell customers clearly what to do.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— Director of Water Operations (Incident Commander) | Command; incident level, boosters and interconnects, and advisories with the Water Quality Manager. | **A stale value is unknown.** **For a Hilltop main break: Mill Road booster, wellfield at full, IC-1 below 12 ft or above 7 MGD.** **Warn the hospital at once if Zone 1 pressure is at risk.** |
| **Team B: SCADA / IT**— SCADA / IT Security Manager (Technical Lead) | Telemetry, the HMI and the stale-data checklist. | **List every stale tag before acknowledging the alarm.** **Find whether it is the radio, the gateway or a server.** **An outage during an unusual trend is CODE CLEARWATER until explained.** |
| **Team C: Distribution**— Distribution Superintendent (Distribution) | Breaks, valves, interconnects, field readings and flushing. | **Isolate with the fewest valves; confirm the area by street.** **IC-1 is a two-person operation after a call to the County duty desk.** **Read storage sites by sight gauge while telemetry is stale.** |
| **Team D: Water Quality / Lab**— Water Quality Manager (Compliance) | Sampling, advisory triggers, DDAGW and Public Health. | **Pressure below 20 psi starts the advisory decision.** **Sample the depressurized area and its edges.** **Consult DDAGW within 24 hours.** |
| **Team E: Public Information**— Public Information Officer (PIO) | Notices, media, social media and MillbrookAlert. | **Critical customers before the public.** **Advisory areas by streets.** **A next-update time every time.** |

### 3. Rules of Engagement

- Begin and end every radio and phone message with “This is an exercise.”
- If a real emergency occurs, the facilitator says “REAL WORLD, REAL WORLD” and the exercise stops.
- You only know a level or a pressure if you have sent someone to read it, until telemetry returns.
- Treat printed injects as real information; ask the SimCell for anything you would normally be able to look up.

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
| Hilltop radio cabinet: RP-1 and RTU-01 (shared 24 VDC supply) | | |
| Hilltop Tank level (sight gauge while stale) | | |
| Valves V-2410, V-2418 (and V-2422 as the fallback) | | |
| Mill Road Booster Station BP-401 / BP-402 and suction PIT-631 | | |
| Interconnect IC-1 (Carver County Water District, two-person operation) | | |
| High Service Pump Station and plant discharge PIT-501 | | |
| Northgate Reservoir (LIT-621) and ALV-301 | | |
| Millbrook General Hospital supply pressure and its tanker contract | | |
| Home-dialysis patients and the Carver Kidney Center (chloramine) | | |
| ERP-3 sampling in the depressurized area | | |
| Customer Service call log by street | | |
| Public mood (calls, posts, press) | | |

*End of Briefing Packet*
