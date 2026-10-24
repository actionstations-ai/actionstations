# Player Briefing Packet
## Ghost Line — SCADA Deception & Chlorine Release

Location: Teague Valley Chemical Company, Corbin Falls Works, Corbin Falls, Teague County, West Virginia · Exercise Duration: 4 Hours
Current Time: 09:00 AM (Exercise Time) · Weather: Clear and dry, wind from the west-south-west at 6 mph

### 1. Situation Brief

The Corbin Falls Works of Teague Valley Chemical Company operates on a normal weekday schedule, with Unit 300 at full load for railcar loading. The tank farm is active, with TK-32 in the Chlorine Storage Building feeding the loading rack, and a rail tank car loading at Rail Spot 2 since 08:40. The control room is staffed with the A-shift team, including the Shift Supervisor and control room operators. Loading operations are underway on the east side of the site, and the process historian shows steady flow into WT-302. All operational systems—DCS (DeltaV), SIS (Triconex), the vendor jump host TVC-JMP-01 and the SIS engineering workstation TS-EWS-01, and fixed gas detection—are reporting nominal status. The site weather station confirms light wind from the west-south-west, and no alarms have been triggered across the facility.

- Process Units: Normal
- Tank Farm (TK-31, TK-32, TK-33): Normal
- Loading Racks (Rail Spot 2): Normal
- Control Room (DCS, SIS, PLCs): Normal
- Fixed Gas Detection (AT-311 to AT-318, AT-321 to AT-326): Normal
- Fence-Line Detectors (AT-904, AT-905): Normal
- Sirens (S-1 to S-6): Off
- CAER-Text System: Inactive
- Community Line (304-555-0190): Available
- Site Weather Station: Nominal
- Vendor Remote Access (TVC-JMP-01): Secure
- Emergency Shutdown Valves (HV-312): Closed
- ERT Level A Suits: Available
- Decontamination Station (Muster Point A): Ready
- Process Historian (TVC-PI-01): Active
- Windows Security Logs (SIEM): Intact
- SIS Logic Version Archive: Current
- Cell-Room Trip Switch: Disabled
- Ridgeline Automation Support Line: Available
- FBI Cyber Liaison (Teague County): Available
- NRC Hotline: Available
- SERC and LEPC Contact List: Available
- Corporate SOC (Remote): Available
- Corporate IT Security (Remote): Available
- IT Network: Stable
- Security Perimeter: Monitored
- Staffing (A Shift): Full

**The Anomaly:** 09:03 AM — Loader at Rail Spot 2 reports to Operations: 'Control, this is Loader 2 on Rail Spot 2. The yellow-green cloud is still rising on WT-302 and ESD-310 is showing closed on the DeltaV HMI. I can see the vapor and the scale is climbing. The hand valve is open, but the screen says closed.'

**YOUR MISSION:** Maintain site integrity and prevent off-site release while investigating and resolving the field-screen discrepancy and unexplained rise in WT-302 level, balancing immediate containment actions with verification of system integrity and operational continuity.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Command**— Emergency Coordinator / Site Incident Commander | You own the declaration of emergency class, coordination of mutual aid, and approval of all notifications and actions. You are responsible for ensuring all ICS roles are filled and for maintaining the chain of command. | **Emergency First: Declare General Emergency immediately upon confirmation of off-site plume or injury.** **Authority Last: The Incident Commander must not be overridden by any alternate or external party during the initial 60 minutes.** **Situational Awareness: If the field and screen disagree on valve status, trust the field and initiate a cyber-incident triage.** |
| **Team B: Operations (Command)**— Operations Superintendent / Shift Supervisor | You own the unit shutdown sequence, isolation of inventory, safe-park decisions, and the cell-room trip decision. You are responsible for directing field actions and ensuring all process safety procedures are followed. | **Safe Park: Isolate all connected units and initiate a safe-park sequence before any manual override.** **Cell-Room Trip: Do not trip the cell room until the ERT confirms entry and the OT Engineer validates no cyber manipulation in the SIS.** **Field Authority: If a valve is seen open in the field while the DCS shows closed, assume the field is correct and proceed to manual isolation.** |
| **Team C: Technical**— Process Control / OT Engineer | You own DCS and SIS integrity, isolation of the control network, and validation of SIS logic before any reset. You are responsible for diagnosing system anomalies and preventing unauthorized changes. | **SIS Integrity: No SIS reset until the cause is known and the Triconex key switch is in RUN mode.** **Remote Access: If a remote session is detected on TVC-JMP-01 without a log entry, isolate the OT network immediately.** **Vendor First: Contact Ridgeline Automation, Emerson, and Schneider Electric for logic comparison and remote support only after confirming no internal breach.** |
| **Team D: Compliance**— Environmental, Health and Safety Manager | You own the reportable-quantity call and the NRC, SERC, LEPC and OSHA notifications. You are responsible for ensuring all regulatory reporting is accurate and timely. | **Facts Only: Report release data to regulators without mentioning cause, cyber, or system behavior.** **NRC First: Call the NRC within 1 hour of release confirmation, even if the release is below reportable quantity.** **OSHA: Report any injury or potential exposure to OSHA within 8 hours, using the 8/24-hour form.** |
| **Team E: Security**— Facility Security Officer | You own the site security plan, access control, theft and diversion response, and the law-enforcement liaison. You are responsible for securing the site and managing forensic evidence. | **FBI First: If a deliberate cyber attack is suspected, contact the FBI field office immediately and do not disclose details to the media.** **Evidence: Secure all logs, terminals, and remote access devices on TVC-JMP-01 and TS-EWS-01 before any system reset.** **No Unauthorized Access: If a remote session is found without a log entry, assume it was unauthorized and initiate a full forensic review.** |
| **Team F: Communications**— Community Relations / Communications Manager | You own sirens and the community notification line, neighbors and schools, and the media. You are responsible for issuing public statements and activating emergency alerts. | **Sirens: Sound S-1 to S-6 upon General Emergency declaration and confirm with the CCR.** **CAER-Text: Initiate CAER-Text to 1,140 neighbors within 15 minutes of the General Emergency call.** **Media: All media statements must be approved by the IC and follow the holding statement template (Annex B, Form ERP-8).** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs during the exercise, say 'REAL WORLD, REAL WORLD' and the exercise will stop immediately.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead and simulate the passage of time.
- Printed injects (posts, logs, photos, reports) are real intelligence and must be treated as such.

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
| DCS (DeltaV) | | |
| SIS (Triconex) | | |
| the vendor jump host TVC-JMP-01 and the SIS engineering workstation TS-EWS-01 | | |
| Fence-line detectors (AT-904, AT-905) | | |
| Sirens (S-1 to S-6) | | |
| CAER-Text system | | |
| Community line (304-555-0190) | | |
| Site weather station | | |
| Vendor remote access (TVC-JMP-01) | | |
| Emergency shutdown valves (HV-312) | | |
| ERT Level A suits | | |
| Decontamination station (Muster Point A) | | |
| Process historian (TVC-PI-01) | | |
| Windows security logs (SIEM) | | |
| SIS logic version archive | | |
| Cell-room trip switch | | |
| Ridgeline Automation support line | | |
| FBI cyber liaison (Teague County) | | |
| NRC hotline | | |
| SERC and LEPC contact list | | |
| Corporate SOC (remote) | | |
| Corporate IT Security (remote) | | |

*End of Briefing Packet*
