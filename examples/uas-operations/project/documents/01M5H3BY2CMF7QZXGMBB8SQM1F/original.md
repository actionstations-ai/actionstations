# Harwick UAS Operations Group — UAS Flight Operations & Safety Manual (FOM)

> **EXERCISE MATERIAL — for training use.** The organization, people, procedures, numbers, frequencies, addresses and identifiers in this document are simulated. Nothing here is a real operating procedure of any UAS program; do not use it to plan or conduct flights.

Document Control Number: HUOG-FOM-2026 · Revision 4.0 · Effective Date: 09/01/2026
Approved: Marguerite Ostrowski (General Manager) · Devin Alcott (Director of Flight Operations / Chief Remote Pilot) · Priya Natarajan (Aviation Safety Officer)

**Record of Revisions:** 3.0 — 08/15/2024 — All — Remote ID compliance, the UAS-12 flight-test protocol added · 3.1 — 05/01/2025 — Sections 6, 9 — UAS-11 VTOL procedures, lost-link timers · 4.0 — 09/01/2026 — Sections 4, 8, 10, Annex A — Crew currency, public-event restrictions, flyaway procedure rewritten after the 06/2026 UAS-05 lost-link event

## Table of Contents

Section 1 Purpose, Scope and Authority · Section 2 Organization and Responsibilities · Section 3 Crew Roles and Qualifications · Section 4 Aircraft, Payloads and Airworthiness · Section 5 Flight Planning · Section 6 Airspace, LAANC and ATC Coordination · Section 7 Flight Sites and Operating Limits · Section 8 Normal Procedures and Checklists · Section 9 Abnormal and Emergency Procedures · Section 10 Remote ID, Records and Reporting · Section 11 Safety Management · Annex A Fleet Register · Annex B Forms · Annex C Acronyms

---

## SECTION 1: PURPOSE, SCOPE AND AUTHORITY

### 1.1 Purpose

This manual sets the standard for every flight Harwick UAS Operations Group ("the Group") conducts: survey campaigns, calibration flights, crew training, fee-for-service collections and demonstrations. It exists so that a crew at the Birch Hollow Range at 0630 and a crew at Horton Field at midday make the same decisions.

### 1.2 Scope

Applies to all Group aircraft in Annex A, all Group-owned ground control stations, all persons acting as crew (employees, contract pilots, trainees, client observers) and all flights, wherever conducted. Partner-owned aircraft flown on a Group campaign fly under this manual.

### 1.3 Authority

Flights are conducted under 14 CFR Part 107, the Group's waivers (Section 6.5), the UAS-12 flight-test protocol (Section 10.1) and the conditions of the Group's aviation insurance policy and client contracts. Where this manual is stricter than a regulation, this manual applies. The Aviation Safety Officer may ground any aircraft, crew member or site.

### 1.4 Related Documents

| Document                                          | Number         | Revision |
| ------------------------------------------------- | -------------- | -------- |
| Emergency Response Plan for Flight Operations     | HUOG-ERP-2026  | 2.0      |
| Information Security Plan — GCS and Data Pipeline | HUOG-ISP-2026  | 1.3      |
| Site & Airspace Sheet                             | HUOG-SITE-2026 | 2.1      |
| Hangar Complex Emergency Procedures               | CIS-EP-2025    | 3        |
| Corporate Communications crisis protocol          | UC-CP-2025     | —        |

## SECTION 2: ORGANIZATION AND RESPONSIBILITIES

### 2.1 Positions

| Position                                                 | Holder                | Responsibilities                                                                                                                                                 |
| -------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General Manager                                          | Marguerite Ostrowski  | Accountable executive; approves this manual, client agreements and any flight outside Section 7 limits; spokesperson with Corporate Communications               |
| Director of Flight Operations (FOM) / Chief Remote Pilot | Devin Alcott          | Owns the flight schedule, crew rosters, LAANC and NOTAM review, fleet register and the go/no-go; Incident Commander for a flight-operations emergency (HUOG-ERP) |
| Aviation Safety Officer (ASO)                            | Priya Natarajan       | Owns the safety case, hazard log, waiver compliance, regulator reporting, crew currency audits; independent of the FOM; may stop any flight                      |
| Systems & Cybersecurity Lead                             | Tomás Reyes           | Owns the GCS fleet, firmware, radio configuration, networks, the data pipeline and cyber incident response (HUOG-ISP)                                            |
| Payload & Calibration Lead                               | Hannah Whitlock       | Owns payload integration, calibration procedures, ground-truth instruments and data quality                                                                      |
| Fleet & Logistics Manager                                | Owen Castellano       | Owns Hangar 1, batteries, field kits, vehicles, keys, visitor sign-in, purchasing                                                                                |
| Campaign Lead                                            | Assigned per campaign | Owns the science plan, the target layout and the client relationship for that campaign                                                                           |

### 2.2 Decision authority

| Decision                                                                                           | Authority                                                                                       |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Go / no-go for a flight day                                                                        | FOM (RPIC may always say no)                                                                    |
| Stop a flight in progress                                                                          | RPIC, VO (by calling "ABORT"), ASO                                                              |
| Fly above the Horton Field LAANC grid ceiling (Further Coordination)                               | FOM with ASO concurrence                                                                        |
| Fly a payload without a current calibration file                                                   | Payload & Calibration Lead, noted in the flight log                                             |
| Fly during a public event at the adjacent Harwick Fairgrounds within 500 ft of the event footprint | Prohibited (Section 7.6); only the General Manager may request an exception from Harwick Police |
| Accept a client site within 40 miles                                                               | FOM after a Site Survey Form (Annex B)                                                          |
| Release flight data to a client                                                                    | Campaign Lead with the Systems & Cybersecurity Lead (HUOG-ISP Section 7)                        |
| Notify the FAA, NTSB or law enforcement                                                            | ASO (FOM in the ASO's absence) per HUOG-ERP Section 6                                           |

## SECTION 3: CREW ROLES AND QUALIFICATIONS

### 3.1 Roles

- **Remote Pilot in Command (RPIC).** Holds a current Part 107 certificate, is listed on the Group roster, is current on the aircraft type (Section 3.3) and has final authority for the flight. One RPIC per aircraft; an RPIC may command only one aircraft at a time.
- **Visual Observer (VO).** Maintains unaided visual line of sight, scans for aircraft, people and vehicles, and calls "TRAFFIC", "PEOPLE" and "ABORT". Required for every flight of UAS-01, UAS-02, UAS-03, UAS-11 and UAS-12 and for every flight at Horton Field.
- **Payload Operator (PO).** Operates the sensor from PAY-01, watches the live waterfall display and data-rate indicators, and calls data-quality holds. Never touches the flight controls.
- **Ground Station Operator (GSO).** On campaigns with two aircraft airborne or with RTK, monitors telemetry, link quality, DAA-1 air traffic display and battery timers at the GCS and calls link and traffic warnings.
- **Site Safety Lead (SSL).** Controls the launch area, the cones and the public contact point; required at the Creek Test Area and at any site with public access.
- **Campaign Lead.** Decides what is collected and when; does not override the RPIC.
- **Fleet & Logistics Manager.** Issues aircraft, batteries and field kits against the schedule and the maintenance status.

A person may hold two roles only in the combinations RPIC+Campaign Lead or VO+SSL, and never on a heavy-lift aircraft.

### 3.2 Minimum crew

| Aircraft                    | Minimum crew                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| UAS-07 to UAS-10 (training) | RPIC + VO (instructor may act as VO)                                      |
| UAS-04 to UAS-06            | RPIC + VO; PO when PL-03/PL-04 flown for a client deliverable             |
| UAS-01, UAS-02, UAS-03      | RPIC + VO + PO + GSO                                                      |
| UAS-11 (VTOL)               | RPIC + VO + GSO; a second VO beyond 500 m downrange                       |
| UAS-12 (Testbed)            | RPIC + VO + GSO; the Systems & Cybersecurity Lead or a delegate at GCS-04 |

### 3.3 Currency and training

- RPIC: Part 107 certificate; FAA recurrent training within 24 months; three take-offs and landings on type within the last 90 days; night flights require the night-training module and the 107.29 waiver briefing.
- Heavy-lift endorsement (UAS-01/02/03): twenty logged flights as GSO on type and a check flight with the FOM.
- Testbed endorsement (UAS-12): the above plus the lost-link and parameter-change briefing from the Systems & Cybersecurity Lead.
- VO: the Group's two-hour VO course; renewed annually.
- Trainees fly UAS-07 to UAS-10 only, and only with an instructor present, until endorsed.
- Currency is tracked on the crew roster on the NAS (`\\HUOG-NAS01\ops\crew-roster.xlsx`); the roster is the only source the FOM uses to assign crews. A crew member whose currency lapses is removed from the roster the same day.

### 3.4 Fitness

No crew member flies within eight hours of alcohol, when fatigued, or on medication that affects alertness. Duty day is limited to 10 hours including driving; the FOM schedules Birch Hollow Range campaigns with a 0530 call and a 1500 hard stop for that reason.

## SECTION 4: AIRCRAFT, PAYLOADS AND AIRWORTHINESS

### 4.1 Fleet

The fleet register (Annex A, mirrored in the OEM fleet portal and the maintenance spreadsheet) is the list of aircraft the Group may fly. An aircraft not on the register, or marked DOWN, does not leave Hangar 1. The register records for each tail: registration number, Remote ID method and serial, firmware version, total flight hours, last inspection and open discrepancies.

### 4.2 Configuration control

- Flight-controller firmware and GCS software versions are set by the Systems & Cybersecurity Lead and recorded in the configuration baseline (HUOG-ISP Section 4). Crews do not accept OEM update prompts in the field; the GCS laptops have updates disabled outside the Tuesday update window.
- Parameter changes to UAS-11 and UAS-12 (lost-link timers, geofence, return-to-launch altitude, failsafe actions) are made only in Hangar 2 by the Systems & Cybersecurity Lead or the FOM, logged in the parameter change log, and confirmed by a hover test at Horton Field before any campaign flight.
- A geofence is loaded for every site: Horton Field 200 ft / site boundary; Birch Hollow Range flight areas 400 ft / preserve boundary excluding the Millstone County Park side.

### 4.3 Inspections

| Inspection    | When                                                                     | By                                          |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Pre-flight    | Every flight (checklist 8.3)                                             | RPIC                                        |
| 25-hour       | Every 25 flight hours                                                    | Fleet & Logistics Manager with the FOM      |
| Post-incident | After any hard landing, prop strike, lost link, flyaway or water contact | FOM and ASO; aircraft DOWN until signed off |
| Annual        | Each August                                                              | FOM, ASO, Systems & Cybersecurity Lead      |
| Payload       | Before each campaign                                                     | Payload & Calibration Lead                  |

### 4.4 Batteries

Lithium-polymer packs are stored at storage charge in the battery room of Hangar 1 in the fire-rated cabinet. Packs are logged by cycle count; a pack is retired at 200 cycles, after any puffing, after a crash, or after a cell-voltage spread over 0.1 V. Charging happens only in the battery room or in the field charging case FC-1 under observation. A pack that is hot, swollen or smoking is placed in the sand bucket (one in the battery room, one in every field kit) and the HUOG-ERP battery-fire procedure is followed.

### 4.5 Payload limits

Each payload flies only on the aircraft listed in the Site & Airspace Sheet Section 6. PL-06 (SAR) transmits only at the Quarry Flight Area under the Group's experimental radio authorization and never with people on the quarry bench. PL-02 is subject to export-control handling (HUOG-ISP Section 7.3) and is never left unattended in a vehicle.

## SECTION 5: FLIGHT PLANNING

### 5.1 Campaign plan

A campaign (one or more flight days for one purpose) requires a Campaign Plan (Annex B form FOM-1) approved by the FOM at least five working days ahead: objectives, site, flight areas, aircraft and payloads, crew by role, flight lines and altitudes, ground-truth layout, airspace and NOTAM check, weather minimums, risk assessment, client data requirements and the data-handling class (HUOG-ISP Section 7).

### 5.2 Daily flight plan

On each flight day the RPIC prepares a flight plan on form FOM-2 for each aircraft: LAANC authorization reference (Horton Field), NOTAM/TFR check time, weather observation, crew and roles, battery packs assigned, geofence confirmed, emergency landing zones, and the hard stop time. The FOM reviews it before the first launch (by phone when off base).

### 5.3 Weather minimums

| Limit                                               | Value                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Wind (steady / gust)                                | Heavy-lift 18 kt / 25 kt; mid-size and small 15 kt / 20 kt; UAS-11 20 kt / 28 kt |
| Visibility                                          | 3 statute miles                                                                  |
| Cloud clearance                                     | 500 ft below clouds, 2,000 ft horizontal                                         |
| Precipitation                                       | None; no flight within 30 minutes of lightning within 10 nm                      |
| Temperature                                         | 20 °F to 95 °F (battery and cooled-sensor limits)                                |
| Solar elevation for calibrated spectral collections | Above 30°                                                                        |

### 5.4 Risk assessment

The Campaign Plan includes a hazard list using the Group's risk matrix (likelihood 1–5 × severity 1–5). Any hazard scored 12 or higher needs a mitigation approved by the ASO. Standing hazards: people under the flight path, the Millstone County Park trail at the Creek Test Area, the lodge road, manned aircraft (the Birch Hollow Range sees low helicopter traffic along the creek), birds of prey at the quarry, and RF interference near the hangar complex roof.

## SECTION 6: AIRSPACE, LAANC AND ATC COORDINATION

### 6.1 Classes and ceilings

Horton Field is under the HWK Class C airspace with a UAS Facility Map grid ceiling of 200 ft AGL. The Birch Hollow Range flight areas are in Class G airspace below the Class C shelf with the Part 107 ceiling of 400 ft AGL. The Site & Airspace Sheet is the record; the UAS Facility Map is re-checked by the FOM each quarter and before any Further Coordination request.

### 6.2 LAANC

Each flight at Horton Field requires a LAANC authorization obtained by the RPIC in an approved application before launch, for the specific area, altitude and window. The authorization reference is written on the FOM-2 flight plan. Flying without it, or after the window closes, is a reportable event to the ASO.

### 6.3 NOTAMs and TFRs

The FOM checks NOTAMs and TFRs for the HWK area the evening before and the morning of each flight day. A stadium or VIP TFR within 30 nm stops flights until the FOM confirms the Group's site is outside it. The Group does not file NOTAMs for Part 107 operations.

### 6.4 ATC coordination

- Flights at Horton Field normally need no ATC contact beyond LAANC.
- A flyaway or loss of control that may enter the Class C surface area or exceed 400 ft is called by the RPIC to the HWK Air Traffic Control Tower on the exercise number 585-555-0199 **before** any other call, stating: aircraft type and tail, last known position and altitude, direction and speed, estimated battery time remaining, and the RPIC's callback number. The GSO keeps the DAA-1 air-traffic display up and relays any manned traffic.
- The Group monitors HWK Tower and Approach on the handheld scanner during Horton Field operations (monitor only; the Group never transmits on aviation frequencies).

### 6.5 Waivers and authorizations

| Authorization                              | Reference (exercise reference) | Conditions                                                                                        |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Part 107.29 night operations               | 107W-2026-01184                | Anti-collision lights visible 3 sm; night-trained crew; expires 08/31/2028                        |
| UAS-12 flight-test protocol                | HUOG-FTP-12, 05/2024           | Horton Field only; test flights stay within the field boundary; broadcast module RID-BM-12 fitted |
| Experimental radio authorization for PL-06 | WR-EXP-2025-0912               | Quarry Flight Area; log every transmission                                                        |

The Group holds no BVLOS, operations-over-people or Part 107.39 waiver; a request for one goes through the ASO and the General Manager.

## SECTION 7: FLIGHT SITES AND OPERATING LIMITS

### 7.1 Site register

Only the sites in the Site & Airspace Sheet (Horton Field; the Lakeshore, Quarry and Creek flight areas at the Birch Hollow Range; approved client sites) are used. A client site is added after a Site Survey Form (FOM-3) signed by the FOM and the ASO.

### 7.2 Horton Field

- Launch point HF-LP1 by the equipment shed; cones at 15 m from the aircraft; the VO stands at the field's south-east corner.
- Maximum 200 ft AGL (grid ceiling); 150 ft when the Stony Creek tree line is in leaf (VO sight line).
- No flight over the perimeter road, the parking lots or the fairgrounds to the east.
- Shift changes at the fairgrounds come at :50 past the hour; the fairgrounds path along the field's north edge fills with pedestrians — launches wait until :05.
- Crew Ch 3 reaches the flight operations desk in Hangar 2 through the roof repeater.

### 7.3 Lakeshore Flight Area (Birch Hollow Range)

- Launch point TP-LFA-LP1 at the lodge parking pad. RTK-1 on survey marker SM-L1 by the lodge.
- Flight lines run east–west over the meadow and the north shore of the lake; no flight over the lodge or the patio when guests are present (the site manager's event calendar is checked in the Campaign Plan).
- Calibration tarps CT-1 to CT-4 and the reflectance panel stand RP-1 are laid at the meadow's west end; the Payload Operator calls "PANEL CLEAR" before the first line.
- Maximum 400 ft AGL; the standard multispectral line altitude is 120 m and the MX-A hyperspectral altitude is 30 m.

### 7.4 Quarry Flight Area (Birch Hollow Range)

- Launch point TP-QFA-LP1 on the quarry bench; RTK-2 on survey marker SM-Q1.
- No people on the bench while PL-06 transmits; the SSL holds the access track.
- Poor cell coverage: the GSO confirms the FIELD-RTR-1 uplink before launch; if it is down, the flight plan's "no-uplink" procedure applies (Section 8.5).

### 7.5 Creek Test Area (Birch Hollow Range)

- Launch point TP-CTA-LP1 at the creek meadow gate; the SSL staffs the gate because Millstone County Park trail users can walk in.
- No flight across the park boundary (the geofence stops 20 m short). Flights over the creek stay below 200 ft to keep the VO sight line.

### 7.6 Public events at the adjacent Harwick Fairgrounds

The Group does not fly within 500 ft of the footprint of a public event at the adjacent Harwick Fairgrounds with an expected attendance over 1,000 (the county fair, concerts, races). Harwick Police publishes the event list each quarter; the FOM marks those days NO FLY at Horton Field. Only the General Manager may ask Harwick Police for an exception, and the Group does not provide "drone coverage" of events. During a public event at the adjacent Harwick Fairgrounds the Group's role, if any, is to help Harwick Police and its detection vendor identify whether a reported drone is a Group aircraft (HUOG-ERP Section 8.4).

### 7.7 Operations over people and vehicles

Not permitted. The flight path avoids the lodge road, the perimeter road and any gathered people by the horizontal distances in the site cards (minimum 30 m for small aircraft, 50 m for mid-size, 100 m for heavy-lift and UAS-11).

## SECTION 8: NORMAL PROCEDURES AND CHECKLISTS

### 8.1 Kit issue (Fleet & Logistics Manager)

Aircraft and payload status checked in the register; batteries issued by pack number at storage charge with the charging case; field kit (site cards, cones, fire extinguisher, sand bucket, first-aid kit, radios on Crew Ch 1, scanner, DAA-1, FIELD-RTR-1, laminated HUOG-ERP cards) signed out on the kit log.

### 8.2 Site set-up

1. SSL places cones and the public contact sign; confirms the emergency landing zones.
2. GSO stands up FIELD-RTR-1, DAA-1 and the GCS; confirms RTK fix (Lakeshore, Quarry).
3. Payload Operator lays and measures ground-truth targets; records spectrometer FS-1 readings.
4. RPIC checks weather, NOTAM/TFR and (Horton Field) LAANC; completes form FOM-2.
5. Crew briefing (Section 8.6).

### 8.3 Pre-flight checklist (per aircraft)

- Airframe: props, arms, landing gear, payload mount, no cracks; registration and Remote ID marking visible
- Batteries: correct packs, voltage, latched; pack numbers on FOM-2
- GCS: correct aircraft profile, firmware baseline, geofence and lost-link settings confirmed on the parameter screen, home point set, RTL altitude set per site card
- Links: C2 link quality above 70 % at the launch point; RTK corrections flowing; Remote ID broadcast confirmed on the GCS status page
- Payload: powered, storage media clear, PAY-01 receiving; calibration file date on FOM-2
- Site: VO in position, cones placed, people clear by the site distance, landing zone clear
- Airspace: LAANC reference (Horton Field), DAA-1 showing no traffic within 2 nm below 1,500 ft

### 8.4 Launch, flight and recovery

- Launch call: RPIC "LAUNCHING UAS-04", VO "CLEAR", GSO "LINKS GOOD".
- Hover check at 5 m: controls, GNSS satellites (minimum 12), compass, link; then climb to the plan altitude.
- During flight the GSO calls battery at 50 %, 30 % and the RTL point; the PO calls data holds; the VO calls traffic and people.
- Landing: RPIC "LANDING", VO "CLEAR"; motors disarmed before anyone approaches.
- After the last flight: logs downloaded to the GCS, batteries to storage charge, kit inventory, site swept for tarps, stakes and cones; FOM-2 completed and signed.

### 8.5 No-uplink procedure

When FIELD-RTR-1 has no cellular uplink, the crew flies the pre-loaded plan without cloud services: no OEM fleet-portal check-in, no map tiles beyond the cache, no live weather. The GSO phones the flight operations desk (585-555-0140) with the launch and landing times for the log, and the day ends at the planned hard stop regardless.

### 8.6 Crew briefing

Every flight day starts with a briefing by the RPIC covering: objectives and flight lines; roles and the abort word; site hazards and emergency landing zones; weather and the hard stop; lost-link, flyaway and fire actions from the laminated HUOG-ERP cards; the public contact plan (the SSL talks to the public, nobody else).

## SECTION 9: ABNORMAL AND EMERGENCY PROCEDURES

### 9.1 Lost link

Each aircraft's failsafe is set to **return-to-launch after 10 seconds of lost C2 link at the site's RTL altitude** (Horton Field 45 m; Birch Hollow Range 60 m), then land at the home point. The RPIC announces "LOST LINK", the GSO starts the timer and confirms the failsafe on the telemetry (if any), the VO keeps eyes on the aircraft, the PO stops the sensor. If the aircraft is not seen returning within 60 seconds, the RPIC declares a flyaway (9.2). After any lost-link event the aircraft is DOWN until a post-incident inspection and the link log is reviewed by the Systems & Cybersecurity Lead.

### 9.2 Flyaway (aircraft not responding and leaving the flight area)

1. RPIC: "FLYAWAY, UAS-xx" on Crew Ch 1; attempt RTL, then land, then motor cut-off if below 30 ft over clear ground.
2. GSO: note last position, altitude, heading, speed and battery time remaining from the telemetry; keep the Remote ID / telemetry track on screen; start a written timeline.
3. VO: keep visual contact as long as possible; call the direction and any manned aircraft.
4. RPIC: call HWK Tower (585-555-0199) if the track heads toward the Class C surface area or above 400 ft, otherwise within 5 minutes anyway; then the flight operations desk; then the ASO.
5. Crew: follow by vehicle using the last track if safe; notify CCSO (Birch Hollow Range) or Harwick Police (base) that a Group aircraft is down or loose; do not enter private property without the landowner.
6. ASO: regulatory notifications per HUOG-ERP Section 6; aircraft and GCS quarantined for the investigation (HUOG-ISP Section 9 if a link compromise is suspected).

### 9.3 GNSS degradation or spoofing suspicion

Signs: satellite count falls while the sky is clear; position jumps; RTK fix lost on both RTK-1 and the aircraft; the home point moves; DAA-1 and the GCS disagree on position. Actions: the RPIC switches to attitude/manual mode and lands at the nearest emergency landing zone using the VO; the GSO screenshots the GCS and saves the telemetry; the Systems & Cybersecurity Lead is called before anything is powered off; no further launches at the site that day.

### 9.4 Crew, bystander or aircraft emergencies

Crash, injury, fire, battery event, airspace incursion, drone sighting over the site, weather and medical emergencies are in HUOG-ERP Sections 4–8. The laminated cards in each field kit are the field version of those sections.

### 9.5 Abort criteria

Any of: VO loses sight; manned aircraft within 1 nm below 1,500 ft; a person or vehicle inside the site distance; link quality below 50 % for 10 seconds; GNSS below 8 satellites; battery at the RTL point; wind above limits; any crew member calling ABORT.

## SECTION 10: REMOTE ID, RECORDS AND REPORTING

### 10.1 Remote ID

All aircraft broadcast Remote ID (standard, or the broadcast modules RID-BM-11 on UAS-11 and RID-BM-12 on UAS-12). The RPIC confirms the broadcast on the GCS status page at pre-flight. UAS-12 flies only at Horton Field under the flight-test protocol noted on FOM-2; flying UAS-12 at the Birch Hollow Range is prohibited.

### 10.2 Records

| Record                                      | Where                                                   | Retention            |
| ------------------------------------------- | ------------------------------------------------------- | -------------------- |
| Flight logs (telemetry, GCS logs)           | GCS → `\\HUOG-NAS01\flightlogs\<year>\<tail>\`          | 5 years              |
| FOM-2 flight plans and FOM-1 campaign plans | `\\HUOG-NAS01\ops\plans\`                               | 5 years              |
| LAANC authorizations                        | Saved as PDF with the FOM-2                             | 5 years              |
| Crew roster and currency                    | `\\HUOG-NAS01\ops\crew-roster.xlsx`                     | Current + 3 years    |
| Maintenance and battery logs                | OEM fleet portal; maintenance spreadsheet; battery book | Life of the aircraft |
| Parameter change log (UAS-11, UAS-12)       | `\\HUOG-NAS01\ops\param-log.md`                         | Life of the aircraft |
| Hazard log and incident reports             | ASO folder on the NAS                                   | 10 years             |

### 10.3 Reporting

- To the FOM and ASO, same day: any lost link, flyaway, hard landing, prop strike, geofence breach, LAANC lapse, abort for traffic, public complaint, or a drone of unknown origin over a Group site.
- To the FAA (within 10 calendar days, by the ASO): any Part 107.9 accident — serious injury or loss of consciousness, or property damage over $500 other than to the aircraft.
- To the NTSB (immediately, by the ASO): any accident meeting the 49 CFR 830 criteria for unmanned aircraft.
- To the Systems & Cybersecurity Lead, immediately: suspected link interference, spoofing, GCS malware, unexpected parameter changes or any data-handling event (HUOG-ISP Section 9).

## SECTION 11: SAFETY MANAGEMENT

### 11.1 Hazard log

The ASO keeps the hazard log; any crew member may add an entry anonymously through the safety form on the Group intranet. Entries are reviewed monthly at the safety meeting (FOM, ASO, Systems & Cybersecurity Lead, Fleet & Logistics Manager, one crew representative).

### 11.2 Just culture

Reports made in good faith are not grounds for discipline; deliberate violations and flying without authorization are.

### 11.3 Exercises

The Group exercises the HUOG-ERP annually as a tabletop with Harwick Police, Corporate Communications and the managed security provider, and runs a field drill of the flyaway and battery-fire procedures each spring at Horton Field.

### 11.4 Open items (hazard log extract, 09/2026)

| Id    | Hazard                                                                                                                                    | Status                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| HL-24 | UAS-05 lost link for 38 s at the Lakeshore Flight Area on 06/14/2026; RTL functioned; cause attributed to a crew Wi-Fi hotspot on 2.4 GHz | Mitigation: hotspots banned at the launch point; crew radios only |
| HL-27 | Parameter change log for UAS-12 not updated after a lost-link timer test in 07/2026                                                       | Open — FOM to audit                                               |
| HL-29 | FIELD-RTR-1 admin password unchanged since purchase                                                                                       | Open — Systems & Cybersecurity Lead                               |
| HL-31 | Birch Hollow Range gate found open on arrival twice in 08/2026                                                                            | Open — site manager                                               |

## ANNEX A: FLEET REGISTER (SUMMARY)

See the Site & Airspace Sheet Section 4 for the fleet table. Status on 09/01/2026: UAS-01 to UAS-11 UP; UAS-12 DOWN pending the HL-27 parameter audit; UAS-05 returned to service 07/02/2026 after the HL-24 inspection. Firmware baseline: OEM aircraft 03.2026-B; UAS-11 autopilot 4.5.2; UAS-12 autopilot 4.6.0-dev (development build, Section 4.2).

## ANNEX B: FORMS

FOM-1 Campaign Plan · FOM-2 Daily Flight Plan and Log · FOM-3 Site Survey · FOM-4 Incident Report (shared with HUOG-ERP) · FOM-5 Battery Log Sheet · FOM-6 Parameter Change Record

## ANNEX C: ACRONYMS

AGL above ground level · ASO Aviation Safety Officer · ATC air traffic control · BVLOS beyond visual line of sight · C2 command and control · DAA detect and avoid · FOM Director of Flight Operations (also this manual) · GCS ground control station · GNSS global navigation satellite system · GSO Ground Station Operator · LAANC Low Altitude Authorization and Notification Capability · LWIR long-wave infrared · NOTAM Notice to Air Missions · PO Payload Operator · RPIC Remote Pilot in Command · RTK real-time kinematic · RTL return to launch · SAR synthetic aperture radar · SSL Site Safety Lead · SWIR short-wave infrared · TFR temporary flight restriction · VO Visual Observer · VNIR visible and near-infrared
