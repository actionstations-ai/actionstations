# Cedar Ridge Dam — Security Plan (Physical and Control System)

Document Control Number: CVWA-SEC-CRD · Revision 2.4 · Effective Date: 11/01/2025 · Classification: CVWA RESTRICTED — Critical Energy/Electric Infrastructure Information (CEII) *(fictional marking)*
Approved: Teresa Okafor (General Manager) · Victor Ramos (Security Manager) · Glen Haskins (Dam Operations Manager) · Aaron Feld (SCADA/IT Lead)

> **Fictional document** created as source material for tabletop exercise generation. All organizations, vendors, products, systems, addresses, network addresses, persons and telephone numbers are invented. The CEII marking is part of the teaching artifact; nothing here is real CEII.

**Record of Revisions:** 2.2 — 06/01/2023 — All — FERC security group reassessment · 2.3 — 09/15/2024 — Section 6 — AeroSentry installed · 2.4 — 11/01/2025 — Sections 7, 8 — Jump host, vendor access window

## Table of Contents

Section 1 Purpose and Scope · Section 2 Security Organization · Section 3 Restricted Areas and Perimeter · Section 4 Physical Access Control System (PACS) · Section 5 Video Surveillance and Patrol · Section 6 Unmanned Aircraft Systems (UAS) · Section 7 Personnel Security and Insider Threat · Section 8 Control System (SCADA) Cyber Security · Section 9 Incident Response — CODE STILLWATER · Section 10 Evidence Preservation · Section 11 Notifications · Annex A Contacts · Annex B Door and Camera Schedules

---

## SECTION 1: PURPOSE AND SCOPE

### 1.1 Purpose

This Security Plan describes the measures CVWA uses to deter, detect, delay and respond to threats against Cedar Ridge Dam, its powerhouse and its control system, and how security events link to the Emergency Action Plan (EAP). It meets FERC Security Program for Hydropower Projects expectations for a Security Group 1 dam (high consequence).

### 1.2 Scope

Covers the dam crest and Crest Road, Spillway Hoist House, Intake Tower 1 and access bridge, control building, powerhouse (Units 1 and 2), switchyard, tailrace, Dam Access Road gate, and the SCADA network. The public East Overlook and Cedar Lake boat ramp are outside the security perimeter but are monitored.

### 1.3 Security Assumptions

- The most consequential attack is unauthorized operation of Spillway Gates 1–5 or the low-level outlet (LLO), physically or through SCADA, causing a sudden downstream release.
- Response time for the Pike County Sheriff's Office to the site is 18–25 minutes (single road, rural patrol zone).
- From 2200 to 0600 no CVWA staff and no guard is on site (Section 5.3).

## SECTION 2: SECURITY ORGANIZATION

| Role | Name | Security Duties |
|---|---|---|
| Security Manager | Victor Ramos | Owns this plan; PACS administrator; badge issuance and revocation; liaison to Sheriff, FBI, FERC security staff; insider threat program |
| Dam Operations Manager | Glen Haskins | Operational decisions during a security event; EAP level declaration |
| SCADA/IT Lead | Aaron Feld | Control system security; vendor remote-access approvals; cyber incident lead; firewall rule owner |
| Dam Safety Engineer | Mei-Lin Chao, P.E. | Post-incident structural inspection before resuming normal operations |
| Contract Security | Ridgeline Protective Services (one officer per shift, 0600–2200) | Gatehouse, patrols, visitor log, CCTV monitoring during shift |
| Public Affairs Officer | Jordan Pike | Media and social media related to security events |

## SECTION 3: RESTRICTED AREAS AND PERIMETER

### 3.1 Restricted Areas

| Area | Contents | Access Level | Entry Point |
|---|---|---|---|
| R1 — Control Room | CRD-HMI-01, siren local panel, EAP binders | Operators, DOM, DSE, SCADA Lead, Security Manager | Door P-2 |
| R2 — Powerhouse | Units 1 and 2, CRD-HMI-02, unit control panels, DG-1 | Operators, maintenance, escorted contractors | Doors P-3, P-4 |
| R3 — Intake Tower 1 | Intake gate hoists, trash racks, RTU-03 | Operators, maintenance (two-person rule) | Door P-5 via access bridge |
| R4 — Spillway Hoist House | Gate hoists for Spillway Gates 1–5, PLC-1, PLC-2, local control panels LCP-1 to LCP-5 | Operators, maintenance (two-person rule) | Doors P-6, P-7 |
| R5 — Crest Road | Dam crest, monolith galleries entrance, LLO gate operator | All badged staff; vehicles by permit | West and East Crest Gates (keyed) |
| R6 — Server/Telecom Room | CRD-SCADA-SRV01, CRD-HIST-01, CRD-FW-01, network switches | SCADA Lead, Security Manager | Door P-8 |
| R7 — Switchyard | 69 kV breakers, station service transformer | Qualified electrical workers | Padlocked gate (CVWA lock series 400) |

### 3.2 Perimeter

- 8-ft chain-link with 3-strand barbed wire around the control building, powerhouse and switchyard (west bank toe). Dam Access Road gate at SR-41 is a motorized swing gate, closed 2200–0600, opened by badge reader or Control Room.
- Crest Road is closed to the public; pedestrian access ended in 2019. **The East Overlook (public, open dawn to dusk) is 150 ft from the east end of the Spillway Hoist House, separated only by a 4-ft steel railing and the locked East Crest Gate.** The overlook parking lot is unlit after 2300.
- Cedar Lake: a buoy line 500 ft upstream of the dam marks the boat-restricted zone. There is no physical boom. The public boat ramp is 0.6 miles upstream on the east shore.
- Tailrace: public bank fishing permitted to a fence 300 ft downstream of the powerhouse.

### 3.3 Signage

"Restricted Area — No Trespassing" at all restricted areas; "No Drone Flying from This Property" at the overlook (advisory only; see Section 6).

## SECTION 4: PHYSICAL ACCESS CONTROL SYSTEM (PACS)

### 4.1 Description

PACS is the **"KeyWarden 6"** system (fictional vendor Tessaron Access Systems). Server CRD-PACS-01 sits on the business LAN security VLAN (10.85.40.10); door controllers communicate over the business LAN, not the SCADA network. Credentials are proximity badges with PIN at Doors P-2, P-6, P-7 and P-8.

### 4.2 Credential Cache

Each door controller holds a local credential cache refreshed from CRD-PACS-01 **every 15 minutes**. A revoked badge remains valid at a door until the next refresh (up to 15 minutes). If a controller loses communication with the server, it continues to grant access from its last cache **indefinitely** and buffers events locally; buffered events upload when communication returns and are timestamped at upload, not at the swipe, in the PACS event view (raw timestamps are in the controller log only).

### 4.3 Door Schedule

| Door | Location | Reader | Power-Loss Mode | Notes |
|---|---|---|---|---|
| Door P-1 | Control building main entrance | Badge | Fail-secure | Key override: Security Manager, DOM |
| Door P-2 | Control Room | Badge + PIN | Fail-secure | |
| Door P-3 | Powerhouse north personnel door | Badge | **Fail-safe** (life-safety egress) | Unlocks on loss of power; DG-1 does not feed this door controller |
| Door P-4 | Powerhouse generator floor from tailrace deck | Badge | **Fail-safe** | Propped open during summer maintenance (repeat finding) |
| Door P-5 | Intake Tower 1, access bridge door | Badge | Fail-secure | Reader has 1–2 s latency over wireless bridge |
| Door P-6 | Spillway Hoist House, east | Badge + PIN | Fail-secure | Nearest door to East Overlook |
| Door P-7 | Spillway Hoist House, west | Badge + PIN | Fail-secure | Mechanical key override (series 200) |
| Door P-8 | Server/Telecom Room | Badge + PIN | Fail-secure | Two-person rule not enforced by PACS |

### 4.4 Badge Management

- Badges are revoked by the Security Manager within 1 business day of separation; for involuntary separation, before the employee is notified. There is no after-hours PACS administrator; revocation outside business hours requires calling Victor Ramos.
- Contractor badges expire at the end of the work order; the expiration date is entered manually.
- Lost badges must be reported within 1 hour.
- Series 200 mechanical keys (Spillway Hoist House) — 9 issued; key inventory last reconciled 02/2025, 1 key unaccounted for.

## SECTION 5: VIDEO SURVEILLANCE AND PATROL

### 5.1 CCTV

Fourteen cameras record to NVR CRD-NVR-01 (business LAN security VLAN, 10.85.40.20), 30-day retention. Live view in the Control Room and at the gatehouse; remote view for the Security Manager via VPN to the business LAN.

| Camera | View | Type |
|---|---|---|
| CAM-01 | Dam Access Road gate at SR-41 | Fixed, LPR |
| CAM-02 | Control building entrance (Door P-1) | Fixed |
| CAM-03 | Control Room interior | Fixed |
| CAM-04 | Powerhouse north door (Door P-3) and parking | Fixed |
| CAM-05 | Powerhouse generator floor | Fixed |
| CAM-06 | Switchyard | Fixed, thermal |
| CAM-07 | Intake Tower 1 access bridge | Fixed; **IR illuminator failed 08/2025, no night image** |
| CAM-08 | West Crest Gate and Crest Road west | PTZ |
| CAM-09 | East Overlook and East Crest Gate | PTZ |
| CAM-10 | Spillway Hoist House exterior (Doors P-6, P-7) | Fixed |
| CAM-11 | Spillway face and stilling basin | Fixed |
| CAM-12 | Tailrace and fishing access fence | Fixed |
| CAM-13 | Upstream face / buoy line | PTZ, thermal |
| CAM-14 | Server/Telecom Room (Door P-8) | Fixed |

### 5.2 Analytics

Line-crossing alerts on CAM-08, CAM-09 and CAM-10 generate alarms on the gatehouse workstation only. **After 2200 these alerts are not monitored** and are reviewed the next morning.

### 5.3 Patrol Schedule

| Time | Coverage |
|---|---|
| 0600–1430 | Control Room Operator on site; contract officer at gatehouse; crest patrol at 0800, 1100, 1400 |
| 1430–2200 | Contract officer only; crest patrol at 1600, 1900, 2130 |
| **2200–0600** | **No CVWA staff or guard on site.** Sheriff courtesy drive-by of Dam Access Road gate and East Overlook twice nightly (not scheduled; not logged to CVWA) |

## SECTION 6: UNMANNED AIRCRAFT SYSTEMS (UAS)

### 6.1 Airspace Status

The airspace over Cedar Ridge Dam is **not** designated restricted airspace. There is no Temporary Flight Restriction and no FAA-designated UAS restriction over the site. Recreational and Part 107 operators may lawfully fly over the reservoir, overlook and dam subject to FAA rules. CVWA may restrict **takeoff and landing** from CVWA property (overlook, boat ramp) as a property rule only.

### 6.2 Detection — AeroSentry

An **AeroSentry** passive detection unit (fictional product) is mounted on the Spillway Hoist House roof:

- Remote ID receiver: broadcast Remote ID out to approx. 1.5 miles; displays aircraft serial, position, altitude, and operator (control station) location.
- RF detection: common consumer control links out to approx. 1 km.
- **Limitations:** does not detect aircraft without Remote ID that fly pre-programmed autonomous routes with no control link; RF detection degraded in the river gorge below the powerhouse; no radar or optical tracking; no mitigation capability.
- Alerts go by SMS and email to the Security Manager, DOM and the on-shift contract officer. **Between 2200 and 0600 alerts reach only the Security Manager's phone.** Alerts are not shown on the SCADA HMIs.

### 6.3 Policy — No Interference

CVWA staff and contractors **shall not** jam, spoof, net, shoot, strike, or otherwise interfere with or take control of any aircraft, including a UAS, in flight. Federal law reserves counter-UAS mitigation to authorized federal agencies. Staff may not confront the operator.

### 6.4 Response to a UAS Sighting or Detection

- [ ] Record time, location, direction, altitude, description, and any Remote ID data (operator location) from AeroSentry
- [ ] Observe from cover; photograph or video the aircraft and any visible operator/vehicle; do not approach
- [ ] Notify Pike County Sheriff's Office dispatch (Annex A); provide operator location if known
- [ ] Notify Security Manager and DOM; DOM considers Level 1 (EAP 4.2) if the aircraft is over the crest, Spillway Hoist House, Intake Tower 1 or switchyard
- [ ] Report to the FAA (Domestic Events Network / local Flight Standards) and, if suspicious or repeated, to the FBI
- [ ] If an object is dropped or the aircraft lands on the structure: treat as a suspicious item (Section 9.3); do not touch
- [ ] Log in the Security Incident Log; retain AeroSentry data (it purges after 14 days)

## SECTION 7: PERSONNEL SECURITY AND INSIDER THREAT

### 7.1 Screening

Employees with access to R1, R3, R4, R6 receive a criminal background check at hire and every 5 years. Contractors are screened by their employer; CVWA verifies only identity.

### 7.2 Two-Person Rule

Entry to Intake Tower 1 and the Spillway Hoist House, and any switch of a gate's LOCAL/REMOTE selector, requires two qualified persons. Exception: the on-call operator may enter alone during an EAP event. **The rule is procedural; PACS does not enforce it.**

### 7.3 Accounts

All HMI and engineering-workstation logins are individual. The shared "OPS" account on CRD-HMI-02 was to be retired in 2024 and remains active for powerhouse unit start/stop because two contractor-installed screens are bound to it.

### 7.4 Indicators and Reporting

Report to the Security Manager: unexplained after-hours PACS activity; copying of drawings, gate-setting sheets or network diagrams; attempts to obtain another person's PIN; disabling of alarms; disgruntlement following discipline. Separations of staff with R1/R4/R6 access trigger same-day review of HMI, jump host and PACS logs.

## SECTION 8: CONTROL SYSTEM (SCADA) CYBER SECURITY

### 8.1 Architecture

| Zone | Subnet | Assets |
|---|---|---|
| SCADA servers / HMIs | 10.84.10.0/24 | CRD-SCADA-SRV01 (10.84.10.10), CRD-HMI-01 Control Room (10.84.10.21), CRD-HMI-02 Powerhouse (10.84.10.22), CRD-EWS-01 engineering workstation (10.84.10.30) |
| Field controllers | 10.84.20.0/24 | PLC-1 (10.84.20.11), PLC-2 (10.84.20.12), RTU-01 to RTU-08 (10.84.20.101–108) |
| SCADA DMZ | 10.84.250.0/24 | CRD-HIST-01 historian (10.84.250.10), CRD-JUMP-01 jump host (10.84.250.20) |
| Business LAN | 10.85.0.0/16 | CVWA offices, email, CRD-PACS-01, CRD-NVR-01 (security VLAN 10.85.40.0/24) |

Firewall CRD-FW-01 separates 10.84.x.x from 10.85.x.x. Permitted flows: business LAN to CRD-HIST-01 (HTTPS read-only); business LAN to CRD-JUMP-01 (RDP, MFA); CRD-JUMP-01 to CRD-EWS-01 and CRD-SCADA-SRV01 only. No direct internet route from 10.84.x.x.

### 8.2 Field Controller Assignments

| Controller | Function | Link |
|---|---|---|
| PLC-1 | Spillway Gates 1–3 hoist control, gate position | Fiber, crest gallery |
| PLC-2 | Spillway Gates 4–5 hoist control; LLO slide gate | Fiber, crest gallery |
| RTU-01 | Spillway Gates 1–2 position encoders, hoist motor status | Fiber |
| RTU-02 | Spillway Gates 3–5 position encoders, hoist motor status | Fiber |
| RTU-03 | Intake Tower 1: headwater level (Gauge G-1), trash rack differential, intake gate position | Wireless bridge |
| RTU-04 | Penstocks 1–2 pressure and flow | Fiber |
| RTU-05 | LLO gate position, conduit pressure | Fiber |
| RTU-06 | Seepage weirs W-1 to W-4, piezometers PZ-1 to PZ-12 | Copper, gallery |
| RTU-07 | Stilling basin Gauge G-2, tailwater Gauge G-3 | Fiber |
| RTU-08 | Milford Gauge (4.5 mi downstream) | **Cellular modem, public carrier**; password-protected web configuration page |

### 8.3 Vendor Remote Access (HydroLogix)

HydroLogix (fictional SCADA integrator) supports CRD-SCADA-SRV01, the HMI application, and PLC-1/PLC-2 logic.

- **There is no 24/7 vendor VPN.** Remote access is only through CRD-JUMP-01 during a **ticketed window** approved by Aaron Feld (or the DOM if he is unavailable).
- Procedure: HydroLogix opens a ticket → SCADA Lead approves window (date, start/end, named technician, scope) → SCADA Lead enables the named HydroLogix account on CRD-JUMP-01 and confirms MFA → session recorded → at end of window SCADA Lead **manually** disables the account and logs it.
- PLC logic changes require a CVWA operator on site watching the HMI, and the Section 8 return-to-service checklist in the O&M Manual.
- 2025 audit finding: the HydroLogix account was left enabled for 9 days after a window; the account disable step has no automatic expiry.
- After-hours vendor support during an emergency requires the SCADA Lead to be reached first; there is no alternate approver with jump host admin rights.

### 8.4 SCADA Failure-Mode Matrix

| Failure | What Still Works | What Is Lost | Required Action |
|---|---|---|---|
| CRD-SCADA-SRV01 down | PLC-1/PLC-2 hold last gate positions; local control at LCP-1 to LCP-5 | All remote gate control; HMI displays; AlarmLink after-hours alarms | Station operators at Spillway Hoist House; LOCAL mode; read gate positions from mechanical indicators |
| HMI compromised / unexpected commands | Local control panels (LOCAL mode blocks remote commands) | Trust in HMI readings | Switch all gates to LOCAL; isolate 10.84.x.x at CRD-FW-01; CODE STILLWATER |
| PLC-1 or PLC-2 fault | Hoist contactors at LCP (hard-wired local push-buttons) | Position limits enforced by PLC, rate limiting | Local push-button operation with observer on gate; 1 ft per 10 min maximum by watch |
| RTU-06 loss | Manual weir and piezometer readings | Continuous seepage alarms | Manual readings every 4 hours (O&M 6.3) |
| RTU-08 loss (cellular) | NWS/partner river gauges | Milford Gauge stage on HMI | Phone Milford EOC for visual staff-gauge readings |
| Network loss to Intake Tower 1 | Local intake gate controls in tower | Gauge G-1 headwater on HMI | Read Gauge G-1 staff gauge visually |
| Loss of station power | UPS on SCADA 2 hours; DG-1 for control building | Gate hoists (no hoist power) | Portable generator PG-1 (O&M 5.3) or handwheel |

## SECTION 9: INCIDENT RESPONSE — CODE STILLWATER

### 9.1 Code Word

"**CODE STILLWATER**" announced on radio CVWA-1 means: suspected attack on, or unauthorized operation of, gates, units or the control system. All operators stop non-essential work and confirm gate positions.

### 9.2 Cyber / Unauthorized Operation Checklist

- [ ] Operator: compare HMI gate positions with mechanical indicators at the Spillway Hoist House and with Gauge G-2/G-3 readings
- [ ] DOM: order affected gates to LOCAL; restore safe positions locally; consider EAP Level 2 (unexplained gate movement)
- [ ] SCADA Lead: disable CRD-JUMP-01 vendor accounts; block 10.85.x.x → 10.84.x.x at CRD-FW-01; isolate RTU-08 cellular link
- [ ] Do not power off or reimage CRD-SCADA-SRV01, CRD-HMI-01, CRD-HMI-02 or CRD-EWS-01 unless life safety requires
- [ ] Security Manager: pull PACS and CCTV for R1, R4, R6 for the prior 72 hours
- [ ] Notify per Section 11

### 9.3 Physical Intrusion / Suspicious Item

Do not touch or move a suspicious item. Clear 300 ft. Use landline or radio beyond 300 ft. The Sheriff requests the state bomb squad (2+ hour response). DOM decides whether to stop Units 1 and 2 and hold gate positions.

## SECTION 10: EVIDENCE PRESERVATION

Preserve CRD-NVR-01 footage (export before the 30-day overwrite), PACS controller logs (raw, including buffered events), AeroSentry data (14-day purge), CRD-FW-01 and CRD-JUMP-01 logs and session recordings, HMI and historian event logs, and the paper Control Room log. Record chain of custody on Form SEC-7. Photograph physical scenes before anyone enters.

## SECTION 11: NOTIFICATIONS

| Event | Agency | Time Limit |
|---|---|---|
| Any intrusion, sabotage, threat, UAS of concern | Pike County Sheriff's Office | Immediately |
| Security incident affecting dam operation or integrity | FERC Division of Dam Safety and Inspections (regional security contact) | **Within 6 hours**; written report within 72 hours |
| Same | ODNR Division of Water Resources (Dam Safety) | Within 6 hours |
| Suspected terrorism, sabotage, UAS with payload, control-system intrusion | FBI (Cincinnati-area field office, JTTF) | Within 1 hour |
| Control-system cyber incident | CISA (24/7 Central) | Within 24 hours; immediately if gates/units operated without authorization |
| UAS sighting | FAA | Same day |
| Dam safety condition triggered | Pike County EMA, downstream jurisdictions per EAP Section 5 | Per EAP |

---

## ANNEX A: CONTACTS

| Organization | Contact | Telephone |
|---|---|---|
| CVWA Control Room | Cedar Ridge Dam | (555) 021-4400 |
| CVWA Security Manager | Victor Ramos | (555) 021-4420 / (555) 024-5518 |
| CVWA SCADA/IT Lead | Aaron Feld | (555) 021-4430 / (555) 024-7743 |
| CVWA Dam Operations Manager | Glen Haskins | (555) 021-4410 / (555) 024-1187 |
| Ridgeline Protective Services | Shift supervisor | (555) 021-4480 |
| Pike County Sheriff's Office | Dispatch | (555) 022-7000 |
| FBI | Cincinnati-area field office (24 h) | (555) 028-7100 |
| CISA | 24/7 Central | (555) 028-8800 |
| FAA | Domestic Events Network / Flight Standards | (555) 028-9200 |
| FERC | Chicago Regional Office security contact | (555) 028-3020 |
| ODNR Division of Water Resources | 24-hour line | (555) 027-1500 |
| HydroLogix | Support desk (business hours) / escalation | (555) 029-4400 / (555) 029-4411 |
| Tessaron Access Systems | KeyWarden support | (555) 029-6600 |

## ANNEX B: QUICK REFERENCE

Doors P-1 to P-8 (Section 4.3) · Cameras CAM-01 to CAM-14 (Section 5.1) · SCADA 10.84.x.x / Business 10.85.x.x (Section 8.1) · Controllers PLC-1, PLC-2, RTU-01 to RTU-08 (Section 8.2) · Code word CODE STILLWATER (Section 9)
