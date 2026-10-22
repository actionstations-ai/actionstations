# Riverbend Regional Transit Authority (RRTA) — CAD/AVL, Fare and SCADA Cyber Annex

Revision 1.3 · Original Date: 11/04/2025 · Revised: 07/20/2026 · Approved: Priya Natarajan (IT/OT Manager, Cybersecurity Coordinator) · Luis Ortega (Director of Transportation) · Dana Whitfield (General Manager)

> **Fictional document** created as sample source material for Tabletop Generator. "TransitLogic CAD/AVL", "RiverPass" and every host, address, person and number here are invented. The network details are sample data for exercises, not a real configuration.

**HANDLING: RRTA SECURITY-SENSITIVE.** Annex to EOP Rev 3.2 (Section 9.7) and SSEPP Rev 2.4. Distribution: OCC supervisors, IT/OT staff, Transit Police command, executive team.

**Record of Revisions:** 1.0 — 11/04/2025 — All — Initial annex · 1.1 — 02/02/2026 — Section 4 — vendor remote access rule · 1.2 — 05/11/2026 — Section 5 — failure matrix after the April AVL gateway outage · 1.3 — 07/20/2026 — Sections 6–8 — CODE GRAYLINE, notifications, one-route-first restoration

## Table of Contents

Section 1 Purpose and Scope · Section 2 System Architecture · Section 3 Roles · Section 4 Access and Remote Access Policy · Section 5 Failure Modes and Manual Procedures · Section 6 Incident Response — CODE GRAYLINE · Section 7 Notifications · Section 8 Restoration and Verification · Section 9 Tabletop Scenario Hooks · Annex A Contacts · Annex B Host and Network Inventory · Annex C Acronyms

---

## SECTION 1: PURPOSE AND SCOPE

### 1.1 Purpose

Defines how RRTA keeps buses and trains moving safely when dispatch, rider information, fare collection or traction power control systems fail, whether from a cyber attack or a technical fault. The first goal is safe operation; the second is preserving evidence; the third is restoring systems in a verified order.

### 1.2 Systems Covered

TransitLogic CAD/AVL (dispatch and vehicle location); on-board vehicle logic units (VLUs) and the data radio/cellular link; GTFS-RT real-time feed, RRTA Rider app back end and passenger information displays (PIDS) with station PA; RiverPass fare system; traction power SCADA; PACS and CCTV (network side only — physical procedures are in SSEPP Section 4).

## SECTION 2: SYSTEM ARCHITECTURE

### 2.1 Network Segments

| VLAN | Subnet | Purpose | Notes |
|---|---|---|---|
| 10 | 10.72.10.0/24 | OCC servers and consoles | CAD/AVL servers, PIDS server, radio gateway |
| 20 | 10.72.20.0/24 | Depots (Northside Depot, Riverfront Garage, Mill Creek Yard) | Depot dispatch workstations, yard management |
| 30 | 10.72.30.0/23 | On-board / radio | VLUs over data radio and private cellular APN |
| 40 | 10.72.40.0/24 | Fare | Fare back office, ticket vending machines, validators via cellular |
| 50 | 10.72.50.0/24 | Traction power SCADA (OT) | SCADA server, HMI, substation PLCs |
| 60 | 10.72.60.0/24 | Physical security | PACS head-end, door controllers, NVRs |
| 90 | 10.72.90.0/24 | Vendor VPN landing zone | Integrator access; disabled outside approved windows |
| 100 | 10.72.100.0/24 | Corporate / business | Email, HR, finance; no route to VLAN 50 |

All inter-VLAN traffic passes the core firewall `RRTA-FW-CORE01` (10.72.0.1). VLAN 50 is reachable only through the OT jump host `RRTA-OT-JUMP01` (10.72.50.5).

### 2.2 TransitLogic CAD/AVL

- `RRTA-CAD-APP01` (10.72.10.21) — dispatch application server, active.
- `RRTA-CAD-APP02` (10.72.20.21) — warm standby at Northside Depot; failover is manual and takes about 25 minutes.
- `RRTA-CAD-DB01` (10.72.10.25) — dispatch database (schedules, assignments, incident log, message history). Nightly backup at 0230 to `RRTA-BKP-NAS01` (10.72.10.40); the NAS is on the same domain as the servers.
- `RRTA-AVL-GW01` (10.72.10.30) — AVL gateway; receives vehicle position reports every 15 seconds over data radio and cellular and forwards them to CAD and the GTFS-RT publisher.
- `RRTA-RADIO-GW01` (10.72.10.35) — connects CAD to the P25 radio system for talkgroup assignment and covert alarm audio.
- 14 dispatch consoles in the OCC (10.72.10.101–114); 2 depot dispatch workstations (10.72.20.50 Northside Depot, 10.72.20.60 Riverfront Garage).

### 2.3 On-Board Equipment

Every bus (Bus 4400–4460 and Bus 2200–2235) and every light-rail vehicle (LRV 101–112) carries a VLU (10.72.30.0/23 addresses assigned by vehicle: Bus 4417 is 10.72.30.117; LRV 106 is 10.72.31.106). The VLU drives the operator display, stop annunciation, headsign, automatic passenger counters, covert alarm and on-board fare validators. VLUs download schedule and route files from `RRTA-CAD-APP01` at pull-out. If the link is lost, the VLU keeps announcing stops from the last downloaded file but **stops sending covert alarms and positions**.

### 2.4 Rider Information

- `RRTA-GTFS-RT01` (10.72.10.50) publishes vehicle positions, trip updates and service alerts to the RRTA Rider app and third-party trip planners.
- **Stale-feed behavior:** if `RRTA-AVL-GW01` stops sending positions, `RRTA-GTFS-RT01` keeps publishing the last known positions with predicted arrivals for **15 minutes** before dropping the vehicles. Riders see buses that are not where the app shows them.
- `RRTA-PIDS-SRV01` (10.72.10.55) drives 86 platform and shelter displays and the pre-recorded station PA. OCC console 3 has a hardware switch that blanks all displays and mutes pre-recorded PA. Live PA from OCC microphones is a separate audio path and still works.

### 2.5 RiverPass Fare System

- `RRTA-FARE-BO01` (10.72.40.10) — fare back office: card accounts, fare tables, hotlist (blocked cards), settlement.
- 210 validators on vehicles and platforms, 38 ticket vending machines. Validators receive the hotlist and fare table every 10 minutes.
- **Offline mode:** a validator that cannot reach `RRTA-FARE-BO01` keeps accepting RiverPass cards against its last hotlist for up to **24 hours**, stores up to **72 hours** of taps, then rejects all cards ("SEE OPERATOR"). Credit-card taps at validators fail immediately when offline.
- Card payment processing goes to an external processor through a dedicated tunnel; RRTA stores no full card numbers.

### 2.6 Traction Power SCADA

- `RRTA-TP-SCADA01` (10.72.50.10) — SCADA server polling 4 substation PLCs: Mill Creek Substation (10.72.50.31), Harlan Substation (10.72.50.32), Riverfront Substation (10.72.50.33), Eastgate Substation (10.72.50.34).
- `RRTA-TP-HMI01` (10.72.50.20) — Rail Controller HMI in the OCC; open/close feeder breakers, view catenary voltage and alarms.
- PLCs hold their last state if SCADA is lost; breakers stay as they were. Local control requires a substation technician at the panel.
- `RRTA-OT-JUMP01` is the only path into VLAN 50. **It is dual-homed (VLAN 10 and VLAN 50) and is also used by the TransitLogic integrator for CAD support** — flagged in the 02/2026 assessment for separation; not yet done.

### 2.7 Security Systems

`RRTA-PACS-SRV01` (10.72.60.10) and `RRTA-VMS-NVR01` / `RRTA-VMS-NVR02` (10.72.60.20/.21). PACS controller behavior on network loss is in SSEPP Section 4.2 (Northside Depot pedestrian gate 20-minute cache).

## SECTION 3: ROLES

| Role | Name | Responsibility in a cyber incident |
|---|---|---|
| Technical lead | Priya Natarajan, IT/OT Manager | Declares CODE GRAYLINE; containment, evidence, restoration |
| Operational lead | Luis Ortega, Director of Transportation | Service levels, voice dispatch, suspension decisions |
| Security liaison | Renee Calloway, Chief of Transit Police | Law enforcement contact, physical security of server rooms |
| Communications | Marcus Bell, Communications Director | Rider and media messages |
| Executive | Dana Whitfield, General Manager | Policy decisions, ransom and disclosure decisions, board |
| OT engineer | Kenji Abe, SCADA Engineer | Substation PLC checks, HMI validation |
| Vendor | TransitLogic Network Operations Center (NOC) | CAD/AVL diagnostics under Section 4.2 rules |

## SECTION 4: ACCESS AND REMOTE ACCESS POLICY

### 4.1 Accounts

Named accounts only. Administrator accounts on CAD, fare and SCADA servers require MFA. **Exception:** the `DEPOT-DISPATCH` shared CAD login at Northside Depot (SSEPP 9.2). Service accounts are listed in Annex B; their passwords rotate yearly.

### 4.2 Vendor Remote Access

- The TransitLogic integrator connects only through the vendor VPN to VLAN 90 and then to `RRTA-OT-JUMP01`.
- The VPN account is **enabled only during a ticketed maintenance window** opened by IT/OT in the service desk with a start and end time. IT/OT enables the account at window start and disables it at window end.
- **There is no 24/7 vendor VPN.** Outside a window, the vendor NOC may not connect; after-hours emergency access requires a phone approval from the IT/OT Manager and creation of an emergency ticket.
- Sessions on `RRTA-OT-JUMP01` are recorded. Vendor accounts may not change SCADA configuration.
- 06/2026 audit: the VPN account was left enabled after 3 of 22 windows for 1–4 days.

### 4.3 Removable Media and Consoles

No personal USB devices on OCC consoles, HMI or depot dispatch workstations. Approved media are scanned at the IT/OT kiosk. OCC consoles have internet access blocked except the NWS radar page.

### 4.4 Monitoring

Firewall and VPN logs go to the log server `RRTA-LOG01` (10.72.10.60), 90-day retention. CAD application logs are kept on `RRTA-CAD-APP01` for **7 days** only before rolling. SCADA event logs are kept on `RRTA-TP-SCADA01` for 30 days. IT/OT has no 24/7 security monitoring; alerts after 1700 page the IT/OT on-call (555) 014-2290.

## SECTION 5: FAILURE MODES AND MANUAL PROCEDURES

### 5.1 Failure Modes Matrix

| Failed system | Dispatch | Headways | Rider information | Fare collection | Safety impact |
|---|---|---|---|---|---|
| `RRTA-CAD-APP01` | No assignments, messaging or incident log; voice dispatch | Gaps grow 5–15 min within an hour | GTFS-RT trip updates stop; positions continue if AVL is up | Unaffected | Covert alarms lost |
| `RRTA-CAD-DB01` | CAD stays up read-only for about 30 min, then fails | As above | As above | Unaffected | Covert alarms lost after CAD fails |
| `RRTA-AVL-GW01` | CAD shows no vehicle positions | Bunching on long routes (Routes 14, 41, 63) | Stale positions for 15 min, then blank | Unaffected | Covert alarms lost |
| Data radio / cellular APN | Positions and alarms lost for affected vehicles | As above | Affected vehicles drop | On-board validators go offline (Section 2.5) | Covert alarms lost |
| `RRTA-GTFS-RT01` / `RRTA-PIDS-SRV01` | Unaffected | Unaffected | App and displays blank or wrong | Unaffected | False display or PA messages possible |
| `RRTA-FARE-BO01` | Unaffected | Unaffected | Unaffected | Offline mode 24 h, then rejects cards | Crowding at validators |
| `RRTA-TP-SCADA01` / HMI | Rail Controller has no remote breaker control | Rail continues if power on; no remote isolation | Unaffected | Unaffected | Emergency power removal needs a technician on site (about 40 min to Mill Creek Substation or Eastgate Substation) |
| `RRTA-PACS-SRV01` | Unaffected | Unaffected | Unaffected | Unaffected | Door behavior per SSEPP 4.2 |

### 5.2 Degraded Service Levels

- **Level A:** full schedule, voice dispatch assisted by AVL map.
- **Level B:** voice dispatch without positions; the OCC can manage about 40 vehicles by voice. Reduce to core routes: Routes 14, 22, 41 and 56 at 15-minute headways, plus Blue Line and Green Line at 12-minute headways.
- **Level C:** rail only on line-of-sight rules, buses on Routes 14 and 22 only, or systemwide suspension (EOP Section 6).

### 5.3 Checklist: Voice Dispatch

- [ ] Duty Superintendent declares voice dispatch on all talkgroups; time logged.
- [ ] Assign dispatchers: TRANSIT-OPS 1 (Routes 3, 7, 14, 18), TRANSIT-OPS 2 (Routes 22, 31, 41), TRANSIT-OPS 3 (Routes 56, 63, 70), TRANSIT-OPS 4 (rail).
- [ ] Print the paper run sheets from the OCC binder (updated each service change; check the date).
- [ ] Operators report by voice at timepoints: vehicle number, route, timepoint, minutes late.
- [ ] Track vehicles on the whiteboard grid by route and timepoint.
- [ ] Tell operators: covert alarm is not working; use emergency talk-request and "mirror check" phrase (SSEPP Section 5).
- [ ] Street Supervisors posted at Central Transit Center and Harlan Street Station to manage spacing.
- [ ] Depot dispatchers record pull-outs and pull-ins by bus number on Form OPS-7.
- [ ] Decide Level B within 30 minutes if CAD is not restored.

### 5.4 Fare System Offline

If `RRTA-FARE-BO01` is unreachable for more than 2 hours, or validators show wrong fares, the Director of Transportation may order fare-free operation and validators are bagged. Fare-free operation is announced only through the PIO.

### 5.5 SCADA Loss

Rail Controller places substation technicians at Harlan Substation and Riverfront Substation (the two feeding the shared segment) within 60 minutes. Trains operate under the Rail Operating Rulebook manual block. Any request from Riverbend Fire Department to remove power is relayed by phone to the technician at the panel. If HMI values disagree with technician readings, **trust the panel** and log the mismatch as possible tampering.

### 5.6 False Rider Information

If PIDS, PA or the app show messages the OCC did not post: blank displays at OCC console 3; use live PA only; PIO posts a correction; IT/OT isolates `RRTA-PIDS-SRV01` and `RRTA-GTFS-RT01` from the network without powering them off.

## SECTION 6: INCIDENT RESPONSE — CODE GRAYLINE

### 6.1 Declaration

The IT/OT Manager (or the IT/OT on-call if she cannot be reached in 30 minutes) declares **CODE GRAYLINE** when any of the following is true: ransomware note or mass file encryption; unknown admin account or login on CAD, fare, SCADA or PACS; HMI commands not issued by the Rail Controller; false PIDS or PA messages; loss of two or more systems in Section 5.1 at the same time without a known cause.

### 6.2 Command

Unified Command: Director of Transportation (operations) and IT/OT Manager (technical), seated in the OCC; EOC activation Level 1 (EOP 5.2). Chief of Transit Police secures the OCC server room (Room 214) and Northside Depot server closet.

### 6.3 Containment

1. Disable the vendor VPN account and block VLAN 90 at `RRTA-FW-CORE01`.
2. Block VLAN 10 to VLAN 50 traffic through `RRTA-OT-JUMP01`; SCADA keeps running on its own segment.
3. Isolate affected hosts at the switch port; do not shut them down.
4. Disconnect `RRTA-BKP-NAS01` from the network to protect backups.
5. Reset passwords for admin and service accounts on affected systems from a clean workstation.

### 6.4 Evidence and Logs

- **Do not power off, reboot, reimage or restore any affected host before the IT/OT Manager approves.** Memory and logs are lost on reboot.
- Copy CAD application logs from `RRTA-CAD-APP01` within the first 24 hours — they roll after 7 days and are the only record of dispatcher actions.
- Export firewall and VPN logs from `RRTA-LOG01` for the last 30 days.
- Export SCADA event logs and `RRTA-OT-JUMP01` session recordings.
- Record every action with time and person on the ICS-214; chain of custody on Form SEC-20.
- Ransom: RRTA does not pay; any contact with the attacker goes through the General Manager and FBI.

### 6.5 Checklist: CODE GRAYLINE

- [ ] IT/OT Manager declares CODE GRAYLINE; OCC logs time.
- [ ] Director of Transportation sets service level (5.2) and starts voice dispatch (5.3).
- [ ] Containment steps 6.3 completed and logged.
- [ ] Evidence steps 6.4 started; no reboots.
- [ ] Notifications per Section 7 started; clock times recorded.
- [ ] PIO rider message posted.
- [ ] TransitLogic NOC engaged only through an emergency ticket approved by the IT/OT Manager.

## SECTION 7: NOTIFICATIONS

| Recipient | When | By |
|---|---|---|
| IT/OT on-call | Within 15 minutes of suspected incident | OCC Duty Superintendent |
| General Manager | Within 1 hour of CODE GRAYLINE | IT/OT Manager |
| CISA | Within **24 hours** of identifying a reportable cybersecurity incident (TSA surface requirement) | IT/OT Manager |
| TSA (Surface Operations Center) | Same 24-hour report; Cybersecurity Coordinator contact | IT/OT Manager |
| FBI field office | When criminal activity suspected (ransomware, intrusion) | Chief of Transit Police |
| FTA | Within 2 hours if the incident causes a reportable safety event | Chief Safety Officer |
| Harlan County Emergency Management Agency | On Level 1 activation | Emergency Manager |
| TransitLogic NOC | When vendor diagnostics are needed (emergency ticket) | IT/OT Manager |
| Cyber insurance carrier | Within 72 hours | Deputy GM Finance |

## SECTION 8: RESTORATION AND VERIFICATION

1. Rebuild or restore affected servers from a backup older than the first known compromise, on an isolated network.
2. Verify `RRTA-CAD-DB01` schedule data against the current service change before connecting vehicles.
3. **One route first:** reconnect CAD/AVL for Route 14 only. Verify for 30 minutes: positions match operator voice reports at three timepoints; covert alarm test from one bus; GTFS-RT positions match.
4. Add routes in groups of three, 15 minutes apart; then rail.
5. Reconnect PIDS last; check 5 displays by eye at Central Transit Center and Harlan Street Station.
6. SCADA: Kenji Abe and a substation technician verify each breaker state at the panel matches the HMI before returning remote control.
7. Fare: reload hotlist and fare tables; test 10 cards (including a hotlisted test card) at Central Transit Center.
8. Vendor VPN stays disabled until the AAR approves a new access process.

## SECTION 9: TABLETOP SCENARIO HOOKS

Points in this annex a scenario may test: the 15-minute stale GTFS-RT feed (2.4); covert alarms lost whenever CAD or AVL fails (2.3, 5.1); the dual-homed `RRTA-OT-JUMP01` shared with the vendor (2.6); VPN accounts left enabled after windows (4.2); 7-day CAD log roll (4.4, 6.4); backups on the same domain (2.2); 24-hour validator hotlist (2.5); 40-minute drive to remote substations (5.1); no 24/7 security monitoring after 1700 (4.4); the CISA 24-hour clock (7).

## ANNEX A: CONTACTS (Mock-Up)

| Contact | Number |
|---|---|
| OCC Duty Superintendent | (555) 014-2200 |
| IT/OT On-Call (24/7 pager) | (555) 014-2290 |
| Priya Natarajan, IT/OT Manager | (555) 014-2280 |
| Kenji Abe, SCADA Engineer | (555) 014-2285 |
| Substation Technician On-Call | (555) 014-2255 |
| TransitLogic NOC | (555) 016-7700 |
| Fare processor support | (555) 016-7800 |
| CISA reporting line | (555) 019-2500 |
| TSA Surface Operations Center | (555) 019-2100 |
| FBI field office | (555) 019-2400 |
| FTA Regional Office | (555) 019-2000 |

## ANNEX B: HOST AND NETWORK INVENTORY

| Hostname | IP | VLAN | Role |
|---|---|---|---|
| RRTA-FW-CORE01 | 10.72.0.1 | all | Core firewall |
| RRTA-CAD-APP01 | 10.72.10.21 | 10 | CAD/AVL application (active) |
| RRTA-CAD-APP02 | 10.72.20.21 | 20 | CAD/AVL warm standby, Northside Depot |
| RRTA-CAD-DB01 | 10.72.10.25 | 10 | CAD database |
| RRTA-AVL-GW01 | 10.72.10.30 | 10 | AVL gateway |
| RRTA-RADIO-GW01 | 10.72.10.35 | 10 | Radio gateway |
| RRTA-BKP-NAS01 | 10.72.10.40 | 10 | Backup storage |
| RRTA-GTFS-RT01 | 10.72.10.50 | 10 | GTFS-RT publisher |
| RRTA-PIDS-SRV01 | 10.72.10.55 | 10 | Displays and pre-recorded PA |
| RRTA-LOG01 | 10.72.10.60 | 10 | Log server |
| RRTA-FARE-BO01 | 10.72.40.10 | 40 | RiverPass back office |
| RRTA-TP-SCADA01 | 10.72.50.10 | 50 | Traction power SCADA |
| RRTA-TP-HMI01 | 10.72.50.20 | 50 | Rail Controller HMI |
| RRTA-OT-JUMP01 | 10.72.50.5 | 10/50 | OT jump host (dual-homed) |
| RRTA-PACS-SRV01 | 10.72.60.10 | 60 | PACS head-end |
| RRTA-VMS-NVR01 / RRTA-VMS-NVR02 | 10.72.60.20 / .21 | 60 | CCTV recorders |

Service accounts: `svc_cad_sync`, `svc_avl_feed`, `svc_fare_settle`, `svc_scada_hist`.

## ANNEX C: ACRONYMS

APN Access Point Name · AVL Automatic Vehicle Location · CAD Computer-Aided Dispatch · CISA Cybersecurity and Infrastructure Security Agency · GTFS-RT General Transit Feed Specification – Realtime · HMI Human-Machine Interface · MFA Multi-Factor Authentication · NAS Network-Attached Storage · NOC Network Operations Center · OT Operational Technology · PIDS Passenger Information Display System · PLC Programmable Logic Controller · SCADA Supervisory Control and Data Acquisition · VLAN Virtual Local Area Network · VLU Vehicle Logic Unit · VPN Virtual Private Network
