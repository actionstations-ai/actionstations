# City of Millbrook Department of Water & Sewer — SCADA System Description (Appendix A to the OT / Cybersecurity Plan)

Document Control Number: MDWS-SCADA-APP-A · Revision 3.0 · Effective Date: 03/01/2026 · Parent document: MDWS-OTSEC-2026 · Maintained by: Priya Nandakumar (SCADA / IT Security Manager) · Reviewed: Ray Castellano (Plant Superintendent), Tom Okonkwo (Distribution Superintendent)

> **EXERCISE MATERIAL — for training use.** The City of Millbrook, its people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 2.0 — 09/15/2023 — All — AquaSight 7 upgrade, MBW-SCADA-SRV02 standby added · 2.1 — 10/01/2024 — A.3, A.6 — DosaTech metering pump VFDs; ScreenBridge support agent recorded · 2.2 — 09/01/2025 — A.4 — PLC-02 chemical-feed logic change (supervisor PIN for caustic dose above 20 mg/L) · 3.0 — 03/01/2026 — All — Reissued with OT Plan Rev 1.3; A.5 nuisance alarm list; A.9 audit log format

**Handling:** Controlled distribution. Copies are held by the SCADA / IT Security Manager, the Plant Superintendent, the Control Room (binder SCADA-A), Kessler Controls (contract copy) and the City IT Director. Contains network addressing; do not post or email outside the City.

## Table of Contents

A.1 Overview and Platform · A.2 Control Network Inventory · A.3 PLC and RTU Register · A.4 Tag List and Setpoint Limits · A.5 Alarm Philosophy · A.6 Remote Access Paths · A.7 Telemetry · A.8 HMI Screens · A.9 Audit Logging and Historian · A.10 Vendor and Support Contacts

## SECTION A.1: OVERVIEW AND PLATFORM

### A.1.1 Platform

The Millbrook water system is supervised by **AquaSight SCADA version 7.2**, supplied and supported by Kessler Controls (the integrator of record since the 2016 plant controls replacement). AquaSight runs on a redundant server pair in the Riverside Water Treatment Plant (RWTP) Control Room: MBW-SCADA-SRV01 is the active server and MBW-SCADA-SRV02 is a hot standby that takes over automatically if SRV01 stops responding for 20 seconds. Both servers poll the six plant PLCs over the plant PLC network and the seven remote RTUs over the telemetry network, drive the three HMI workstations, and write every tag to the historian MBW-HIST-01 in the SCADA DMZ.

### A.1.2 What SCADA Controls

- **Plant process:** raw water pumping, chemical feed dosing (flow-paced and residual-trimmed), filter run and backwash sequencing, clearwell level and high service pumping.
- **Distribution:** tank levels and the pump-start/stop logic that fills them, booster station pressure control, interconnect meter readings. The remote RTUs run local control loops themselves and continue those loops when telemetry is lost (A.7.4).
- **Not controlled by SCADA:** the Orchard Wellfield well pumps start and stop on Orchard Standpipe level through RTU-06's own logic with a SCADA override; the Carver County Water District interconnect valve IC-1 and the Fairhaven interconnect valve IC-2 are manually operated (two-person rule, ERP Section 12) and SCADA only reads their meters.

### A.1.3 Modes of Control

| Mode | Meaning | Where selected |
|---|---|---|
| AUTO | PLC/RTU logic runs the equipment on SCADA setpoints | HMI faceplate |
| MANUAL | Operator sets the output (pump speed, valve position, dose) from the HMI; PLC interlocks remain active | HMI faceplate |
| LOCAL / HAND | Equipment is run from its local control panel or MCC HOA switch; the HMI shows status only and cannot command it | Local panel / MCC |

Chemical metering pumps also have a local stroke dial and a speed dial on the DosaTech VFD; in HAND those dials, not SCADA, set the dose (OT Plan Section 8).

## SECTION A.2: CONTROL NETWORK INVENTORY

| Host | IP | OS / software | Role | Patch status (03/2026) |
|---|---|---|---|---|
| MBW-SCADA-SRV01 | 10.72.10.10 | Windows Server 2019; AquaSight 7.2 server | Active SCADA server, alarm server, AlarmCall autodialer interface | Patched through 12/2025 (quarterly window) |
| MBW-SCADA-SRV02 | 10.72.10.11 | Windows Server 2019; AquaSight 7.2 server | Hot standby | Patched through 12/2025 |
| MBW-HMI-01 | 10.72.10.21 | Windows 10 LTSC; AquaSight client | Control Room operator workstation (primary) | Patched through 12/2025 |
| MBW-HMI-02 | 10.72.10.22 | Windows 10 LTSC; AquaSight client; **ScreenBridge support agent 4.1** | Chemical Building operator workstation | Patched through 09/2025 (missed December window; vendor agent blocks reboot) |
| MBW-HMI-03 | 10.72.10.23 | Windows 10 LTSC; AquaSight client | High Service Pump Station workstation | Patched through 12/2025 |
| MBW-EWS-01 | 10.72.10.30 | Windows 10 LTSC; Kessler K-Logic programming suite; AquaSight designer | Engineering workstation; source of nightly project backup (OT Plan Section 9) | Patched through 12/2025 |
| MBW-HIST-01 | 10.72.250.10 | Windows Server 2019; AquaSight historian; SQL | Historian; read-only reports to the business LAN | Patched through 12/2025 |
| MBW-JUMP-01 | 10.72.250.20 | Windows Server 2019; RDP gateway; session recorder | Approved vendor remote-access path | Patched through 01/2026 |
| MBW-FW-01 | — | Firewall appliance (firmware 2025.4) | Separates business LAN, SCADA DMZ, control network, PLC and RTU networks | Firmware current |
| RWTP telemetry master radio | 10.72.30.1 | Buckeye Telemetry BT-900 master | Polls remote RTUs | Firmware 2022 |

Domain: all Windows hosts above are members of the **MBWSCADA** Active Directory domain (domain controller role held by MBW-SCADA-SRV02). MBWSCADA trusts the business domain MILLBROOK one way (OT Plan Section 5.3).

## SECTION A.3: PLC AND RTU REGISTER

| Controller | Location | Make / firmware | I/O summary | Link to SCADA | Local control available |
|---|---|---|---|---|---|
| PLC-01 | Intake Structure 1 / raw water gallery | Kessler K-series K-500, firmware 2019 | P-101, P-102, P-103 start/stop/speed; intake gates G-1, G-2; LIT-101, AIT-101; screen differential | Fiber, 10.72.20.11 | Raw water MCC HOA |
| PLC-02 | Chemical Building | Kessler K-500, firmware 2019; logic revised 08/2025 | CL2-FC-201, CL2-FC-202, NAOH-FC-203, F-FC-204, ALUM-FC-205, POLY-FC-206 pacing and trims; bulk tank levels; PSH-302 input | Fiber, 10.72.20.12 | DosaTech VFD HAND + stroke dials |
| PLC-03 | Filter gallery (Filters 1–3) | Kessler K-500, firmware 2019 | FV-301 to FV-303, headloss, filter effluent turbidity, run-time | Fiber, 10.72.20.13 | Filter local panel |
| PLC-04 | Filter gallery (Filters 4–6), backwash | Kessler K-500, firmware 2019 | FV-304 to FV-306, BW-1, BW-2, backwash sequence | Fiber, 10.72.20.14 | Filter local panel |
| PLC-05 | High Service Pump Station | Kessler K-500, firmware 2021 | HSP-1 to HSP-3 speed and start/stop; LIT-401, LIT-402; AIT-301 to AIT-304; PIT-501; FIT-501 | Fiber, 10.72.20.15 | HSP MCC HOA |
| PLC-06 | Plant electrical room | Kessler K-500, firmware 2021 | Utility feed status, DG-1 start/run, UPS status, compressors | Fiber, 10.72.20.16 | Switchgear local |
| RTU-01 | Hilltop Tank | Buckeye Telemetry BT-R2, firmware 2020 | LIT-601, LIT-602, ZS-601, drain valve, RP-1 status, site power | 900 MHz radio (10.72.30.101); cellular backup | None required (tank) |
| RTU-02 | Orchard Standpipe | Buckeye BT-R2, firmware 2020 | LIT-611, AIT-611, ZS-611 (out of service), ZS-612 | Radio through RP-1 (10.72.30.102) | None required |
| RTU-03 | Northgate Reservoir / Northgate Booster Station | Buckeye BT-R2, firmware 2020 | LIT-621, ALV-301 position, BP-301 to BP-303, PIT-621, PIT-622 | Radio through RP-1 (10.72.30.103) | Pressure-switch auto at the booster panel |
| RTU-04 | Mill Road Booster Station | Buckeye BT-R2, firmware 2020 | BP-401, BP-402, PIT-631, PIT-632, FIT-631 | Radio through RP-1 (10.72.30.104) | Local HOA |
| RTU-05 | Eastfield Pump Station | Buckeye BT-R2, firmware 2021 | P-501, P-502, PSV-501, PIT-641, FIT-641 | **Cellular modem only** (10.72.30.105); modem web configuration page enabled | Local HOA |
| RTU-06 | Orchard Wellfield | Buckeye BT-R2, firmware 2020 | Wells W-1, W-2, W-3 start/stop; CL2-FC-611; FIT-611 | Radio through RP-1 (10.72.30.106) | Well panel HOA |
| RTU-07 | Intake Structure 1 | Buckeye BT-R2, firmware 2020 | Screen status, LIT-101 (duplicate), CAM-18 power | Fiber to PLC-01 (10.72.30.107) | — |

Spare PLC: one K-500 CPU and two I/O modules are held in the Control Room spares cabinet. There is no spare BT-R2 RTU; Buckeye Telemetry quotes 10 business days.

## SECTION A.4: TAG LIST AND SETPOINT LIMITS

Every controlled tag has an operator range (what any logged-in operator may set), a supervisor range (requires the supervisor PIN on the HMI faceplate), and a PLC hard limit the controller enforces regardless of the HMI. Alarm limits are configured in AquaSight and may be changed only by the SCADA / IT Security Manager or a Kessler technician in an approved window (OT Plan Section 7.4).

### A.4.1 Raw Water and Intake (PLC-01)

| Tag | Description | Units | Normal range | Low alarm | High alarm | Hard limit / interlock | Who may change setpoint |
|---|---|---|---|---|---|---|---|
| LIT-101 | River level at Intake Structure 1 | ft | 4.0–9.0 | 2.5 (pump trip 2.0) | 12.0 (flood) | P-101/102/103 trip at 2.0 | — (measurement) |
| AIT-101 | Raw water turbidity | NTU | 2–25 | — | 60 (advisory), 150 (P2) | None | — |
| P-101 | Raw Water Pump 1 speed | % | 55–95 | — | — | Min 40 % | Operator |
| P-102 | Raw Water Pump 2 speed | % | 55–95 | — | — | Min 40 % | Operator |
| P-103 | Raw Water Pump 3 speed (standby) | % | 0 / 55–95 | — | — | Min 40 % | Operator |
| FIT-101 | Raw water flow | MGD | 6–15 | 3.0 | 16.5 | Plant rated 16.0 | — |
| G-1, G-2 | Intake gate position | % open | 100 | — | — | Two-person close | Supervisor |

### A.4.2 Chemical Feed (PLC-02)

| Tag | Description | Units | Normal range | Low alarm | High alarm | Hard limit / interlock | Who may change setpoint |
|---|---|---|---|---|---|---|---|
| CL2-FC-201 | Pre-chlorination dose (Hypochlorite Feed System) | mg/L as Cl2 | 1.0–2.5 | 0.5 | 4.0 | PLC clamp 6.0; pump stops when FIT-101 < 1 MGD | Operator 0–4.0; Supervisor 4.0–6.0 |
| CL2-FC-202 | Post-chlorination dose (Hypochlorite Feed System) | mg/L as Cl2 | 1.5–3.5 | 1.0 | 5.0 | PLC clamp 6.0 | Operator 0–5.0; Supervisor 5.0–6.0 |
| **NAOH-FC-203** | Caustic dose (Caustic Feed System, 25 % sodium hydroxide) | mg/L | 8–14 | 4.0 | 20 | **PLC clamp 40**; **PSH-302 hard-wired stop at pH 9.5** | Operator 0–20; Supervisor PIN 20–40 |
| F-FC-204 | Fluoride dose (Fluoride Feed System) | mg/L as F | 0.6–0.8 | 0.4 | 1.0 | PLC clamp 1.3; pump stops when FIT-501 < 1 MGD | Operator 0–1.0; Supervisor 1.0–1.3 |
| ALUM-FC-205 | Alum dose (Alum Feed System) | mg/L | 12–30 | 5 | 45 | PLC clamp 60 | Operator 0–45; Supervisor 45–60 |
| POLY-FC-206 | Polymer dose (Polymer Feed System) | mg/L | 0.1–0.5 | — | 1.0 | PLC clamp 2.0 | Operator |
| LIT-201 | Hypochlorite bulk Tank A level | % | 25–95 | 15 | 97 | Fill interlock 97 | — |
| LIT-202 | Hypochlorite bulk Tank B level | % | 25–95 | 15 | 97 | Fill interlock 97 | — |
| LIT-203 | Caustic bulk tank level | % | 25–95 | 15 | 97 | Fill interlock 97 | — |
| LIT-204 | Fluoride tank level | % | 25–95 | 15 | 97 | Fill interlock 97 | — |
| PSH-302 | Finished water pH high-high switch (hard-wired) | — | Not tripped | — | Trip at 9.5 | Opens NAOH-FC-203 run circuit; manual reset at PLC-02 panel | Nobody via HMI |

Notes: NAOH-FC-203 dose is flow-paced from FIT-501 and trimmed on AIT-302 in AUTO. A setpoint entered above 20 mg/L opens the supervisor PIN dialog; the PIN is a four-digit code shared by all three HMIs (OT Plan Section 5.4). Every setpoint write is recorded in the audit log with the HMI node name and the logged-in account (A.9).

### A.4.3 Filtration (PLC-03, PLC-04)

| Tag | Description | Units | Normal range | Low alarm | High alarm | Hard limit / interlock | Who may change setpoint |
|---|---|---|---|---|---|---|---|
| FV-301 to FV-306 | Filter 1–6 effluent valve position | % open | 40–80 | — | Travel timeout 90 s | Closes on individual filter turbidity > 1.0 NTU for 5 min | Operator (MANUAL) |
| AIT-311 to AIT-316 | Filter 1–6 effluent turbidity | NTU | 0.03–0.15 | — | 0.3 (P3), 1.0 (P2, filter off-line) | Filter-to-waste on 1.0 | — |
| DPT-301 to DPT-306 | Filter 1–6 headloss | ft | 1–7 | — | 8.0 (backwash due), 9.5 (P2) | Backwash lockout if BW-1 and BW-2 both faulted | — |
| AIT-310 | Combined filter effluent turbidity | NTU | 0.05–0.12 | — | 0.3 (P2), 1.0 (P1, treatment failure) | None (regulatory limit 0.3 in 95 % of samples) | — |
| BW-1, BW-2 | Backwash pump run / speed | % | 60–90 | — | — | One at a time | Operator |

### A.4.4 Clearwell, Finished Water and High Service (PLC-05)

| Tag | Description | Units | Normal range | Low alarm | High alarm | Hard limit / interlock | Who may change setpoint |
|---|---|---|---|---|---|---|---|
| LIT-401 | Clearwell 1 level | ft | 10–16 | 8.0 (HSP trip 6.0) | 17.5 (overflow 18.0) | HSP-1/2/3 trip at 6.0 | — |
| LIT-402 | Clearwell 2 level | ft | 9–15 | 7.0 | 16.5 | — | — |
| AIT-301 | Finished water free chlorine residual | mg/L | 1.0–2.0 | 0.6 (P2), 0.3 (P1) | 3.0 | CL2-FC-202 trim range ±1.0 mg/L | — |
| AIT-302 | Finished water pH | pH | 7.4–7.8 | 7.0 | **8.5** | PSH-302 at 9.5 (independent) | — |
| AIT-303 | Finished water fluoride | mg/L | 0.6–0.8 | 0.4 | 1.2 (P2), 2.0 (P1) | F-FC-204 stop at 2.0 | — |
| AIT-304 | Finished water turbidity | NTU | 0.05–0.15 | — | 0.5 | — | — |
| HSP-1 | High Service Pump 1 speed | % | 60–100 | — | — | Min 45 %; trip on LIT-401 < 6.0 | Operator |
| HSP-2 | High Service Pump 2 speed | % | 60–100 | — | — | As HSP-1 | Operator |
| HSP-3 | High Service Pump 3 speed (standby) | % | 0 / 60–100 | — | — | As HSP-1 | Operator |
| PIT-501 | High service discharge pressure (Zone 1 reference) | psi | 62–78 | 50 (P2), 40 (P1) | 95 | HSP trip at 105 | Setpoint 70 psi: Supervisor |
| FIT-501 | Plant finished water flow | MGD | 6–14 | 2.0 | 16.0 | — | — |

### A.4.5 Remote Sites (RTU-01 to RTU-06)

| Tag | Description | Units | Normal range | Low alarm | High alarm | Hard limit / interlock | Who may change setpoint |
|---|---|---|---|---|---|---|---|
| LIT-601 | Hilltop Tank level (radar) | ft | 22–38 (overflow 40.0) | 18 (P2), 12 (P1) | 39.0 | Pump-fill logic: HSP speed up at 24, back at 36 | Fill band: Supervisor |
| LIT-602 | Hilltop Tank level (pressure, backup) | ft | Tracks LIT-601 ±0.5 | Deviation > 1.5 ft = P3 | — | — | — |
| ZS-601 | Hilltop Tank roof hatch | — | CLOSED | — | OPEN (P2 security) | — | — |
| LIT-611 | Orchard Standpipe level | ft | 60–92 (overflow 96.0) | 50 (P2), 40 (P1) | 94.0 | Wells W-1/2/3 stop at 93 | Well start/stop band: Supervisor |
| AIT-611 | Orchard Standpipe outlet chlorine residual | mg/L | 0.8–1.6 | 0.5 (P2), 0.3 (P1) | 3.0 | CL2-FC-611 trim | — |
| ZS-611 | Orchard Standpipe roof hatch | — | CLOSED (**out of service, WO-24-1187; always reads CLOSED**) | — | OPEN (P2 security) | — | — |
| ZS-612 | Orchard Standpipe fence gate | — | CLOSED | — | OPEN outside 06:00–18:00 (P3 security) | — | — |
| CL2-FC-611 | Wellfield hypochlorite dose | mg/L | 1.0–2.0 | 0.5 | 3.0 | Clamp 4.0 | Operator |
| LIT-621 | Northgate Reservoir level | ft | 14–24 (overflow 26.0) | 10 (P2), 6 (P1) | 25.0 | ALV-301 closes at 25 | — |
| PIT-621 | Northgate Booster discharge | psi | 68–80 | 55 (P2) | 95 | BP trip at 105 | Setpoint 74 psi: Supervisor |
| PIT-622 | Zone 3 system pressure (Carver Community College) | psi | 48–62 | 35 (P2), 25 (P1) | 85 | — | — |
| BP-301 to BP-303 | Northgate booster pump speed | % | 55–100 | — | — | Min 45 %; trip on LIT-621 < 6 | Operator |
| PIT-631 | Mill Road Booster suction (Zone 1) | psi | 55–70 | 35 (BP lockout 30) | — | BP-401/402 lockout at 30 | — |
| PIT-632 | Mill Road Booster discharge (Zone 2) | psi | 70–85 | 55 | 95 | Trip 105 | Setpoint 78 psi: Supervisor |
| BP-401, BP-402 | Mill Road booster pump speed | % | 0 / 55–100 | — | — | Min 45 % | Operator |
| FIT-631 | Carver County Water District interconnect flow (IC-1) | MGD | 0 | — | > 0.1 when IC-1 logged closed (P3) | Read only | — |
| P-501, P-502 | Eastfield pump speed | % | 50–100 | — | — | Min 45 % | Operator |
| PSV-501 | Eastfield pressure-sustaining valve position | % | 20–70 | — | — | — | Supervisor |
| PIT-641 | Eastfield loop pressure | psi | 45–60 | 35 (P2), 25 (P1) | 80 | — | — |
| FIT-641 | Fairhaven interconnect flow (IC-2) | MGD | 0 | — | > 0.1 when IC-2 logged closed (P3) | Read only | — |

## SECTION A.5: ALARM PHILOSOPHY

### A.5.1 Priorities

| Priority | Meaning | Operator response | After-hours callout |
|---|---|---|---|
| P1 Critical | Immediate risk to public health or supply: loss of disinfection (AIT-301 < 0.3), AIT-310 > 1.0, pH outside 6.5–9.0, zone pressure < 25 psi, clearwell/tank low-low, PSH-302 trip, any fluoride > 2.0 | Act within 5 minutes; notify Plant Superintendent; start ERP Section 4 level assessment | AlarmCall dials the duty operator, then the Plant Superintendent, then the Director until acknowledged (3-minute steps) |
| P2 High | Process or security condition needing action within 30 minutes: residual or pH outside normal range, tank low, pump fault, hatch OPEN, telemetry loss to a site > 15 minutes, SCADA server failover | Act within 30 minutes; log in the Control Room log | AlarmCall dials the duty operator only |
| P3 Medium | Maintenance or deviation: headloss high, analyzer deviation, VFD warning, gate contact outside hours | Act this shift | None |
| P4 Advisory | Information: operator login, setpoint change, mode change, remote session start/stop, stale data | Review; no action required unless unexplained | None |

### A.5.2 Rules

- Every P1 and P2 alarm must be acknowledged by a named operator account; **acknowledging an alarm does not clear it** and does not change the equipment state.
- Operators may not disable or shelve a P1 alarm. P2 and P3 alarms may be shelved for up to 8 hours with a reason recorded; shelved alarms are listed on the Alarms screen banner.
- **Stale-data flag:** a tag not updated within 3 polling cycles is drawn with a grey hatch and a P4 "STALE" alarm. On loss of RP-1 every tag at Orchard Standpipe, Orchard Wellfield, Northgate and Mill Road goes stale at once; the HMI holds the last value. Operators have been observed acknowledging a block of STALE alarms without reading them (A.7.4).
- Setpoint changes, mode changes and logins are P4 and roll off the Alarm Summary quickly; they remain in the audit log (A.9).
- AlarmCall (the autodialer on MBW-SCADA-SRV01) uses the business telephone system; if the business LAN or the phone gateway is down, after-hours alarms are not delivered and the duty operator must call the Control Room every 2 hours.

### A.5.3 Known Nuisance and Standing Alarms (03/2026)

| Tag / alarm | Condition | Status |
|---|---|---|
| ZS-611 Orchard Standpipe hatch | Switch destroyed by lightning 07/2024; wired to read CLOSED pending replacement | WO-24-1187 open; parts ordered twice |
| LIT-602 deviation | Backup transmitter drifts in cold weather | Shelved most winter mornings |
| RTU-05 comm fail | Cellular carrier drops 2–4 times per week for 1–5 minutes | Accepted; no action |
| HSP-2 VFD warning | Cooling fan bearing | WO-26-0211 |
| MBW-HMI-02 reboot pending | Patch window missed (ScreenBridge agent) | Open finding F-3, OT Plan Section 14 |

## SECTION A.6: REMOTE ACCESS PATHS

| Path | Endpoint reached | Authentication | Logging / recording | Approver | Status |
|---|---|---|---|---|---|
| MBW-JUMP-01 (RDP gateway in the SCADA DMZ) | MBW-EWS-01, MBW-SCADA-SRV01/02 | Named Kessler account (e.g. `kessler_jmolina`), MFA, enabled only for a ticketed window | Session video and keystroke log retained 1 year | SCADA / IT Security Manager | Approved path (OT Plan Section 6.2) |
| **ScreenBridge support agent on MBW-HMI-02** | MBW-HMI-02 (full desktop, Chemical Feed screen and faceplates) | Shared vendor account `dosatech_svc`, password only, no MFA; outbound through MBW-FW-01 rule FW-R-22 to the ScreenBridge cloud relay | Agent keeps a local connection log only; not forwarded to the city SIEM | None recorded (installed 2024 commissioning) | **Open finding F-3**; to be removed or routed through MBW-JUMP-01 |
| RTU-05 cellular modem web configuration page | Modem at Eastfield Pump Station (carrier private APN) | Local admin password (changed 2024); firmware 2021 | Modem syslog not collected | SCADA / IT Security Manager | Accepted risk, review 2026 |
| MBW-HIST-01 reports | Historian read-only web reports | MILLBROOK domain accounts | IIS logs | City IT | Approved (FW-R-05) |
| Operator remote view | None | — | — | — | Operators have no remote HMI access; after-hours response is by phone and drive-in |

The DosaTech commissioning report that documents the ScreenBridge installation, including the `dosatech_svc` credentials, is filed at \\MBW-FS-01\Engineering\Commissioning\DosaTech-2024 on the business file server.

## SECTION A.7: TELEMETRY

### A.7.1 Radio Network

| Link | From | To | Medium | Poll interval |
|---|---|---|---|---|
| T-1 | RWTP master radio (mast, 120 ft) | RTU-01 Hilltop Tank / repeater RP-1 | 900 MHz licensed, 12.4 mi | 30 s |
| T-2 | RP-1 | RTU-02 Orchard Standpipe | 900 MHz | 60 s |
| T-3 | RP-1 | RTU-06 Orchard Wellfield | 900 MHz | 60 s |
| T-4 | RP-1 | RTU-03 Northgate | 900 MHz | 30 s |
| T-5 | RP-1 | RTU-04 Mill Road Booster Station | 900 MHz | 30 s |
| T-6 | Carrier cellular (private APN) | RTU-05 Eastfield Pump Station | LTE modem | 60 s |
| T-7 | Carrier cellular (private APN) | RTU-01 Hilltop Tank (backup path) | LTE modem | On T-1 failure |
| T-8 | Fiber | RTU-07 / PLC-01 Intake Structure 1 | Single-mode fiber, 600 ft | 2 s |

### A.7.2 Single Point of Failure

RP-1 at Hilltop Tank is the only path to RTU-02, RTU-03, RTU-04 and RTU-06. Loss of RP-1 (site power, lightning, antenna icing, vandalism) removes telemetry from the Orchard Standpipe, the Orchard Wellfield, Northgate Reservoir and Booster Station, and Mill Road Booster Station at once; Hilltop Tank itself stays visible over the cellular backup T-7. There is no spare repeater; Buckeye Telemetry's response is next business day.

### A.7.3 Behaviour on Telemetry Loss

- Each RTU keeps running its local loops on the last setpoints received (tank fill bands, booster pressure setpoints, well start/stop on LIT-611).
- The HMI holds last values with the STALE flag (A.5.2). Trends flat-line; a flat-lined tank level looks like a stable tank.
- SCADA-initiated commands (remote pump start, setpoint change) are queued for 10 minutes and then discarded with a P4 "COMMAND NOT DELIVERED" entry.
- After 15 minutes without a poll the site raises a P2 "COMM FAIL"; operators must then obtain readings by phone or drive-by (OT Plan Section 8; ERP Section 6).

### A.7.4 Distribution Events Seen Through Telemetry

A break on the Hilltop Transmission Main shows first as a rising FIT-501 with falling PIT-501 at the plant and LIT-601 falling faster than the diurnal curve; Mill Road Booster Station's PIT-631 falls as Zone 1 pressure drops. If RP-1 is down at the time, the operator sees only the plant-side signature and a flat Hilltop Tank trend, which has been misread as "tank holding" in the past (ERP Section 6.6).

## SECTION A.8: HMI SCREENS

| Screen | Name | Contents | Where shown |
|---|---|---|---|
| OVW-1 | Plant Overview | Raw flow, plant flow, clearwell levels, finished water quality (AIT-301 to AIT-304), HSP status, zone pressures, tank levels, comm status bar | MBW-HMI-01, -02, -03 |
| CHM-2 | Chemical Feed | CL2-FC-201/202, NAOH-FC-203, F-FC-204, ALUM-FC-205, POLY-FC-206 faceplates with PV, SP, mode; bulk tank levels; PSH-302 state | MBW-HMI-02 primary |
| FLT-3 | Filters | Filters 1–6 run/backwash state, FV-301 to FV-306, headloss, effluent turbidity, backwash sequence | MBW-HMI-01 |
| CLW-4 | Clearwell / High Service | LIT-401/402, HSP-1 to HSP-3 speed and status, PIT-501, FIT-501 | MBW-HMI-03 primary |
| DST-5 | Distribution Overview | Map of Zones 1–3 with Hilltop Tank, Orchard Standpipe, Northgate Reservoir levels, booster and pump station status, interconnect meters, STALE indicators by site | MBW-HMI-01 |
| SIT-6 | Site Detail (one per remote site) | Full tag list for the RTU, security contacts, camera link, radio signal strength | MBW-HMI-01 |
| ALM-7 | Alarms | Alarm Summary with priority filter, shelved list, AlarmCall status | All |
| TRD-8 | Trends | Historian trends; default groups: Finished Water Quality, Tank Levels, Zone Pressures | All |
| AUD-9 | Audit Log | Last 500 audit entries (A.9); export to CSV | MBW-HMI-01, MBW-EWS-01 |
| SEC-10 | System Status | Server redundancy state, PLC/RTU comm health, remote sessions active on MBW-JUMP-01 | MBW-HMI-01 |

Screen SEC-10 does not show ScreenBridge sessions on MBW-HMI-02; those are visible only in the agent's own tray icon on that workstation.

## SECTION A.9: AUDIT LOGGING AND HISTORIAN

### A.9.1 Audit Log

AquaSight records every operator action in the audit log on MBW-SCADA-SRV01 (replicated to SRV02 and MBW-HIST-01): logins and logouts, setpoint changes (old value, new value, tag, HMI node, account), mode changes, alarm acknowledgements and shelving, PIN entries, and remote-session start/stop on MBW-JUMP-01. Retention is 90 days online and 1 year on the historian. The log cannot be edited from an HMI; it can be cleared from MBW-EWS-01 by an AquaSight administrator (Kessler and the SCADA / IT Security Manager hold that role).

Example entries:

```
2026-03-04 06:38:02  P4  LOGIN      node=MBW-HMI-02 acct=OPS_SHIFT_B    result=OK
2026-03-04 06:41:10  P4  SETPOINT   node=MBW-HMI-02 acct=OPS_SHIFT_B    tag=NAOH-FC-203.SP old=11.0 new=12.0 mg/L
2026-03-04 06:41:12  P4  MODE       node=MBW-HMI-02 acct=OPS_SHIFT_B    tag=NAOH-FC-203 old=AUTO new=MANUAL
2026-03-04 06:42:30  P4  PIN        node=MBW-HMI-02 acct=OPS_SHIFT_B    tag=NAOH-FC-203.SP requested=24.0 result=ACCEPTED
2026-03-04 06:42:31  P4  SETPOINT   node=MBW-HMI-02 acct=OPS_SHIFT_B    tag=NAOH-FC-203.SP old=12.0 new=24.0 mg/L
2026-03-04 06:55:48  P2  ALARM      tag=AIT-302.HI   value=8.6 pH       state=ACTIVE
2026-03-04 07:02:15  P4  RSESSION   node=MBW-JUMP-01 acct=kessler_jmolina start=07:02:15 target=MBW-EWS-01
```

A ScreenBridge session appears in the audit log only as actions taken under whatever HMI account was already logged in on MBW-HMI-02 (normally the shared shift account); the log does not distinguish a keyboard in the Chemical Building from a remote desktop session.

### A.9.2 Historian

MBW-HIST-01 stores all analog tags at 10-second resolution for 2 years and all digital tags on change. The Water Quality Manager pulls monthly operating reports from it for the Ohio EPA DDAGW; the Laboratory Supervisor reconciles AIT-301 and AIT-302 with grab samples daily. Historian data are the primary evidence for reconstructing a process event; export the affected tags to CSV before any server is rebooted or rebuilt (OT Plan Section 10.7).

## SECTION A.10: VENDOR AND SUPPORT CONTACTS

| Organization | Scope | Contact |
|---|---|---|
| Kessler Controls | AquaSight servers, HMIs, PLC logic, MBW-JUMP-01 access | Support (555) 039-4400 (business hours); escalation (555) 039-4411 (24 h); named technicians Jared Molina, Sam Whitfield |
| DosaTech Metering Systems | Chemical metering pumps, VFDs, ScreenBridge agent on MBW-HMI-02 | Support (555) 039-5500 |
| Buckeye Telemetry | BT-900 master, BT-R2 RTUs, RP-1, cellular modems | Support (555) 039-9100 (business hours; next business day on site) |
| Veridian Meter Systems | AMI network and MBW-AMI-01 head-end (business LAN) | Support (555) 039-6600 |
| City IT (Kevin Marsh) | MBW-FW-01 rules, MILLBROOK domain, MBW-BKP-01, SIEM | (555) 031-2300 / (555) 034-1188 |
| SCADA / IT Security Manager (Priya Nandakumar) | Owner of this appendix; remote-access approvals | (555) 031-2280 / (555) 034-1144 |
| RWTP Control Room | Duty operator, 24 h | (555) 031-2244 |

Quick reference: control network 10.72.10.x · PLCs 10.72.20.11–16 · RTUs 10.72.30.101–107 · DMZ 10.72.250.x · business 10.73.x.x · jump host MBW-JUMP-01 · repeater RP-1 at Hilltop Tank · supervisor PIN tags: NAOH-FC-203 above 20 mg/L, CL2-FC-201/202 above 4.0/5.0, F-FC-204 above 1.0, pressure setpoints · hard-wired protection: PSH-302 (pH 9.5), LIT-401 low-low HSP trip, LIT-101 low-low raw pump trip
