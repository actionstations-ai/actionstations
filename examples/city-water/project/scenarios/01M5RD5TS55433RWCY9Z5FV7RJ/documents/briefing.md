# Player Briefing Packet
## Ransomware Riptide — Ransomware at City Hall and the Island Decision

Location: Riverside Water Treatment Plant, Millbrook, Carver County, Ohio · Exercise Duration: 4 Hours
Current Time: 09:00 (Monday, October 26) (Exercise Time) · Weather: Clear and mild, 58°F

### 1. Situation Brief

It is a normal Monday morning. Demand is about 9 MGD and the Riverside Water Treatment Plant is in automatic, with one certified operator in the Control Room and the Plant Superintendent on site. Distribution crews are out on routine work, including hydrant flushing on Linden Street posted last week and the Monday inspection at Hilltop Tank. City Hall opened at 08:00; Customer Service is taking calls on the billing system and the lab is entering the morning samples in LIMS.

- Treatment process and chemical feeds: Normal (automatic)
- Finished-water chlorine, pH, fluoride, turbidity: Normal at the 08:00 sample
- Control network (SCADA servers, HMIs, MBW-EWS-01): Normal
- Business network (MBW-CIS-01, MBW-AMI-01, MBW-FS-01, LIMS): Normal
- Distribution and storage: Normal
- Staffing: One operator in the Control Room; Superintendent on site

**The Anomaly:** 09:07 — The Distribution Office calls the Control Room on radio DWS-1: its files have been renamed and a ransom note is on every desktop. Customer Service at City Hall sees the same on the billing screens.

**YOUR MISSION:** Keep safe water flowing and the plant under your control while the City’s business network is down, decide whether and when to cut the control network off from it, and tell customers and the public only what you know.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— Director of Water Operations (Incident Commander) | Command of the plant and distribution system; declares incident levels, approves islanding and manual operations, and staffs them. | **Trust the field: act on field readings and grab samples when the screen and the field disagree.** **Coordinate by phone and radio DWS-1 during a cyber incident.** **Record every decision and its basis on ERP-1.** |
| **Team B: SCADA / IT**— SCADA / IT Security Manager (Technical Lead) | The control network, its firewall rules and remote access, the islanding steps and the technical investigation, working with City IT. | **Do not power off, reimage or clean the SCADA hosts (OT Plan 10.7).** **On business-network ransomware, have FW-R-17, FW-R-22 and FW-R-14 disabled at once.** **Decide within 30 minutes whether to island the control network.** |
| **Team C: Public Information**— Public Information Officer (PIO) | Media, social media, MillbrookAlert and the City website. | **Use the cyber holding statement until the Director and the Water Quality Manager approve more.** **Never confirm a ransom demand or discuss payment.** **Give a time for the next update every time.** |
| **Team D: Water Quality / Lab**— Water Quality Manager (Compliance) | Sampling, the lab, regulatory reporting and the advisory triggers. | **Answer water-quality questions from grab samples.** **Record results on paper bench sheets when LIMS is down.** **Notify Ohio EPA DDAGW within 24 hours of a cyber event that affects monitoring.** |
| **Team E: Customer Service**— Customer Service Lead (Customer Service) | The customer service center, the surge line, the critical-customer list and the manual workarounds for billing. | **Switch to paper intake forms and the printed critical-customer list when MBW-CIS-01 fails.** **No disconnections for non-payment while billing is down.** **Report complaint patterns to the Control Room.** |

### 3. Rules of Engagement

- Begin and end every radio and phone message with “This is an exercise.”
- If a real emergency occurs, the facilitator says “REAL WORLD, REAL WORLD” and the exercise stops.
- The facilitator will announce time jumps; treat the new time as real.
- Treat printed injects as real information; you may ask the SimCell for anything you would normally be able to look up.

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
| Business network: MBW-CIS-01, MBW-AMI-01, MBW-FS-01, MBW-LIMS-01 | | |
| Backup server MBW-BKP-01 and the tapes in the City Hall vault | | |
| Domain controllers MBW-DC-01 / MBW-DC-02 and the MBWSCADA → MILLBROOK trust | | |
| Firewall MBW-FW-01 rules FW-R-17, FW-R-14, FW-R-22 | | |
| SCADA servers MBW-SCADA-SRV01 / SRV02 | | |
| Engineering workstation MBW-EWS-01 | | |
| HMIs MBW-HMI-01 / 02 / 03 | | |
| PLC-02 (chemical feed) and PLC-05 (High Service) on local control | | |
| Operators per shift (two needed in manual) | | |
| Grab sampling on ERP-3 and paper bench sheets | | |
| Customer Service surge line and paper intake forms | | |
| MillbrookAlert console and the City website | | |
| Public mood (calls, posts, press) | | |

*End of Briefing Packet*
