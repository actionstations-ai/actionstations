# Corwin Valley Gas Company — Distribution System and SCADA Description

Document Control Number: CVG-SYS-2026 · Revision 5.1 · Effective Date: 04/01/2026 · Maintained by: Anil Desai (OT/SCADA Manager) and Raymond Oyelowo (Measurement and Regulation Supervisor) · Reviewed: Theresa Novak (Gas Control Manager), Diane Ferrante (Director of Distribution Operations)

> **EXERCISE MATERIAL — for training use.** Corwin Valley Gas Company, the City of Corwin, Lake Haven County, their people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 4.0 — 02/15/2024 — Sections 3, 4 — Low-pressure district recorders PR-7A, PR-7B, PR-8A, PR-8B; electronic pilot controllers PC-21 and PC-22 · 5.0 — 06/01/2025 — Sections 5, 6 — PipeView SCADA 6 upgrade; OT jump host · 5.1 — 04/01/2026 — Sections 2, 7 — Customer counts; cast-iron replacement progress; alarm limits

**Handling:** Controlled. Contains station locations and network names; do not post or email outside CVG.

## Table of Contents

Section 1 Overview · Section 2 Supply and City Gates · Section 3 Lines and Valves · Section 4 Regulator Stations · Section 5 Pressure Districts · Section 6 SCADA Platform · Section 7 Alarm Limits and Tags · Section 8 Remote Access and Telecommunications · Section 9 Critical Customers · Section 10 Vendors

---

## SECTION 1: OVERVIEW

Corwin Valley Gas Company (CVG) is an investor-owned local distribution company serving about 61,800 customers in the City of Corwin, the Borough of Elm Falls and Ashby, Dorrance, Kettle Creek and Lower Mill townships in Lake Haven County, Pennsylvania. The system has 1,140 miles of main: 860 miles of plastic, 214 miles of coated and protected steel, and 66 miles of legacy cast-iron and bare-steel main in the two low-pressure districts (replacement program at 9 miles per year). CVG operates no compressor stations, no storage and no LNG.

The Operations Center at 2200 Foundry Road, Corwin houses Gas Control, the Measurement and Regulation (M&R) shop, the distribution yard and the emergency operations center (Room 140).

## SECTION 2: SUPPLY AND CITY GATES

| City gate | Location | Supply | Design capacity | Outlet MAOP | Feeds |
|---|---|---|---|---|---|
| Harlan Road City Gate | 4100 Harlan Road, Ashby Township | Tri-Ridge Interstate Pipeline, meter station TR-418 | 18 MMcf/d | 300 psig | Line 100 |
| Millstream Gate Station | 75 Millstream Lane, Kettle Creek Township | Tri-Ridge Interstate Pipeline, meter station TR-422 | 9 MMcf/d | 300 psig | Line 200 |

Both gates have inlet filters, ultrasonic meters with electronic flow measurement, a gas chromatograph (Harlan Road only), odorant injection (Harlan Road for both lines through a cross-tie), and two-run pressure regulation with monitor regulators and relief. Winter design day 2026: 74 MMcf with Elm Falls Industrial Park interruptible load curtailed.

## SECTION 3: LINES AND VALVES

| Line | Description | Size / material | MAOP | Route |
|---|---|---|---|---|
| Line 100 | Supply main from Harlan Road City Gate to the north and central system | 12-inch coated steel | 300 psig | Harlan Road – Quarry Road – Foundry Road |
| Line 200 | Supply main from Millstream Gate Station to the south and Elm Falls | 8-inch coated steel | 300 psig | Millstream Lane – Corwin River crossing at Foundry Road bridge – Elm Falls |
| Line 300 | Cross-tie between Line 100 and Line 200 | 8-inch coated steel | 300 psig | Foundry Road (normally open) |
| Lateral 7 | Industrial supply | 6-inch coated steel | 150 psig | Line 200 – Elm Falls Industrial Park |

Remote-control valves RCV-01 (Harlan Road City Gate outlet), RCV-02 (Millstream Gate Station outlet), RCV-03 (Line 100 at Quarry Road) and RCV-04 (Lateral 7 takeoff) are operable from SCADA and locally. Manual valves Valve 11 to Valve 14 and Valve 21 to Valve 24 are the inlet valves of the regulator stations of the same numbers; Valve 31 and Valve 32 bracket the Line 200 river crossing. Full table: CVG-EP-2026 Section 7.

## SECTION 4: REGULATOR STATIONS

| Station | Location | Inlet source | Outlet | Pressure district | Regulation | Telemetry |
|---|---|---|---|---|---|---|
| RS-11 | Quarry Road at Route 44 | Line 100 | 60 psig | Pressure District 1 | Worker/monitor, mechanical pilots | ROC800, radio |
| RS-12 | Harlan Road at Beech Street | Line 100 | 60 psig | Pressure District 1 | Worker/monitor, mechanical pilots | ROC800, radio |
| RS-13 | Foundry Road at Ninth Street | Line 100 | 60 psig | Pressure District 2 | Worker/monitor, mechanical pilots | ROC800, radio |
| RS-14 | Elm Falls Pike | Line 200 | 60 psig | Pressure District 3 | Worker/monitor, mechanical pilots | ROC800, radio |
| RS-15 | Kettle Creek Road | Line 200 | 45 psig | Pressure District 4 | Worker/monitor, mechanical pilots | ROC800, cellular |
| RS-16 | Dorrance Road | Line 100 | 45 psig | Pressure District 4 | Worker/monitor, mechanical pilots | ROC800, cellular |
| RS-17 | Lower Mill Road | Line 200 | 25 psig | Pressure District 5 | Worker/monitor, mechanical pilots | ROC800, cellular |
| RS-18 | Ashby Pike | Line 100 | 25 psig | Pressure District 5 | Worker/monitor, mechanical pilots | ROC800, cellular |
| RS-19 | Industrial Park Drive | Lateral 7 | 60 psig | Pressure District 6 | Worker/monitor, mechanical pilots | ROC800, radio |
| RS-20 | Mill Race Road | Line 200 | 25 psig | Pressure District 6 | Worker/monitor, mechanical pilots | ROC800, cellular |
| RS-21 | Front Street at Market Street, Corwin | Pressure District 2 (60 psig) | 10 in. w.c. | Pressure District 7 | Worker/monitor; **worker pilot with electronic pilot controller PC-21**; relief | ROC800, radio |
| RS-22 | Church Street at Canal Street, Corwin | Pressure District 2 (60 psig) | 10 in. w.c. | Pressure District 7 | Worker/monitor; **worker pilot with electronic pilot controller PC-22**; relief | ROC800, cellular modem (finding F-3) |
| RS-23 | Main Street at Bridge Street, Elm Falls | Pressure District 3 (60 psig) | 10 in. w.c. | Pressure District 8 | Worker/monitor, mechanical pilots; relief | ROC800, radio |
| RS-24 | Mill Street at River Road, Elm Falls | Pressure District 3 (60 psig) | 10 in. w.c. | Pressure District 8 | Worker/monitor, mechanical pilots; relief | ROC800, radio |

**Electronic pilot controllers (PC-21, PC-22):** installed in 2023 so Gas Control could raise the downtown Corwin outlet setpoint on design-cold days without sending a technician. The controller loads the worker regulator's pilot; its setpoint is written from SCADA through the station RTU. The monitor regulator downstream keeps its own mechanical pilot set at 14 in. w.c., and the relief valve opens at 16 in. w.c. Setpoint range allowed in PipeView: 8 to 12 in. w.c.; the controller itself accepts 0 to 2 psig (about 55 in. w.c.), so the PipeView limit is the only software limit (finding noted in CVG-CIRP-2026 review, not yet closed).

**Sensing lines:** each low-pressure station's worker and monitor sense pressure on the downstream main about 40 feet from the station. A sensing line that is cut, plugged or connected to an isolated main makes both regulators open fully; this is the failure mode of the 2018 Merrimack Valley accident, and CVG's construction procedure CP-17 requires M&R sign-off before any work near a sensing line.

## SECTION 5: PRESSURE DISTRICTS

| District | Pressure | MAOP | Customers | Fed by | Notes |
|---|---|---|---|---|---|
| Pressure District 1 | 60 psig | 60 psig | 9,880 | RS-11, RS-12 | North Corwin, Ashby Township |
| Pressure District 2 | 60 psig | 60 psig | 8,210 | RS-13 | Central Corwin; feeds RS-21 and RS-22 |
| Pressure District 3 | 60 psig | 60 psig | 6,940 | RS-14 | Elm Falls; feeds RS-23 and RS-24 |
| Pressure District 4 | 45 psig | 60 psig | 11,300 | RS-15, RS-16 | Kettle Creek and Dorrance townships |
| Pressure District 5 | 25 psig | 60 psig | 10,620 | RS-17, RS-18 | Lower Mill, south Ashby |
| Pressure District 6 | 25–60 psig | 60 psig | 5,400 | RS-19, RS-20 | Elm Falls Industrial Park and Mill Race |
| Pressure District 7 | 10 in. w.c. | 14 in. w.c. | 5,120 | RS-21, RS-22 | Downtown Corwin; cast-iron mains; Corwin General Hospital is NOT on this district (fed from Pressure District 2) |
| Pressure District 8 | 10 in. w.c. | 14 in. w.c. | 4,330 | RS-23, RS-24 | Old Elm Falls; cast-iron and bare steel |

District-end recorders: PR-7A (Front Street at Lock Street) and PR-7B (Canal Street at Water Street) in Pressure District 7; PR-8A (Main Street at Oak Street) and PR-8B (River Road at Ferry Street) in Pressure District 8. Each reports to SCADA over cellular every 60 seconds and keeps a local 30-day log readable with a laptop.

## SECTION 6: SCADA PLATFORM

PipeView SCADA 6 (Halden Automation, integrator of record since 2015) runs on CVG-SCADA01 (active) and CVG-SCADA02 (hot standby) in the Gas Control equipment room, with three controller consoles CVG-HMI01 to CVG-HMI03, the engineering workstation CVG-ENG01 (ROCLINK and PipeView configuration tools), the historian CVG-HIST01 in the OT DMZ, and the OT jump host CVG-OT-JMP01 in the OT DMZ. Polling cycle: 30 seconds for city gates and radio stations, 60 seconds for cellular stations and recorders. The OT domain is CVGOT, separate from the business domain CVG; CVG-OTFW01 separates IT from the OT DMZ and CVG-OTFW02 separates the DMZ from the control zone.

HMI screens: System Overview; one screen per city gate; Regulator Stations (all fourteen); Low Pressure (Pressure District 7 and Pressure District 8 with station outlets, recorders and pilot-controller setpoints); Valves (RCV-01 to RCV-04); Alarms; Audit Trail.

## SECTION 7: ALARM LIMITS AND TAGS

| Point | Tag | Low | High | High-high |
|---|---|---|---|---|
| RS-21 outlet | RS21-PT-OUT | 6 in. w.c. | 12 in. w.c. | 14 in. w.c. |
| RS-22 outlet | RS22-PT-OUT | 6 in. w.c. | 12 in. w.c. | 14 in. w.c. |
| RS-23 outlet | RS23-PT-OUT | 6 in. w.c. | 12 in. w.c. | 14 in. w.c. |
| RS-24 outlet | RS24-PT-OUT | 6 in. w.c. | 12 in. w.c. | 14 in. w.c. |
| PC-21 setpoint | PC21-SP | — | change alarm | — |
| PC-22 setpoint | PC22-SP | — | change alarm | — |
| PR-7A, PR-7B, PR-8A, PR-8B | PR7A-PT … PR8B-PT | 5 in. w.c. | 12 in. w.c. | 14 in. w.c. |
| Pressure District 2 at RS-13 outlet | RS13-PT-OUT | 45 psig | 62 psig | 65 psig |
| Line 100 at Harlan Road City Gate | HRG-PT-OUT | 220 psig | 300 psig | 310 psig |

Station outlet transmitters are on the station's own RTU; a compromised RTU or SCADA server can report a false value, which is why the district recorders run on a separate cellular path and why field gauges govern (CVG-EP-2026 Decision Record EP-2).

## SECTION 8: REMOTE ACCESS AND TELECOMMUNICATIONS

- Staff and the integrator reach OT only through CVG-OT-JMP01 with MFA; the integrator account "halden-support" is enabled permanently for after-hours support (CVG-CIRP-2026 CIRP-2).
- Station telemetry: licensed 900 MHz radio from the Quarry Hill tower for radio stations; carrier private network cellular modems for the others and for the recorders.
- RS-22's cellular modem exposes a vendor web configuration page on the carrier private network (finding F-3).
- Voice: company radio (two talkgroups, Gas Control and Field), cell phones; Gas Control has an analog ring-down line to the Lake Haven County 911 Center.

## SECTION 9: CRITICAL CUSTOMERS

| Customer | District | Note |
|---|---|---|
| Corwin General Hospital | Pressure District 2 | Dual-fuel boilers (oil backup, 72 hours) |
| Lake Haven County 911 Center | Pressure District 1 | Generator on diesel |
| Riverside Manor and Front Street Senior Residence (nursing homes) | Pressure District 7 | Gas heat only; relocation plan with county EMA |
| Corwin Area High School and four elementary schools | Pressure Districts 1, 2, 7 | Gas heat |
| Elm Falls Industrial Park | Pressure District 6 / Lateral 7 | Interruptible |

## SECTION 10: VENDORS

| Vendor | Role | Contact |
|---|---|---|
| Halden Automation | PipeView SCADA integrator, after-hours support | 800-555-0123 |
| Emerson | ROC800 RTU and ROCLINK support | Vendor support line |
| Keel Valley Wireless | Carrier private network for cellular modems | 800-555-0127 |
| Tri-Ridge Interstate Pipeline | Upstream supply, Gas Control | 800-555-0198 |
