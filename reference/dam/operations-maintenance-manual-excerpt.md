# Cedar Ridge Dam — Operations & Maintenance Manual (Excerpt)

Document Control Number: CVWA-OM-CRD · Revision 5.0 · Effective Date: 06/15/2025 · Approved: Glen Haskins (Dam Operations Manager) · Mei-Lin Chao, P.E. (Dam Safety Engineer) · Aaron Feld (SCADA/IT Lead)

> **Fictional document** created as source material for tabletop exercise generation. Cedar Ridge Dam, CVWA, all equipment names, vendors, persons and telephone numbers are invented. This excerpt contains Sections 1–10 of a longer manual; equipment-specific maintenance procedures (Sections 11–24) are omitted.

**Record of Revisions:** 4.2 — 03/01/2022 — Section 2 — Revised rule curve · 4.3 — 05/10/2023 — Section 3 — AlarmLink autodialer · 5.0 — 06/15/2025 — All — Five-year rewrite; Section 8 added after 2024 PLC-2 logic update event

## Table of Contents

Section 1 General · Section 2 Normal Reservoir Operations · Section 3 Control Room, HMI and Staffing · Section 4 Spillway Gate Operation · Section 5 Electrical Power and Backup Power · Section 6 Instrumentation and Monitoring · Section 7 Communications · Section 8 Returning SCADA Control to Service · Section 9 Routine Inspections · Section 10 Flood Operations · Annex A Key Elevations and Limits

---

## SECTION 1: GENERAL

### 1.1 Purpose

This manual tells operators how to run Cedar Ridge Dam within its design limits under normal, flood and degraded conditions. Emergency classification and notification are governed by the Emergency Action Plan (EAP); security matters by the Security Plan. Where this manual and the EAP conflict during an emergency, the EAP governs.

### 1.2 Operating Authority

The Dam Operations Manager (DOM), Glen Haskins, directs all release changes. The on-shift Control Room Operator may make routine release changes within the rule curve band and the ramping limits of Section 2.4 without further approval. Any change outside those limits requires the DOM's direction, recorded in the Control Room log with time and name.

## SECTION 2: NORMAL RESERVOIR OPERATIONS

### 2.1 Rule Curve

| Period | Target Pool (ft NAVD88) | Allowable Band |
|---|---|---|
| December 1 – March 15 | Winter pool 792.0 | 791.0 – 793.5 |
| March 16 – May 1 | Fill linearly to 798.0 | ±1.0 ft of line |
| May 2 – September 30 | Summer pool 798.0 | 797.0 – 798.5 |
| October 1 – November 30 | Draw down linearly to 792.0 | ±1.0 ft of line |

Flood-control storage is el. 798.0 to 806.0. Water above the band is evacuated as fast as downstream limits allow (Section 2.4). The Milford municipal intake requires a minimum release of 120 cfs at all times.

### 2.2 Release Facilities

| Facility | Capacity | Normal Use |
|---|---|---|
| Units 1 and 2 | 1,650 cfs each at full gate (18 MW each) | Base releases up to 3,300 cfs |
| Low-level outlet (LLO) | 2,900 cfs at el. 798.0 | Minimum flow when both units are off; drawdown |
| Spillway Gates 1–5 | 182,000 cfs total at el. 810.0 | Flood releases above powerhouse capacity |

### 2.3 Spillway Gate Operating Sequence and Limits

- **Opening sequence:** Gate 3, Gate 2, Gate 4, Gate 1, Gate 5 (center first, then alternating, to center the jet in the stilling basin). **Closing sequence:** reverse (5, 1, 4, 2, 3).
- No gate may be more than 2 ft out of step with the gate next in sequence, except when a gate is out of service.
- Maximum gate movement rate: 1 ft per 10 minutes per gate. PLC-1/PLC-2 enforce this in REMOTE; operators enforce it by watch in LOCAL.
- Minimum opening 0.5 ft (prevents gate vibration). Gates are not operated with ice on the skin plate (February heater check required).
- Spillway Gate 4 has a known hoist cable wear issue; inspect monthly and limit to 20 ft opening until the 2026 cable replacement is complete.

### 2.4 Downstream Ramping Limits

- Increase total release by no more than **2,000 cfs per hour**, and no more than 1,000 cfs in the first hour after a release has been steady for 24 hours (public safety at tailrace fishing access).
- **Notify Pike County EMA before total release exceeds 8,000 cfs**; notify City of Milford when the Milford Gauge is forecast to reach action stage 11.5 ft.
- Decrease no more than 1,500 cfs per hour (bank stability downstream).
- Ramping limits may be exceeded only on DOM direction under an EAP Level 2 or Level 3.

### 2.5 Unit Start/Stop

- Normal start: from CRD-HMI-01 (GEN-3 screen) or locally at the unit control board in the powerhouse. Start sequence takes approx. 6 minutes to synchronize to the 69 kV system.
- A unit trip at full load drops release by 1,650 cfs instantly. The operator restores release with the LLO within 15 minutes (minimum flow and downstream stage).
- Units are not run below 600 cfs (rough zone).
- Units 1 and 2 run unattended overnight on automatic level control; a trip outside day shift is handled by the on-call operator (Section 3.5).

## SECTION 3: CONTROL ROOM, HMI AND STAFFING

### 3.1 HMI Stations

CRD-HMI-01 (Control Room) is the primary station. CRD-HMI-02 (powerhouse) duplicates all screens. Both connect to CRD-SCADA-SRV01. Historical trends come from CRD-HIST-01.

### 3.2 HMI Screens

| Screen | Name | Contents |
|---|---|---|
| OVW-1 | Overview | Headwater (Gauge G-1), tailwater (Gauge G-3), total release, gate and unit summary, Milford Gauge |
| SPW-2 | Spillway | Spillway Gates 1–5 position, setpoint, hoist motor status, LOCAL/REMOTE state, heater status |
| GEN-3 | Units | Units 1 and 2 MW, flow, wicket gate, Penstocks 1–2 pressure |
| INS-4 | Instrumentation | Weirs W-1 to W-4, piezometers PZ-1 to PZ-12, uplift cells |
| LLO-5 | Low-Level Outlet | LLO gate position, conduit pressure, bulkhead status |
| ALM-6 | Alarm Summary | Active and unacknowledged alarms by priority |
| COM-7 | Communications | Status of PLC-1, PLC-2, RTU-01 to RTU-08, CRD-FW-01 link, AlarmLink |

### 3.3 Alarm Priorities

| Priority | Examples | Response |
|---|---|---|
| P1 — Critical | Uncommanded gate movement > 0.5 ft; headwater > 806.0; any weir above Level 2 threshold; penstock pressure drop > 15%; LLO gate open without command | Immediate; AlarmLink pages on-call after hours |
| P2 — High | Unit trip; PLC or RTU communication loss > 5 min; headwater > 801.0; station service loss | Within 15 minutes; AlarmLink pages on-call after hours |
| P3 — Medium | Single piezometer above Level 1; gate heater fault; UPS on battery | Same shift; **not paged after hours** |
| P4 — Advisory | Historian lag; trend deviation; door forced alarm from PACS interface | Next business day |

### 3.4 Shift Staffing

| Period | Staffing |
|---|---|
| 0600–1430, 7 days | **One** Control Room Operator on site |
| 1430–0600 | **No operator on site.** On-call operator (rotating among four qualified operators) |
| Business hours, Mon–Fri | DOM, DSE, maintenance crew (2–3) available on site |

The on-call operator must reside within 30 miles and arrive at the site within **60 minutes** of a page. No remote control of the dam is permitted from outside the Control Room or powerhouse.

### 3.5 After-Hours Alarm Path (AlarmLink)

P1 and P2 alarms route from CRD-SCADA-SRV01 to the AlarmLink autodialer, which calls and texts the on-call operator. If not acknowledged in **10 minutes**, AlarmLink calls the DOM; after 20 minutes, the DSE. AlarmLink depends on CRD-SCADA-SRV01 and the control building phone line; **if CRD-SCADA-SRV01 is down, no after-hours alarms are sent.** A daily 0700 test call confirms the path.

## SECTION 4: SPILLWAY GATE OPERATION

### 4.1 Control Modes

Each gate has a LOCAL/REMOTE key selector at its local control panel (LCP-1 to LCP-5) in the Spillway Hoist House. REMOTE = commands from CRD-HMI-01/02 via PLC-1 (Gates 1–3) or PLC-2 (Gates 4–5). LOCAL = push-buttons at the LCP only; remote commands are ignored. Selector keys are held in the Control Room key box.

### 4.2 Remote Operation (Normal)

- [ ] Confirm DOM direction (if outside Section 2.4 limits) and log it
- [ ] Notify Pike County EMA if total release will exceed 8,000 cfs
- [ ] Sound the spillway warning horn on the crest 5 minutes before opening (tailrace users)
- [ ] Enter setpoint on SPW-2; observe movement at 1 ft per 10 min; confirm position on CAM-11 and stilling basin Gauge G-2
- [ ] Record gate positions and total release in the log every 30 minutes during gate changes

### 4.3 Local Operation from the Spillway Hoist House

Used when SCADA is unavailable or untrusted (Security Plan 8.4).

- [ ] Two qualified persons; one at the LCP, one observing the gate from the crest with a radio (CVWA-2)
- [ ] Obtain selector keys from the Control Room key box; turn the gate to LOCAL; confirm "LOCAL" lamp
- [ ] Read the mechanical position indicator on the hoist drum; record
- [ ] Jog RAISE/LOWER in steps of no more than 1 ft; wait 10 minutes between steps
- [ ] Observe slack-cable and over-travel limit lamps; stop on any abnormal noise
- [ ] Report each position to the Control Room or DOM; record in the log
- [ ] Gates remain in LOCAL until the Section 8 checklist is complete

### 4.4 Manual Handwheel Operation (No Hoist Power)

Each hoist has a declutchable handwheel. Two people can move a gate about **1 ft per 45 minutes**. A full opening of one gate by hand is not practical in a flood; handwheel operation is for small adjustments or closing a gate that has stuck partially open. Lock out the hoist motor before engaging the handwheel.

## SECTION 5: ELECTRICAL POWER AND BACKUP POWER

### 5.1 Station Service

Station service is fed from the 69 kV switchyard through the station service transformer, with a backup 12.47 kV distribution feeder from the local utility on SR-41. The Spillway Hoist House motor control center (MCC-H) is fed only from the station service bus.

### 5.2 Diesel Generator DG-1

- 150 kW, located in the powerhouse; auto-starts within 30 seconds on loss of station service.
- **Supplies the control building only** (Control Room, server room, lighting, radio base station, sirens S-1 to S-3 local panel).
- Does **not** supply MCC-H (gate hoists), the intake gate hoists, the LLO hydraulic power unit, or Door P-3.
- Fuel: 72 hours at full load (1,200-gallon belly tank). Tested monthly under load for 30 minutes.
- SCADA servers and network switches have a 2-hour UPS.

### 5.3 Portable Generator PG-1 (Gate Hoists)

- 250 kW trailer-mounted unit stored at the **CVWA maintenance yard in Milford**, 6.5 road miles from the dam.
- Requires a CDL-qualified driver (two on staff) and a tow vehicle; typical deployment time **90 minutes** in daylight, longer at night or if SR-41 is flooded (use Ridge Fire Road).
- Connects at the Spillway Hoist House exterior quick-connect panel (QC-1) on the crest. The crest is reached through the West Crest Gate.
- PG-1 can run hoists for two gates simultaneously. Load-tested twice yearly; last test 04/2025 (the October 2025 test was postponed).
- The LLO hydraulic power unit has a hand pump for emergency closure only.

### 5.4 Loss of Station Power Checklist

- [ ] Confirm DG-1 running and control building energized
- [ ] Check backup feeder availability with the utility
- [ ] If releases must change and station service will not return within 1 hour: DOM orders PG-1 deployment
- [ ] Note that Units 1 and 2 trip on loss of grid; restore minimum flow with the LLO (hand pump only closes; LLO opening requires HPU power) or spillway
- [ ] Report to the DOM every 30 minutes until restored

## SECTION 6: INSTRUMENTATION AND MONITORING

### 6.1 Gauges

| Gauge | Location | Telemetry | Notes |
|---|---|---|---|
| Gauge G-1 | Headwater, Intake Tower 1 | RTU-03 | Staff gauge also readable from access bridge |
| Gauge G-2 | Stilling basin, spillway apron | RTU-07 | |
| Gauge G-3 | Tailwater below powerhouse | RTU-07 | |
| Milford Gauge | Main Street Bridge, City of Milford | RTU-08 (cellular) | Action stage 11.5 ft; flood stage 14.0 ft; moderate 17.0 ft |

### 6.2 Seepage Weirs and Piezometers

| Instrument | Location | Normal | Level 1 Threshold | Level 2 Threshold |
|---|---|---|---|---|
| Weir W-1 | Left (east) abutment toe | 4–8 gpm | 15 gpm | 30 gpm or turbid |
| Weir W-2 | Foundation gallery, monoliths 6–10 | 10–18 gpm | 30 gpm | 50 gpm or turbid |
| Weir W-3 | Foundation gallery, monoliths 11–16 | 8–14 gpm | 25 gpm | 45 gpm or turbid |
| Weir W-4 | Right (west) abutment toe near powerhouse | 2–5 gpm | 10 gpm | 20 gpm or turbid |
| PZ-1 to PZ-12 | Foundation, 2 per monolith 6–11 | Per DSE baseline | +5 ft over baseline | +10 ft over baseline in adjacent monoliths |

(Table 6-2.) Thresholds are referenced by EAP Section 4.

### 6.3 Reading Frequency

Weirs and piezometers telemeter every 15 minutes via RTU-06. Manual readings are taken weekly and **every 4 hours** when RTU-06 is out of service or the reservoir is above el. 801.0. Turbidity can only be judged by eye; a camera does not view the weirs.

## SECTION 7: COMMUNICATIONS

| System | Use | Notes |
|---|---|---|
| Radio CVWA-1 (VHF repeater on Cedar Ridge) | Operations dispatch, Control Room | Repeater has 8-hour battery; not on DG-1 |
| Radio CVWA-2 (talkaround) | Crest/hoist house/powerhouse local | Works without repeater |
| Radio PIKE-EM | Interoperability with Sheriff and EMA | Control Room base and two portables |
| Control Room landline | Primary for EAP notifications | Single copper pair along Dam Access Road |
| Satellite phone | Backup | Control Room charging cradle; test monthly |
| Cellular | Supplementary | **No reliable coverage in the powerhouse or on the tailrace deck** |

## SECTION 8: RETURNING SCADA CONTROL TO SERVICE

Required after any PLC/HMI software or logic change, vendor (HydroLogix) remote session, network change, controller replacement, or any period of LOCAL operation.

- [ ] SCADA Lead confirms CRD-JUMP-01 vendor account disabled and session recording saved
- [ ] Compare running PLC-1/PLC-2 logic to the approved baseline (checksum) on CRD-EWS-01; document any difference and its approval ticket
- [ ] Point-to-point check: each gate's HMI position matches the hoist drum indicator within 0.2 ft
- [ ] Verify rate limit (1 ft per 10 min) and out-of-step interlock by a 0.5 ft test move on one gate in the presence of two operators
- [ ] Confirm alarms P1/P2 reach AlarmLink (test page)
- [ ] Confirm RTU-01 to RTU-08 values are current (timestamp less than 2 minutes) on COM-7
- [ ] DOM authorizes return; operator turns selectors to REMOTE one gate at a time; log time and names
- [ ] Return keys to the Control Room key box

The 2024 event that led to this section: after a PLC-2 logic update, Spillway Gate 5 accepted setpoints but the rate limit was missing; the error was found during a test move.

## SECTION 9: ROUTINE INSPECTIONS

| Inspection | Frequency | By |
|---|---|---|
| Crest walk, spillway, gates visual | Daily (day shift) | Control Room Operator |
| Gallery walk, weirs (manual), drains | Weekly | Operator + maintenance |
| Spillway Gate exercise (each gate, 1 ft) | Monthly, March–June; quarterly otherwise | Two operators |
| Hoist cable inspection | Monthly (Gate 4), quarterly (others) | Maintenance |
| Intake Tower 1 trash racks | Monthly and after high flows | Maintenance |
| DSE formal inspection | Annual | Mei-Lin Chao, P.E. |
| FERC / ODNR-DWR inspection | Annual / 5-year (Part 12D) | Regulators, Independent Consultant |

## SECTION 10: FLOOD OPERATIONS

### 10.1 Trigger

Flood operations begin when the reservoir exceeds the rule-curve band and inflow forecast from the National Weather Service exceeds powerhouse plus LLO capacity (approx. 6,200 cfs), or on DOM direction.

### 10.2 Flood Operations Checklist

- [ ] DOM: place on-call operator on site for 24-hour coverage (12-hour shifts); cancel non-essential maintenance
- [ ] Check DG-1 fuel; stage PG-1 at the dam (do not wait for station power loss)
- [ ] Confirm all Spillway Gates operable; Gate 4 limited to 20 ft (Section 2.3)
- [ ] Hourly coordination with National Weather Service and USACE; read Milford Gauge hourly
- [ ] Notify Pike County EMA before total release exceeds 8,000 cfs; update every 3 hours
- [ ] Manual weir/piezometer readings every 4 hours above el. 801.0
- [ ] Reservoir above el. 801.0 and rising: EAP Level 1; above el. 806.0 and forecast rising: EAP Level 2
- [ ] Close Crest Road to all non-essential vehicles; Security Manager closes East Overlook

---

## ANNEX A: KEY ELEVATIONS AND LIMITS

| Item | Value |
|---|---|
| Dam crest | el. 812.0 |
| Spillway capacity reference | el. 810.0 (182,000 cfs) |
| Top of flood-control pool / gates closed top | el. 806.0 |
| EAP Level 1 pool trigger | el. 801.0 and rising |
| Summer pool / winter pool | el. 798.0 / el. 792.0 |
| Spillway crest | el. 774.0 |
| Minimum release (Milford intake) | 120 cfs |
| Ramping up / down | 2,000 cfs/h / 1,500 cfs/h |
| EMA pre-notification threshold | 8,000 cfs |
| Gate rate limit | 1 ft per 10 min |
| On-call response | 60 minutes |
| AlarmLink escalation | 10 min → DOM; 20 min → DSE |
