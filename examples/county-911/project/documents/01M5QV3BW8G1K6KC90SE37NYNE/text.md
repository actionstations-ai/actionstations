# Rook County Emergency Communications District — ECC Operations and Continuity Plan

Document Control Number: RCECD-OPS-2026 · Revision 4.0 · Effective Date: 03/01/2026 · Approved: Karen Voss (911 Director) · Luis Aldana (Operations Manager) · Rook County Emergency Communications Board, Resolution 2026-03

> **EXERCISE MATERIAL — for training use.** Rook County, the City of Halden, the Rook County Emergency Communications District, its people, partner agencies, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 3.0 — 01/15/2024 — All — Rewritten for NG911 i3 call delivery over the state ESInet · 3.1 — 06/01/2025 — Sections 6, 7 — Backup PSAP moved to the Rook County Highway Garage; mutual call-taking agreement with Tamarack County Communications renewed · 4.0 — 03/01/2026 — All — Cyber Incident Response Playbook (RCECD-CYB-2026) cross-referenced; swatting procedure; carrier outage contact updated

## Table of Contents

Section 1 Purpose, Authority and Scope · Section 2 Situation and Assumptions · Section 3 Organization and Roles · Section 4 Floor Operations and Staffing · Section 5 Incident Levels · Section 6 Call Surge, Rerouting and Mutual Aid · Section 7 Manual Operations (CAD Down) · Section 8 Evacuation to the Backup PSAP · Section 9 Severe Weather Operations · Section 10 Swatting and Fraudulent Calls · Section 11 Public Information · Section 12 Training and Exercises · Annex A Contact List · Annex B Forms · Annex C Decision Records

## SECTION 1: PURPOSE, AUTHORITY AND SCOPE

### 1.1 Purpose

This plan tells the Rook County Emergency Communications District (RCECD) how to keep answering 911 calls and dispatching police, fire and EMS when call volume, weather, a technology failure, a cyber incident or the loss of the building gets in the way. The district's job, in priority order, is: answer the call, locate the caller, send the right help, and keep responders informed.

### 1.2 Authority

RCECD is the primary Public Safety Answering Point (PSAP) for all of Rook County, created by interlocal agreement between Rook County, the City of Halden and the towns of Marlow and Pine Ridge. It operates under Indiana's statewide 911 statute and the rules of the Indiana Statewide 911 Board, which funds call-handling equipment and operates the statewide ESInet that delivers 911 calls to the center. Access to criminal justice information follows the FBI CJIS Security Policy through the Indiana State Police as the state CJIS Systems Agency.

### 1.3 Scope

Call taking for 911, text-to-911 and the 10-digit lines; dispatch for the Rook County Sheriff's Office, Halden Police Department, Marlow and Pine Ridge town marshals, Halden Fire Department, four volunteer fire departments and Rook County EMS; after-hours call-out for county highway and Halden utilities; outdoor warning sirens and the county's Wireless Emergency Alert authority on behalf of Rook County Emergency Management.

### 1.4 Coordinated Documents

| Document | Number | Revision |
|---|---|---|
| Cyber Incident Response Playbook | RCECD-CYB-2026 | 2.1 |
| Systems, Positions and Radio Description | RCECD-SYS-2026 | 3.0 |
| Rook County Tactical Interoperable Communications Plan (TICP) | RC-TICP-2024 | — |
| Rook County Comprehensive Emergency Management Plan, ESF-2 | RC-CEMP-2024 | — |
| Mutual Call-Taking Agreement with Tamarack County Communications | MCTA-2025 | — |

## SECTION 2: SITUATION AND ASSUMPTIONS

- Rook County has 118,400 residents; Halden (52,700) is the county seat. RCECD handles about 74,000 911 calls and 96,000 10-digit calls a year, and creates about 88,000 CAD incidents.
- 911 calls arrive over the state ESInet on SIP trunk group A (primary) and SIP trunk group B (diverse path). The 10-digit non-emergency and administrative lines arrive on the county voice system.
- The center sits on its own CAD and call-handling network segment, but CAD servers, the recorder and the administrative workstations depend on the county Active Directory, county email and county backups.
- During a severe-weather event, call volume can reach five times normal within 15 minutes of a tornado warning.

## SECTION 3: ORGANIZATION AND ROLES

| ICS role | Primary | Alternate | Responsibilities |
|---|---|---|---|
| Incident Commander (ECC) | Karen Voss, 911 Director | Luis Aldana, Operations Manager | Center-level command, rerouting and evacuation decisions, overtime, policy-group requests |
| Operations — Floor | On-duty Shift Supervisor (A shift Tasha Greene; B shift Mike Delgado; C shift Erin Kowalczyk) | Senior telecommunicator on shift | Call handling, manual dispatch, talkgroup patches, position assignments |
| Technical Lead | Brent Harlow, 911 Systems Manager | Priyanka Shah, CAD Administrator | Call-handling equipment, CAD, ALI and mapping, recorder, carrier and vendor escalation; designated outage contact for the 911 service provider |
| Radio | Ron Tibbets, Radio System Manager (COML) | Halden Fire Department communications officer | P25 radio system, consoles, interoperability channels, ICS 205 |
| County IT / Security | Greg Matthys, Rook County IT Director | Nadia Fenwick, County Information Security Officer | County network, isolation, endpoint detection, forensics |
| Compliance (CJIS) | Shelly Marquardt, Terminal Agency Coordinator | Andrea Kim, Training and QA Coordinator | IDACS/NCIC access, CJIS incident reporting to the state CSA |
| Law Enforcement Liaison | Capt. Dale Rourke, Rook County Sheriff's Office | Lt. Monica Hayes, Halden Police Department | Field response posture, swatting response, BOLOs |
| Fire / EMS Liaison | Battalion Chief Victor Ames, Halden Fire Department | Jen Castillo, Rook County EMS Supervisor | Station alerting fallback, staging, mutual aid |
| Emergency Management | Paul Brodsky, Rook County EMA Director | EMA duty officer | EOC activation, sirens, WEA and EAS messages |
| Public Information Officer | Kayla Brennan, County Communications Director | Halden Police PIO | 10-digit emergency number messages, social media, press |

## SECTION 4: FLOOR OPERATIONS AND STAFFING

The floor has 12 positions (RCECD-SYS-2026, Section 3). Minimum staffing is six telecommunicators and one supervisor at all times; eight and one from 15:00 to 03:00.

| Position | Normal assignment |
|---|---|
| Position 1 – Position 6 | 911 and 10-digit call taking |
| Position 7 | Police Dispatch (PD Main, PD TAC 1, PD TAC 2) |
| Position 8 | Sheriff Dispatch (SO Main, SO TAC 1) |
| Position 9 | Fire Dispatch (FD Main, FD TAC 1 – FD TAC 3) |
| Position 10 | EMS Dispatch (EMS Main, EMS Ops 1) |
| Position 11 | Supervisor (all talkgroups, siren and WEA terminal) |
| Position 12 | Overflow and training; activated by the supervisor |

## SECTION 5: INCIDENT LEVELS

| Level | Trigger | Actions |
|---|---|---|
| Level 3 — Watch | Severe weather watch; one system degraded with a workaround; nuisance-call pattern | Supervisor notifies Operations Manager; call-back staff on standby |
| Level 2 — Degraded | 911 calls queuing more than 20 seconds for 10 minutes; CAD or ALI unavailable; TDoS suspected; tornado warning in the county | Director notified; Position 12 opened; Technical Lead on site; recall of off-duty staff |
| Level 1 — Critical | 911 calls not being delivered or not answered; CAD down more than 30 minutes; building unusable; cyber incident on the CAD network | Director is IC; rerouting or evacuation decided; County EOC informed; state 911 office informed |

## SECTION 6: CALL SURGE, REROUTING AND MUTUAL AID

### 6.1 Abandoned-call and queue thresholds

The ACD wallboard alarms at 3 calls in queue or 20 seconds longest wait. The supervisor opens Position 12, moves dispatchers to call taking if radio traffic allows, and calls in off-duty staff through CountyNotify.

### 6.2 Rerouting 911 calls

When RCECD cannot answer, the Technical Lead asks the state ESInet network operations center to route overflow or all 911 calls to Tamarack County Communications under MCTA-2025. Tamarack answers, takes the information on the shared call form and relays it to RCECD dispatchers by the ring-down line or by radio on 8CALL90 if phones fail. Only the Director (or the Operations Manager when the Director cannot be reached) authorizes rerouting all 911 calls (decision record OPS-DR-2).

### 6.3 Outage notices from carriers

Under FCC rules (47 CFR 4.9(h)), 911 service providers must tell an affected PSAP about an outage as soon as possible and no later than 30 minutes after discovering it, by phone and in writing, with a unique outage identifier and a contact. RCECD's designated outage contact on file with every provider is Brent Harlow, with the supervisor desk (555-0111) as the 24/7 alternate. The supervisor logs every notice on form RCECD-F-09 and reconfirms the contact with each provider every January.

## SECTION 7: MANUAL OPERATIONS (CAD DOWN)

When RespondCAD is unavailable or cannot be trusted (decision record OPS-DR-3):

1. Supervisor announces "CAD down, go to cards" on all talkgroups.
2. Call takers write each call on a manual dispatch card (RCECD-F-11), stamp the time, and pass it to the dispatcher by hand.
3. Dispatchers track unit status on the whiteboard and the printed unit roster; units give status by radio only, not by mobile data terminal.
4. Fire station alerting falls back to radio tone-out on FD Main.
5. Address verification uses the printed map book and the call-handling map, which runs on the call-handling network, not on CAD.
6. When CAD returns, the CAD Administrator verifies it (Cyber Playbook Section 8) before cards are back-entered; incident numbers issued during the outage use the manual series M26-0001.

## SECTION 8: EVACUATION TO THE BACKUP PSAP

The backup PSAP is at the Rook County Highway Garage, 900 County Road 200 North, Halden: four positions (Position 13 – Position 16) with call-handling, radio consoles and a CAD client. Time to operational target: 45 minutes. During the move, 911 is rerouted to Tamarack County Communications. The Director orders evacuation; the Shift Supervisor leads the move; one dispatcher stays on a portable radio until the backup PSAP is live.

## SECTION 9: SEVERE WEATHER OPERATIONS

- On a tornado watch the supervisor staffs to the evening level and tests sirens' activation path.
- On a tornado warning for Rook County the supervisor activates the outdoor warning sirens for the warned area from Position 11, announces the warning on all talkgroups and opens Position 12.
- Rook County Emergency Management issues any Wireless Emergency Alert; the National Weather Service issues the warnings.
- Storm spotters report on SO TAC 1; damage reports are logged on CAD as "WX DAMAGE" incidents (or on cards).

## SECTION 10: SWATTING AND FRAUDULENT CALLS

Swatting calls report a violent emergency at a specific person's or institution's address to draw an armed response. Signs: a caller who is calm, scripted or sounds like a recording; a call on a 10-digit line instead of 911; a VoIP or blocked number; details that do not fit the address; a target who is a public official, a school or a well-known person.

Call takers do not refuse service or delay dispatch because a call might be false. They:

1. Process the call as real and dispatch per the run card.
2. Flag the incident "POSSIBLE SWAT" and tell the dispatcher, who tells the responding supervisor on the air.
3. Try a call-back to the ANI and, if the address has a known phone, a call to the residence or institution.
4. Preserve the recording and the ALI data; the QA Coordinator exports them for law enforcement.

The responding agency decides the tactical posture. The Law Enforcement Liaison reports swatting patterns to the FBI Indianapolis Field Office.

## SECTION 11: PUBLIC INFORMATION

The PIO publishes alternate 10-digit emergency numbers only on the Director's decision (OPS-DR-4) and only numbers in Annex A. The message always says "If you can reach 911, keep calling 911." Channels: county website, county and Sheriff social media, Channel 12 and The Halden Herald, and a Wireless Emergency Alert through Rook County Emergency Management when the outage affects 911 county-wide. The PIO answers false "911 is down, call this number" posts within 30 minutes with the correct information.

## SECTION 12: TRAINING AND EXERCISES

Quarterly: rerouting test with Tamarack County Communications; manual-operations drill (two hours on cards); backup PSAP activation once a year. This tabletop covers a combined severe-weather, TDoS and CAD scenario.

## ANNEX A: CONTACT LIST

| Organization | Contact | Number |
|---|---|---|
| RCECD supervisor desk (24/7) | Shift Supervisor | 555-0111 |
| RCECD non-emergency line (public) | Call takers | 555-0100 |
| Alternate emergency numbers (published only on OPS-DR-4) | Halden / county | 555-0110, 555-0112 |
| Brent Harlow, 911 Systems Manager | Mobile | 555-0113 |
| Karen Voss, 911 Director | Mobile | 555-0114 |
| Tamarack County Communications | Supervisor | 555-0118 |
| State ESInet network operations center (24/7) | NOC | 555-0119 |
| Rook County IT on-call | Greg Matthys / on-call | 555-0121 |
| Rook County Emergency Management | Paul Brodsky | 555-0124 |
| Rook County Sheriff's Office | Watch commander | 555-0126 |
| Halden Police Department | Watch commander | 555-0128 |
| Indiana State Police, IDACS help desk | — | (number in supervisor binder) |
| FBI Indianapolis Field Office | Duty agent | (number in supervisor binder) |
| Channel 12 newsroom | Assignment desk | 555-0161 |
| The Halden Herald | City desk | 555-0163 |

## ANNEX B: FORMS

RCECD-F-09 Carrier outage notice log · RCECD-F-11 Manual dispatch card · RCECD-F-14 Rerouting request record · RCECD-F-17 Possible swatting call record · ICS 205, 205A, 213, 214, 201.

## ANNEX C: DECISION RECORDS

| Record | Decision | Owner |
|---|---|---|
| OPS-DR-1 | Declare an incident level | Shift Supervisor / Director |
| OPS-DR-2 | Reroute all 911 calls to Tamarack County Communications | Director |
| OPS-DR-3 | Go to manual operations (cards) | Shift Supervisor |
| OPS-DR-4 | Publish alternate 10-digit emergency numbers; request a WEA | Director with EMA Director |
| OPS-DR-5 | Evacuate to the backup PSAP | Director |
