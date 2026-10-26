# Player Briefing Packet
## Ghost Flight — GNSS Spoofing & Command Hijack

Location: Harwick UAS Operations Group, Birch Hollow Range, Harwick, Calder County, New York · Exercise Duration: 4 Hours
Current Time: 09:00 AM (Exercise Time) · Weather: Clear, 72°F, winds 6 mph from the west

### 1. Situation Brief

It is a busy Tuesday morning at Harwick UAS Operations Group. Flight operations are underway across multiple test sites: UAS-11 is in pre-flight preparations at the Birch Hollow Range Lakeshore Flight Area (TP-LFA), conducting a multispectral campaign over the meadow near Birch Hollow Lodge. The Hangar 1 hangar is active with battery charging and system checks, while Hangar 2 (flight operations and GCS room) is staffed at full capacity. The Group’s primary campaign focus is on environmental monitoring and remote sensing, with multiple aircraft scheduled for flight testing across Horton Field, the Quarry Flight Area, and the Creek Test Area. All systems are operating within normal parameters, and the base is in a standard operational cycle with no known disruptions.

- Flight Test Sites: Normal
- Ground Control Stations (GCS): Green
- C2 and Telemetry Radio Links (915 MHz): Green
- GNSS / RTK Base Stations (RTK-1, RTK-2): Green
- Autopilots and Flight Controllers: Green
- Payload and Sensor Computers (PL-02, PL-06): Green
- Battery Chargers and Battery Management Systems: Green
- Remote ID Modules: Green
- Detect-and-Avoid / ADS-B Receivers (DAA-1): Green
- Hangar PACS and CCTV: Green
- IT Systems (NAS, Firewall, Backups): Green
- Security and Physical Access (Hangar 1 Perimeter): Green

**The Anomaly:** 09:18:02 — Payload Operator (UAS-11 field team) reports via internal comms: 'This is the Payload Operator on UAS-11. PANEL CLEAR confirmed. The aircraft is now 120 meters east of the meadow, over the lodge patio. DAA-1 shows position as 43.1724°N, 77.5631°W. RTK-1 has a full fix. The aircraft telemetry shows a 150-meter jump in latitude under clear sky. The flight line is east–west over the meadow. This does not match the field. The aircraft is not on the flight line.'

**YOUR MISSION:** Maintain operational continuity and data integrity while investigating and resolving a sudden, unexplained aircraft position jump and loss of RTK fix at the Birch Hollow Range Lakeshore Flight Area. Balance the need for immediate action to preserve flight control and system state against the requirement to collect full telemetry and forensic evidence before any reboot or re-pair.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)** | You own flight operations, crew coordination, and go/no-go decisions. You are responsible for the operational status of UAS-11 and the integrity of the flight test site. You must ensure the aircraft is landed safely if command integrity is compromised, and preserve all GCS and radio states until full logs are captured. | **Flight First: land the aircraft immediately if command integrity is compromised, even if telemetry suggests otherwise.** **Preserve State: do not power down the GCS or radio link until full telemetry and link logs are captured.** **Follow the FOM: if the Flight Operations Manual is unavailable, defer to the RPIC on scene to act under Sections 4–8.** |
| **Team B: Systems / Cyber** | You own the GCS, C2 links, telemetry pipeline, and technical investigation into cyber incidents. You are responsible for preserving the GCS and radio state, tracing all RF sources at the site, and verifying system baselines to detect anomalies. | **Forensics First: preserve the GCS and radio state before any reboot or re-key.** **Trace the RF: document every transmitter visible at the site, including crew hotspots, vehicles, and lodge Wi-Fi.** **Verify the Baseline: if a flight controller or GCS shows modified firmware, quarantine the system and halt all flights of that type.** |
| **Team C: Safety** | You own the safety case, airspace authorizations, and regulatory reporting. You are responsible for ensuring compliance with the FOM and ERP, verifying airspace status, and initiating FSDO reporting if required. | **Regulatory First: report any flight departure outside authorization to the FAA FSDO immediately.** **Notify the FSDO: when a flight is involved and the GCS shows modified parameters, initiate the FSDO reporting protocol.** **Hold the Line: if the ASO suspects a cyber-physical incident, do not release any public statement until the General Manager signs off.** |
| **Team D: Communications** | You own the narrative, media, and public messaging. You are responsible for coordinating all external communications, ensuring truthfulness, and forwarding all intelligence to the proper offices. | **Truth Over Reassurance: do not release a statement that contradicts the field team’s observations, even under pressure.** **Forward Evidence: send any trainee video, forum post, or social media content to Corporate Communications and the ASO immediately.** **Client First: notify the CP&L program office of any data integrity loss affecting a deliverable, before any public comment.** |
| **Team E: Security** | You own the hangar, test site perimeter, and law enforcement liaison. You are responsible for securing the site, controlling access, and documenting any suspicious activity. | **Secure the Site: if a vehicle with RF equipment is seen leaving, notify Harwick Police Department and CCSO immediately.** **Control Access: if a vehicle is seen near the launch area, block entry to Hangar 1 until the site is secured.** **Document the Scene: photograph any vehicle that left, the lodge parking area, and the launch site after the event.** |
| **Team F: Client** | You own the data deliverables, client reporting, and controlled technology. You are responsible for ensuring compliance with federal program requirements and protecting data integrity. | **Deliverable Integrity: if data integrity is compromised, declare a hold on Deliverable D-3 and notify the client immediately.** **Export Control: if PL-02 data is at risk, activate the Compliance Officer and halt all data transfers.** **No Assumptions: do not assume the flight was successful; base all client reports on verified telemetry and logs.** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs, say 'REAL WORLD, REAL WORLD' and the exercise will stop immediately.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead in the timeline.
- Printed injects (posts, logs, photos, reports) are intelligence — treat them as real and act accordingly.

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
| GCS (Ground Control Station) | | |
| C2 Link (915 MHz) | | |
| Telemetry Radio Link | | |
| GNSS / RTK Base Station (RTK-1) | | |
| Autopilot and Flight Controller | | |
| Payload and Sensor Computer (PL-02) | | |
| Battery Charger and Battery Management System | | |
| Remote ID Module | | |
| Detect-and-Avoid / ADS-B Receiver (DAA-1) | | |
| Hangar PACS and CCTV | | |
| IT Systems (NAS, Firewall, Backups) | | |
| Public Mood (Social Media Sentiment) | | |
| RTK-1 and SV-1/SV-2 Logs | | |
| GCS and Radio State (Preserved) | | |
| Hangar 1 Perimeter (Physical Security) | | |

*End of Briefing Packet*
