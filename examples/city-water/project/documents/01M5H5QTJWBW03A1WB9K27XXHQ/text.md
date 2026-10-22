# City of Millbrook Department of Water & Sewer — System Map and Asset Sheet

Document Control Number: MDWS-MAP-2026 · Revision 4.0 · Effective Date: 02/01/2026 · Maintained by: Tom Okonkwo (Distribution Superintendent) and Priya Nandakumar (SCADA / IT Security Manager)

> **EXERCISE MATERIAL — for training use.** The City of Millbrook, its people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

This sheet is the map of record for the Millbrook water system. The Emergency Response Plan (MDWS-ERP-2026), the OT / Cybersecurity Plan (MDWS-OTSEC-2026), the SCADA System Description (MDWS-SCADA-APP-A) and the Public Communications Plan (MDWS-PCP-2026) use the identifiers below exactly as written here.

## 1. System at a Glance

| Item | Value |
|---|---|
| Owner / operator | City of Millbrook, Department of Water & Sewer (DWS) |
| Public water system ID | OH-CARVER-0418 (community water system) |
| Population served | 68,400 (24,500 service connections) in Millbrook and three townships of Carver County, Ohio |
| Sources | Millbrook River (surface water, **Intake Structure 1** at river mile 12.4) and the Orchard Wellfield (**Wells W-1, W-2, W-3**, 1.2 MGD each) |
| Treatment | **Riverside Water Treatment Plant** (RWTP), conventional: rapid mix, flocculation, sedimentation, dual-media filtration, chlorination (sodium hypochlorite), pH adjustment (sodium hydroxide), fluoridation |
| Rated capacity | 16.0 MGD; average day 9.5 MGD; summer peak day 14.1 MGD (July 2025) |
| Storage | **Clearwell 1** (1.5 MG) and **Clearwell 2** (1.0 MG) at the plant; **Hilltop Tank** (elevated, 1.0 MG); **Orchard Standpipe** (0.75 MG); **Northgate Reservoir** (ground storage, 2.0 MG) |
| Pumping | **High Service Pump Station** (at RWTP), **Northgate Booster Station**, **Mill Road Booster Station**, **Eastfield Pump Station** |
| Pressure zones | **Zone 1** (Valley), **Zone 2** (Hilltop), **Zone 3** (Northgate) |
| Distribution | 410 miles of main (6-inch to 36-inch), 3,120 hydrants, 2,860 valves, AMI meters on 97 % of services |
| Control system | AquaSight SCADA (Kessler Controls, integrator); 6 plant PLCs, 7 remote RTUs, 900 MHz licensed radio telemetry with cellular backup at two sites |
| Interconnections | Carver County Water District at Mill Road (4.0 MGD emergency supply, normally closed); City of Fairhaven at Eastfield (2.0 MGD, normally closed) |
| Primacy agency | Ohio EPA, Division of Drinking and Ground Waters (DDAGW), Central District Office |

## 2. Map of Record (described)

The system map (sheet MDWS-MAP-2026-1, 36 × 48 in, in the Control Room, the Distribution Office and every DWS truck) shows:

- **Riverside Water Treatment Plant**, 1400 River Road, on the west bank of the Millbrook River at the south edge of downtown. Intake Structure 1 is 600 ft upstream of the plant on the same bank. The plant site holds Clearwells 1 and 2, the High Service Pump Station, the Chemical Building, the Administration / Lab Building and the SCADA Control Room.
- **Zone 1 (Valley)**, hydraulic grade 940 ft: downtown, the Millbrook General Hospital campus (Oak Street), the Carver Kidney Center (dialysis, Market Street), Millbrook City Schools, the River Road industrial corridor including Harvest Ridge Foods (a 1.1 MGD food-processing customer). Fed directly by the High Service Pump Station. No elevated storage of its own; Zone 1 pressure is held by the High Service pumps and the Hilltop Transmission Main.
- **Zone 2 (Hilltop)**, hydraulic grade 1,012 ft: the residential plateau east of the river, 60 % of the service connections. Fed through the 24-inch **Hilltop Transmission Main** (River Road to Hilltop Tank, 3.1 miles, 1968 cast iron, lined 2004) and from the Orchard Wellfield through the Orchard Standpipe. Hilltop Tank floats on Zone 2 and is the zone's pressure reference.
- **Zone 3 (Northgate)**, hydraulic grade 1,085 ft: the northern plateau, the Northgate Industrial Park and Carver Community College. Fed only from Northgate Reservoir through the Northgate Booster Station; Northgate Reservoir is filled from Zone 2 by an altitude valve (ALV-301).
- **Mill Road Booster Station** lifts Zone 1 water into Zone 2 when Hilltop Tank cannot keep up (summer, or a Hilltop Transmission Main outage), and houses the 12-inch Carver County Water District interconnect (valve IC-1, normally closed, two-person operation).
- **Eastfield Pump Station** is a pressure-sustaining station on the Zone 1 eastern loop serving the Eastfield subdivision and the City of Fairhaven interconnect (valve IC-2, normally closed).
- Radio: the plant telemetry mast (120 ft) reaches the **Hilltop Tank repeater**; Orchard Standpipe, Northgate Reservoir / Booster Station and Mill Road Booster Station are reached only through the Hilltop repeater. Eastfield Pump Station and the Hilltop Tank site also have cellular modems.

## 3. Facilities

### 3.1 Riverside Water Treatment Plant (RWTP), 1400 River Road

| Area | Equipment and tags | Control |
|---|---|---|
| Intake Structure 1 | Bar screens, two traveling screens; raw water pumps **P-101, P-102, P-103** (6,000 gpm each, two duty one standby); raw turbidity AIT-101; river level LIT-101 | PLC-01 (intake) via fiber; RTU-07 at the intake structure |
| Rapid mix / flocculation | Flash Mix Basin TK-110; **Alum Feed System** ALUM-FC-205; **Polymer Feed System** POLY-FC-206; Flocculation Basins 1 and 2; Sedimentation Basins 1 and 2 | PLC-02 (chemical feed) |
| Filtration | **Filters 1–6**, dual media (anthracite over sand), 2.8 MGD each; filter effluent valves FV-301 to FV-306; combined filter effluent turbidity AIT-310; backwash pumps BW-1, BW-2 | PLC-03 (Filters 1–3), PLC-04 (Filters 4–6 and backwash) |
| Chemical Building | **Hypochlorite Feed System** (12.5 % sodium hypochlorite; pre-chlorination CL2-FC-201 and post-chlorination CL2-FC-202; two 6,000-gal bulk tanks); **Caustic Feed System** (25 % sodium hydroxide; NAOH-FC-203; 4,000-gal bulk tank); **Fluoride Feed System** (fluorosilicic acid; F-FC-204; 2,000-gal tank); Permanganate Feed System (seasonal) | PLC-02; HMI MBW-HMI-02 in the Chemical Building |
| Clearwells | **Clearwell 1** (1.5 MG, LIT-401) and **Clearwell 2** (1.0 MG, LIT-402); finished water analyzers: chlorine residual AIT-301, pH AIT-302, fluoride AIT-303, turbidity AIT-304 | PLC-05 |
| High Service Pump Station | **HSP-1, HSP-2, HSP-3** (6,500 gpm each, VFD, two duty one standby); discharge pressure PIT-501; plant flow FIT-501 (magmeter, 36-inch) | PLC-05; HMI MBW-HMI-03 |
| Plant utilities | Dual utility feeds, 1,250 kW standby generator DG-1 (72 h fuel), UPS for SCADA (4 h); air compressors | PLC-06 |
| Administration / Lab Building | SCADA Control Room (MBW-HMI-01), water quality laboratory (LIMS), Plant Superintendent's office, 24-hour operator | — |

### 3.2 Remote Sites

| Site | Address | Assets and tags | Telemetry |
|---|---|---|---|
| **Hilltop Tank** | 2200 Summit Drive | Elevated tank 1.0 MG, overflow el. 1,012 ft; level LIT-601 (radar) and LIT-602 (pressure, backup); altitude/drain valve; roof hatch switch ZS-601; radio repeater RP-1; site cameras CAM-11, CAM-12 | **RTU-01**; 900 MHz radio to plant and repeater; cellular backup |
| **Orchard Standpipe** | 870 Orchard Road | Standpipe 0.75 MG; level LIT-611; chlorine residual analyzer AIT-611 at the outlet; roof hatch switch ZS-611 (**out of service**, WO-24-1187); fence gate contact ZS-612; camera CAM-13 | **RTU-02**; radio through Hilltop repeater |
| **Orchard Wellfield** | 900 Orchard Road | Wells W-1, W-2, W-3 (submersible, 1.2 MGD each); wellfield hypochlorite feed CL2-FC-611; flow FIT-611 | **RTU-06**; radio through Hilltop repeater |
| **Northgate Reservoir / Northgate Booster Station** | 4100 Northgate Parkway | Ground storage 2.0 MG; level LIT-621; altitude valve ALV-301; booster pumps **BP-301, BP-302, BP-303** (2,100 gpm each, VFD); discharge pressure PIT-621; Zone 3 pressure PIT-622; cameras CAM-14, CAM-15 | **RTU-03**; radio through Hilltop repeater |
| **Mill Road Booster Station** | 1350 Mill Road | Booster pumps **BP-401, BP-402** (3,000 gpm each); suction PIT-631, discharge PIT-632; Carver County Water District interconnect valve IC-1 and meter FIT-631; camera CAM-16 | **RTU-04**; radio through Hilltop repeater |
| **Eastfield Pump Station** | 2900 Eastfield Boulevard | Pumps **P-501, P-502** (1,500 gpm each); pressure-sustaining valve PSV-501; Fairhaven interconnect valve IC-2 and meter FIT-641; camera CAM-17 | **RTU-05**; **cellular modem only** (no radio path) |
| **Intake Structure 1** | River Road, 600 ft upstream of RWTP | Screens, river level LIT-101, raw turbidity AIT-101, intake gates G-1, G-2; camera CAM-18 | **RTU-07**; fiber to PLC-01 |

### 3.3 Pressure Zones

| Zone | HGL | Storage | Supply | Critical customers |
|---|---|---|---|---|
| **Zone 1** (Valley) | 940 ft | None (Clearwells at the plant) | High Service Pump Station | Millbrook General Hospital, Carver Kidney Center, Harvest Ridge Foods, downtown, Fire Station 1 |
| **Zone 2** (Hilltop) | 1,012 ft | Hilltop Tank, Orchard Standpipe | Hilltop Transmission Main; Orchard Wellfield; Mill Road Booster Station | 14,700 residential connections, Millbrook High School, Summit Care nursing home |
| **Zone 3** (Northgate) | 1,085 ft | Northgate Reservoir | Northgate Booster Station only | Northgate Industrial Park, Carver Community College, Fire Station 3 |

Minimum acceptable pressure anywhere in the system is 20 psi (Ohio EPA standard); normal operating range is 45–85 psi. Pressure below 20 psi in a zone, a main break that depressurizes an area, or loss of disinfection are the conditions that start the public-notice decision in ERP Section 9.

## 4. Control System Summary

| Element | Identifier | Location / notes |
|---|---|---|
| SCADA servers | MBW-SCADA-SRV01 (primary), MBW-SCADA-SRV02 (hot standby) | Control Room server rack; AquaSight 7.2 |
| HMIs | MBW-HMI-01 (Control Room), MBW-HMI-02 (Chemical Building), MBW-HMI-03 (High Service Pump Station) | Operator workstations |
| Engineering workstation | MBW-EWS-01 | PLC programming; Control Room |
| Historian | MBW-HIST-01 | SCADA DMZ |
| Jump host | MBW-JUMP-01 | SCADA DMZ; the only approved vendor remote-access path (OT Plan Section 6) |
| Firewall | MBW-FW-01 | Between the business LAN, the SCADA DMZ and the control network |
| Plant PLCs | PLC-01 to PLC-06 | Functions in Section 3.1 |
| Remote RTUs | RTU-01 to RTU-07 | Sites in Section 3.2 |
| Business systems | MBW-CIS-01 (billing / CIS), MBW-AMI-01 (AMI head-end), MBW-LIMS-01, MBW-GIS-01, MBW-FS-01 (file server), MBW-BKP-01 (backup), MBW-DC-01 / MBW-DC-02 (domain controllers) | City Hall data center and the RWTP Administration Building |
| Security systems | MBW-PACS-01 (badge system), MBW-NVR-01 (video recorder), cameras CAM-01 to CAM-18 | Security VLAN |

Full addressing, tag lists, setpoint limits and the alarm philosophy are in MDWS-SCADA-APP-A.

## 5. Key Staff and Numbers

| Role | Name | Office / mobile |
|---|---|---|
| Director of Water Operations | Denise Albrecht | (555) 031-2200 / (555) 034-1101 |
| Plant Superintendent, RWTP | Ray Castellano | (555) 031-2240 / (555) 034-1122 |
| Distribution Superintendent | Tom Okonkwo | (555) 031-2260 / (555) 034-1133 |
| SCADA / IT Security Manager | Priya Nandakumar | (555) 031-2280 / (555) 034-1144 |
| Water Quality Manager (Compliance) | Marcus Oyelaran | (555) 031-2230 / (555) 034-1155 |
| Laboratory Supervisor | Elena Vasquez | (555) 031-2232 |
| Security & Emergency Manager | Luis Ferreira | (555) 031-2290 / (555) 034-1166 |
| Public Information Officer (City Communications Director) | Hannah Weiss | (555) 031-2100 / (555) 034-1177 |
| City IT Director | Kevin Marsh | (555) 031-2300 / (555) 034-1188 |
| City Manager | Gloria Tennant | (555) 031-2000 |
| Mayor | Robert Kline | (555) 031-2001 |
| RWTP Control Room (24 h) | Duty operator | (555) 031-2244 |
| Distribution on-call | Rotating | (555) 034-1199 |
| Customer Service (business hours) | DWS Customer Service | (555) 031-2222 |

## 6. Quick Reference

Plant: Riverside Water Treatment Plant (RWTP), 1400 River Road · Zones 1, 2, 3 · Tanks: Hilltop Tank, Orchard Standpipe, Northgate Reservoir, Clearwell 1, Clearwell 2 · Pump stations: High Service Pump Station, Northgate Booster Station, Mill Road Booster Station, Eastfield Pump Station · Wells W-1 to W-3 · PLC-01 to PLC-06 · RTU-01 to RTU-07 · Chemical feed: Hypochlorite, Caustic, Fluoride, Alum, Polymer · SCADA 10.72.x.x / Business 10.73.x.x · Interconnects IC-1 (Mill Road), IC-2 (Eastfield)
