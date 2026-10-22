# Harwick UAS Operations Group — Site & Airspace Sheet

> **EXERCISE MATERIAL — for training use.** The organization, people, procedures, numbers, frequencies, addresses and identifiers in this document are simulated. Public sources consulted for realism are listed in SOURCES.md; nothing here is a real operating procedure and it must not be used for real flight planning.

Document Control Number: HUOG-SITE-2026 · Revision 2.1 · Effective 09/01/2026 · Owner: Director of Flight Operations · Reviewed annually and after any change to the FAA UAS Facility Map

This sheet is the map of record for Harwick UAS Operations Group ("the Group"), a regional unmanned-aircraft operator flying infrastructure inspection, agricultural and environmental survey, and public-safety support missions under contract. It lists the flight sites, airspace status, aircraft, ground control stations, payloads, radio channels, networks and contacts that the Flight Operations & Safety Manual (HUOG-FOM), the Emergency Response Plan (HUOG-ERP) and the Information Security Plan (HUOG-ISP) refer to. Generated injects can be checked against it.

## 1. Organization

| Item | Value |
|---|---|
| Organization | Harwick UAS Operations Group (HUOG), a Part 107 commercial operator; clients include Calder Power & Light (transmission-line inspection), the Calder Valley Agricultural Cooperative and the Calder County Sheriff's Office (public-safety support) |
| Home base | Millbrook Road hangar complex, Harwick: Hangar 2 (flight operations center and GCS room), Hangar 3 (payload integration and calibration shop), Hangar 1 (aircraft storage, battery room, roll-up door to the apron) |
| General Manager | Marguerite Ostrowski |
| Director of Flight Operations (Chief Remote Pilot) | Devin Alcott |
| Aviation Safety Officer (ASO) | Priya Natarajan |
| Systems & Cybersecurity Lead | Tomás Reyes |
| Payload & Calibration Lead | Hannah Whitlock |
| Fleet & Logistics Manager | Owen Castellano |
| Flight operations desk (Hangar 2, staffed during campaigns) | 585-555-0140 |
| Email domain (exercise) | huog.example |

## 2. Flight sites

| Site id | Name | Where | Airspace (verify before every flight) | Notes |
|---|---|---|---|---|
| HF | **Horton Field** | Mowed turf area 400 m south of the hangar complex on the Group's leased parcel, bounded by the perimeter road and the Stony Creek tree line | HWK Class C outer shelf; UAS Facility Map grid ceiling **200 ft AGL**; LAANC authorization required for every flight | Also the only site cleared for the UAS-12 Testbed flight-test protocol. Public events at the adjacent Harwick Fairgrounds use the parking lots beside the field; see HUOG-FOM 7.6 |
| TP-LFA | **Lakeshore Flight Area** | Birch Hollow Range, Dunmore: the meadow between Birch Hollow Lodge and the north shore of the lake | Class G below the HWK Class C shelf; **400 ft AGL** without LAANC; NOTAM review required | Primary multispectral / hyperspectral campaign site; calibration tarps and the reflectance panel stand live here |
| TP-QFA | **Quarry Flight Area** | Birch Hollow Range: the old sand-quarry bench on the east side of the lake | Class G; 400 ft AGL | Terrain and shadow targets; the only site cleared for SAR (PL-06) collections |
| TP-CTA | **Creek Test Area** | Birch Hollow Range: the meadow along Millstone Creek, west boundary, adjacent to Millstone County Park | Class G; 400 ft AGL; **no flight over the park boundary** | Wildlife-management and creek-monitoring flights; public trail users visible from the launch point |
| — | Off-site client sites | Within 40 miles of base by agreement | Site-specific | Require a Site Survey Form (HUOG-FOM Annex B) and the ASO's signature |

Launch points: HF-LP1 (north end of Horton Field, by the equipment shed), TP-LFA-LP1 (gravel pad at the lodge parking lot), TP-QFA-LP1 (quarry bench), TP-CTA-LP1 (creek meadow gate). Emergency landing zones are marked on the laminated site cards kept in every field kit.

Birch Hollow Range is a 180-acre former quarry property the Group leases from the Birch Hollow Lodge owners; the gate on Dunmore Road is locked outside scheduled use and the Group holds gate code card 7 (code changes quarterly). Cell coverage is good at the lodge and poor on the quarry bench. The lodge has Wi-Fi (guest network) and a locked storage closet (key on the field-kit ring).

## 3. Airspace and authorizations

- **Harwick Regional Airport (HWK)** lies several miles northwest of the hangar complex. The complex and Horton Field sit under the HWK Class C airspace; the UAS Facility Map grid over Horton Field carries a 200 ft ceiling. Flights above the grid ceiling need a Further Coordination request filed at least 72 hours ahead; the Group has never been approved above 300 ft at Horton Field.
- Birch Hollow Range is outside the Class C boundary in Class G airspace; the standard Part 107 ceiling of 400 ft AGL applies. A flyaway from the Lakeshore Flight Area heading west-northwest reaches the Class C boundary in roughly 6 km.
- Authorizations the Group operates under (exercise values): Part 107 remote pilot certificates for every RPIC; LAANC authorizations per flight at Horton Field; Part 107.29 night waiver **107W-2026-01184** (anti-collision lights, night-trained crews only); a flight-test protocol for UAS-12 at Horton Field (broadcast module RID-BM-12 fitted; test flights stay within the field boundary); no beyond-visual-line-of-sight waiver.
- ATC coordination: LAANC is the normal path. For a flyaway or loss of control that may enter Class C airspace, the RPIC calls **HWK Air Traffic Control Tower (exercise number 585-555-0199)** immediately; the ASO notifies the **FAA Harwick FSDO (exercise number 585-555-0188)** within the timelines in HUOG-ERP Section 6.
- NOTAMs: the Director of Flight Operations checks NOTAMs for the HWK area and any TFR within 30 nm before each campaign day. The Group does not file NOTAMs for routine Part 107 flights.
- Remote ID: every aircraft broadcasts Remote ID (standard, or the broadcast modules RID-BM-11 on UAS-11 and RID-BM-12 on UAS-12).

## 4. Aircraft (fleet register, HUOG-FOM Annex A)

| Tail | Name | Type | Payload capacity | Remote ID | Typical use |
|---|---|---|---|---|---|
| UAS-01 | Heron | Heavy-lift hexacopter, RTK | 5.5 kg | Standard | Carries PL-01 (multimodal) |
| UAS-02 | Osprey | Heavy-lift hexacopter, RTK | 5.5 kg | Standard | Carries PL-02 (SWIR) or PL-05 (lidar) |
| UAS-03 | Condor | Heavy-lift octocopter, RTK | 10 kg | Standard | Carries PL-06 (SAR) at the Quarry Flight Area |
| UAS-04 | Kestrel | Mid-size quadcopter | 1.5 kg | Standard | PL-03 multispectral |
| UAS-05 | Merlin | Mid-size quadcopter | 1.5 kg | Standard | PL-03 / PL-04 |
| UAS-06 | Harrier | Mid-size quadcopter | 1.5 kg | Standard | PL-07 RGB mapping |
| UAS-07, UAS-08, UAS-09, UAS-10 | Sparrow 1–4 | Small RGB quadcopters | Integrated camera | Standard | Crew training, site surveys, public-safety support |
| UAS-11 | Albatross | Fixed-wing VTOL mapping aircraft | 1.2 kg | Broadcast module RID-BM-11 | Large-area multispectral and corridor mapping at Birch Hollow Range |
| UAS-12 | Testbed | Custom development airframe (open-source autopilot) | 3 kg | Broadcast module RID-BM-12 | Autopilot and link development at Horton Field |

FAA registration numbers are on the airframes and in the fleet register (format FA3 + 7 characters, all invented). Batteries: lithium-polymer packs B-001 to B-048, logged by cycle count in the battery book; charging only in the battery room of Hangar 1 or in the field charging case FC-1.

## 5. Ground control stations and field kit

| Id | Description | Hostname / address | Used with |
|---|---|---|---|
| GCS-01 | Ruggedized laptop, Windows, mission-planning and OEM flight software, dual C2 radios | HUOG-GCS01 · 10.17.40.11 | UAS-01, UAS-02 |
| GCS-02 | Ruggedized laptop, Windows | HUOG-GCS02 · 10.17.40.12 | UAS-03, UAS-11 |
| GCS-03 | Ruggedized laptop, Windows | HUOG-GCS03 · 10.17.40.13 | UAS-04 to UAS-06 |
| GCS-04 | Ruggedized laptop, Linux, open-source ground station | HUOG-GCS04 · 10.17.40.14 | UAS-12 only |
| GCS-05, GCS-06 | Tablets with the OEM flight app | Managed devices | UAS-07 to UAS-10 |
| RTK-1, RTK-2 | RTK base stations (tripod, survey marker) | 10.17.40.21, 10.17.40.22 | RTK aircraft |
| FIELD-RTR-1 | Field router with cellular uplink and Wi-Fi | 192.168.88.1 (field LAN 192.168.88.0/24) | All field laptops |
| PAY-01 | Payload operator laptop (sensor control, live waterfall display) | HUOG-PAY01 · 10.17.40.31 | PL-01, PL-02, PL-06 |
| DAA-1 | ADS-B receiver with the air-traffic display | 192.168.88.40 | Every campaign |
| CTR-1 | Field charging case with four chargers | — | Batteries |

Flight logs, telemetry and payload data are offloaded from the GCS and payload drives to the operations NAS **HUOG-NAS01 (10.17.41.5)** and processed on **HUOG-PROC01 / HUOG-PROC02 (10.17.41.11–12)** before transfer to the data-center processing cluster **DC-HPC** (10.17.60.0/24) for calibration and client product generation.

## 6. Payloads

| Id | Payload | Notes |
|---|---|---|
| PL-01 | Multimodal payload "MX-A": hyperspectral line scanner (VNIR), RGB camera, LWIR camera, lidar, GNSS/IMU | Flown on UAS-01 at 30 m AGL |
| PL-02 | SWIR hyperspectral imager, cooled | Export-control review on file (ECR-2025-07) |
| PL-03 | Five-band multispectral camera with downwelling light sensor | UAS-04, UAS-05, UAS-11 |
| PL-04 | LWIR thermal camera | UAS-05 |
| PL-05 | Lidar scanner | UAS-02 |
| PL-06 | Ku-band synthetic aperture radar | UAS-03 only; Quarry Flight Area only; FCC experimental authorization on file (exercise reference) |
| PL-07 | RGB mapping camera | UAS-06 |

Ground truth: calibration tarps CT-1 to CT-4, reflectance panel stand RP-1, field spectrometer FS-1, two GNSS survey receivers SV-1 and SV-2. Calibration files live in `\\HUOG-NAS01\calibration\` and are versioned by date.

## 7. Radio channels (exercise values)

| Channel | Use | Frequency |
|---|---|---|
| C2 link, OEM aircraft | Command and control / video | 2.4 GHz and 5.8 GHz, frequency-hopping, OEM encryption |
| C2 link, UAS-11 and UAS-12 | Telemetry and control | 915 MHz band (902–928 MHz), 100 mW, configured network id per aircraft |
| Crew Ch 1 | Flight crew (RPIC, VO, payload operator) | UHF 461.0375 MHz, CTCSS 103.5 |
| Crew Ch 2 | Site safety / public contact | UHF 462.2625 MHz |
| Crew Ch 3 | Base-to-field (repeater at the hangar complex roof, base only) | UHF 464.5500 MHz |
| ATC monitor | HWK Tower / Approach, monitor only | As published in the Chart Supplement; the Group never transmits |
| RTK corrections | RTK-1 / RTK-2 to aircraft | 433 MHz band, 10 mW |

## 8. Networks and systems (HUOG-ISP Section 3)

- **Flight Ops VLAN** 10.17.40.0/24 — GCS laptops, RTK bases, payload laptop; no Internet except the update window.
- **Data VLAN** 10.17.41.0/24 — HUOG-NAS01, HUOG-PROC01/02, the calibration workstation HUOG-CAL01 (10.17.41.20).
- **Data Center Operations** 10.17.60.0/24 — DC-HPC login node DC-LOGIN01, scratch storage, the client transfer gateway DC-XFER01 (SFTP).
- **Field LAN** 192.168.88.0/24 behind FIELD-RTR-1 (cellular uplink).
- **Corporate** — identity (single sign-on), email, the ITSM helpdesk (IT helpdesk, exercise number 585-555-0150), the managed SOC (SecureWatch MSSP).
- Firewall **HUOG-FW01** between the Group VLANs and the office network; syslog to the MSSP SIEM.
- Fleet and maintenance tracking: the OEM fleet portal (cloud) for UAS-01 to UAS-10; the maintenance spreadsheet on the NAS for UAS-11 and UAS-12.

## 9. Contacts (exercise numbers)

| Party | Role | Number |
|---|---|---|
| Harwick Police Department | City police, first response, public event at the adjacent Harwick Fairgrounds control | 585-555-0111 |
| Calder County Sheriff's Office (CCSO) | Law enforcement at the Birch Hollow Range, drone complaints | 911 / 585-555-0120 |
| Dunmore Fire District | Fire / EMS at the Birch Hollow Range | 911 |
| HWK Air Traffic Control Tower | Flyaway / airspace incursion (exercise line) | 585-555-0199 |
| FAA Harwick FSDO | Accident / incident reporting | 585-555-0188 |
| NTSB Response Operations Center | Reportable accidents | 585-555-0177 (exercise line) |
| Corporate Communications | Media, PIO | 585-555-0160 |
| Managed SOC (SecureWatch MSSP) | Cyber incidents | 585-555-0155 |
| Compliance Officer | Controlled technology / data | 585-555-0165 |
| Birch Hollow Lodge property manager | Gate, lodge, event calendar | 585-555-0170 |
| Client: Calder Power & Light (CP&L) program office (utility inspection client) | Deliverables, data incidents | 585-555-0180 |
| Client: Calder Valley Agricultural Cooperative (CVAC) | Precision-agriculture partner | 585-555-0185 |

## 10. Data-integrity tells (features that do not exist)

Non-existent features (data-integrity tells for scenarios): there is no thirteenth aircraft (a "UAS 13" does not exist), no seventh ground control station ("GCS 07" does not exist), no Hangar 4, no payload PL 08, no RTK 3, no Crew Ch 4, no "North Field", no second lodge and no Group helicopter. The Group holds no BVLOS waiver and owns no counter-UAS equipment (detection at public events at the adjacent Harwick Fairgrounds is provided by the Harwick Police Department's contracted detection vendor, see HUOG-ERP 8.4). The Group does not own an aircraft registered with an N-number.
