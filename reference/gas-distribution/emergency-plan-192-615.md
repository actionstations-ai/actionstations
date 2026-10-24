# Corwin Valley Gas Company — Gas Emergency Plan (49 CFR 192.615)

Document Control Number: CVG-EP-2026 · Revision 7.0 · Effective Date: 03/01/2026 · Approved: Gordon Haskell (Vice President, Gas Operations) · Reviewed: Theresa Novak (Gas Control Manager), Luis Abernathy (Pipeline Safety Compliance Manager) · Operator: Corwin Valley Gas Company, PHMSA Operator ID 99001 (exercise value)

> **EXERCISE MATERIAL — for training use.** Corwin Valley Gas Company, the City of Corwin, Lake Haven County, their people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 6.0 — 02/15/2024 — All — Reissued after the low-pressure overpressure-protection review (telemetry pressure recorders added in every low-pressure district) · 6.1 — 11/01/2024 — Sections 5, 6 — Potential-rupture notification and rupture identification procedures · 7.0 — 03/01/2026 — All — Cross-references to the Cybersecurity Incident Response Plan CVG-CIRP-2026; NRC telephone-only notice; manual-operations staffing; annual liaison update

## Table of Contents

Section 1 Purpose, Authority and Scope · Section 2 System Summary · Section 3 Emergency Organization · Section 4 Receiving, Identifying and Classifying Notices · Section 5 Response Procedures by Emergency Type · Section 6 Overpressure and Loss of Pressure Control · Section 7 Shutdown, Valve Shut-off and Pressure Reduction · Section 8 Notifications and Reports · Section 9 Liaison with Public Officials · Section 10 Restoration and Relights · Section 11 Failure Investigation · Section 12 Training and Exercises · Annex A Contacts · Annex B Decision Records · Annex C Forms

---

## SECTION 1: PURPOSE, AUTHORITY AND SCOPE

### 1.1 Purpose

This plan sets out how Corwin Valley Gas Company (CVG) receives and classifies emergency notices, responds to them, protects people first and then property, and restores service. It meets 49 CFR 192.615 and the Pennsylvania Public Utility Commission's gas safety requirements, and it works with the Cybersecurity Incident Response Plan (CVG-CIRP-2026) when the cause or the effect of an emergency involves the control systems.

### 1.2 Scope

CVG distributes natural gas to about 61,800 customers in the City of Corwin, the Borough of Elm Falls and four townships of Lake Haven County, Pennsylvania. CVG receives gas at two city gates from the Tri-Ridge Interstate Pipeline and has no compressor stations, storage fields or LNG facilities.

### 1.3 Priorities

1. Life safety of the public, responders and employees.
2. Stopping the flow of gas to the hazard.
3. Protecting property and critical customers (Corwin General Hospital, two nursing homes, the Lake Haven County 911 Center, schools).
4. Restoring service safely.

---

## SECTION 2: SYSTEM SUMMARY

Full details are in the Distribution System and SCADA Description (CVG-SYS-2026).

| Element | Summary |
|---|---|
| Supply | Harlan Road City Gate (primary, 18 MMcf/d design) and Millstream Gate Station (secondary, 9 MMcf/d), both fed from Tri-Ridge Interstate Pipeline |
| Supply lines | Line 100 (12-inch steel, MAOP 300 psig) from Harlan Road City Gate; Line 200 (8-inch steel, MAOP 300 psig) from Millstream Gate Station; Lateral 7 (6-inch steel, MAOP 150 psig) to the Elm Falls Industrial Park |
| District regulator stations | RS-11 to RS-24 (fourteen stations) |
| Pressure districts | Pressure District 1 to Pressure District 6 (intermediate and medium pressure, 25–60 psig) and Pressure District 7 and Pressure District 8 (low pressure, 7–14 in. w.c., cast-iron and bare-steel legacy mains in downtown Corwin and Old Elm Falls) |
| Control | Gas Control room at the Operations Center, 2200 Foundry Road, Corwin; PipeView SCADA 6 polling ROC800 RTUs at city gates and regulator stations |
| Customers on low pressure | 9,450 customers in Pressure District 7 and Pressure District 8, most with appliances without individual service regulators |

---

## SECTION 3: EMERGENCY ORGANIZATION

CVG uses ICS. The first person reached in each row fills the role until relieved.

| ICS role | Primary | Alternate | Responsibilities |
|---|---|---|---|
| Incident Commander | Gordon Haskell, VP Gas Operations | Diane Ferrante, Director of Distribution Operations | Activates this plan at Level 2 or 3; approves district shutdowns, curtailment and mutual-assistance requests |
| Gas Control Manager | Theresa Novak | Senior gas controller on shift | System pressure, line pack, remote valve and setpoint actions, manual operation if SCADA is lost |
| Gas Controller (on shift) | Shift controller (24/7) | Second controller | First receipt of alarms; potential-rupture notification; executes controller actions per CVG-CRM-2025 |
| Field Operations Supervisor (M&R) | Raymond Oyelowo, Measurement and Regulation Supervisor | On-call M&R technician | Regulator station checks, manual valve closures, field gauges, regulator lock-up |
| Distribution Field Supervisor | Kathy Brennan | On-call distribution supervisor | Servicepersons on odor calls, meter shut-offs, door-to-door sweeps, relights |
| Cybersecurity Coordinator (TSA) | Anil Desai, OT/SCADA Manager | Erin Mallory, IT Security Manager (alternate Cybersecurity Coordinator) | CVG-CIRP-2026; CISA report; IT/OT isolation |
| Emergency Response / Public Safety Coordinator | Frank DiNardo | Distribution Field Supervisor | Liaison with Lake Haven County 911, fire chiefs, county EMA; evacuation zones |
| Pipeline Safety Compliance Manager | Luis Abernathy | Compliance engineer | NRC call, PHMSA and PA PUC reports, safety-related conditions |
| Corporate Security Manager | Glen Whitaker | Security supervisor | City-gate and station security, law enforcement |
| Customer Service Manager | Yolanda Price | Call center supervisor | Odor-call surge, outage scripts, relight scheduling |
| Public Information Officer | Megan Sorensen, Manager of Communications and Public Awareness | Communications specialist | Media, evacuation and shut-off notices, relight notices |
| Gas Supply Manager | Paul Lindgren | Gas scheduler | Nominations, Tri-Ridge coordination, operational flow orders |

---

## SECTION 4: RECEIVING, IDENTIFYING AND CLASSIFYING NOTICES

### 4.1 Sources

Gas emergency line 1-800-555-0190 (24/7, answered by the call center, after hours by Gas Control); Lake Haven County 911 Center direct ring-down to Gas Control; SCADA alarms; servicepersons and M&R technicians by radio; Tri-Ridge Gas Control; police and fire on scene.

### 4.2 Classification

| Level | Meaning | Examples | Activation |
|---|---|---|---|
| Level 1 | Single location, handled by a serviceperson | Inside odor, leak at a meter set | Distribution Field Supervisor |
| Level 2 | Several locations, a regulator station abnormality, or a loss of SCADA visibility | Several odor calls in one district, high-pressure alarm at a station, SCADA comms loss over 15 minutes | Gas Control Manager and Field Operations Supervisor; IC informed |
| Level 3 | Fire or explosion involving gas, a confirmed overpressure or underpressure of a district, a potential rupture, or a cyber event affecting gas control | Multiple fires in a low-pressure district; unauthorized command to a regulator | IC activates; Emergency Operations Center at the Operations Center, Room 140 |

**Several odor or high-flame calls from one low-pressure district within 30 minutes are classified Level 3 until disproved** (Decision Record EP-3).

---

## SECTION 5: RESPONSE PROCEDURES BY EMERGENCY TYPE

### 5.1 Gas detected inside or near a building

Dispatch a serviceperson (target arrival 30 minutes in Corwin, 45 minutes in the townships); evacuate when combustible-gas readings or the caller's report warrant; eliminate ignition sources; shut off at the meter; ventilate; find and fix the leak or make safe; coordinate with fire on scene.

### 5.2 Fire or explosion near or involving a pipeline facility

Notify 911 if not already; Gas Control looks for pressure or flow changes; field crews isolate the nearest valves; protect exposures with fire; do not extinguish a gas-fed fire until the gas is shut off unless fire command decides otherwise.

### 5.3 Natural disaster

Pre-stage crews; patrol regulator stations and river crossings (Line 200 crosses the Corwin River at the Foundry Road bridge); restore pressure from the city gates outward.

### 5.4 Potential rupture

When Gas Control or the field sees an unexplained pressure loss or flow increase consistent with a rupture on Line 100, Line 200 or Lateral 7, the controller declares a notification of potential rupture, notifies the Lake Haven County 911 Center immediately and directly, and begins rupture identification; the controller closes RCV-01 to RCV-04 as needed and field crews close the manual valves listed in Section 7.

---

## SECTION 6: OVERPRESSURE AND LOSS OF PRESSURE CONTROL

Low-pressure districts are the highest-consequence part of the system: an overpressure pushes gas at line pressure into appliances built for inches of water column, and pilot lights and burners become ignition sources in many buildings at once.

### 6.1 Overpressure protection

Each low-pressure regulator station (RS-21 to RS-24) has a worker regulator and a monitor regulator in series, with sensing lines connected to the downstream main, and a relief valve. Since 2024 each low-pressure district also has telemetry pressure recorders at its far ends (PR-7A, PR-7B, PR-8A, PR-8B) reporting to SCADA every 60 seconds, so Gas Control no longer depends on the station outlet reading alone.

### 6.2 Triggers

- High-pressure alarm at a low-pressure station outlet (alarm 12 in. w.c., high-high 14 in. w.c.) or at a district recorder.
- Disagreement between a station's outlet reading and its district recorders of more than 2 in. w.c.
- Two or more odor, high-flame or pilot-outage calls from one low-pressure district in 30 minutes.
- Any unexplained setpoint change on an electronic pilot controller (RS-21 and RS-22 only, CVG-SYS-2026 Section 4).

### 6.3 Actions

1. Gas Control dispatches M&R to the station and the nearest recorder with calibrated field gauges; field gauges govern over SCADA when they disagree.
2. If an overpressure is confirmed or cannot be ruled out within 20 minutes, the IC orders the station shut in at its inlet valve (Section 7), accepting the outage of the district.
3. Notify 911 and fire; request that fire and police sweep for fires; ask the electric utility (Lake Haven Electric Cooperative) about de-energizing if fires are widespread.
4. Distribution crews begin door-to-door meter shut-offs in the district; customers are not relit until the district is purged and pressure-tested.
5. If a cyber cause is suspected, the Cybersecurity Coordinator activates CVG-CIRP-2026 and Gas Control moves the affected stations to local control (CVG-CIRP-2026 Section 6).

---

## SECTION 7: SHUTDOWN, VALVE SHUT-OFF AND PRESSURE REDUCTION

| Valve | Location | Type | Isolates | Operated by |
|---|---|---|---|---|
| RCV-01 | Harlan Road City Gate outlet | Remote-control | Line 100 from Harlan Road City Gate | Gas Control (SCADA), local |
| RCV-02 | Millstream Gate Station outlet | Remote-control | Line 200 from Millstream Gate Station | Gas Control (SCADA), local |
| RCV-03 | Line 100 at Quarry Road | Remote-control | Line 100 north segment | Gas Control (SCADA), local |
| RCV-04 | Lateral 7 takeoff | Remote-control | Lateral 7 and Elm Falls Industrial Park | Gas Control (SCADA), local |
| Valve 11 | RS-11 inlet | Manual | RS-11 | M&R |
| Valve 12 | RS-12 inlet | Manual | RS-12 | M&R |
| Valve 13 | RS-13 inlet | Manual | RS-13 | M&R |
| Valve 14 | RS-14 inlet | Manual | RS-14 | M&R |
| Valve 21 | RS-21 inlet | Manual | RS-21, Pressure District 7 (north half) | M&R |
| Valve 22 | RS-22 inlet | Manual | RS-22, Pressure District 7 (south half) | M&R |
| Valve 23 | RS-23 inlet | Manual | RS-23, Pressure District 8 (east) | M&R |
| Valve 24 | RS-24 inlet | Manual | RS-24, Pressure District 8 (west) | M&R |
| Valve 31 | Line 200 at the Foundry Road bridge (east bank) | Manual, key-operated | Line 200 river crossing | Distribution crew |
| Valve 32 | Line 200 at the Foundry Road bridge (west bank) | Manual, key-operated | Line 200 river crossing | Distribution crew |

Regulator stations RS-15 to RS-20 are isolated at their own inlet valves, listed on the station drawings in each M&R truck. Shutting in a single low-pressure station does not drop the district if its twin station stays in service; shutting in a whole low-pressure district requires both of its stations (RS-21 and RS-22 for Pressure District 7; RS-23 and RS-24 for Pressure District 8).

---

## SECTION 8: NOTIFICATIONS AND REPORTS

| Notice | Who | When | By |
|---|---|---|---|
| Potential rupture | Lake Haven County 911 Center | Immediately and directly | Gas Controller |
| Incident (49 CFR 191.3) | National Response Center, 800-424-8802 | By telephone at the earliest practicable moment, no later than one hour after confirmed discovery; revise or confirm within 48 hours | Pipeline Safety Compliance Manager (Gas Control Manager after hours) |
| Incident | Pennsylvania PUC Gas Safety Division | Per PA PUC rules, by telephone | Pipeline Safety Compliance Manager |
| Written incident report | PHMSA Form F 7100.1 | Within 30 days | Pipeline Safety Compliance Manager |
| Safety-related condition | PHMSA | Within five working days of determination and not later than ten working days after discovery | Pipeline Safety Compliance Manager |
| Cybersecurity incident | CISA (and TSA as directed) | As soon as practicable, no later than 72 hours after identification | Cybersecurity Coordinator (CVG-CIRP-2026) |
| Supply problem | Tri-Ridge Gas Control | Immediately | Gas Control |

---

## SECTION 9: LIAISON WITH PUBLIC OFFICIALS

CVG meets each year with the Lake Haven County 911 Center, Lake Haven County Emergency Management Agency, the Corwin Fire Department, the Elm Falls Volunteer Fire Company, the township fire companies and Corwin Police, and gives each a copy of the pressure-district map, the emergency line and the Gas Control ring-down number. The most recent liaison meeting was 10/14/2025; attendees reviewed the low-pressure district map and agreed that fire command will ask CVG before re-entering a block with multiple gas fires.

---

## SECTION 10: RESTORATION AND RELIGHTS

After a district shutdown: confirm every meter in the district is off (door-to-door log), repair and replace regulators as required, purge and pressure-test, restore gas at the station, then relight customer by customer with an appliance check. Planning figure: two relights per serviceperson-hour; a full shutdown of Pressure District 7 (5,120 customers) needs mutual assistance from neighboring Pennsylvania utilities through the regional gas mutual-assistance agreement.

## SECTION 11: FAILURE INVESTIGATION

The Pipeline Integrity Manager leads a failure investigation under 192.617: preserve regulators, pilots, sensing lines, SCADA logs, RTU event logs and the controller's actions; no component leaves the site without being tagged.

## SECTION 12: TRAINING AND EXERCISES

Annual review of this plan with every controller, M&R technician and serviceperson; one tabletop per year that also counts as the annual exercise of CVG-CIRP-2026 when it tests at least two of that plan's objectives.

---

## ANNEX A: CONTACTS

| Contact | Number |
|---|---|
| CVG gas emergency line | 1-800-555-0190 |
| CVG Gas Control ring-down / direct | 570-555-0191 |
| Lake Haven County 911 Center (non-emergency) | 570-555-0193 |
| Lake Haven County EMA duty officer | 570-555-0194 |
| Corwin Fire Department, on-duty battalion chief | 570-555-0195 |
| Corwin Police watch commander | 570-555-0196 |
| Lake Haven Electric Cooperative dispatch | 570-555-0197 |
| Tri-Ridge Interstate Pipeline Gas Control | 800-555-0198 |
| National Response Center | 800-424-8802 |
| Pennsylvania PUC Gas Safety Division | 717-555-0199 |
| CISA Central | report@cisa.gov · 888-282-0870 |
| TSA (pipeline security, per SD instructions) | as directed in the SD |
| Corwin General Hospital facilities | 570-555-0110 |

## ANNEX B: DECISION RECORDS

| Record | Decision | Date |
|---|---|---|
| EP-1 | The Gas Control Manager may shut in any single regulator station without IC approval when an overpressure cannot be ruled out | 02/15/2024 |
| EP-2 | Field gauges govern over SCADA readings when they disagree | 02/15/2024 |
| EP-3 | Two or more odor, high-flame or pilot-outage calls from one low-pressure district in 30 minutes are Level 3 until disproved | 02/15/2024 |
| EP-4 | A district shutdown that will last past 18:00 between November and March requires the IC to open warming-center coordination with Lake Haven County EMA | 11/01/2024 |

## ANNEX C: FORMS

C-1 ICS 201 · C-2 Odor call ticket · C-3 Valve closure log · C-4 NRC telephonic report record · C-5 Door-to-door shut-off and relight sheet · C-6 Regulator station field check (inlet, outlet, monitor and worker positions, field gauge readings) · C-7 ICS 214
