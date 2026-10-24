# Rook County Emergency Communications District — Systems, Positions and Radio Description

Document Control Number: RCECD-SYS-2026 · Revision 3.0 · Effective Date: 03/01/2026 · Maintained by: Brent Harlow (911 Systems Manager) and Ron Tibbets (Radio System Manager) · Reviewed: Priyanka Shah (CAD Administrator), Greg Matthys (Rook County IT Director)

> **EXERCISE MATERIAL — for training use.** Rook County, the City of Halden, the Rook County Emergency Communications District, its people, partner agencies, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 2.0 — 01/15/2024 — All — NG911 i3 cut-over · 2.1 — 06/01/2025 — Sections 3, 6 — Backup PSAP at the Highway Garage; Site 5 added · 3.0 — 03/01/2026 — All — Network segments and dependencies for the Cyber Incident Response Playbook

**Handling:** Restricted. Contains network and radio system details.

## Table of Contents

Section 1 Facility · Section 2 Call Delivery · Section 3 Positions · Section 4 CAD and Related Systems · Section 5 Networks and Accounts · Section 6 Radio System · Section 7 Agencies and Units Dispatched · Section 8 Alerting · Section 9 Neighboring PSAPs

## SECTION 1: FACILITY

RCECD occupies the second floor of the Rook County Public Safety Center, 250 West Jefferson Street, Halden. The building also holds the Sheriff's Office and the county EOC (first floor). Access is by badge through a mantrap; the equipment room is badge plus PIN. Power: two utility feeds, a 500 kW diesel generator (48 hours of fuel) and a 40-minute UPS for the floor and equipment room.

## SECTION 2: CALL DELIVERY

| Path | What it carries | Detail |
|---|---|---|
| SIP trunk group A | 911 voice and text-to-911 from the state ESInet (primary) | 24 simultaneous calls; diverse fiber entrance (north) |
| SIP trunk group B | 911 from the state ESInet (diverse path) | 24 simultaneous calls; south entrance; carries all calls if A fails |
| 10-digit lines | Non-emergency 555-0100, alarm company line 555-0102, agency lines | County voice system, PRI; GateKeeper call-screening appliance in front |
| Ring-down lines | Tamarack County Communications, Sheriff watch commander, Halden PD | Direct copper circuits, independent of the county voice system |

Text-to-911 sessions arrive in CallPoint at any call-taking position. Device-based hybrid location is shown with the ALI data where the carrier supplies it.

## SECTION 3: POSITIONS

| Position | Location | Normal function | Radio console | Notes |
|---|---|---|---|---|
| Position 1 | Primary floor, row 1 | Call taking | No | |
| Position 2 | Primary floor, row 1 | Call taking | No | |
| Position 3 | Primary floor, row 1 | Call taking | No | Text-to-911 lead |
| Position 4 | Primary floor, row 2 | Call taking | No | |
| Position 5 | Primary floor, row 2 | Call taking | No | |
| Position 6 | Primary floor, row 2 | Call taking | No | |
| Position 7 | Primary floor, radio row | Police Dispatch | Yes | PD Main, PD TAC 1, PD TAC 2 |
| Position 8 | Primary floor, radio row | Sheriff Dispatch | Yes | SO Main, SO TAC 1 |
| Position 9 | Primary floor, radio row | Fire Dispatch | Yes | FD Main, FD TAC 1, FD TAC 2, FD TAC 3; station alerting |
| Position 10 | Primary floor, radio row | EMS Dispatch | Yes | EMS Main, EMS Ops 1 |
| Position 11 | Supervisor pod | Supervisor | Yes (all) | Siren activation, IPAWS terminal, GateKeeper console |
| Position 12 | Supervisor pod | Overflow / training | Yes | Opened by the supervisor |
| Position 13 | Backup PSAP, Highway Garage | Call taking / dispatch | Yes | |
| Position 14 | Backup PSAP, Highway Garage | Call taking / dispatch | Yes | |
| Position 15 | Backup PSAP, Highway Garage | Call taking | No | |
| Position 16 | Backup PSAP, Highway Garage | Supervisor | Yes | |

There are no other positions. Each position has a CallPoint i3 call-handling screen, a call-handling map and a RespondCAD client (hostnames RCECD-POS01 to RCECD-POS16).

## SECTION 4: CAD AND RELATED SYSTEMS

| System | Product | Hosts | Owner |
|---|---|---|---|
| Call-handling equipment | CallPoint i3 (Northwind Telecom) | CP-CORE01, CP-CORE02 (equipment room); vendor-managed | Brent Harlow |
| Computer-aided dispatch | RespondCAD 9 (Keystone Public Safety) | CAD-APP01 (application), CAD-DB01 (database), CAD-GIS01 (map and geocoder), CAD-MDS01 (mobile data server) | Priyanka Shah |
| Mobile data terminals | RespondCAD Mobile | 61 vehicle laptops over cellular VPN | Priyanka Shah |
| Records management (Sheriff and Halden PD) | County RMS | RMS-APP01 (county data center) | Sheriff's Office |
| Recorder | EchoVault | REC-01; storage on county SAN; local 72-hour buffer | Andrea Kim |
| 10-digit call screening | GateKeeper Voice Security appliance | GK-01 | Brent Harlow |
| Mass notification (staff call-back) | CountyNotify | vendor cloud | Luis Aldana |
| Outdoor warning sirens | 34 sirens, radio-activated from Position 11 | Siren encoder SE-01 | Ron Tibbets |
| IPAWS alerting software | via Rook County Emergency Management | EMA laptop and Position 11 | Paul Brodsky |

CAD incident numbers are year-prefixed (CAD #26-104455). During manual operations, card numbers use the series M26-0001.

## SECTION 5: NETWORKS AND ACCOUNTS

| Segment | Systems | Connection to county network |
|---|---|---|
| Call-handling network | CP-CORE01/02, position call-handling screens | None (vendor VPN for support only, enabled per ticket) |
| CAD segment | CAD-APP01, CAD-DB01, CAD-GIS01, CAD-MDS01, REC-01, position CAD clients | Through firewall CAD-FW01; log-in via county Active Directory (RC-DC01, RC-DC02) |
| CJIS segment | IDACS/NCIC terminals | Through the Indiana State Police circuit; advanced authentication |
| Radio network | Zone controller, consoles, site links | None |
| County network | Admin PCs, email, file shares, voice system | — |

Endpoint detection runs on all CAD-segment and county machines, monitored 24/7 by Hoosier Shield Managed Security. CAD database backups: nightly to the county backup appliance and a weekly copy to offline media in the equipment room safe (last restore test 10/2025, 5 hours). Vendor remote access to RespondCAD: county jump host RC-JUMP01 with multi-factor authentication, enabled per ticket.

## SECTION 6: RADIO SYSTEM

Rook County owns a P25 Phase II trunked radio system with five sites and a zone controller at the Public Safety Center.

| Site | Location | Role | Backhaul |
|---|---|---|---|
| Site 1 | Public Safety Center, Halden | Prime site and zone controller; simulcast cell for Halden | Fiber |
| Site 2 | Kessler Hill tower | Simulcast cell north | Microwave |
| Site 3 | Marlow water tower | Simulcast cell east | Microwave |
| Site 4 | Pine Ridge tower | Simulcast cell south | Microwave |
| Site 5 | Rook River tower | Stand-alone site west | Microwave |

If the zone controller fails, sites drop to site trunking: talkgroups work only among radios on the same site.

| Talkgroup / channel | Use |
|---|---|
| PD Main | Halden Police dispatch |
| PD TAC 1 | Halden Police tactical |
| PD TAC 2 | Halden Police tactical / special events |
| SO Main | Sheriff dispatch (also town marshals) |
| SO TAC 1 | Sheriff tactical; storm spotters during severe weather |
| FD Main | Fire dispatch and tone-out |
| FD TAC 1 | Fireground tactical |
| FD TAC 2 | Fireground tactical |
| FD TAC 3 | Fireground tactical / mutual aid |
| EMS Main | EMS dispatch |
| EMS Ops 1 | EMS hospital and operations |
| 8CALL90 | National interoperability calling channel (conventional) |
| 8TAC91 | National interoperability tactical |
| 8TAC92 | National interoperability tactical |
| VCALL10 | VHF interoperability calling (volunteer fire departments) |
| UCALL40 | UHF interoperability calling |

These are all talkgroups and channels on the RCECD consoles.

## SECTION 7: AGENCIES AND UNITS DISPATCHED

| Agency | Units |
|---|---|
| Rook County Sheriff's Office | Patrol units Adam-21 to Adam-34 |
| Halden Police Department | Units 101–128 |
| Halden Fire Department | Engine 1, Engine 2, Engine 3, Ladder 1, Rescue 1, Battalion 1 |
| Volunteer fire departments (Marlow, Pine Ridge, Kessler, Rook River) | Engine 4, Engine 5, Engine 6, Engine 7, tankers |
| Rook County EMS | Medic 1, Medic 2, Medic 3, Medic 4, Medic 5 |

Hospitals: Halden Memorial Hospital (Level III trauma) and Rook Valley Medical Center.

## SECTION 8: ALERTING

Sirens are activated by area (North, South, East, West, Halden) from Position 11. Wireless Emergency Alerts and EAS messages are issued by Rook County Emergency Management as the county's authorized alert originator; RCECD can issue them from Position 11 only when the EMA Director or duty officer authorizes it by phone.

## SECTION 9: NEIGHBORING PSAPS

| PSAP | Agreement | Ring-down |
|---|---|---|
| Tamarack County Communications | Mutual call-taking (MCTA-2025); receives rerouted 911 | Yes |
| Juniper County 911 | Mutual aid radio patch on 8TAC91 | No |
| Indiana State Police post | State police dispatch | No |
