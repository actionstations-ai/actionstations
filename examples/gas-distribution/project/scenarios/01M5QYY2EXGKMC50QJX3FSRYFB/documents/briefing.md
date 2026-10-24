# Player Briefing Packet
## Ghost Pressure — SCADA vs. Field Gauges & Life Safety

Location: Corwin Valley Gas Company, City of Corwin, Lake Haven County, Pennsylvania · Exercise Duration: 4 Hours
Current Time: 16:30 PM (Exercise Time) · Weather: Clear and cold, with temperatures at 12°F

### 1. Situation Brief

The gas system is operating on send-out near the winter peak, with city gates, regulator stations, and mains under nominal conditions. The gas control room is monitoring all SCADA telemetry, including pressure readings from RS-21 and RS-22, and all remote-control valves are responsive. The network is stable, with no alarms triggered across the pipeline system. Field crews are conducting routine checks on pressure districts 1, 2, and 7, which include critical facilities such as Corwin General Hospital, the 911 center, and two nursing homes. The control room and field teams are in normal communication, and all systems—SCADA HMI, historian, RTUs, gas chromatographs, and telemetry links—are reporting green status. The evening shift is underway with full staffing, and no unusual events have been reported yet.

- City Gates (Harlan Road, Millstream Gate): Normal
- Regulator Stations (RS-21, RS-22): Normal
- Mainline Pipelines (7, 100, 200, 300): Normal
- Gas Control Room (SCADA HMI, historian, alarm management): Normal
- RTUs at RS-21, RS-22, and Valve Sites: Normal
- Remote-Control and Automatic Shut-Off Valves (RCV/ASV): Normal
- Compressor Unit Control Panels and Station ESD: Not Applicable (CVG has no compressors)
- Fire and Gas Detection Systems: Normal
- Electronic Flow Measurement, Gas Chromatographs, Odorant Injection: Normal
- Low-Pressure District Pressure Telemetry (PR-7A, PR-7B): PR-7B: Normal; PR-7A: Offline
- AMI Gas Meters: Normal
- Radio, Cellular, and Satellite Telemetry Links: Normal
- IT and OT Networks: Normal
- Security Systems (Perimeter, Access Control): Normal
- Staffing (Gas Control, Field, Management): Full Shift

**The Anomaly:** 16:35 PM — Field Unit (Radio) → Gas Control Manager: 'Control, this is M&R Tech Jones at RS-22. I just did a field gauge check on the RS-22 outlet and it reads 30 in. w.c.—that's 1.1 psig. The SCADA HMI shows 10 in. w.c., which is within limits. But the gauge is not budging, and the pressure is holding. I'm not sure what to trust here.'

**YOUR MISSION:** Maintain system integrity and public safety while investigating and resolving the discrepancy between SCADA telemetry and field pressure readings, balancing the need for rapid action against the risk of unnecessary shutdowns.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— VP Gas Operations (Incident Commander), Gas Control Manager (GCM), Cybersecurity Coordinator (TSA), Corporate Security Manager, Corporate Communications / Public Awareness Manager | You own the overall incident response, including activation of emergency plans, approval of district shutdowns, and coordination of all major actions. You are responsible for ensuring life safety is prioritized and that no unapproved actions occur across any team. | **Authority First: You have the final say on shutdowns and curtailments, even if field and control disagree.** **Life Safety Above All: If field personnel report overpressure and a fire, shut in the district immediately.** **Do Not Delay: If SCADA shows normal pressure but field says 14 in. w.c., trust the field and act.** |
| **Team B: Gas Control**— Gas Control Manager (GCM) | You own system pressure, line pack, remote valve operations, and manual control if SCADA fails. You are responsible for verifying pressure anomalies and initiating isolation procedures when field and SCADA disagree. | **If SCADA and field disagree on pressure, trust the field and initiate manual isolation.** **Do not override a field report of overpressure without IC approval.** **If a command appears that no operator issued, declare a cyber incident immediately.** |
| **Team C: Technical**— Cybersecurity Coordinator (TSA) | You own the OT/SCADA system, CISA reporting, IT/OT isolation, and the incident response plan. You are responsible for declaring a cyber incident and managing network integrity. | **Declare a cyber incident if any setpoint change is unauthorized or unexplained.** **Isolate the OT network from IT immediately after a cyber suspicion.** **Disable remote access to the jump host and revoke integrator accounts upon compromise.** |
| **Team D: Field**— Field Operations Supervisor (M&R) | You own regulator station checks, manual valve closures, field gauges, and relights. You are responsible for verifying pressure readings and reporting anomalies to Gas Control and Incident Command. | **If a field gauge shows overpressure, report it to GCM and IC immediately.** **Do not close a valve without GCM or IC authorization, even if pressure is dangerously high.** **Confirm all pressure readings with a second gauge if possible.** |
| **Team E: Security**— Corporate Security Manager | You own the physical security of city-gate and station facilities, and the law enforcement liaison. You are responsible for securing facilities and restricting access during cyber or physical threats. | **If a cyber incident is declared, secure all station perimeters and restrict access to authorized personnel only.** **Liaise with FBI and local police immediately upon any unauthorized access to OT systems.** **Do not allow field crews to enter a station without a security clearance if a cyber incident is active.** |
| **Team F: Communications**— Corporate Communications / Public Awareness Manager | You own media, evacuation and relight notices, and public messaging. You are responsible for issuing timely, accurate public information and correcting misinformation. | **Issue a public evacuation notice within 15 minutes of a confirmed overpressure.** **Correct false media reports about explosions immediately and clearly.** **Use the 'smell gas, act fast' message to reinforce public safety.** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs, say 'REAL WORLD, REAL WORLD' immediately and the exercise will stop.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead in the narrative.
- Printed injects (posts, logs, photos, reports) are intelligence—treat them as real and act accordingly.

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
| SCADA HMI (PipeView) | | |
| RTUs at RS-21 and RS-22 | | |
| Field pressure gauges at RS-21 and RS-22 | | |
| District recorder PR-7B (cellular link) | | |
| Remote control valves (RCVs) at RS-21 and RS-22 | | |
| OT jump host (CVG-OT-JMP01) | | |
| Integrator account (halden-support) access | | |
| Cellular telemetry for PR-7A and PR-7B | | |
| Gas control room (HMI and console) | | |
| Field crew radios | | |
| Public mood (evacuation readiness, panic level) | | |
| Media reports (Channel 16, Corwin Courier) | | |

*End of Briefing Packet*
