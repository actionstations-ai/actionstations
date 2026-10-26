# Player Briefing Packet
## Deadline Ransom — Ransomware on the NAS and the processing workstation before a client deadline

Location: Millbrook Road hangar complex (Hangars 1–3), Harwick, Calder County, New York · Exercise Duration: 4 Hours
Current Time: 09:00 (Monday, October 5) (Exercise Time) · Weather: Clear, 52°F

### 1. Situation Brief

It is Monday morning in the processing week for CP&L Deliverable D-3, the calibrated hyperspectral cubes from the Lakeshore summer campaign, due on October 15. The processing team is in Hangar 3, two crews are preparing a CVAC field collection at Horton Field for 10:30, and the ground control stations that docked over the weekend are in Hangar 2. Backups run nightly to an off-site service, and the offline drives OB-1 and OB-2 rotate weekly, one in the General Manager’s safe.

- HUOG-NAS01 and processing workstations: Normal on Friday
- GCS fleet: GCS-01 to GCS-04 on baseline; tablets GCS-05/06
- Backups: OB-1 in the safe; OB-2 in the rack; off-site nightly
- CP&L D-3: Due October 15
- CVAC collection: Planned 10:30

**The Anomaly:** 09:05 — The processing analyst reports that every file in the D-3 folders has been renamed and a ransom note sits in every folder; the workstation shows the same note.

**YOUR MISSION:** Contain the attack without losing the fleet or the evidence, find out what was taken, recover the client data in the right order, and tell your clients the truth inside their contract clocks.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Leadership**— General Manager (Leadership) | Client and regulator notification, the no-pay decision and the Group’s public position. | **Decide within four hours whether client deadlines are at risk.** **CP&L’s 24-hour notice applies if its data may have been read.** **The Group does not pay; record it.** |
| **Team B: Systems / Cybersecurity**— Systems & Cybersecurity Lead (Systems / Cybersecurity) | Containment, the GCS baseline, backups and the MSSP. | **Isolate the Data VLAN and disconnect the NAS.** **A GCS that mounted the NAS is infected.** **OB-x stays offline until the MSSP clears the environment.** |
| **Team C: Flight Operations**— Director of Flight Operations (Flight Operations) | Which flights go, on which GCS, with which crews. | **No flight on an uncleared GCS.** **No GCS on the NAS until told.** **Clients hear about flight changes through the Campaign Lead.** |
| **Team D: Payload & Calibration**— Payload & Calibration Lead (Payload & Calibration) | Processing, calibration integrity and payload media. | **Nothing is processed until it matches its manifest.** **Calibration share first.** **Payload media are custody items.** |
| **Team E: Corporate Communications**— Corporate Communications (Communications) | All external messaging under UC-CP-2025. | **Staff do not speak to the media.** **No ransom, demand or loss confirmed without the General Manager.** **A next-update time every time.** |

### 3. Rules of Engagement

- Begin and end every radio and phone message with “This is an exercise.”
- If a real emergency occurs, the facilitator says “REAL WORLD, REAL WORLD” and the exercise stops.
- The facilitator will announce time jumps; treat the new time as real.
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
| HUOG-NAS01 (campaigns, flightlogs, ops, calibration, controlled shares) | | |
| Processing workstations HUOG-PROC01 / HUOG-PROC02 | | |
| HUOG-FW01 and the Data VLAN isolation | | |
| GCS-01 to GCS-04 (baseline 03.2026-B / L-2026.2) and tablets GCS-05/06 | | |
| Offline drives OB-1 (safe) and OB-2 (rack) | | |
| Off-site backup service | | |
| Payload SSDs in the Hangar 3 media cabinet | | |
| Calibration share and repository hashes | | |
| CP&L D-3 (due October 15) and the 24-hour exposure notice | | |
| CVAC collections (7-day products; 5-day exposure notice) | | |
| SecureWatch MSSP and the FBI report | | |
| Public mood (posts, press) | | |

*End of Briefing Packet*
