# Riverbend Regional Transit Authority (RRTA) — System Security and Emergency Preparedness Plan (SSEPP)

Revision 2.4 · Original Date: 05/01/2021 · Revised: 06/30/2026 · Approved: Dana Whitfield (General Manager) · Renee Calloway (Chief of Transit Police, Security Coordinator) · Luis Ortega (Director of Transportation)

> **Fictional document** created as sample source material for Tabletop Generator. The agency, people, numbers and systems are invented. The handling marking below is reproduced as part of the sample; nothing here is real security-sensitive information.

**HANDLING: RRTA SECURITY-SENSITIVE.** Distribution limited to RRTA staff with a security role, Riverbend Police Department, Harlan County Emergency Management Agency and FTA/TSA reviewers. Do not post, email unencrypted, or leave unattended.

**Record of Revisions:** 2.2 — 04/12/2024 — Sections 5, 8 — event-day plan after Stadium Station AAR · 2.3 — 10/01/2025 — Section 7 — drone/UAS procedures · 2.4 — 06/30/2026 — Sections 4, 9 — PACS migration at Northside Depot; insider threat program

## Table of Contents

Section 1 Purpose and Policy · Section 2 Security Roles and Responsibilities · Section 3 Threat and Vulnerability Assessment · Section 4 Physical Security of Facilities · Section 5 Operator and Rider Safety · Section 6 Suspicious Activity and Suspicious Packages · Section 7 Drone / UAS Incidents · Section 8 Event-Day Crowd Plans · Section 9 Insider Threat Program · Section 10 Notification Matrix · Section 11 Evidence Preservation · Section 12 Training and Review · Annex A Security Contacts · Annex B Acronyms

---

## SECTION 1: PURPOSE AND POLICY

### 1.1 Purpose

This SSEPP describes how RRTA protects riders, employees, vehicles and facilities from intentional harm, and how security measures tie into the Emergency Operations Plan (EOP Rev 3.2) and the CAD/AVL, Fare and SCADA Cyber Annex (Rev 1.3). It follows FTA guidance for transit security programs and supports TSA surface transportation security requirements.

### 1.2 Policy Statement

Security is a line responsibility. Every employee reports suspicious activity, wears an RRTA badge visibly on RRTA property, and challenges or reports unbadged persons in non-public areas. Violations of badge, tailgating or key-control rules are disciplinary matters.

### 1.3 Applicability

All RRTA facilities and vehicles; contractors and vendors on RRTA property; Riverbend Police Department officers assigned to transit under the city–RRTA agreement.

## SECTION 2: SECURITY ROLES AND RESPONSIBILITIES

### 2.1 Security Coordinator

| Designation | Name | Title | 24/7 Contact |
|---|---|---|---|
| Primary Security Coordinator | Renee Calloway | Chief of Transit Police | (555) 014-2210 / Transit Police Dispatch (555) 014-2211 |
| Alternate | Lt. Darnell Price | Transit Police Operations Lieutenant | (555) 014-2212 |
| Cybersecurity Coordinator | Priya Natarajan | IT/OT Manager | (555) 014-2280 |

### 2.2 Responsibilities

- **Chief of Transit Police:** owns this SSEPP; leads threat assessment; liaison with Riverbend Police Department, FBI field office, TSA and the regional fusion center; IC for criminal and security incidents until relieved by RPD.
- **Director of Transportation:** service decisions during security incidents (hold, bypass, suspend) per EOP Section 6.
- **IT/OT Manager:** PACS, CCTV and network security; owner of the Cyber Annex.
- **Facilities Manager:** fences, gates, locks, keys, lighting.
- **Communications Director:** all public statements about security incidents.
- **Transit Police:** 18 sworn officers and 12 contracted fare/security officers. Patrol coverage 0500–0100. **Between 0100 and 0500 there is no RRTA police patrol**; Riverbend Police Department responds to calls on RRTA property.

## SECTION 3: THREAT AND VULNERABILITY ASSESSMENT

### 3.1 Method

Annual assessment led by the Chief of Transit Police with Facilities and IT/OT. Each asset is scored for criticality, vulnerability and consequence (1–5). Last full assessment: 02/2026.

### 3.2 Summary of Highest-Rated Risks

| Asset | Threat | Key Vulnerability | Score |
|---|---|---|---|
| Central Transit Center | Active assailant, IED, crowd | 7 open entrances; CCTV gaps at the 5th Street bays | 4.6 |
| Stadium Station | Crowd crush, IED, UAS | Single plaza exit stair; 1,200-person platform | 4.4 |
| OCC / Administration Building | Intrusion, cyber, insider | Shared lobby with customer service until 1700 | 4.2 |
| Mill Creek Yard | Trespass, vandalism, sabotage, UAS | 1.4 miles of fence along Mill Creek; no fence intrusion detection on the creek side | 4.1 |
| Northside Depot | Theft of bus, sabotage, fuel | Pedestrian gate PACS cache window (4.3) | 3.9 |
| Traction power substations | Sabotage, copper theft | Unstaffed; Eastgate Substation camera has no night illumination | 3.8 |
| Riverfront Garage | Fire, sabotage of chargers | No generator; PACS on utility power only | 3.6 |

### 3.3 Planning Threats

Fare evasion escalating to assault on operators; theft of copper and catenary components; trespass on the right-of-way; swatting and hoax bomb threats; hostile UAS overflight; disgruntled employee or former contractor; ransomware delivered through a vendor connection; protest activity at Central Transit Center.

## SECTION 4: PHYSICAL SECURITY OF FACILITIES

### 4.1 Access Control System (PACS)

RRTA uses a single PACS head-end, `RRTA-PACS-SRV01` (10.72.60.10), with door controllers at each facility on VLAN 60. Badges are proximity cards with PIN at OCC, server rooms and substations. Badge records sync from the HR system nightly at 0200; **a badge deactivated in HR during the day stays active at the door until the next sync** unless Transit Police deactivates it manually in PACS.

### 4.2 Gates and Doors — Failure Modes

| Location | Normal | On power loss | On PACS network loss |
|---|---|---|---|
| Northside Depot vehicle gates | Badge + operator | Fail-secure (closed); manual release key in Dispatch | Fail-secure |
| Northside Depot pedestrian gate | Badge | Fail-secure on battery after 4 hours | Uses cached credentials for 20 minutes, then locks out all cards |
| Riverfront Garage vehicle gates | Badge | **Fail-safe (open)** — no generator | Local cache, no time limit |
| Mill Creek Yard main gate | Badge + CCTV | Fail-secure | Fail-secure |
| OCC Room 210 | Badge + PIN | Fail-secure; key held by Duty Superintendent | Cached credentials, no time limit |
| Substation doors | Badge + PIN | Fail-secure (battery) | Fail-secure |

### 4.3 Northside Depot Pedestrian Gate Cache Window

After the 2026 controller migration, the pedestrian gate controller keeps a local credential cache when it loses contact with `RRTA-PACS-SRV01`. For **20 minutes** the controller accepts any card that was valid at the last sync, including cards revoked since then. After 20 minutes it locks out all cards and must be opened with the mechanical key held by the Depot Dispatcher. Gate events during the cache window are stored locally and uploaded when the link returns; they do not appear on the Transit Police console in real time.

### 4.4 Bus Yard Gates

Bus yard vehicle gates at Northside Depot fail-secure. During a fail-secure event, pull-out is done through the manual release by the Depot Dispatcher and a Street Supervisor posted at the gate; every bus leaving is logged by number on Form SEC-12.

### 4.5 CCTV

312 cameras recorded on `RRTA-VMS-NVR01` and NVR02 (30-day retention); on-board cameras on all buses and LRVs record locally (72-hour overwrite). Transit Police console in the OCC views station and depot cameras live. Known gaps: Central Transit Center 5th Street bays; Mill Creek Yard creek-side fence; Eastgate Substation at night.

### 4.6 Fencing and Lighting

8-foot chain link at Northside Depot, Riverfront Garage and Mill Creek Yard. Mill Creek Yard creek side has no intrusion detection. Facilities inspects fence lines monthly; damage is reported to Transit Police Dispatch.

### 4.7 Key Control

Master keys for depots are issued only by the Facilities Manager and logged. Annual audit found 6 depot master keys unaccounted for (2025); re-core of Riverfront Garage is scheduled but not complete.

## SECTION 5: OPERATOR AND RIDER SAFETY

- All buses have an operator barrier, a covert alarm button (sends a priority CAD message and opens the cab microphone to the OCC) and on-board CCTV.
- On a covert alarm, the dispatcher may not call the bus on open radio; dispatcher calls "Bus [number], check your mirrors" as the code phrase and sends Transit Police.
- **When CAD/AVL is down, covert alarms do not reach the OCC.** Operators are then told to use the emergency talk-request on the radio and the phrase "requesting a supervisor for a mirror check."
- Operators do not enforce fares; they state the fare once and continue.
- LRV operators may hold a train at a platform for a disturbance; they may not leave the cab.

## SECTION 6: SUSPICIOUS ACTIVITY AND SUSPICIOUS PACKAGES

### 6.1 Reporting

Employees report through Transit Police Dispatch or by radio; riders through the RRTA Rider app "Report a Concern" or text line. Reports meeting suspicious activity reporting criteria are forwarded by Transit Police to the regional fusion center within 24 hours.

### 6.2 Checklist: Suspicious Package

- [ ] Apply HOT criteria (Hidden, Obviously suspicious, not Typical).
- [ ] Do not touch, move or cover the item.
- [ ] No radio or phone transmission within 50 feet.
- [ ] Move riders 300 feet away (station) or off the vehicle to a point upwind.
- [ ] Notify OCC with location, stop or station, vehicle number.
- [ ] Transit Police IC; request Riverbend Police Department Bomb Squad.
- [ ] Duty Superintendent decides bypass of the station; rider alert per EOP 7.3.
- [ ] Preserve CCTV for the area (Section 11).

### 6.3 Bomb Threats

Calls are logged on the Bomb Threat Checklist (Form SEC-04). The Chief of Transit Police and Director of Transportation jointly decide on search versus evacuation. Threats naming a specific vehicle cause that vehicle to be stopped at the next safe location and emptied.

## SECTION 7: DRONE / UAS INCIDENTS

### 7.1 Situation

UAS sightings over Mill Creek Yard, Stadium Station and the Blue Line bridge over the Harlan River have risen since 2024. RRTA has no drone detection system and no authority to mitigate UAS.

### 7.2 What Staff May Do

- Observe and record: time, location, direction, color, size, payload, lights.
- Look for the operator (often within 400 yards) and report the location; do not approach.
- Hold trains if a UAS is below about 50 feet over catenary or track, or carries a payload: Rail Controller may hold trains on the Duty Superintendent's approval.
- Photograph or video the UAS and the operator.

### 7.3 What Staff May Not Do

- **Do not** attempt to jam, capture, shoot, strike or otherwise interfere with a UAS, or touch a downed UAS (treat as a suspicious package).
- **Do not** confront the operator.
- **Do not** post images to social media.

### 7.4 Notifications

Transit Police notifies Riverbend Police Department and the FAA (through the regional operations center) for every UAS sighting over RRTA property; FBI if a payload, a repeat pattern or a threat is involved. Log as a suspicious activity report.

### 7.5 Checklist: UAS Over Yard or Station

- [ ] OCC logs sighting; Transit Police dispatched.
- [ ] Rail Controller holds trains if 7.2 criteria met.
- [ ] Transit Police notifies RPD and FAA; requests RPD to locate operator.
- [ ] If UAS lands or falls: cordon 300 feet; suspicious package procedure.
- [ ] Resume service on Transit Police "clear."

## SECTION 8: EVENT-DAY CROWD PLANS

### 8.1 Stadium Station

Serves Confluence Park Stadium (34,000 seats). Event plan activated (EOP Level 3) for any event over 15,000 tickets.

- Pre-event: Green Line 3-car trains at 8-minute headways; 4 extra buses on Route 18.
- Post-event: Green Line 6-minute headways for 90 minutes; Platform Supervisor, 6 Transit Police, 8 event staff.
- Plaza gates: Platform Supervisor meters entry to keep the platform below 1,200 persons; metering starts when the platform is half full.
- Crowd stops: if the plaza stair is blocked, the Platform Supervisor calls "Plaza hold" on TRANSIT-OPS 2 and Transit Police closes the plaza gates.
- PIDS at Stadium Station show event messages from the OCC; station PA is the primary instruction channel during a hold.

### 8.2 Central Transit Center

Large gatherings and protests: Transit Police assesses; RPD leads public-order response. Duty Superintendent may detour Routes 14, 22, 41 and 56 to the 5th Street on-street bays (no CCTV coverage — Section 4.5).

## SECTION 9: INSIDER THREAT PROGRAM

### 9.1 Scope

Covers employees, contractors and vendors with badge, key, system or vehicle access. Program lead: Chief of Transit Police; members: HR Director, IT/OT Manager, Labor Relations.

### 9.2 Controls

- Background check before badge issue; re-check every 5 years for OCC and IT/OT staff.
- Two-person rule for SCADA configuration changes and fare system fare-table changes.
- Contractor badges expire at contract end date in PACS; **the expiry date is entered manually by the sponsoring manager and is often left blank** (2026 audit: 41 of 160 contractor badges had no expiry).
- Separation checklist: badge, keys, uniforms, radio, accounts disabled within 4 hours of separation; IT/OT disables CAD, fare and VPN accounts.
- Shared accounts are prohibited. **Exception still in place:** the depot dispatch workstation at Northside Depot uses a shared `DEPOT-DISPATCH` login on CAD for shift change; tracked as a known risk.

### 9.3 Reporting Concerns

Any employee may report concerns to the Chief of Transit Police or the anonymous ethics line (555) 014-2299. Retaliation is prohibited.

## SECTION 10: NOTIFICATION MATRIX

| Event | Internal (within) | External (within) |
|---|---|---|
| Suspicious package, station bypass | OCC, Chief of Transit Police (immediately) | RPD Bomb Squad (immediately) |
| Bomb threat naming RRTA | GM, Director of Transportation (15 min) | RPD; FBI (1 hour) |
| Assault on operator | Director of Transportation (30 min) | RPD (immediately) |
| UAS over yard or station | Chief of Transit Police (15 min) | RPD, FAA (1 hour) |
| Breach of PACS-controlled area | IT/OT Manager, Facilities (30 min) | RPD if criminal |
| Significant security incident | GM (1 hour) | TSA (24 hours); FTA if a safety event (2 hours) |
| Cyber incident | IT/OT Manager (15 min) | Per Cyber Annex Section 7 (CISA within 24 hours) |
| Fatality or serious injury | GM, Chief Safety Officer (immediately) | FTA (2 hours); NTSB if criteria met |

## SECTION 11: EVIDENCE PRESERVATION

- On-board video overwrites after **72 hours**; station CCTV after 30 days. Transit Police requests a CCTV export within 24 hours of any incident.
- Export is done only by Transit Police or IT/OT; chain-of-custody Form SEC-20 accompanies every export.
- PACS event logs are kept 180 days; pull logs for affected doors and the 2 hours before the event.
- Do not move a vehicle involved in a fatality without law enforcement approval; NTSB may take control.
- Downed UAS, packages and tools are collected by RPD only.
- Cyber evidence: follow Cyber Annex Section 6.4; do not power off or reimage systems.

## SECTION 12: TRAINING AND REVIEW

- New-hire security awareness (2 hours); annual refresher (1 hour) including UAS and insider threat modules.
- Annual tabletop with RPD and Harlan County EMA; one drill per year on Stadium Station crowd metering.
- This SSEPP is reviewed annually and after every Level 1 activation.

## ANNEX A: SECURITY CONTACTS (Mock-Up)

| Contact | Number |
|---|---|
| Transit Police Dispatch (24/7) | (555) 014-2211 |
| OCC Duty Superintendent | (555) 014-2200 |
| Renee Calloway, Chief of Transit Police | (555) 014-2210 |
| Lt. Darnell Price, Transit Police | (555) 014-2212 |
| Priya Natarajan, IT/OT Manager | (555) 014-2280 |
| Facilities Manager (on call) | (555) 014-2270 |
| Northside Depot Dispatcher | (555) 014-2245 |
| Ethics line (anonymous) | (555) 014-2299 |
| Riverbend Police Department Dispatch | (555) 017-1300 |
| Riverbend Police Department Bomb Squad (via Dispatch) | (555) 017-1300 |
| Regional fusion center | (555) 018-4400 |
| FAA regional operations center | (555) 019-2300 |
| FBI field office | (555) 019-2400 |
| TSA Surface Operations Center | (555) 019-2100 |
| Harlan County Emergency Management Agency | (555) 018-3600 |

## ANNEX B: ACRONYMS

CCTV Closed-Circuit Television · FAA Federal Aviation Administration · FBI Federal Bureau of Investigation · HOT Hidden, Obviously suspicious, not Typical · NVR Network Video Recorder · PACS Physical Access Control System · RPD Riverbend Police Department · SSEPP System Security and Emergency Preparedness Plan · UAS Unmanned Aircraft System · VMS Video Management System
