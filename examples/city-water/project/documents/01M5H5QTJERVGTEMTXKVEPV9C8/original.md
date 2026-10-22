# City of Millbrook Department of Water & Sewer — Emergency Response Plan (AWIA / SDWA §1433)

Document Control Number: MDWS-ERP-2026 · PWS ID: OH-CARVER-0418 · Population served: 68,400 · Certification to EPA: 12/2025 (recertification due 12/2030)
Revision 2.1 · Effective Date: 01/15/2026 · Approved: Denise Albrecht (Director of Water Operations) · Gloria Tennant (City Manager) · Marcus Oyelaran (Water Quality Manager)

> **EXERCISE MATERIAL — for training use.** The City of Millbrook, its people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 2.0 — 11/20/2025 — All — Five-year update incorporating the 2025 Risk and Resilience Assessment (MDWS-RRA-2025) · 2.1 — 01/15/2026 — Sections 7, 9, 11, Annex A — Cyber response cross-references to MDWS-OTSEC-2026; advisory decision record ERP-2; annual contact update

## Table of Contents

Section 1 Purpose, Authority and Plan Basis · Section 2 System Description · Section 3 Roles and Responsibilities · Section 4 Incident Levels and Activation · Section 5 Notification and Reporting · Section 6 Detection Strategies · Section 7 Response Procedures · Section 8 Storage Facility Security and Sampling Response · Section 9 Public Notification and Advisories · Section 10 Public Information · Section 11 Cyber and Control-System Incidents · Section 12 Mutual Aid and Resources · Section 13 Recovery and Return to Normal · Section 14 Training and Exercises · Annex A Contact List · Annex B Critical Customer List · Annex C Forms and Checklists

---

## SECTION 1: PURPOSE, AUTHORITY AND PLAN BASIS

### 1.1 Purpose

This Emergency Response Plan (ERP) tells the Department of Water & Sewer (DWS) how to detect, classify and respond to an emergency affecting the Millbrook water system, how to protect public health while the system is degraded, and how to notify customers, regulators and partners. It is written to keep safe water flowing first, to tell people the truth about their water second, and to protect property third.

### 1.2 Authority

Prepared under Section 1433 of the Safe Drinking Water Act as amended by the America's Water Infrastructure Act of 2018, which requires a community water system serving more than 3,300 people to keep a risk and resilience assessment and an emergency response plan, to review both every five years and to certify completion to the U.S. EPA. The statute asks the ERP to address four things, and this plan maps to them:

| Statutory element | Where it lives in this plan |
|---|---|
| Strategies and resources that improve resilience, including physical security and cybersecurity | Sections 8, 11 and 12; MDWS-OTSEC-2026 |
| Plans and procedures, and the equipment needed, to respond to a malevolent act or natural hazard | Sections 4, 5, 7 and 12 |
| Actions, procedures and equipment that lessen the impact of such an event on public health and supply | Sections 7, 9 and 12 (interconnects, manual operation, alternate supply, advisories) |
| Strategies that aid detection of malevolent acts or natural hazards | Section 6 |

The Ohio EPA Division of Drinking and Ground Waters (DDAGW) is the primacy agency; its public-notification and reporting rules govern Sections 5 and 9. This plan was coordinated with the Carver County Local Emergency Planning Committee on 10/08/2025.

### 1.3 Basis — 2025 Risk and Resilience Assessment

MDWS-RRA-2025 (kept under restricted access; summary only here) ranked the following as the highest-consequence threats, in order:

1. Manipulation of chemical feed through SCADA or remote access (Caustic Feed System and Hypochlorite Feed System).
2. Ransomware on the business network reaching the control network through the domain trust and backup traffic (OT Plan Sections 5.3 and 9).
3. Tampering or contamination at an open-to-atmosphere storage site (Orchard Standpipe, Hilltop Tank).
4. Failure of the Hilltop Transmission Main during summer demand, with or without a telemetry outage.
5. Prolonged power loss to the Riverside Water Treatment Plant during an ice storm.

Resilience investments funded from the RRA: second radar level sensor at Hilltop Tank (LIT-602, done), supervisor PIN on chemical setpoints (done, with the limitation noted in OT Plan 5.4), repair of the Orchard Standpipe hatch switch ZS-611 (WO-24-1187, **still open**), and removal of the DosaTech ScreenBridge remote-support agent on MBW-HMI-02 (OT Plan finding F-3, **still open**).

### 1.4 Coordinated Documents

| Document | Number | Revision |
|---|---|---|
| System Map and Asset Sheet | MDWS-MAP-2026 | 4.0 |
| OT / Cybersecurity Plan and Incident Response Playbook | MDWS-OTSEC-2026 | 1.3 |
| SCADA System Description (Appendix A to the OT Plan) | MDWS-SCADA-APP-A | 3.0 |
| Public Communications Plan for Water Emergencies | MDWS-PCP-2026 | 2.0 |
| Carver County Emergency Operations Plan, ESF-3 (Public Works) and ESF-8 (Health) annexes | 2024 | — |
| Risk and Resilience Assessment (restricted) | MDWS-RRA-2025 | 1.0 |

### 1.5 Plan Holders

Controlled copies (paper, numbered 1–18) are held in the RWTP Control Room, the Director's office, the Distribution Office, each on-call vehicle go-bag, the City Manager's office, Carver County EMA, Carver County Public Health, Millbrook Police and Fire dispatch, and the DDAGW Central District Office. The electronic copy on MBW-FS-01 is not to be relied on during a cyber incident (Section 11).

## SECTION 2: SYSTEM DESCRIPTION

The Millbrook system is described in full in MDWS-MAP-2026. In summary: the Riverside Water Treatment Plant (RWTP, 1400 River Road, rated 16.0 MGD) treats Millbrook River water drawn at Intake Structure 1, supplemented by the Orchard Wellfield (Wells W-1 to W-3, 3.6 MGD). Finished water is stored in Clearwell 1 and Clearwell 2 and pumped by the High Service Pump Station (HSP-1 to HSP-3) into Zone 1. Zone 2 is fed by the 24-inch Hilltop Transmission Main and floats on Hilltop Tank, with Orchard Standpipe fed by the wells; Mill Road Booster Station can lift Zone 1 water into Zone 2. Zone 3 is supplied only from Northgate Reservoir through the Northgate Booster Station. Eastfield Pump Station sustains pressure on the Zone 1 eastern loop. Interconnects: IC-1 at Mill Road (Carver County Water District, 4.0 MGD) and IC-2 at Eastfield (City of Fairhaven, 2.0 MGD), both normally closed. Control is by AquaSight SCADA with PLC-01 to PLC-06 at the plant and RTU-01 to RTU-07 at remote sites over 900 MHz radio through the Hilltop Tank repeater RP-1, with cellular modems at Hilltop Tank (backup) and Eastfield Pump Station (only path).

## SECTION 3: ROLES AND RESPONSIBILITIES

DWS uses the Incident Command System. Positions are filled by the people below; alternates are listed and the first person reached fills the role until relieved.

| ICS role | Primary | Alternate | Responsibilities |
|---|---|---|---|
| Incident Commander | Denise Albrecht, Director of Water Operations | Ray Castellano | Declares incident levels; decides on manual operation, isolation and interconnect use; decides, with the WQ Manager, on advisories; briefs the City Manager |
| Operations Section Chief — Plant | Ray Castellano, Plant Superintendent | Senior operator on shift | Treatment process, chemical feed, manual operation of RWTP, DG-1 |
| Operations Section Chief — Distribution | Tom Okonkwo, Distribution Superintendent | Distribution on-call lead | Main breaks, valve operations, interconnects IC-1/IC-2, flushing, door hangers |
| Technical Specialist — SCADA / Cyber | Priya Nandakumar, SCADA / IT Security Manager | Kevin Marsh, City IT Director | Control-system integrity, remote access, islanding, evidence, CISA/FBI technical liaison |
| Water Quality / Compliance Officer | Marcus Oyelaran, Water Quality Manager | Elena Vasquez, Laboratory Supervisor | Sampling plans, lab results, DDAGW consultation, public-notice triggers and lifting criteria |
| Safety / Security Officer | Luis Ferreira, Security & Emergency Manager | SecureLine shift supervisor | Site security, law-enforcement liaison, access control, evidence at physical scenes |
| Public Information Officer | Hannah Weiss, City Communications Director | Jordan Alvarez, Communications Specialist | All public and media communication per MDWS-PCP-2026 |
| Liaison Officer | Luis Ferreira (or as assigned) | — | Carver County EMA / EOC, OHWARN, interconnect partners |
| Policy Group | Gloria Tennant, City Manager; Mayor Robert Kline | — | Approves advisories affecting more than 5,000 people, emergency procurement above $50,000, declarations |

The RWTP Control Room is staffed 24 hours by one certified operator; a second operator is on site 0600–1800 on weekdays. The duty operator is the first responder to every alarm and has standing authority to take the plant to manual and to stop any chemical feed pump without waiting for approval.

## SECTION 4: INCIDENT LEVELS AND ACTIVATION

### 4.1 Overview

DWS uses three levels. A level may be declared directly; it is not necessary to pass through lower levels. Any employee who observes a condition below reports it to the Control Room immediately.

### 4.2 Level 1 — Monitor

- Pressure dip below 35 psi in part of one zone, recovering within 30 minutes.
- Loss of telemetry from a single remote site; a single SCADA alarm that cannot be explained; a stale-data flag that persists beyond 30 minutes.
- Minor main break (12-inch or smaller) with no customers out of water.
- Customer complaints of taste, odor or color clustered on one street.
- A security alarm at a remote site cleared by patrol with no sign of entry.

**Declared by:** duty operator or Distribution on-call lead. Logged on ERP-1; the Director informed at the next shift turnover.

### 4.3 Level 2 — Operational Emergency

- Pressure below 20 psi across a zone or an area of more than 500 connections; a break on a transmission main (16-inch or larger).
- Treatment process failure: combined filter effluent turbidity above 0.3 NTU for more than 15 minutes, finished chlorine residual below 0.5 mg/L, finished pH outside 6.8–8.8, or any chemical feed pump running outside its setpoint without an explanation.
- Loss of SCADA view or control for more than 30 minutes; loss of the Hilltop repeater RP-1 (telemetry to four sites).
- Suspected intrusion at a storage site (Hilltop Tank, Orchard Standpipe, Northgate Reservoir): cut fence, open hatch, disturbed vent, or ZS-612 alarm with no patrol explanation.
- Confirmed cyber intrusion on the business network (MILLBROOK domain), ransomware on any City system, or loss of MBW-CIS-01 / MBW-AMI-01.
- Loss of both utility feeds to RWTP with DG-1 carrying the plant.

**Declared by:** Incident Commander, either Operations Section Chief or the SCADA / IT Security Manager. The Director is told within 15 minutes.

### 4.4 Level 3 — Public Health Emergency

- Loss of disinfection (finished chlorine residual below 0.2 mg/L entering distribution) or any confirmed or credible contamination of source, plant or distribution water.
- A Boil Water, Do Not Drink or Do Not Use advisory for more than 5,000 people.
- Control-system compromise that affects or could affect chemical feed or pumping, including an unexplained setpoint change on NAOH-FC-203, CL2-FC-201/202 or F-FC-204.
- Sustained loss of supply to a zone (Zone 3 is wholly dependent on Northgate Booster Station).
- Chemical overfeed reaching the clearwells (finished pH above 9.5 or chlorine residual above 4.0 mg/L).

**Declared by:** Incident Commander, or the duty operator when the Director and Plant Superintendent cannot be reached within 10 minutes. Level 3 opens the DWS Incident Command Post in the RWTP Administration Building conference room and requests Carver County EOC activation through Carver County EMA.

## SECTION 5: NOTIFICATION AND REPORTING

### 5.1 General

Notifications are made by telephone with a voice read-back and logged on ERP-1 (time, person reached, message, call-back number). Email, MillbrookAlert and text are supplementary. If a primary contact does not answer within 2 minutes, call the alternate and continue; do not wait. During a suspected cyber incident, assume the City email tenant and MBW-FS-01 may be read by the intruder and use phone, radio DWS-1 or personal devices for coordination (OT Plan 10.1).

### 5.2 Internal Call-Down

| Step | From | To | Time limit |
|---|---|---|---|
| 1 | Person observing | RWTP Control Room (555) 031-2244 | Immediately (radio DWS-1 or phone) |
| 2 | Duty operator | Plant Superintendent (Ray Castellano) and, for distribution events, Distribution on-call (555) 034-1199 | Within 5 minutes |
| 3 | Plant Superintendent / on-call lead | Director of Water Operations (Denise Albrecht) | Within 10 minutes of a Level 2 condition |
| 4 | Director | Water Quality Manager; SCADA / IT Security Manager; Security & Emergency Manager; PIO | Within 15 minutes of Level 2 |
| 5 | Director | City Manager (Gloria Tennant); Mayor's office | Within 1 hour of Level 2; within 15 minutes of Level 3 or any advisory decision |

### 5.3 External Reporting Clocks

| Event | Report to | Time limit | By |
|---|---|---|---|
| Any Tier 1 public-notice situation (Section 9.2) | Ohio EPA DDAGW Central District (district engineer Paul Grieve; 24-h line (555) 037-1555) | Consultation starts as soon as practical and **within 24 hours**; immediately if intentional contamination is suspected | WQ Manager |
| Chemical release or spill at RWTP or on the Millbrook River above Intake Structure 1 | Ohio EPA emergency line; Carver County EMA; Millbrook Fire | Immediately | Plant Superintendent |
| Suspected intentional contamination, tampering with a storage facility, threat against the system | FBI Cleveland-area field office (555) 038-7100; Millbrook Police dispatch (555) 032-7000 | Immediately | Security & Emergency Manager |
| Cyber incident affecting any DWS system | CISA 24/7 (555) 038-8800 | **Within 24 hours** of determining an incident (plan for the 72-hour federal reporting rule as well); immediately if chemical feed or pumping was operated without authorization | SCADA / IT Security Manager |
| Same | WaterISAC (555) 038-6000; EPA Region 5 Water Division (555) 038-5000 | Within 24 hours | SCADA / IT Security Manager |
| Same | Cyber-insurance carrier (policy MBW-CY-2025-114) | **Within 48 hours**, and before any outside incident-response firm is engaged | City IT Director |
| Any Level 2 or 3 incident that may need the County EOC | Carver County EMA (Director Sandra Pruitt, (555) 032-4000) | Within 30 minutes | Liaison Officer |
| Any advisory decision | City Manager and Mayor | Within 1 hour (before public release wherever possible) | Director |
| Advisory affecting hospital, dialysis or nursing homes | Carver County Public Health (Dr. Anita Shah, (555) 032-6000); Annex B critical customers | Before public release (PCP Section 5) | WQ Manager / PIO |

### 5.4 Pre-Scripted Messages

**To DDAGW (Tier 1 consultation):** "This is [name], [title], City of Millbrook DWS, PWS ID OH-CARVER-0418. We have a [loss of pressure / treatment failure / suspected contamination] affecting [Zone / area, approximate population] that began at [time]. We are [issuing / considering] a [Boil Water / Do Not Drink] advisory. Our sampling plan is [summary]. My call-back number is [number]."

**To Carver County EMA (Level 3):** "…We have declared a Level 3 water emergency. [Nature of event]. We request activation of the County EOC and a public-health representative at our Incident Command Post at the Riverside plant. Next update by [time]."

### 5.5 Known Notification Gaps

- The Control Room landline rolls to the Administration Building front desk during business hours; after hours it rings only in the Control Room.
- Cellular coverage inside the Chemical Building and at Intake Structure 1 is poor; use radio DWS-1.
- The DDAGW 24-hour line reached voicemail during the 01/2026 drill; the district engineer's mobile is in Annex A.
- The MillbrookAlert operator console is a web application on the business LAN; during a ransomware event it may be unavailable (PCP Section 9 workaround).

## SECTION 6: DETECTION STRATEGIES

### 6.1 Control-System Alarms

SCADA priority 1 and 2 alarms (MDWS-SCADA-APP-A, A.5) reach the duty operator on MBW-HMI-01 and, after hours, the on-call phones through the AlarmCall autodialer. Operators are required to investigate, not just acknowledge, any alarm on chemical feed rate, finished-water quality, tank level or pump status that they cannot explain from the plant's own operation.

### 6.2 Online Water-Quality Instruments

| Instrument | Location | Normal | Alarm | Action |
|---|---|---|---|---|
| AIT-301 finished chlorine residual | Clearwell outlet | 1.0–2.0 mg/L | < 0.5 or > 3.5 | Verify with grab sample within 15 min; check CL2-FC-202 stroke |
| AIT-302 finished pH | Clearwell outlet | 7.4–7.8 | < 6.8 or > 8.5; **PSH-302 hard-wired trip at 9.5** | Verify; check NAOH-FC-203 setpoint and audit log; stop caustic feed if unexplained |
| AIT-303 finished fluoride | Clearwell outlet | 0.6–0.8 mg/L | > 1.3 | Stop F-FC-204; grab sample |
| AIT-310 combined filter effluent turbidity | Filter gallery | < 0.1 NTU | > 0.3 for 15 min | Treatment failure response (7.3) |
| AIT-611 outlet chlorine residual | Orchard Standpipe | 0.6–1.2 mg/L | < 0.3 or sudden change > 0.5 | Site inspection; sample; consider isolating the standpipe |
| AIT-101 raw turbidity | Intake Structure 1 | 2–15 NTU | > 50 | Spill / storm response (7.4) |

### 6.3 Customer Complaints and AMI

Customer Service codes every call by street and symptom in the CIS. Three or more taste, odor, color or "burning" complaints from one pressure zone within an hour, or any report of skin or eye irritation, are reported to the Control Room at once. The AMI head-end (MBW-AMI-01) flags continuous-flow and reverse-flow meters hourly; a cluster of reverse-flow flags can be the first sign of a main break or of a cross-connection.

### 6.4 Security Systems

PACS and camera coverage are described in MDWS-OTSEC-2026 Section 3 and MDWS-SCADA-APP-A A.5. Note the known limitation at Orchard Standpipe: the roof hatch switch ZS-611 has been out of service since a lightning strike in 07/2024 (WO-24-1187), RTU-02 therefore always reports the hatch as CLOSED, and CAM-13 covers only the gate. Detection at that site depends on the fence contact ZS-612, the weekly Tuesday visit and AIT-611.

### 6.5 Telemetry Health

The HMI shows a stale-data flag when an RTU has not reported for two polling cycles. Operators must treat a stale value as unknown, not as the last good value. Loss of RP-1 at Hilltop Tank removes live data from Orchard Standpipe (RTU-02), Orchard Wellfield (RTU-06), Northgate (RTU-03) and Mill Road (RTU-04) at once; Hilltop Tank itself (RTU-01) fails over to cellular. Eastfield (RTU-05) is cellular only.

### 6.6 Main-Break Indicators

A sudden rise in FIT-501 plant flow with falling PIT-501 discharge pressure, a Hilltop Tank level (LIT-601) falling faster than 1 ft per 20 minutes, or an AMI reverse-flow cluster indicates a break. At summer demand a break on the Hilltop Transmission Main near Summit Drive drains Hilltop Tank in about 4 hours. Isolation requires valves V-2410 and V-2418; V-2418 is recorded as hard to operate and was last exercised in 2023.

## SECTION 7: RESPONSE PROCEDURES

### 7.1 Loss of Pressure / Main Break

1. Distribution on-call locates the break; Control Room trends FIT-501, PIT-501, LIT-601 and the booster stations.
2. Isolate with the fewest valves (map of record); confirm the isolated area by street.
3. If pressure in any area fell below 20 psi, or customers were without water, start the advisory decision (Section 9) and the sampling plan (Section 8.3) before repairs are complete.
4. For a Hilltop Transmission Main break: start Mill Road Booster Station (BP-401/402) to hold Zone 2; run Orchard Wellfield at full capacity; if Zone 2 demand exceeds about 7 MGD or Hilltop Tank falls below 12 ft, request the Carver County Water District interconnect (IC-1, two-person valve operation after a phone call to their duty desk).
5. Flush, disinfect and sample the repaired main before returning it to service.

### 7.2 Loss of Power

DG-1 (1,250 kW, 72 hours of fuel) carries the plant; the SCADA UPS covers 4 hours. Northgate Booster Station and Mill Road Booster Station have no standby power; Zone 3 then runs on Northgate Reservoir storage (about 10 hours at summer demand). Request the OHWARN portable generator (300 kW trailer) for Northgate first.

### 7.3 Treatment Process Failure / Chemical Overfeed

1. Duty operator stops the affected chemical feed pump at its local HOA switch and confirms the stop on the pump, not only on the HMI.
2. Isolate the affected clearwell if finished-water quality is outside limits; if both clearwells are affected, stop the High Service pumps and hold on storage (Hilltop Tank and Northgate Reservoir give Zones 2 and 3 about 4–6 hours; Zone 1 has no storage and the hospital must be warned at once).
3. Grab samples at the clearwell outlet, the High Service discharge and the first hydrant on each zone; lab turnaround 30 minutes for pH and chlorine, 18–24 hours for bacteriological.
4. If finished pH exceeded 9.5 or chlorine exceeded 4.0 mg/L in water that left the plant, treat as Level 3 and consult DDAGW on a Do Not Drink advisory for the affected zones.
5. If the cause is an unexplained setpoint change, announce CODE CLEARWATER and follow Section 11.

### 7.4 Source Water Contamination

A spill on the Millbrook River above Intake Structure 1, or raw turbidity above 50 NTU with an unknown cause: stop raw water pumps P-101 to P-103, close intake gates G-1 and G-2, run on the clearwells and Orchard Wellfield, and ask Carver County EMA for the spill report. The plant has about 16 hours of storage at average demand with the wells running.

### 7.5 Cyber Incident

Follow MDWS-OTSEC-2026 Section 10. Summary for the Incident Commander:

- Business-network incident (ransomware, phishing, loss of CIS/AMI): City IT contains; the SCADA / IT Security Manager decides within 30 minutes whether to island the control network (OT Plan 10.3), because backup traffic (firewall rule FW-R-17) and the MBWSCADA–MILLBROOK domain trust give business-side malware a path to SCADA.
- Control-network incident: CODE CLEARWATER; the plant goes to manual (Section 7.5.1); remote sites are read by phone and drive-by.
- Do not restore from backups until the SCADA / IT Security Manager confirms they are clean. The most recent PLC-02 program backup is from 03/2025 and does not include the 08/2025 chemical-feed logic change (OT Plan finding F-2); re-commissioning PLC-02 needs Kessler Controls on site.

#### 7.5.1 Manual Operation

The plant can be run in manual for 72 hours with two operators per shift. Chemical feed pumps are set by their local stroke and speed dials; the High Service pumps run in HAND from the MCC; grab samples for chlorine, pH and turbidity are taken every 2 hours and logged on ERP-3; Hilltop Tank is read from its sight gauge and Northgate Reservoir from its float board every 2 hours; Northgate Booster Station runs on its local pressure-switch control. Call-in of off-duty operators is through the Plant Superintendent; OHWARN can supply certified operators within 12 hours.

### 7.6 Physical Intrusion or Tampering at a Storage Facility

See Section 8. Do not enter a site where tampering is suspected until Millbrook Police have cleared it; photograph before anyone touches anything; isolate the facility from the system by valve if the water quality cannot be confirmed.

### 7.7 Contamination Threat

A threat (call, letter, social post) or the discovery of a suspicious container, open hatch or unusual residue triggers the Water Contamination Threat procedure: assess credibility with Millbrook Police and the FBI within 1 hour; isolate the facility; sample per Section 8.3 with field screening (chlorine demand, pH, conductivity, radiation); notify DDAGW and Carver County Public Health; decide on a precautionary advisory within 2 hours of a credible threat. "Credible" does not require confirmation — an open hatch at a site with a disabled hatch switch is credible.

### 7.8 Natural Hazards

- **Flood:** Intake Structure 1 and the lower level of the Chemical Building flood at river stage 18 ft; move chemical day tanks and shut PLC-01 power if the gallery floods.
- **Heat wave:** demand above 13 MGD for three days stresses the Hilltop Transmission Main and empties Hilltop Tank overnight; pre-position the Mill Road Booster Station and ask for voluntary conservation through the PIO.
- **Ice storm:** expect loss of both utility feeds and of the Hilltop repeater (ice on the mast); staff Hilltop Tank and Northgate with a person and a phone.

## SECTION 8: STORAGE FACILITY SECURITY AND SAMPLING RESPONSE

### 8.1 Facilities

| Site | Access control | Intrusion detection | Water-quality instrument | Routine visit |
|---|---|---|---|---|
| Hilltop Tank | Fence, locked gate, ladder cage lock | ZS-601 hatch switch; CAM-11, CAM-12 | None online (sampled weekly) | Weekly (Mondays) |
| Orchard Standpipe | Fence, locked gate | ZS-612 gate contact; **ZS-611 hatch switch out of service**; CAM-13 (gate only) | AIT-611 outlet chlorine residual | Weekly (Tuesdays) |
| Northgate Reservoir | Fence, locked gate, locked hatches | Hatch switches; CAM-14, CAM-15 | None online | Weekly (Wednesdays) |
| Clearwells 1 and 2 | Inside the RWTP fence | Plant PACS, CAM-01 to CAM-10 | AIT-301 to AIT-304 | Continuous |

### 8.2 Response to a Security Alarm or Sign of Entry

1. Patrol (SecureLine) or the Distribution on-call responds within 30 minutes; the Control Room watches the site level and, at Orchard Standpipe, AIT-611.
2. Any sign of entry (cut lock, open hatch, footprints on the roof, foreign object, residue, altered vent screen) is a Level 2 condition: call Millbrook Police; the Security & Emergency Manager and the WQ Manager respond.
3. Isolate the facility by closing its inlet/outlet valves unless doing so would drop a zone below 20 psi (Orchard Standpipe can be isolated without affecting Zone 2 if Hilltop Tank is above 15 ft).
4. Sample per 8.3 before draining anything; preserve video from MBW-NVR-01 (30-day overwrite) and RTU event logs.
5. Decide on a precautionary advisory (Section 9) within 2 hours; the decision does not wait for lab results.

### 8.3 Sampling Plan (ERP-3)

| Sample point | Tests | Turnaround |
|---|---|---|
| Facility outlet (tank or standpipe) and the first two hydrants downstream | Field: free chlorine, pH, conductivity, temperature; lab: total coliform / E. coli, heterotrophic plate count | Field 15 min; coliform 18–24 h |
| Same points | Chemical screen (metals, volatile organics, pesticide screen) through the Ohio EPA contract laboratory | 48–72 h |
| Clearwell outlet | Chlorine, pH, fluoride, turbidity | 30 min |

Lifting an advisory that was issued for a storage site requires two consecutive rounds of satisfactory bacteriological samples 24 hours apart, so an advisory of this kind lasts at least 48–72 hours.

## SECTION 9: PUBLIC NOTIFICATION AND ADVISORIES

### 9.1 Authority

The Director of Water Operations, with the Water Quality Manager, decides whether to issue, extend and lift an advisory, after consulting DDAGW and, for health questions, the Carver County Health Commissioner. The City Manager approves any advisory affecting more than 5,000 people; the Mayor is informed. The decision and its basis are recorded on ERP-2 before release. The duty operator may issue a verbal "do not drink" instruction to Annex B critical customers in an immediate danger (confirmed overfeed leaving the plant) without waiting for the Director.

### 9.2 Tier 1 Situations (notice within 24 hours; consult DDAGW within 24 hours)

Confirmed E. coli in distribution; nitrate above the limit; a turbidity treatment failure; a waterborne disease outbreak; loss of pressure below 20 psi affecting an area of the system; chemical contamination, including an overfeed, or intentional contamination; loss of disinfection; and any other situation DDAGW designates. DWS may act earlier and will consider precautionary notice whenever a Section 8.2 condition exists.

### 9.3 Advisory Types

| Advisory | When | Customer instruction |
|---|---|---|
| **Boil Water Advisory** | Pressure loss, main break, treatment interruption, microbial result, suspected microbial contamination | Boil for one minute before drinking, cooking, brushing teeth, making ice |
| **Do Not Drink** | Chemical contamination or overfeed (for example sodium hydroxide, fluoride), unknown contaminant, credible contamination threat | Do not drink, cook with or give to pets; boiling does not help; use bottled or tanker water |
| **Do Not Use** | A contaminant harmful by skin contact or inhalation | No drinking, bathing, washing; flushing toilets allowed |
| **Precautionary (any type)** | Section 8.2 or 7.7 condition without a confirmed result, at the Director's discretion after consulting DDAGW and Public Health | As above, labelled precautionary |

### 9.4 Advisory Area

Advisory areas are defined by pressure zone and street boundaries from the map of record, never by "neighborhood" names alone. A Zone 2 advisory covers about 42,000 people; a Zone 3 advisory about 9,000; Zone 1 about 17,000 including Millbrook General Hospital and the Carver Kidney Center. A single-street advisory after a small break is drawn by the Distribution Superintendent.

### 9.5 Sequence

Critical customers (Annex B) are called before any public release; the hospital and the dialysis center need 4 hours' notice to switch to tanker supply and each has 24 hours of stored water; Harvest Ridge Foods must stop production under a Do Not Drink and has asked for a direct call. Then MillbrookAlert, the City website and outage map, social accounts, Channel 4 and the Millbrook Courier, and door hangers (six crews hang about 2,000 per hour). Target: critical customers within 1 hour of the decision, the public within 2 hours, never later than 24 hours; repeat every 12 hours; translations into Spanish and Nepali on every channel (MDWS-PCP-2026 Sections 4 and 5).

### 9.6 Lifting

The WQ Manager recommends lifting when the cause is corrected, pressure has been restored above 20 psi for 24 hours, chlorine residual is at least 0.5 mg/L throughout the area, and two consecutive rounds of bacteriological samples 24 hours apart are satisfactory (for a chemical event, when results are below the health-based level at every sample point). DDAGW concurs; the same channels carry the rescission with flushing instructions.

## SECTION 10: PUBLIC INFORMATION

The PIO runs all public and media communication under MDWS-PCP-2026, from the Joint Information Center with Carver County EMA when the County EOC is active. Channels: MillbrookAlert (31,000 registrations), City website and outage map, Facebook, X and Nextdoor, Channel 4 and the Millbrook Courier, door hangers and the critical-customer call list; Spanish and Nepali translations through the contracted translation line. During a cyber incident the PIO says nothing about attribution or affected systems without the SCADA / IT Security Manager and the FBI; the holding statement in the PCP is used.

## SECTION 11: CYBER AND CONTROL-SYSTEM INCIDENTS

### 11.1 CODE CLEARWATER

"CODE CLEARWATER" announced on radio DWS-1 means a suspected cyber attack on, or unauthorized operation of, the control system. Every operator compares HMI values with local instruments and field readings (chemical feed pump stroke counters, clearwell staff gauges, pump running lights at the MCC, tank sight gauges) and reports differences to the Plant Superintendent, who decides on manual control. Full checklists are in MDWS-OTSEC-2026 Section 10.

### 11.2 Evidence

Do not power off HMIs, servers or PLCs unless life safety requires it. Export the SCADA audit log and historian trends; preserve MBW-NVR-01 video, PACS logs, MBW-FW-01 and MBW-JUMP-01 logs and session recordings; record chain of custody on Form SEC-4.

### 11.3 Known Remote-Access Risk

The approved vendor path is MBW-JUMP-01 in a ticketed window. A remote-support agent (ScreenBridge) installed by DosaTech on MBW-HMI-02 in the Chemical Building reaches the internet outside that path and uses a shared account; its removal is OT Plan finding F-3 and remains open. Until it is removed, any unexplained change on the Chemical Feed screen is to be treated as a possible remote session, and the SCADA / IT Security Manager can disable the business-LAN exception (firewall rule FW-R-22) at any time.

## SECTION 12: MUTUAL AID AND RESOURCES

| Resource | Source | Lead time | Notes |
|---|---|---|---|
| Emergency supply up to 4.0 MGD into Zone 2 | Carver County Water District through IC-1 at Mill Road Booster Station | 1 hour | Phone their duty desk; two-person valve operation; their water is chloraminated — notify dialysis customers |
| Emergency supply up to 2.0 MGD into Zone 1 east | City of Fairhaven through IC-2 at Eastfield Pump Station | 2 hours | Pressure difference limits flow in summer |
| Certified operators, pumps, generator trailer, valve crews | OHWARN (555) 037-9000 | 6–12 hours | Mutual-aid agreement signed 2022 |
| Potable water tankers (3 × 6,000 gal) and bottled water (two truckloads) | Carver County EMA contract; Great Lakes Chemical Supply tanker fleet as backup | 4 hours | Hospital and dialysis first |
| Portable generator 300 kW | OHWARN / Carver County EMA | 6 hours | Northgate Booster Station priority |
| SCADA integrator on site | Kessler Controls (555) 039-4411 escalation | 4 hours business days; 12 hours after hours | Required for PLC-02 re-commissioning |
| Incident-response firm | Through the cyber-insurance carrier | 24 hours | Carrier must be notified first (5.3) |
| Chemical resupply | Great Lakes Chemical Supply (hypochlorite); NorthStar Chemical (sodium hydroxide, fluorosilicic acid) | 24–48 hours | Plant holds 10 days of hypochlorite, 14 days of caustic |

## SECTION 13: RECOVERY AND RETURN TO NORMAL

The Incident Commander terminates the incident when water quality is confirmed throughout the affected area, pressure is restored, the control system has been returned to service under the OT Plan return-to-service checklist, and advisories are lifted with DDAGW concurrence.

- [ ] All advisories lifted and rescission issued on every channel
- [ ] Sampling results filed; DDAGW written report within 10 days
- [ ] Control system verified: setpoints, PLC programs and HMI application compared with the last clean backup; vendor accounts disabled; firewall rules restored
- [ ] CISA, FBI and WaterISAC follow-up reports sent; insurer notified of close-out
- [ ] Critical customers told directly that normal service has resumed
- [ ] ERP-1 log, ERP-2 decision records and ERP-3 sample logs filed
- [ ] After-action review within 30 days; findings assigned with due dates

## SECTION 14: TRAINING AND EXERCISES

| Activity | Frequency | Last | Next due |
|---|---|---|---|
| Annex A call-down drill, including after hours | Annual | 01/12/2026 | 01/2027 |
| Manual-operation drill (plant in manual for 4 hours) | Annual | 06/2025 | 06/2026 |
| Tabletop exercise with Carver County EMA, Public Health, Police and Fire | Annual | 04/2025 (main break scenario) | **04/2026 — cyber scenario required** |
| Advisory communications drill with the PIO (templates, translations, critical-customer calls) | Annual | 09/2025 | 09/2026 |
| Full-scale exercise | Every 3 years | 2023 | 2026 |

Findings from the 01/2026 call-down drill: the Director was reached in 7 minutes (target 10); the DDAGW 24-hour line reached voicemail; the hospital facilities desk did not know the dialysis center had its own water contract.

---

## ANNEX A: CONTACT LIST

| Organization | Role / Name | Primary | Alternate |
|---|---|---|---|
| DWS RWTP Control Room | Duty operator (24 h) | (555) 031-2244 | Radio DWS-1 |
| DWS | Denise Albrecht, Director of Water Operations | (555) 031-2200 | (555) 034-1101 (cell) |
| DWS | Ray Castellano, Plant Superintendent | (555) 031-2240 | (555) 034-1122 (cell) |
| DWS | Tom Okonkwo, Distribution Superintendent | (555) 031-2260 | (555) 034-1133 (cell) |
| DWS | Distribution on-call | (555) 034-1199 | |
| DWS | Priya Nandakumar, SCADA / IT Security Manager | (555) 031-2280 | (555) 034-1144 (cell) |
| DWS | Marcus Oyelaran, Water Quality Manager | (555) 031-2230 | (555) 034-1155 (cell) |
| DWS | Elena Vasquez, Laboratory Supervisor | (555) 031-2232 | |
| DWS | Luis Ferreira, Security & Emergency Manager | (555) 031-2290 | (555) 034-1166 (cell) |
| City of Millbrook | Hannah Weiss, PIO | (555) 031-2100 | (555) 034-1177 (cell) |
| City of Millbrook | Kevin Marsh, City IT Director | (555) 031-2300 | (555) 034-1188 (cell) |
| City of Millbrook | Gloria Tennant, City Manager | (555) 031-2000 | |
| City of Millbrook | Mayor Robert Kline | (555) 031-2001 | |
| Ohio EPA DDAGW Central District | Paul Grieve, district engineer | (555) 037-1500 | (555) 037-1555 (24 h) |
| EPA Region 5 | Water Division | (555) 038-5000 | |
| CISA | 24/7 operations | (555) 038-8800 | |
| FBI | Cleveland-area field office, cyber task force | (555) 038-7100 | |
| WaterISAC | Member desk | (555) 038-6000 | |
| Carver County EMA | Sandra Pruitt, Director | (555) 032-4000 | |
| Carver County Public Health | Dr. Anita Shah, Health Commissioner | (555) 032-6000 | |
| Millbrook Police | Chief Dale Whitaker / dispatch | (555) 032-7000 | |
| Millbrook Fire | Chief Mike Reardon | via dispatch | |
| OHWARN | Duty coordinator | (555) 037-9000 | |
| Carver County Water District | Duty desk | (555) 036-2100 | |
| City of Fairhaven Water | Operations | (555) 036-3300 | |
| Kessler Controls | Support / escalation | (555) 039-4400 | (555) 039-4411 |
| DosaTech Metering Systems | Support | (555) 039-5500 | |
| SecureLine Protective | Shift supervisor | (555) 039-8800 | |
| Channel 4 | Assignment desk | (555) 039-0400 | |
| Millbrook Courier | News desk | (555) 039-0500 | |

## ANNEX B: CRITICAL CUSTOMER LIST

| Customer | Zone | Contact | Need |
|---|---|---|---|
| Millbrook General Hospital | 1 | Facilities (555) 035-1000 | 24 h stored water; 4 h notice to switch to tanker supply (contract with Carver County Water District) |
| Carver Kidney Center (dialysis) | 1 | (555) 035-2200 | 24 h stored water; 4 h notice; sensitive to chloramine from IC-1 water |
| Harvest Ridge Foods | 1 | Plant manager (555) 035-4400 | 1.1 MGD; must stop production under a Do Not Drink; direct call before public release |
| Summit Care nursing home | 2 | (555) 035-5500 | 112 residents; bottled water delivery |
| Millbrook City Schools (7 buildings) | 1, 2 | District facilities via City dispatch | Closure decision by 0530 |
| Carver Community College | 3 | Campus safety | Dormitories, 600 residents |
| Fire Stations 1 and 3 | 1, 3 | Fire dispatch | Hydrant pressure for firefighting |

## ANNEX C: FORMS AND CHECKLISTS

- **ERP-1 Incident Log** — time, event, action, who, notifications made.
- **ERP-2 Advisory Decision Record** — condition, Tier, advisory type, area (zone and streets), population, DDAGW contact and time, Public Health consultation, approvals, release times by channel, lifting criteria, lifting approval.
- **ERP-3 Sampling and Manual-Operation Log** — sample points, results, times; manual grab-sample log for chlorine, pH and turbidity every 2 hours.
- **SEC-4 Chain of Custody** — evidence item, location, custodian, transfers (shared with MDWS-OTSEC-2026).
