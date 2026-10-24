# Teague Valley Chemical Company, Corbin Falls Works — Facility and Process Description

Document Control Number: TVCC-CFW-FPD-2026 · Revision 3.1 · Effective Date: 03/01/2026 · Process Safety Information under 29 CFR 1910.119(d) (summary edition) · Maintained by: Owen Ritchie (PSM Coordinator) · Control-system sections: Victor Anand (Process Control and OT Engineer)

> **EXERCISE MATERIAL — for training use.** Teague Valley Chemical Company, the Corbin Falls Works, its people, neighbors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 3.0 — 07/15/2025 — All — Reissued after the Unit 300 loading-arm replacement (MOC-25-031) · 3.1 — 03/01/2026 — Sections 5, 6 — SIS register after the Triconex firmware update (MOC-25-077); vendor remote-access path through TVC-JMP-01

**Handling:** Controlled. Contains control-network addressing and SIS details. Copies: CCR binder FPD-1, PSM Coordinator, OT Engineer, ERT Chief, Ridgeline Automation (contract copy).

## Table of Contents

Section 1 Site Layout · Section 2 Process Units · Section 3 Vessels, Tanks and Loading Positions · Section 4 Chemicals on Site · Section 5 Safety Instrumented Functions and Emergency Shutdown · Section 6 Control Systems and Networks · Section 7 Detection, Sirens and Weather · Section 8 Gates, Muster Points and Site Access · Section 9 Utilities and Backup Power

---

## SECTION 1: SITE LAYOUT

The Works sits between River Terminal Road (east), the Teague River (north), the Corbin Valley Railroad main line (south) and Route 9 (west). From west to east: Gate 1 and the Administration Building; the Central Control Room (CCR, a blast-resistant building between Unit 200 and Unit 400); Unit 100 Cell Room; Unit 200 Chlorine Processing; Unit 300 Chlorine Storage and Loading in the south-east corner beside the rail siding; Unit 500 Hypochlorite and Loading Rack 1 by Gate 3; Unit 400 Caustic Evaporation and Truck Spot 1 by the river; Unit 600 Utilities along the west fence. The River Dock (barge caustic, not chlorine) is north of Unit 400. Prevailing wind is from the west-south-west, toward the Riverside Addition.

## SECTION 2: PROCESS UNITS

| Unit | Name | Process | Normal staffing (night) |
|---|---|---|---|
| Unit 100 | Cell Room | Brine electrolysis in 96 membrane electrolyzers (rectifiers RX-1 to RX-4); wet chlorine to Unit 200, hydrogen to the hydrogen header, 32% caustic to Unit 400 | 2 outside operators |
| Unit 200 | Chlorine Processing | Cooling, drying in C-201 and C-202 with sulfuric acid, compression (K-201, K-202), liquefaction (E-210), liquid receiver V-210, tail gas to the scrubber | 2 outside operators |
| Unit 300 | Chlorine Storage and Loading | Liquid chlorine storage in TK-31, TK-32 and TK-33; rail tank car loading at Rail Spot 1 to Rail Spot 4; ton-container filling at Dock 1; vapor return to Unit 200 | 2 outside operators (loader and helper) |
| Unit 400 | Caustic Evaporation | Concentration from 32% to 50% caustic; storage TK-41, TK-42; truck loading at Truck Spot 1; barge loading at the River Dock | 1 outside operator |
| Unit 500 | Hypochlorite | Reactor R-501 (chlorine into dilute caustic); product tanks TK-51, TK-52; truck loading at Loading Rack 1 | 1 outside operator |
| Unit 600 | Utilities and Emergency Scrubber | Emergency scrubber C-650 with caustic recirculation; cooling towers; nitrogen; plant and instrument air; 46 kV substation | shared with Unit 400 |

## SECTION 3: VESSELS, TANKS AND LOADING POSITIONS

### 3.1 Vessels

| Tag | Description | Unit | Notes |
|---|---|---|---|
| C-201 | Primary chlorine drying tower | Unit 200 | Sulfuric acid circulation |
| C-202 | Secondary drying tower | Unit 200 | |
| V-210 | Liquid chlorine receiver, 12 tons | Unit 200 | Level LT-210; relief to the scrubber header |
| V-220 | Tail-gas knockout drum | Unit 200 | |
| R-501 | Hypochlorite reactor | Unit 500 | Temperature trip SIF-510 |
| C-650 | Emergency chlorine scrubber (packed tower, caustic) | Unit 600 | Fans F-651/F-652; caustic circulation pumps P-651A/B |

### 3.2 Storage tanks

| Tag | Contents | Capacity | Building / dike |
|---|---|---|---|
| TK-31 | Liquid chlorine | 90 tons | Chlorine Storage Building (enclosed, vented to C-650) |
| TK-32 | Liquid chlorine | 90 tons | Chlorine Storage Building |
| TK-33 | Liquid chlorine | 90 tons | Chlorine Storage Building (normally the spare / emptying tank) |
| TK-41 | 50% caustic | 1,200 tons | Caustic dike |
| TK-42 | 50% caustic | 1,200 tons | Caustic dike |
| TK-51 | 12.5% sodium hypochlorite | 300 tons | Hypo dike |
| TK-52 | 12.5% sodium hypochlorite | 300 tons | Hypo dike |
| TK-61 | Fresh caustic for the scrubber | 40 tons | Unit 600 |

Maximum chlorine inventory: 270 tons in storage, up to 4 rail tank cars (90 tons each) at the rail spots and up to 30 ton containers at Dock 1.

### 3.3 Loading positions

| Position | Product | Equipment | Isolation |
|---|---|---|---|
| Rail Spot 1 | Liquid chlorine | Loading arm LA-1, railcar scale WT-301 | Remote-operated emergency isolation valves on the arm and the vapor return (ESD-310), hand valve HV-311 |
| Rail Spot 2 | Liquid chlorine | Loading arm LA-2, railcar scale WT-302 | ESD-310, hand valve HV-312 |
| Rail Spot 3 | Liquid chlorine | Loading arm LA-3, railcar scale WT-303 | ESD-310, hand valve HV-313 |
| Rail Spot 4 | Liquid chlorine (empties staging) | Loading arm LA-4, railcar scale WT-304 | ESD-310, hand valve HV-314 |
| Dock 1 | Chlorine ton containers | Filling station, scale WT-305 | ESD-320 |
| Truck Spot 1 | 50% caustic | Bottom loading | Local stop |
| Loading Rack 1 | Sodium hypochlorite | Top loading, two bays | Local stop |

Railcar loading (operating procedure OP-300-04) is by pressure transfer with dry nitrogen padding; the loader watches the railcar scale (local readout and DCS) and stops at the stencilled load limit. The angle valves on the railcar dome are connected to LA-1 to LA-4 through flexible connections replaced every two years (last: MOC-25-031, July 2025).

## SECTION 4: CHEMICALS ON SITE

| Chemical | CAS | RMP status | Maximum on site | Main hazards |
|---|---|---|---|---|
| Chlorine | 7782-50-5 | Regulated toxic substance, Program 3 | about 650 tons including railcars | Toxic by inhalation; heavier than air; yellow-green cloud; oxidizer |
| Hydrogen | 1333-74-0 | Regulated flammable substance; below threshold in the process | under 1 ton in headers | Flammable, invisible flame |
| Sodium hydroxide (50%) | 1310-73-2 | Not regulated under RMP | 2,400 tons | Corrosive |
| Sodium hypochlorite (12.5%) | 7681-52-9 | Not regulated under RMP | 600 tons | Corrosive; releases chlorine with acids |
| Sulfuric acid (98%) | 7664-93-9 | Not regulated under RMP | 150 tons | Corrosive; reacts violently with water |

Safety Data Sheets are in the SDS system (TVC-SDS, on the business network) and in the CCR SDS binder (paper, updated each quarter).

## SECTION 5: SAFETY INSTRUMENTED FUNCTIONS AND EMERGENCY SHUTDOWN

The Safety Instrumented System (SIS) is a Schneider Electric Triconex Tricon controller (TRI-1) in the CCR rack room, separate from the DCS. It is programmed from the TriStation engineering workstation TS-EWS-01. The controller key switch is kept in **RUN** and the key is held by the Shift Supervisor; **PROGRAM** is used only under an approved MOC with the OT Engineer present.

| SIF / ESD | Initiator | Action | SIL |
|---|---|---|---|
| SIF-110 | Low chlorine header pressure, high hydrogen in chlorine, rectifier fault | Trips rectifiers RX-1 to RX-4 (cell room trip) | 2 |
| SIF-120 | Hydrogen header low pressure | Closes hydrogen isolation, trips the cell room | 2 |
| SIF-210 | High pressure in liquefier E-210 or V-210 | Stops compressors K-201/K-202, vents to C-650 | 2 |
| SIF-301 | High-high level in TK-31, TK-32 or TK-33 | Closes the tank's inlet valve | 2 |
| SIF-302 | High-high railcar weight (WT-301 to WT-304) | Closes the loading arm valves on that spot | 1 |
| ESD-310 | Chlorine detectors AT-311 to AT-318 at the rail spots above 3 ppm, the ESD pushbutton in the CCR, or the field pushbuttons at each rail spot | Closes all remote-operated emergency isolation valves on LA-1 to LA-4 and the vapor return; stops nitrogen padding | 2 |
| ESD-320 | Chlorine detectors in the Chlorine Storage Building above 3 ppm, or pushbutton | Closes TK-31 to TK-33 outlet valves and the Dock 1 header; starts C-650 | 2 |
| SIF-510 | High temperature in R-501 | Stops chlorine to R-501 | 1 |
| SIF-650 | Any chlorine detector in a building above 3 ppm | Starts the scrubber C-650 fans and pumps | 1 |

The DCS shows the SIS valve states and trip status through a read-only Modbus link; the DCS cannot write to the SIS. Valve limit switches (ZSC/ZSO) are wired to the SIS; the DCS display copies the SIS state.

## SECTION 6: CONTROL SYSTEMS AND NETWORKS

### 6.1 Systems

| System | Product | Hosts |
|---|---|---|
| Distributed control system (DCS) | Emerson DeltaV (controllers DV-C1 to DV-C6) | Operator stations OWS-01 to OWS-04 (CCR), application station TVC-APP-01, engineering workstation EWS-01 |
| Safety instrumented system (SIS) | Schneider Electric Triconex Tricon (TRI-1) | TriStation workstation TS-EWS-01 |
| Process historian | AVEVA PI | TVC-PI-01 (OT DMZ) |
| Railcar scales | Local weigh indicators, Modbus to the DCS | WT-301 to WT-305 |
| Fixed gas detection | Detector controllers in the CCR, hard-wired to the SIS | AT-311 to AT-318, AT-321 to AT-326, fence-line AT-901 to AT-906 |
| Siren control | Plant siren panel in the CCR, radio link to S-1 to S-6 | SIREN-CP1 |
| Weather station | WX-1 on the Administration Building roof | Data to the DCS and to the EHS laptop |
| Business systems | SAP S/4HANA (orders, inventory, shipping), SDS system, LIMS, email (Microsoft 365) | Business network |

### 6.2 Network zones

| Zone | Contents | Connections |
|---|---|---|
| Level 1–2 Control network | DCS controllers, OWS-01 to OWS-04, EWS-01, TRI-1 and TS-EWS-01 (on a separate SIS segment through firewall FW-SIS) | Only to the OT DMZ through firewall FW-OT1 |
| OT DMZ | TVC-PI-01, patch server TVC-WSUS-OT, jump host TVC-JMP-01 | Business network through FW-OT2 |
| Business network | SAP, email, LIMS, SDS, office PCs | Internet through the corporate firewall |
| Vendor access | Ridgeline Automation (DCS and SIS integrator) connects through the corporate vendor VPN to TVC-JMP-01, then by remote desktop to EWS-01 or TS-EWS-01 | Sessions approved by the OT Engineer in the remote-access log; MFA required; sessions are supposed to be closed after each job |

### 6.3 Known gaps (from the 2025 ChemLock-based security assessment)

- F-1: Remote-access sessions to TS-EWS-01 are allowed by a standing firewall rule on FW-SIS instead of being opened per job (**open**, MOC-26-004 planned).
- F-2: The Triconex key-switch position is not alarmed in the DCS (**open**).
- F-3: Ridgeline Automation uses a shared support account `rl-support` on TVC-JMP-01 (**open**; individual accounts requested).
- F-4: Backups of DCS and SIS configurations are on an offline USB archive in the OT Engineer's safe, last copied 01/2026.

## SECTION 7: DETECTION, SIRENS AND WEATHER

| Detectors | Location | Alarm / trip |
|---|---|---|
| AT-311 to AT-318 | Rail Spot 1 to Rail Spot 4 (two per spot) | 1 ppm alarm, 3 ppm ESD-310 |
| AT-321 to AT-326 | Chlorine Storage Building and Dock 1 | 1 ppm alarm, 3 ppm ESD-320 and SIF-650 |
| AT-901 to AT-906 | Fence line (AT-904 and AT-905 on the east fence facing the Riverside Addition) | 0.5 ppm alarm, 1 ppm General Emergency criterion |

Community sirens S-1 to S-6: S-1 Gate 1, S-2 River Dock, S-3 Riverside Addition (voice), S-4 Route 9, S-5 Corbin Falls Elementary School grounds (voice), S-6 CVRR yard. Sirens are tested on the first Wednesday of each month at noon.

## SECTION 8: GATES, MUSTER POINTS AND SITE ACCESS

| Gate | Use | Staffing |
|---|---|---|
| Gate 1 | Main gate, visitors, trucks for Truck Spot 1 and Loading Rack 1 | 24-hour security officer |
| Gate 2 | Rail gate (CVRR crews) | Card reader, CCTV |
| Gate 3 | River Terminal Road, emergency vehicles | Card reader, opened from the CCR or Gate 1 |

Muster Point A (Administration Building lobby, sealable, with SCBA cache), Muster Point B (North Gate guardhouse), Muster Point C (River Dock warehouse). Access control: card readers on all gates and the CCR, visitor management at Gate 1, CCTV with 30-day retention.

## SECTION 9: UTILITIES AND BACKUP POWER

The Works is fed at 46 kV by Teague Valley Power and Light. A 2 MW diesel generator (DG-1) carries the CCR, the SIS, the DCS, the scrubber C-650, the emergency lighting and the siren panel; the rectifiers trip on loss of grid power. UPS units keep the DCS and the SIS running for 60 minutes.
