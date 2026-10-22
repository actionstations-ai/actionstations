# Riverbend Regional Transit Authority (RRTA) — Emergency Operations Plan (EOP)

Revision 3.2 · Original Date: 03/01/2022 · Revised: 08/15/2026 · Approved: Dana Whitfield (General Manager) · Luis Ortega (Director of Transportation) · Renee Calloway (Chief of Transit Police)

> **Fictional document** created as sample source material for Tabletop Generator. The Riverbend Regional Transit Authority, the City of Riverbend, Harlan County and every person, telephone number and system named here are invented. Nothing here describes a real agency.

**Record of Revisions:** 3.0 — 03/01/2024 — All — Full rewrite after the Stadium Station crowd AAR · 3.1 — 11/04/2025 — Sections 6, 9 — OCC activation levels; cyber hazard annex added · 3.2 — 08/15/2026 — Annex A, Section 10 — contact refresh; rider-notification templates

## Table of Contents

Section 1 Purpose, Scope and Authorities · Section 2 Situation and Assumptions · Section 3 Concept of Operations · Section 4 NIMS/ICS Organization · Section 5 Operations Control Center (OCC) and Activation Levels · Section 6 Service Suspension and Restoration Authority · Section 7 Rider Notification · Section 8 Mutual Aid · Section 9 Hazard Annexes (9.1 Severe Weather · 9.2 Power/Traction Outage · 9.3 Vehicle Collision / Mass Casualty · 9.4 Civil Disturbance and Event Crowds · 9.5 Suspicious Package · 9.6 Depot Fire · 9.7 Cyber Incident Affecting Dispatch) · Section 10 Training, Exercises and AARs · Annex A Contact List · Annex B Identifier Conventions · Annex C Acronyms

---

## SECTION 1: PURPOSE, SCOPE AND AUTHORITIES

### 1.1 Purpose

This EOP establishes how the Riverbend Regional Transit Authority (RRTA) prepares for, responds to and recovers from emergencies affecting riders, employees, vehicles and facilities. It assigns responsibilities, defines who may stop and restore service, and sets the notification sequence to riders, partner agencies and regulators.

### 1.2 Scope

Applies to all RRTA fixed-route bus service (Routes 3, 7, 14, 18, 22, 31, 41, 56, 63 and 70), the Blue Line and Green Line light rail, RRTA ParaLink paratransit, and all RRTA facilities: Central Transit Center, Northside Depot, Riverfront Garage, Mill Creek Yard, all light-rail stations and the four traction power substations. Contracted security and maintenance vendors working on RRTA property are covered while on site.

### 1.3 Coordinated Use with Other Documents

| Document | Revision | Date |
|---|---|---|
| System Security and Emergency Preparedness Plan (SSEPP) | 2.4 | 06/30/2026 |
| CAD/AVL, Fare and SCADA Cyber Annex (Cyber Annex) | 1.3 | 07/20/2026 |
| Public Transportation Agency Safety Plan (PTASP) | 5.0 | 01/15/2026 |
| Rail Operating Rulebook | 12 | 04/01/2025 |
| Harlan County Emergency Operations Plan, ESF-1 Transportation | 2025 | 09/01/2025 |
| City of Riverbend / RRTA Mutual Aid Agreement | N/A | 02/10/2024 |

### 1.4 Authorities

RRTA Board Resolution 2021-14 (adoption of NIMS); FTA requirements for safety event notification and the PTASP; TSA requirements for surface transportation security coordinators and cybersecurity incident reporting; Harlan County ESF-1 (RRTA is the lead support agency for evacuation transportation).

## SECTION 2: SITUATION AND ASSUMPTIONS

### 2.1 System Profile

- **Bus:** 97 active buses. Bus 4400–4460 (61 diesel-electric hybrids) are based at Northside Depot. Bus 2200–2235 (36 battery-electric) are based at Riverfront Garage and charge overnight on 24 depot chargers.
- **Light rail:** 12 light-rail vehicles, LRV 101–112, based at Mill Creek Yard. Blue Line (11.2 miles, 13 stations) and Green Line (6.8 miles, 9 stations) share track between Central Transit Center and Harlan Street Station.
- **Ridership:** about 41,000 weekday boardings; Stadium Station event days add up to 14,000 trips in a 3-hour window.
- **Staff:** 620 employees; 2 OCC shifts staffed 0430–0130; overnight coverage is one Night Supervisor at the OCC plus on-call staff.

### 2.2 Critical Dependencies

- **Electrical power:** Harlan Valley Power Cooperative feeds the four substations (Mill Creek Substation, Harlan Substation, Riverfront Substation, Eastgate Substation) and all depots.
- **Backup power:** OCC (Administration Building, Central Transit Center campus) has a 30-minute UPS and a 250 kW diesel generator with automatic transfer. Northside Depot has a 150 kW generator covering dispatch, fuel island and PACS. **Gap:** Riverfront Garage has no generator; the battery-electric chargers and the garage PACS controller are on utility power only. **Gap:** Mill Creek Yard tower and yard switch heaters are not on backup power.
- **Communications:** Harlan County 800 MHz P25 radio (RRTA talkgroups TRANSIT-OPS 1–4, TRANSIT-POLICE, TRANSIT-MAINT); data radio and cellular link to on-board units; CAD/AVL (TransitLogic CAD/AVL) in the OCC.
- **Rider information:** passenger information displays (PIDS) and station PA, both driven from `RRTA-PIDS-SRV01`; RRTA Rider app and GTFS-RT feed; RiderAlert SMS/email.

### 2.3 Hazard Identification and Risk Assessment

| Hazard | Description | Probability | Consequence | Warning Time |
|---|---|---|---|---|
| Severe winter storm | Ice on catenary, snow over 8 in. in 24 hrs | High | Moderate | 12–48 hours |
| Tornado / severe thunderstorm | Damage to overhead contact system, depot roofs | Medium | High | 10–30 minutes |
| Flooding | Mill Creek overtopping at Mill Creek Yard | Medium | High | 6–24 hours |
| Traction power loss | Substation trip or utility outage | Medium | Moderate | None |
| Cyber incident | Ransomware or intrusion affecting CAD/AVL, fare or SCADA | Medium | High | None |
| Vehicle collision / MCI | Bus or LRV collision with vehicle or pedestrian | Medium | High | None |
| Event crowd / civil disturbance | Stadium Station crowd surge, protest at Central Transit Center | Medium | Moderate | Hours (events) |
| Suspicious package / IED threat | Unattended item on vehicle or platform | High | Variable | None |
| Depot fire | Fire at Northside Depot or Riverfront Garage (battery thermal event) | Low | High | None |
| Drone / UAS incursion | UAS over Mill Creek Yard or Stadium Station | Medium | Low–High | None |

### 2.4 Planning Assumptions

- The first report of most incidents will come from an operator radio call, a 911 transfer or a CAD alarm.
- A major incident will exhaust on-duty OCC and Transit Police resources within 30 minutes.
- Mutual aid from the Riverbend Police Department and Riverbend Fire Department will stage in 10–15 minutes inside city limits; Harlan County units outside city limits take 20–30 minutes.
- Between 0130 and 0430 there is no OCC Duty Superintendent on site. The Night Supervisor holds all OCC authority until the on-call Duty Superintendent arrives (target 45 minutes).
- For a transit accident meeting NTSB criteria, NTSB has authority over the vehicle and scene; RRTA may not move the vehicle except to preserve life.

## SECTION 3: CONCEPT OF OPERATIONS

### 3.1 Phases

- **Phase 1 — Detection and Notification:** OCC receives the report, logs a CAD incident number and starts the notification matrix (Annex A).
- **Phase 2 — Response and Stabilization:** life safety first; protect riders on vehicles and platforms; isolate the hazard; adjust or suspend service.
- **Phase 3 — Recovery and Restoration:** restore service by stages, verify systems, notify riders, collect evidence and records, conduct the AAR.

### 3.2 Priorities

1. Life safety of riders, operators and responders. 2. Incident stabilization. 3. Protection of property and evidence. 4. Continuity of essential service (hospital, school and ParaLink dialysis trips). 5. Restoration of normal service.

## SECTION 4: NIMS/ICS ORGANIZATION

### 4.1 Incident Commander

The **Director of Transportation (Luis Ortega)** is the RRTA Incident Commander for operational incidents (service, weather, power, vehicle failures). The OCC Duty Superintendent is IC until he or a designee assumes command. For fire, hazmat or rescue scenes, the Riverbend Fire Department is IC and RRTA joins Unified Command. For criminal or terrorism incidents, the Chief of Transit Police (Renee Calloway) or Riverbend Police Department Watch Commander is IC. For a cyber incident, Unified Command is the Director of Transportation (operations) and the IT/OT Manager (Priya Natarajan, technical) — see Section 9.7.

### 4.2 Command and General Staff

| ICS Position | Primary | Alternate |
|---|---|---|
| Incident Commander | Luis Ortega, Director of Transportation | OCC Duty Superintendent |
| Public Information Officer | Marcus Bell, Communications Director | Rider Communications Coordinator |
| Safety Officer | Gloria Pham, Chief Safety Officer | Rail Safety Specialist |
| Liaison Officer | Tomasz Kowal, Emergency Manager | Deputy Emergency Manager |
| Operations Section Chief | Bus Operations Manager or Rail Operations Manager | Street Supervisor on scene |
| Planning Section Chief | Service Planning Manager | Scheduling Supervisor |
| Logistics Section Chief | Fleet Maintenance Director | Facilities Manager |
| Finance/Admin Section Chief | Deputy GM, Finance | Grants Manager |
| Policy group (not ICS) | Dana Whitfield, General Manager | Deputy General Manager |

### 4.3 Plain Language

No 10-codes on multi-agency talkgroups. Use vehicle numbers ("Bus 4417", "LRV 106"), route or line names ("Route 22", "Green Line") and stop numbers ("Stop 1042") in every report.

## SECTION 5: OPERATIONS CONTROL CENTER (OCC) AND ACTIVATION LEVELS

### 5.1 Location

Primary OCC: Administration Building, Room 210, Central Transit Center campus. Backup OCC: Northside Depot Training Room (Room 118), equipped with 4 CAD/AVL thin clients, 6 radio consoles and a read-only SCADA view. Moving to the backup OCC takes 60–90 minutes; there is **no traction power control** from the backup OCC — only local control at each substation.

### 5.2 Activation Levels

| Level | Name | Trigger | Staffing |
|---|---|---|---|
| 4 | Normal | Routine operations | OCC shift |
| 3 | Enhanced Monitoring | NWS Watch, planned stadium event, single-route disruption over 30 min | Add Duty Superintendent, PIO on call |
| 2 | Partial Activation | Line suspension, MCI, systemwide CAD/AVL degradation, depot evacuation | IC, PIO, Safety, Liaison, Ops Chief report to OCC |
| 1 | Full Activation | Systemwide suspension, confirmed cyber incident, regional disaster | Full ICS staff; Harlan County EOC liaison seated |

Raising the level is done by the Duty Superintendent; lowering below Level 2 requires the IC.

### 5.3 OCC Checklist — Activation

- [ ] Open CAD incident number; record time, reporter, vehicle, location.
- [ ] Announce activation level on TRANSIT-OPS 1 and by RiderAlert staff page.
- [ ] Notify per Annex A within 15 minutes of Level 2 or higher.
- [ ] Assign a scribe; start the ICS-214 unit log.
- [ ] Confirm generator status at OCC and Northside Depot; record Riverfront Garage power status.
- [ ] Brief IC on vehicles in service, line status and riders on board.

## SECTION 6: SERVICE SUSPENSION AND RESTORATION AUTHORITY

### 6.1 Who May Stop Service

| Action | Authority |
|---|---|
| Stop a single train or bus immediately for safety | Any operator; any Rail Controller; any Street Supervisor |
| Hold or suspend a line or route segment | OCC Duty Superintendent (Night Supervisor 0130–0430) |
| Remove traction power from a segment | Rail Controller on Duty Superintendent approval; Riverbend Fire Department on request (verbal accepted, logged) |
| Systemwide suspension up to 2 hours | Director of Transportation |
| Systemwide suspension beyond 2 hours | General Manager |
| Fare-free operation (validators bypassed) | Director of Transportation, notify Deputy GM Finance |

### 6.2 Restoration

Service is restored only when the IC confirms: hazard removed; traction power verified by the Rail Controller; track or roadway inspected; vehicles inspected; rider information systems reflect restored service. Restore one route or one line segment first, run one complete trip, then restore remaining service.

## SECTION 7: RIDER NOTIFICATION

### 7.1 Channels

Station PA (live from OCC console or pre-recorded); passenger information displays (PIDS); on-board announcements by operator; RRTA Rider app push and GTFS-RT service alerts; RiderAlert SMS/email; RRTA website banner; social media posted only by the Communications Director or designee.

### 7.2 Timelines

- First rider alert within **10 minutes** of any line suspension or route detour over 20 minutes.
- Updates every 30 minutes, or sooner on any change.
- Messages describing a security incident, fatality or cyber incident are approved by the PIO before release. OCC staff may post only the pre-approved templates in 7.3.

### 7.3 Pre-Approved Templates

- "Blue Line service is suspended between [station] and [station] due to [a police investigation / a power problem / weather]. Shuttle buses are being arranged. Next update by [time]."
- "Route [number] is detoured. Buses will not serve Stop [number] to Stop [number]."
- "Real-time arrival information is unavailable. Buses and trains are running. Please use posted schedules."

## SECTION 8: MUTUAL AID

| Partner | Support | Activation |
|---|---|---|
| Harlan County Emergency Management Agency | County EOC, resource requests, ESF-1 | Liaison Officer to County Duty Officer |
| Riverbend Police Department | Patrol, traffic control, tactical, bomb squad | 911 or RPD Dispatch |
| Riverbend Fire Department | Fire, EMS, hazmat, technical rescue | 911 or RFD Dispatch |
| Riverbend City Schools | Up to 40 school buses with drivers for bus bridges and evacuation (weekday availability after 0930 and before 1400 only) | Transportation Director, by phone |
| Harlan County Sheriff | Patrol outside city limits (Route 63, Route 70, Eastgate Station) | Sheriff Dispatch |
| National Weather Service | Forecasts, warnings, spotter reports | NWS office line / NOAA Weather Radio |

## SECTION 9: HAZARD ANNEXES

### 9.1 Severe Weather

- At NWS Winter Storm Warning: deploy anti-icing train runs on Blue Line and Green Line every 30 minutes overnight; stage snow routes for Routes 7, 18, 31.
- At NWS Tornado Warning covering Riverbend: hold trains at the next station with doors open; operators of buses pull to the nearest safe structure; Central Transit Center concourse lower level is the public shelter.
- At flood warning for Mill Creek: move LRVs off the Mill Creek Yard low tracks (Tracks 7–10) to Harlan Street Station tail track.

### 9.2 Power / Traction Outage

1. Rail Controller confirms which substation tripped on the SCADA HMI (`RRTA-TP-HMI01`).
2. Hold all trains in the affected section; no train may coast into a dead section.
3. If remote reset fails twice, dispatch a substation technician for local reset (Mill Creek Substation and Eastgate Substation are each about 40 minutes from the on-call technician base).
4. Request bus bridge if outage expected to exceed 30 minutes.
5. Riverfront Garage utility loss: battery buses already charged continue service; buses not charged above 60% stay in the garage.

### 9.3 Vehicle Collision / Mass Casualty

- Operator: secure the vehicle, call OCC with vehicle number, location (stop number or nearest cross street) and injuries.
- OCC: call 911; dispatch Street Supervisor and Transit Police; remove traction power on request of Riverbend Fire Department.
- Do not move the vehicle after a fatality or serious injury without IC and law enforcement approval; NTSB may assume control.
- Notify FTA within **2 hours** for events meeting FTA thresholds (fatality, injury requiring transport, substantial damage, evacuation for life safety).
- Pull and preserve on-board video and CAD/AVL logs for the vehicle within 24 hours (on-board recorders overwrite after 72 hours).

### 9.4 Civil Disturbance and Event Crowds

- Stadium Station event plan (detail in SSEPP Section 8): Green Line runs 3-car trains at 6-minute headways for 90 minutes post-event; platform capacity is about 1,200 persons; the Platform Supervisor may **meter** entry at the station plaza gates.
- If platform crowding exceeds capacity, the Platform Supervisor requests a hold and the OCC stops inbound trains at Riverfront Station until the platform clears.
- Protest at Central Transit Center: Transit Police assess; Duty Superintendent may detour Routes 14, 22, 41 and 56 to the 5th Street on-street bays.

### 9.5 Suspicious Package

Follow the HOT criteria (Hidden, Obviously suspicious, not Typical). Do not touch or move; no radio or phone transmission within 50 feet; clear 300 feet; Transit Police assumes IC until RPD Bomb Squad arrives. Duty Superintendent decides on station bypass. Full procedure: SSEPP Section 6.

### 9.6 Depot Fire

- Northside Depot: evacuate to the north employee lot; fuel island emergency stop is at Column F-4.
- Riverfront Garage: a battery thermal event on Bus 2200–2235 is a hazmat fire; do not attempt to extinguish beyond an initial portable unit; evacuate and request Riverbend Fire Department hazmat response; tell responders the bus number and the charger bay.

### 9.7 Cyber Incident Affecting Dispatch

**Impact:** CAD/AVL loses vehicle positions or messaging; rider app and PIDS show wrong or stale arrivals; fare validators may drop offline; traction power SCADA may be affected if the incident spreads.
**Response:** declare **CODE GRAYLINE** (see Cyber Annex Section 6). Director of Transportation assumes operational command; IT/OT Manager assumes technical command. OCC switches to voice dispatch per Cyber Annex Section 5.3; reduce service to core routes (Routes 14, 22, 41 and 56 plus both rail lines) if more than 60 vehicles are active. PIO posts "real-time information unavailable" template. Do not reboot or wipe affected servers before the IT/OT Manager approves — preserve logs (Cyber Annex 6.4).

### 9.8 Checklist: Cyber Incident (Operations Side)

- [ ] Duty Superintendent: confirm symptoms with two operators by voice; log time.
- [ ] Call IT/OT on-call (Annex A) within 15 minutes; IT/OT Manager decides on CODE GRAYLINE.
- [ ] Switch to voice dispatch; assign one dispatcher per talkgroup.
- [ ] Blank PIDS if displays show false information (switch at OCC console 3).
- [ ] Rail Controller: verify traction power status by phone with substation technicians if HMI values are in doubt.
- [ ] PIO: approve rider message; inform the General Manager.

## SECTION 10: TRAINING, EXERCISES AND AARs

- Annual full review of this EOP by the Emergency Manager; contact list (Annex A) verified quarterly.
- At least one tabletop per year that includes a cyber scenario, and one functional drill on voice dispatch.
- AAR within 30 days of any Level 1 or Level 2 activation. The 2023 Stadium Station AAR found that platform metering started 11 minutes late because the Platform Supervisor was not on the OCC talkgroup.

## ANNEX A: CONTACT LIST (Mock-Up)

All emergency calls route through the OCC at (555) 014-2200.

| Internal | Contact |
|---|---|
| OCC Duty Superintendent (0430–0130) / Night Supervisor (0130–0430) | (555) 014-2200 |
| Transit Police Dispatch (24/7) | (555) 014-2211 |
| IT/OT On-Call (24/7 pager) | (555) 014-2290 |
| Substation Technician On-Call | (555) 014-2255 |
| Fleet Maintenance — Northside Depot | (555) 014-2240 |
| Fleet Maintenance — Riverfront Garage | (555) 014-2241 |
| Dana Whitfield, General Manager | (555) 014-2001 |
| Luis Ortega, Director of Transportation | (555) 014-2010 |
| Renee Calloway, Chief of Transit Police | (555) 014-2210 |
| Priya Natarajan, IT/OT Manager | (555) 014-2280 |
| Marcus Bell, Communications Director | (555) 014-2050 |
| Tomasz Kowal, Emergency Manager | (555) 014-2060 |

| External | Contact |
|---|---|
| Emergency (police, fire, EMS) | 911 |
| Riverbend Police Department Dispatch | (555) 017-1300 |
| Riverbend Fire Department Dispatch | (555) 017-1200 |
| Harlan County Emergency Management Agency Duty Officer | (555) 018-3600 |
| Harlan County Sheriff Dispatch | (555) 018-3700 |
| National Weather Service (forecast office) | (555) 019-4100 |
| Riverbend City Schools Transportation | (555) 017-5500 |
| Harlan Valley Power Cooperative (outage desk) | (555) 019-8800 |
| FTA Regional Office | (555) 019-2000 |
| TSA Surface Operations Center | (555) 019-2100 |
| NTSB Response Operations Center | (555) 019-2200 |

## ANNEX B: IDENTIFIER CONVENTIONS

Bus routes: "Route 14" or "Routes 14, 22, 41 and 56". Rail lines: "Blue Line", "Green Line". Buses: "Bus 4417" (fleet series 4400–4460 and 2200–2235). Light-rail vehicles: "LRV 101" through "LRV 112". Facilities end in their noun: "Northside Depot", "Riverfront Garage", "Central Transit Center", "Harlan Street Station", "Mill Creek Yard". Stops: "Stop 1042". Hostnames: uppercase with hyphens (`RRTA-CAD-APP01`). Phone numbers: "(555) 01x-xxxx".

## ANNEX C: ACRONYMS

AAR After-Action Review · AVL Automatic Vehicle Location · CAD Computer-Aided Dispatch · EMA Emergency Management Agency · ESF Emergency Support Function · FTA Federal Transit Administration · GTFS-RT General Transit Feed Specification – Realtime · HMI Human-Machine Interface · IC Incident Commander · LRV Light-Rail Vehicle · MCI Mass Casualty Incident · NTSB National Transportation Safety Board · NWS National Weather Service · OCC Operations Control Center · PA Public Address · PIDS Passenger Information Display System · PIO Public Information Officer · PTASP Public Transportation Agency Safety Plan · SCADA Supervisory Control and Data Acquisition · SSEPP System Security and Emergency Preparedness Plan · TSA Transportation Security Administration · UAS Unmanned Aircraft System
