# RRTA System Map

Revision 2026-08 · Prepared by RRTA Service Planning · Reviewed: Luis Ortega (Director of Transportation)

> **Fictional document** created as sample source material for Tabletop Generator. Riverbend, Harlan County and every route, station, stop, facility and person here are invented. There is no image original; this file is the map of record for exercises.

Known layout facts from the EOP, SSEPP and Cyber Annex, listed so generated injects can be checked against them.

## Table of Contents

Section 1 Service Area · Section 2 Light Rail Lines · Section 3 Bus Routes · Section 4 Key Stops · Section 5 Facilities · Section 6 Fleet · Section 7 Power and Communications Sites · Section 8 Identifier Reference · Section 9 Data-Integrity Notes

---

## SECTION 1: SERVICE AREA

- City of Riverbend and adjoining parts of Harlan County, Ohio. Population served about 310,000.
- The Harlan River runs north–south through downtown; Mill Creek joins it from the west at Confluence Park.
- Downtown core: Central Transit Center (5th Street and Market Street), Market Square, Courthouse district, Harlan Street.
- Major trip generators: Riverbend University (east of the river), Riverbend Medical Center, Confluence Park Stadium (34,000 seats, south of downtown), Brewery District, Eastgate Mall.

## SECTION 2: LIGHT RAIL LINES

### 2.1 Blue Line (west–east, 11.2 miles, 13 stations)

| # | Station | Notes |
|---|---|---|
| 1 | Mill Creek Station | West terminus; next to Mill Creek Yard; Mill Creek Substation |
| 2 | Westbrook Station | Park-and-ride, 400 spaces |
| 3 | Fairview Station | |
| 4 | Courthouse Station | |
| 5 | Central Transit Center | Shared with Green Line; bus hub |
| 6 | Market Square Station | Shared with Green Line |
| 7 | Harlan Street Station | Shared with Green Line; tail track for 2 LRVs; Harlan Substation |
| 8 | University Station | East of the Harlan River Bridge |
| 9 | Riverbend Medical Station | Hospital entrance |
| 10 | Oak Hill Station | |
| 11 | Linden Station | |
| 12 | Maple Grove Station | |
| 13 | Eastgate Station | East terminus; Eastgate Substation; Harlan County Sheriff area |

### 2.2 Green Line (north–south, 6.8 miles, 9 stations)

| # | Station | Notes |
|---|---|---|
| 1 | Northside Station | North terminus; 0.4 miles from Northside Depot |
| 2 | Brewery District Station | |
| 3 | Central Transit Center | Shared with Blue Line |
| 4 | Market Square Station | Shared with Blue Line |
| 5 | Harlan Street Station | Shared with Blue Line |
| 6 | Riverfront Station | Riverfront Substation; trains held here during a Stadium Station platform hold |
| 7 | Stadium Station | Confluence Park Stadium; single plaza exit stair; platform about 1,200 persons |
| 8 | Confluence Station | |
| 9 | South Harbor Station | South terminus |

### 2.3 Track Facts

- Shared segment: Central Transit Center – Market Square Station – Harlan Street Station (both lines), fed by Harlan Substation and Riverfront Substation.
- Harlan River Bridge: Blue Line, between Harlan Street Station and University Station; UAS sightings reported here.
- Green Line trains reach Mill Creek Yard over the Blue Line (non-revenue moves through Central Transit Center).
- Normal headways: Blue Line 10 min peak / 15 min off-peak; Green Line 12 min / 15 min; event service on Green Line 6 min post-event.

## SECTION 3: BUS ROUTES

| Route | Name | Termini | Depot | Peak headway |
|---|---|---|---|---|
| Route 3 | Westbrook Crosstown | Westbrook Station – Northside Station | Northside Depot | 20 min |
| Route 7 | Fairview | Central Transit Center – Fairview Heights | Northside Depot | 30 min |
| Route 14 | Market Street | Central Transit Center – Eastgate Station | Northside Depot | 10 min |
| Route 18 | Stadium Shuttle / Confluence | Central Transit Center – Stadium Station | Riverfront Garage | 15 min (event extras) |
| Route 22 | Harlan Avenue | Central Transit Center – Harlan Street Station – University Station | Riverfront Garage | 10 min |
| Route 31 | Mill Creek | Mill Creek Station – Riverbend Medical Station | Northside Depot | 30 min |
| Route 41 | North–South Trunk | Northside Station – South Harbor Station | Northside Depot | 12 min |
| Route 56 | Riverfront | Central Transit Center – Riverfront Station – South Harbor Station | Riverfront Garage | 15 min |
| Route 63 | Eastgate Express | Eastgate Station – downtown (limited stops) | Northside Depot | 30 min (peak only) |
| Route 70 | County Connector | Eastgate Station – Harlan County Courthouse Annex | Riverfront Garage | 60 min |

Core routes during degraded service (Cyber Annex 5.2): **Routes 14, 22, 41 and 56**. Snow routes are defined for Routes 7, 18 and 31. Routes 63 and 70 run outside Riverbend city limits for part of their length (Harlan County Sheriff jurisdiction).

## SECTION 4: KEY STOPS

| Stop | Location | Routes |
|---|---|---|
| Stop 1001 | Central Transit Center, Bay A | Routes 7, 14 |
| Stop 1002 | Central Transit Center, Bay B | Routes 22, 56 |
| Stop 1003 | Central Transit Center, Bay C | Routes 18, 41 |
| Stop 1010 | 5th Street on-street bays (protest detour location; no CCTV) | Routes 14, 22, 41 and 56 when detoured |
| Stop 1042 | Harlan Street Station bus bay | Routes 22, 41 |
| Stop 1057 | Riverbend Medical Center main entrance | Routes 22, 31 |
| Stop 1088 | Riverfront Station | Routes 56, 18 |
| Stop 1101 | Stadium Station plaza | Route 18 |
| Stop 1120 | Northside Station | Routes 3, 41 |
| Stop 1133 | Westbrook Station park-and-ride | Routes 3, 31 |
| Stop 1150 | Eastgate Station | Routes 14, 63, 70 |
| Stop 1166 | Riverbend University, Library Circle | Route 22 |
| Stop 1178 | South Harbor Station | Routes 41, 56 |

Stop numbers run Stop 1001 to Stop 1199; about 640 stops in service.

## SECTION 5: FACILITIES

| Facility | Function | Notes |
|---|---|---|
| Central Transit Center | Main bus hub and rail transfer; Administration Building | OCC in Room 210; OCC server room Room 214; public shelter on concourse lower level |
| Northside Depot | Base for Bus 4400–4460; fuel island; backup OCC (Training Room 118) | 150 kW generator; vehicle gates fail-secure; pedestrian gate 20-minute PACS cache; CAD warm standby `RRTA-CAD-APP02` |
| Riverfront Garage | Base for Bus 2200–2235; 24 depot chargers | No generator; vehicle gates fail-safe (open) on power loss; master keys not yet re-cored |
| Mill Creek Yard | LRV storage and shop for LRV 101–112 | 1.4 miles of creek-side fence without intrusion detection; low Tracks 7–10 flood; yard tower not on backup power |
| Harlan Street Station | Shared-segment station and bus bay | Tail track holds 2 LRVs |
| Stadium Station | Event station | See SSEPP Section 8 |

Employee assembly points: Northside Depot north employee lot; Riverfront Garage river-side lot; Mill Creek Yard main gate.

### 5.1 Station Access and Equipment

| Station | Platform type | Exits | Elevators | PIDS screens | CCTV |
| --- | --- | --- | --- | --- | --- |
| Central Transit Center | 2 side platforms, underground concourse | 4 street exits | 2 | 12 | 46 cameras; gap at 5th Street bays |
| Market Square Station | Center platform | 2 | 1 | 4 | 8 |
| Harlan Street Station | Center platform plus bus bay | 2 | 1 | 6 | 10 |
| Stadium Station | Center platform, plaza gates | 1 plaza stair, 1 emergency ramp (locked, key with Platform Supervisor) | 1 | 6 | 14 |
| Riverfront Station | Side platforms | 2 | 2 | 4 | 6 |
| Mill Creek Station | Side platforms, yard lead adjacent | 2 | 1 | 2 | 4 |
| Eastgate Station | Center platform, bus loop | 2 | 1 | 3 | 5 |
| University Station | Side platforms on bridge approach | 2 | 2 | 4 | 6 |

All other stations: 2 PIDS screens, 2–4 cameras, one emergency call box per platform end (rings the OCC; not monitored 0130–0430 except by the Night Supervisor).

## SECTION 6: FLEET

| Series | Count | Type | Base |
|---|---|---|---|
| Bus 4400–4460 | 61 | 40-ft diesel-electric hybrid | Northside Depot |
| Bus 2200–2235 | 36 | 40-ft battery-electric | Riverfront Garage |
| LRV 101–112 | 12 | Low-floor articulated light-rail vehicle | Mill Creek Yard |
| ParaLink vans | 28 | Cutaway vans (not CAD/AVL; separate scheduling) | Northside Depot |

All buses and LRVs carry a vehicle logic unit, covert alarm, on-board CCTV (72-hour overwrite) and RiverPass validators.

## SECTION 7: POWER AND COMMUNICATIONS SITES

| Site | Feeds / Role | Notes |
|---|---|---|
| Mill Creek Substation | Blue Line west and Mill Creek Yard | About 40 minutes from technician base |
| Harlan Substation | Shared segment, Blue Line east to University Station | At Harlan Street Station |
| Riverfront Substation | Shared segment, Green Line south | At Riverfront Station |
| Eastgate Substation | Blue Line east end | About 40 minutes from technician base; camera has no night illumination |
| OCC | CAD/AVL, SCADA HMI, PIDS, radio consoles | 30-minute UPS, 250 kW generator |
| Radio | Harlan County 800 MHz P25; talkgroups TRANSIT-OPS 1–4, TRANSIT-POLICE, TRANSIT-MAINT | |

## SECTION 8: IDENTIFIER REFERENCE

- **Bus routes:** Route 3, Route 7, Route 14, Route 18, Route 22, Route 31, Route 41, Route 56, Route 63, Route 70 (written as "Route 14" or "Routes 14, 22, 41 and 56").
- **Light-rail lines:** Blue Line, Green Line.
- **Buses:** "Bus 4417" — valid numbers Bus 4400 to Bus 4460 and Bus 2200 to Bus 2235.
- **Light-rail vehicles:** LRV 101 to LRV 112.
- **Facilities:** Northside Depot, Riverfront Garage, Central Transit Center, Harlan Street Station, Mill Creek Yard, Stadium Station, Riverfront Station, Eastgate Station; substations named "[Place] Substation".
- **Stops:** Stop 1001 to Stop 1199 (e.g. Stop 1042).
- **Hosts:** RRTA-CAD-APP01, RRTA-CAD-APP02, RRTA-CAD-DB01, RRTA-AVL-GW01, RRTA-RADIO-GW01, RRTA-GTFS-RT01, RRTA-PIDS-SRV01, RRTA-FARE-BO01, RRTA-TP-SCADA01, RRTA-TP-HMI01, RRTA-OT-JUMP01, RRTA-PACS-SRV01, RRTA-VMS-NVR01, RRTA-VMS-NVR02, RRTA-BKP-NAS01, RRTA-LOG01, RRTA-FW-CORE01.
- **IP ranges:** 10.72.0.0/16; VLAN 10 OCC 10.72.10.0/24, VLAN 20 depots 10.72.20.0/24, VLAN 30 on-board/radio 10.72.30.0/23, VLAN 40 fare 10.72.40.0/24, VLAN 50 SCADA 10.72.50.0/24, VLAN 60 physical security 10.72.60.0/24, VLAN 90 vendor VPN 10.72.90.0/24, VLAN 100 corporate 10.72.100.0/24.
- **Phone numbers:** (555) 014-xxxx RRTA internal; (555) 016-xxxx vendors; (555) 017-xxxx City of Riverbend; (555) 018-xxxx Harlan County; (555) 019-xxxx state and federal.
- **People:** Dana Whitfield (General Manager), Luis Ortega (Director of Transportation), Renee Calloway (Chief of Transit Police), Priya Natarajan (IT/OT Manager), Marcus Bell (Communications Director), Tomasz Kowal (Emergency Manager), Gloria Pham (Chief Safety Officer), Lt. Darnell Price (Transit Police), Kenji Abe (SCADA Engineer).

## SECTION 9: DATA-INTEGRITY NOTES

Use these to spot invented details in generated material:

- There is no Route 12, Route 99, Red Line, Bus 4499, LRV 113 or Stop 2042.
- Stadium Station is on the Green Line only; the Blue Line does not serve it.
- Battery-electric buses (Bus 2200–2235) never operate out of Northside Depot.
- Traction power cannot be controlled from the backup OCC at Northside Depot.
- The Harlan River Bridge carries the Blue Line only.
