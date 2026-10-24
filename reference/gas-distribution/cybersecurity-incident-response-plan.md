# Corwin Valley Gas Company — Cybersecurity Incident Response Plan (TSA Security Directive Pipeline-2021-02 Series)

Document Control Number: CVG-CIRP-2026 · Revision 4.0 · Effective Date: 05/15/2026 · Owner: Anil Desai (OT/SCADA Manager, Cybersecurity Coordinator) · Alternate Cybersecurity Coordinator: Erin Mallory (IT Security Manager) · Approved: Gordon Haskell (VP Gas Operations), Natalie Cho (Chief Information Officer)

> **EXERCISE MATERIAL — for training use.** Corwin Valley Gas Company, the City of Corwin, Lake Haven County, their people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 2.0 — 07/2023 — All — Rewritten to the SD Pipeline-2021-02 incident response plan objectives after TSA designated CVG's distribution facilities · 3.0 — 06/2025 — Sections 6, 7 — Manual-operations staffing; immutable backups for PipeView · 4.0 — 05/15/2026 — All — Aligned with SD Pipeline-2021-02G (effective 05/03/2026, no substantive change from 02F); remote-access findings; contact refresh

**Handling:** Sensitive Security Information may be included in submissions to TSA and CISA; this plan itself is restricted to the positions in Section 2 and the Gas Control binder.

## Table of Contents

Section 1 Purpose and Scope · Section 2 Positions Responsible · Section 3 Critical Cyber Systems · Section 4 Detection and Declaration · Section 5 Objective A: Containment · Section 6 Objective B: Segregation and Manual Operation · Section 7 Objective C: Backups · Section 8 Objective D: IT/OT Isolation Governance · Section 9 Reporting · Section 10 Recovery and Verification · Section 11 Exercises · Annex A Isolation Steps · Annex B Decision Records and Open Findings · Annex C Contacts

---

## SECTION 1: PURPOSE AND SCOPE

This plan gives the specific measures CVG takes to reduce the risk of operational disruption when a cybersecurity incident affects its Critical Cyber Systems. It is organized around the four objectives a TSA-designated owner/operator's incident response plan must meet under SD Pipeline-2021-02G: prompt containment of infected devices; segregation of infected networks and devices, preserving volatile memory before power-off, and labeling affected equipment; the security and integrity of backups; and an established capability and governance for isolating IT from OT. The Gas Emergency Plan (CVG-EP-2026) governs the physical response; the two plans are activated together when a cyber event affects gas control.

## SECTION 2: POSITIONS RESPONSIBLE

| Position | Name | Responsible for |
|---|---|---|
| Cybersecurity Coordinator (primary, 24/7) | Anil Desai, OT/SCADA Manager | Declares a cyber incident affecting OT; directs Sections 5–8 on the OT side; CISA report; TSA liaison |
| Cybersecurity Coordinator (alternate, 24/7) | Erin Mallory, IT Security Manager | IT containment; backups; CISA report when the primary is unavailable |
| Gas Control Manager | Theresa Novak | Decides with the Coordinator when stations go to local control; staffs manual operations |
| SCADA Engineer | Brian Kowal | PipeView servers, RTU configuration, engineering workstation, evidence on OT hosts |
| Network Engineer (OT) | Sofia Mendes | OT firewalls, conduit isolation, remote-access shutdown |
| Field Operations Supervisor (M&R) | Raymond Oyelowo | Technicians at stations for local control and field gauges |
| VP Gas Operations | Gordon Haskell | Approves full IT/OT isolation and any district shutdown; Incident Commander |
| CIO | Natalie Cho | Business-side decisions (billing, customer portal, email) |
| Legal | Hector Ruiz, General Counsel | Law enforcement, privilege, insurer |

## SECTION 3: CRITICAL CYBER SYSTEMS

| System | Hosts | Function | Network zone |
|---|---|---|---|
| PipeView SCADA servers | CVG-SCADA01 (active), CVG-SCADA02 (standby) | Polling, alarms, setpoints, remote valve commands | OT control zone |
| Gas Control HMI consoles | CVG-HMI01, CVG-HMI02, CVG-HMI03 | Controller displays | OT control zone |
| Engineering workstation | CVG-ENG01 | RTU and pilot-controller configuration (ROCLINK), PipeView configuration | OT control zone |
| Historian | CVG-HIST01 | Trends, reports to the business network | OT DMZ |
| OT jump host | CVG-OT-JMP01 | Only path for remote OT access (staff and the integrator), MFA required | OT DMZ |
| Station RTUs | ROC800 at Harlan Road City Gate, Millstream Gate Station, RS-11 to RS-24 | Measurement, alarms, remote valve and pilot setpoints | Field (licensed radio and cellular) |
| Electronic pilot controllers | PC-21 at RS-21, PC-22 at RS-22 | Remote setpoint of the worker regulator pilot | Field, via the station RTU |
| District pressure recorders | PR-7A, PR-7B, PR-8A, PR-8B | Low-pressure district end-point pressures | Field (cellular) |
| OT firewalls | CVG-OTFW01 (IT/OT boundary), CVG-OTFW02 (control/DMZ) | Segmentation | Boundary |

Business systems that are not Critical Cyber Systems but affect operations: customer information and billing, the work-management and mobile dispatch system (servicepersons' odor-call tickets), GIS, email and the call-center telephony.

## SECTION 4: DETECTION AND DECLARATION

- OT network monitoring (passive sensor on the OT control zone, alerts to the IT security operations team and the Cybersecurity Coordinator's phone) flags new remote sessions, configuration downloads to RTUs, and connections from hosts not on the baseline.
- PipeView writes an audit entry for every setpoint change with user, console and time; any setpoint change to PC-21 or PC-22 pages the Gas Control Manager (Decision Record CIRP-5).
- Gas Control reports a cyber suspicion when a screen value disagrees with a field gauge and no instrument fault explains it, when a command appears that no controller issued, or when a console behaves as if someone else is using it.
- The Cybersecurity Coordinator declares a cyber incident affecting OT and notifies the IC; the Gas Emergency Plan's Level 3 then applies.

## SECTION 5: OBJECTIVE A — CONTAINMENT

1. Terminate the suspect session: disable the account in PipeView and in Active Directory (OT domain CVGOT), kill the session on CVG-OT-JMP01.
2. Disable all remote access to OT at CVG-OTFW01 (Annex A, step I-1). This removes the integrator's support path and staff remote access until re-enabled by the Coordinator.
3. Identify the host the actions came from (console, engineering workstation, jump host) from PipeView audit and firewall logs.
4. Change no setpoints from a host that may be compromised; use a known-good console or local control.

## SECTION 6: OBJECTIVE B — SEGREGATION AND MANUAL OPERATION

### 6.1 Segregate devices

Remove the infected or suspect hosts from the network (switch port shutdown by the OT Network Engineer); segregate the other hosts that shared their network segment; **collect a memory image of each affected host before powering it off or moving it**; label affected equipment with red evidence tags (CIRP Form 3) and keep it in Gas Control's locked cabinet.

### 6.2 Local control of stations

When SCADA cannot be trusted, Gas Control moves stations to local control:

| Station group | Local-control method | Staffing |
|---|---|---|
| Harlan Road City Gate, Millstream Gate Station | Station RTU in LOCAL; regulators on mechanical pilots; technician on site with field gauges; reports by radio every 15 minutes | One M&R technician each |
| RS-21, RS-22 (Pressure District 7) | Switch the pilot controller to mechanical pilot (manual selector at the station); verify outlet with a field gauge; confirm with PR-7A and PR-7B readings phoned in by a crew | One technician per station, one crew for recorders |
| RS-23, RS-24 (Pressure District 8) | Mechanical pilots only (no electronic controller); field gauge checks every 30 minutes | One technician for both |
| RS-11 to RS-20 | Mechanical pilots; check on a 60-minute patrol | Two technicians on patrol |

Manual operations at all stations need nine M&R technicians and two distribution crews; CVG has eleven M&R technicians in total, so a full manual period beyond 24 hours needs contractor help (Decision Record CIRP-3).

## SECTION 7: OBJECTIVE C — BACKUPS

PipeView configuration, the historian database and every RTU and pilot-controller configuration are backed up nightly to CVG-OTBK01 in the OT DMZ and weekly to an offline encrypted drive kept in the Operations Center safe (four-week rotation). Backups are scanned before they are written and before a restore. Known-good RTU configurations carry a SHA-256 hash recorded on the station drawing; a restored configuration must match it.

## SECTION 8: OBJECTIVE D — IT/OT ISOLATION GOVERNANCE

| Isolation level | What it means | Who may order it | Consequence |
|---|---|---|---|
| I-1 | Remote access to OT disabled | Cybersecurity Coordinator (either) | No vendor support; on-call engineers must come in |
| I-2 | Historian replication to the business network stopped | Cybersecurity Coordinator | Billing and engineering lose live data; no operational effect |
| I-3 | Full IT/OT separation at CVG-OTFW01 (all conduits closed) | VP Gas Operations on the Coordinator's recommendation | Gas Control loses email and the work-management system on its consoles; odor tickets reach Gas Control by phone from the call center |
| I-4 | SCADA command disabled; stations in local control | Gas Control Manager with the Coordinator | Section 6.2 staffing; no remote valve operation (RCV-01 to RCV-04 operated locally) |

Gas Control can keep operating safely at I-3 and I-4: the stations hold pressure on their mechanical pilots without SCADA, and every remote-control valve can be operated at the valve.

## SECTION 9: REPORTING

| Report | To | When | By |
|---|---|---|---|
| Cybersecurity incident | CISA (report@cisa.gov or 888-282-0870) | As soon as practicable, no later than 72 hours after identification (SD Pipeline-2021-01 series) | Cybersecurity Coordinator |
| Incident coordination | TSA, as the SD and CISA direct | With the CISA report | Cybersecurity Coordinator |
| Law enforcement | FBI Philadelphia Field Office | Same day for unauthorized access to OT | Legal |
| Gas incident (if gas released and 191.3 criteria met) | National Response Center | Within one hour of confirmed discovery (CVG-EP-2026 Section 8) | Pipeline Safety Compliance Manager |
| Regulator | Pennsylvania PUC | Per PUC rules | Pipeline Safety Compliance Manager |
| Information sharing | ONG-ISAC / DNG-ISAC as membership allows | After law enforcement is told | Cybersecurity Coordinator |
| Cyber insurer | Insurer hotline | Within 48 hours (policy condition) | Legal |

## SECTION 10: RECOVERY AND VERIFICATION

1. Rebuild suspect OT hosts from the gold images; restore configurations from backups that predate the incident and match recorded hashes.
2. Compare every station RTU and pilot-controller configuration with its recorded hash before returning the station to SCADA control.
3. Return stations to remote control one at a time, with a technician on site watching a field gauge through one full setpoint check.
4. Remote access stays off until the integrator's accounts are re-issued with new credentials and the jump-host logs have been reviewed.
5. After-action review within 30 days; update the Cybersecurity Implementation Plan if a control failed.

## SECTION 11: EXERCISES

Exercised at least annually, testing at least two of the objectives in Sections 5–8, with the positions in Section 2 as active participants. The 2026 tabletop tests containment (Section 5), segregation and manual operation (Section 6) and isolation governance (Section 8) together with the Gas Emergency Plan's overpressure procedures.

---

## ANNEX A: ISOLATION STEPS

| Step | Action | Where |
|---|---|---|
| I-1 | Disable rule set "OT-REMOTE" (jump host inbound) | CVG-OTFW01 |
| I-2 | Disable rule set "HIST-REPL" | CVG-OTFW02 |
| I-3 | Apply policy "OT-ISLAND" (deny all IT↔OT) | CVG-OTFW01 |
| I-4 | Set PipeView to monitor-only mode; inform stations by radio; selectors to LOCAL | Gas Control consoles and stations |

## ANNEX B: DECISION RECORDS AND OPEN FINDINGS

| Record | Content | Date | Status |
|---|---|---|---|
| CIRP-1 | Either Cybersecurity Coordinator may order I-1 and I-2 at any time without approval | 07/2023 | In force |
| CIRP-2 | The integrator Halden Automation keeps a named account on CVG-OT-JMP01 for after-hours support; sessions are logged but not watched live | 06/2025 | In force; finding F-2 |
| CIRP-3 | A manual-operations period beyond 24 hours needs contractor M&R technicians from the regional mutual-assistance list | 06/2025 | In force |
| CIRP-4 | Finding F-1: CVG-ENG01 has a shared local "engineer" account used by three people | 03/2026 | Open; fix scheduled Q4 2026 |
| CIRP-5 | Any setpoint change to PC-21 or PC-22 pages the Gas Control Manager | 02/2024 | In force |
| CIRP-6 | Finding F-3: the cellular modem at RS-22 has a vendor web interface reachable from the carrier private network; password changed in 2025, interface not disabled | 05/2026 | Open |

## ANNEX C: CONTACTS

| Contact | Number |
|---|---|
| Cybersecurity Coordinator (primary) | 570-555-0120 |
| Alternate Cybersecurity Coordinator | 570-555-0121 |
| Gas Control direct | 570-555-0191 |
| IT security operations (after hours) | 570-555-0122 |
| Halden Automation support (integrator) | 800-555-0123 |
| CISA Central | report@cisa.gov · 888-282-0870 |
| FBI Philadelphia Field Office | 215-555-0125 |
| Cyber insurer hotline | 800-555-0126 |
