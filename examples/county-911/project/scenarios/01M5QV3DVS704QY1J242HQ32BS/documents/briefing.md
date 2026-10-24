# Player Briefing Packet
## Silent Calls — CAD/AVL Integrity & Service Continuity

Location: Rook County Public Safety Center, 250 West Jefferson Street, Halden, Rook County, Indiana · Exercise Duration: 4 Hours
Current Time: 18:30 (Exercise Time) · Weather: Tornado watch for Rook County until 23:00; storms approaching from the west.

### 1. Situation Brief

The Rook County Emergency Communications District (RCECD) dispatch floor is operating during a typical weekday evening shift. With a moderate call load—12 active 911 calls in queue and three pending dispatches—the team is managing routine emergency calls, including medical incidents, traffic collisions, and property crimes. The dispatch floor is staffed at full strength across Positions 1–16, with the Supervisor and Technical Lead in their designated pods. The equipment room, located on Level 1, is actively monitored, and the backup PSAP at the Highway Garage (Positions 13–16) remains on standby. The P25 trunked radio system, including Site 1 through Site 5 and the microwave backhaul, is fully operational. The 911 center’s SIP trunk group A and B are handling inbound calls from the state ESInet, and all conventional mutual-aid channels, gateways, and dispatch consoles are active. The UPS and generator system, with transfer switch, are under normal load. Equipment-room HVAC, access control (badges, mantrap), CCTV, fire suppression, and the mobile communications vehicle are all reporting green status. All systems are synchronized and no anomalies have been reported.

- Dispatch Floor (Positions 1–12): Normal / Green
- Equipment Room (Level 1): Normal / Green
- Radio Sites (Site 1–Site 5): Normal / Green
- Backup PSAP (Highway Garage): Normal / Green
- P25 Trunked Radio System (zone controller, tower sites, microwave backhaul): Normal / Green
- Dispatch Radio Consoles (all): Normal / Green
- Conventional Mutual-Aid Channels and Gateways: Normal / Green
- UPS and Generator with Transfer Switch: Normal / Green
- Equipment-Room HVAC: Normal / Green
- Access Control (badges, mantrap) and CCTV: Normal / Green
- Fire Suppression System: Normal / Green
- Mobile Communications Vehicle: Normal / Green
- IT Systems (CAD, ALI, GIS, Recorder): Normal / Green
- Public Mood (via social media monitoring): Normal / Green

**The Anomaly:** At 18:30, Call Taker 9 (Position 9) reports via phone to the Supervisor: 'Sup, this is Call Taker 9 on Position 9. I just took a 911 call on SIP trunk group A — it was completely silent. No audio, no background noise, just dead air. It lasted 45 seconds and then dropped. The ANI shows 555-0105. I’ve never seen anything like it.'

**YOUR MISSION:** Maintain uninterrupted 911 call answering and unit dispatching while investigating and resolving the silent call anomaly, CAD interface freeze, and potential unauthorized access to backend systems, balancing operational continuity with service integrity and evidence preservation.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— 911 Director (Incident Commander) | You own overall command and continuity of the emergency communications center. You are responsible for declaring incident levels, authorizing evacuation to the backup PSAP, managing overtime and policy-level decisions, and ensuring that all actions comply with the RCECD-OPS-2026 and EOP 4.3. | **Incident First: if the system shows a unit as available but the field says it’s engaged, trust the field and reassign.** **Evacuate or Reroute: declare Level 1 and activate OPS-DR-5 within 5 minutes of CAD freeze and silent call surge.** **Truth Over Reassurance: do not issue public statements until the FBI and CISA are notified via County Security.** |
| **Team B: Floor Operations**— Floor Supervisor (Communications Supervisor) | You own moment-to-moment call handling, the transition to manual dispatch using run cards, and the maintenance of talkgroup patches to field agencies. You are responsible for escalating call queue times, verifying hostage reports, and ensuring that no calls are dismissed without verification. | **Manual First: if CAD freezes, immediately initiate manual dispatch using RCECD-F-11 and position cards.** **Patch to Preserve: maintain talkgroup patches to field agencies even if ALI is inaccurate, to ensure response coordination.** **Queue Watch: if 911 calls queue over 20 seconds for 10 minutes, escalate to Level 2.** |
| **Team C: Technology**— 911 Systems / Technical Services Manager (Technical Lead) | You own the call-handling equipment, CAD, ALI, mapping, and the recorder. You are responsible for isolating compromised systems, preserving evidence, and escalating to the state ESInet NOC and vendors as needed. | **Isolate or Break: if malware beaconing is detected, manually firewall CAD-FW01 (CYB-DR-1) to stop lateral movement.** **Vendor First: if 911 trunks are under TDoS, contact state ESInet NOC (555-0119) immediately to report and request overflow routing.** **Evidence Chain: preserve call detail records and recordings on REC-01 before any system reboot or reset.** |
| **Team D: Radio**— Radio System Manager / Communications Unit Leader (COML) | You own the P25 trunked radio system, consoles, interoperability channels, and the ICS 205. You are responsible for maintaining talkgroup patches, switching to backup consoles if needed, and alerting field units to silent call floods. | **Interoperability First: if CAD is corrupted, maintain talkgroup patches to Sheriff, Police, and Fire using the P25 console.** **No Silence: if a silent call floods the 10-digit lines, patch to the LE Liaison and activate the ICS 205 to alert field units.** **Backup Voice: if the main radio console fails, switch to the secondary console and use the P25 backup channel.** |
| **Team E: Field Agencies**— Police / Sheriff Liaison (Patrol Commander) | You own field response coordination, swatting posture, and BOLO dissemination. You are responsible for verifying hostage reports, activating swatting protocols, and ensuring that no false threats are disseminated to field units. | **Verify Before Respond: if a caller reports a hostage situation, do not dispatch immediately—verify via the field radio and cross-check with the call taker.** **Swatting Posture: if multiple calls report a fake hostage event, activate swatting response protocol and alert FBI via the County Security Officer.** **BOLO Lock: if a silent call claims a false threat, do not issue a BOLO until the call is verified and the Director has approved.** |
| **Team F: Communications**— Public Information Officer (PIO) | You own public messaging, social media, and press coordination. You are responsible for issuing the alternate 10-digit number via WEA and social media, and for correcting false information without speculation. | **One Message: publish only the alternate 10-digit emergency number via WEA and social media once approved by the Director and EMA.** **No Rumor: do not respond to false social media posts—wait for official verification and then issue a correction.** **Press Control: if a reporter calls, state that 'the 911 center is operating under protocol and will issue a public update via WEA.'** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs during the exercise, immediately say 'REAL WORLD, REAL WORLD' and the exercise will stop.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead and simulate the passage of time.
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
| P25 trunked radio system (zone controller, tower sites, microwave backhaul) | | |
| dispatch radio consoles | | |
| conventional mutual-aid channels and gateways | | |
| UPS and generator with the transfer switch | | |
| equipment-room HVAC | | |
| access control (badges, mantrap) and CCTV | | |
| fire suppression | | |
| backup PSAP | | |
| mobile communications vehicle | | |
| IT systems | | |
| service or process itself | | |
| public mood | | |

*End of Briefing Packet*
