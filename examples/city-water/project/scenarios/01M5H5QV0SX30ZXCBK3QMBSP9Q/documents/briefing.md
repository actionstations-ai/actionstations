# Player Briefing Packet
## pH on the Edge — Caustic Overfeed & Public Health

Location: Riverside Water Treatment Plant, Millbrook, Carver County, Ohio · Exercise Duration: 4 Hours
Current Time: 09:00 AM (Exercise Time) · Weather: Clear and dry

### 1. Situation Brief

The Riverside Water Treatment Plant (RWTP) is operating at a weekday peak load of 7.2 million gallons per day (MGD). The treatment process is stable across all six filters, with HSP-1/2/3 maintaining consistent pressure and flow. Clearwell levels are within normal range, and finished water quality parameters—turbidity, chlorine residual, and pH—are all within design bands. The distribution system is supplying Zones 1, 2, and 3 through the Northgate Booster Station and Hilltop Tank, with zone pressures maintained above 40 psi. The Control Room is staffed by a certified operator and a second operator on-site for the morning shift. All SCADA and telemetry systems are reporting green status, and no alarms are active on the HMI screens.

- RWTP Treatment Plant: Normal / Green
- Pump Stations (Eastfield, High Service, Northgate): Normal / Green
- Storage Tanks (Hilltop, Northgate Reservoir, Orchard Standpipe): Normal / Green
- Plant SCADA / HMI (MBW-HMI-01, MBW-HMI-02, MBW-HMI-03): Normal / Green
- PLCs at RWTP (PLC-01 to PLC-06): Normal / Green
- RTUs at Remote Sites (RTU-01 to RTU-07): Normal / Green
- Telemetry Radio / Cellular Links: Normal / Green
- Chemical Feed and Dosing Controls (NAOH-FC-203, CL2-FC-201/202, F-FC-204): Normal / Green
- Online Analyzers (AIT-301 to AIT-304, PSH-302): Normal / Green
- AMI Meters and Head-End (MBW-AMI-01): Normal / Green
- Remote-Access Gateway (MBW-JUMP-01): Normal / Green
- IT Systems (MBW-CIS-01, MBW-LIMS-01, MBW-GIS-01): Normal / Green
- Security Systems (MBW-PACS-01, MBW-NVR-01, CAM-01 to CAM-18): Normal / Green
- Staffing (Control Room, on-site, on-call): Normal / Green

**The Anomaly:** 09:18 — Duty Operator Chen reports via radio from the Chemical Building: 'Control, this is Duty Operator Chen, on rounds at the Chemical Building. AIT-302 shows finished-water pH at 9.3 — that's way above the normal 7.4–7.8 range. The HMI for NAOH-FC-203 still says 14 mg/L, which is in the normal range. But PSH-302 hasn't tripped, and I can hear the caustic pump running at full speed. I don't know what to trust — the screen says normal, but the water tastes like lye.'

**YOUR MISSION:** Maintain continuous, safe water delivery to the public while investigating and resolving the unexpected caustic overfeed and control-system anomaly, balancing immediate public health risk with operational continuity and system integrity.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— Director of Water Operations (Incident Commander) | You own the entire treatment and distribution system, including plant operations, chemical feed, interconnects, and emergency isolation. You make final decisions on manual operation, advisory issuance, and system containment. | **Safety First: if the screen and the field disagree, trust the field.** **Decision Authority: the Director declares Level 3 and issues advisories after consulting the WQ Manager and confirming lab results.** **Containment Over Continuity: if a zone is at risk, isolate it even if it causes a pressure drop below 20 psi.** |
| **Team B: SCADA / IT**— SCADA / IT Security Manager (Technical Lead) | You own the control system integrity, remote access, network isolation, and forensic evidence preservation. You ensure no unauthorized access and maintain a chain of custody for all cyber-physical data. | **Evidence First: preserve RTU logs, NVR footage, and remote-access session records before any network reset.** **Isolation Protocol: shut down all remote-access gateways and isolate the SCADA network from the business network immediately upon compromise.** **No Public Disclosure: do not name the vendor, system, or attack method; use generic terms like 'a technology issue affecting the control system'.** |
| **Team C: Public Information**— Public Information Officer (PIO) | You own the public narrative, media coordination, and official statement release. You ensure all messaging is factual, timely, and aligned with regulatory and operational decisions. | **Truth Before Reassurance: release facts first; do not say 'no risk' until lab results confirm safety.** **Pre-Scripted Release: use Section 10 templates and GIS boundaries to publish the advisory within 45 minutes of the decision.** **No Speculation: do not comment on remote access, vendor names, or ransom demands; defer to the SCADA / IT Security Manager for technical details.** |
| **Team D: Water Quality / Lab**— Water Quality Manager (Compliance) | You own sampling, lab analysis, regulatory reporting, and public-notice triggers. You confirm all public health thresholds and initiate advisory processes based on verified data. | **Lab Authority: only lab results can confirm a public health emergency; if pH > 9.5, trigger advisory regardless of HMI.** **No Delay: release results to the Control Room and the Director within 15 minutes of sample completion.** **Health Effects: only the WQ Manager may approve the health-effects content in the advisory.** |
| **Team E: Security**— Security & Emergency Manager (Sec) | You own site security, law enforcement liaison, and emergency response execution. You ensure physical access is controlled and evidence is preserved for forensic use. | **Site First: if any sign of entry is found, call Millbrook Police and isolate the facility immediately.** **Law Enforcement: activate the Millbrook Police liaison and share evidence only after the SCADA / IT Security Manager confirms the cyber-physical nature of the event.** **No Solo Action: do not act on physical access claims without verifying with the Control Room and the WQ Manager.** |
| **Team F: Regulator Liaison**— Ohio EPA DDAGW Central District (Regulator Liaison) | You own regulatory compliance, reporting, and external oversight. You ensure timely and accurate communication with the Ohio EPA and other oversight bodies. | **Tier 1 First: call Ohio EPA DDAGW within 30 minutes of confirming a Level 3 condition using the pre-scripted message.** **No Delay: do not wait for a formal letter; report via phone and confirm in writing.** **Regulatory Truth: only the WQ Manager and the Director may provide facts to DDAGW; the PIO may not release details without approval.** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs (e.g., fire, injury, active threat), say 'REAL WORLD, REAL WORLD' and the exercise will stop immediately.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead in the narrative and simulate elapsed time.
- All printed injects (emails, reports, photos, logs) are intelligence and must be treated as real; do not question their authenticity.

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
| Plant SCADA / HMI (MBW-HMI-02) | | |
| PLCs at the RWTP (PLC-02) | | |
| RTUs at remote sites (Orchard Standpipe, Northgate Booster) | | |
| Telemetry radio / cellular links (to HMI) | | |
| Chemical feed and dosing controls (NAOH-FC-203) | | |
| Online analyzers (AIT-302 pH, PSH-302 high-high switch) | | |
| AMI meters and head-end (for zone pressure and flow) | | |
| Remote-access gateway for the integrator (DosaTech ScreenBridge) | | |
| IT systems (business network, email) | | |
| Public mood (customer calls, social media sentiment) | | |
| Hard-wired high-high pH switch (PSH-302) | | |
| Control-room operator (on-site and remote) | | |
| Lab results (pH, caustic residual) | | |
| Interconnect IC-1/IC-2 (for zone pressure relief) | | |

*End of Briefing Packet*
