# Harwick UAS Operations Group — Emergency Response Plan for Flight Operations (ERP)

> **EXERCISE MATERIAL — for training use.** The organization, people, procedures, numbers, frequencies, addresses and identifiers in this plan are simulated. The telephone numbers are exercise numbers and do not reach any real agency.

Document Control Number: HUOG-ERP-2026 · Revision 2.0 · Effective Date: 09/01/2026 Approved: Marguerite Ostrowski (General Manager) · Priya Natarajan (Aviation Safety Officer, plan owner) · Lt. Marcus Bellamy (Harwick Police Department, concurrence) · Celeste Marrow (Corporate Communications, concurrence)

**Record of Revisions:** 1.0 — 09/01/2024 — All — First issue · 1.1 — 03/15/2025 — Section 7 — Birch Hollow Range access and CCSO liaison · 2.0 — 09/01/2026 — Sections 3, 5, 6, 8, Annex A — Incident levels, airspace-incursion and base-event procedures, notification timelines aligned with the FOM Rev 4.0

## Table of Contents

Section 1 Purpose and Scope · Section 2 Concept of Operations · Section 3 Incident Levels · Section 4 Crash, Hard Landing and Property Damage · Section 5 Injury and Medical · Section 6 Notifications · Section 7 Fire and Battery Events · Section 8 Flyaway, Airspace Incursion and Unknown Drones · Section 9 Site-Specific Procedures · Section 10 Public Information · Section 11 Recovery, Investigation and Records · Annex A Contact List · Annex B Incident Report Form · Annex C Field Cards

## SECTION 1: PURPOSE AND SCOPE

### 1.1 Purpose

This plan tells the crew in the field, the flight operations desk and the Group leadership what to do in the first minutes and hours after a flight-operations emergency, who to call and in what order, and who speaks for the Group. It protects people first, then the public and property, then the aircraft and data, then the mission schedule.

### 1.2 Scope

Covers every flight the Group conducts under the Flight Operations & Safety Manual (HUOG-FOM) at Horton Field, the Birch Hollow Range flight areas and client sites, and events in Hangar 1 and Hangars 2 and 3 that involve aircraft, batteries or payloads. Cyber incidents affecting the ground control stations, links or the data pipeline are handled under the Information Security Plan (HUOG-ISP) Section 9; where both plans apply (a flyaway with a suspected link compromise), this plan's Incident Commander leads and the Systems & Cybersecurity Lead runs the technical investigation.

### 1.3 Relationship to base and county plans

The Group is a tenant of the city emergency management structure: Harwick Police Department is the first responder at the base and activates the city emergency plan; at the Birch Hollow Range the first responders are the Dunmore Fire District and the Calder County Sheriff's Office (CCSO), reached through 911. Corporate Communications owns all external messaging under the crisis protocol UC-CP-2025. The Group never speaks to the media directly.

## SECTION 2: CONCEPT OF OPERATIONS

### 2.1 Incident Commander

The **Director of Flight Operations (Devin Alcott)** is the Group's Incident Commander (IC) for any flight-operations emergency. Until the FOM is reached, the **RPIC of the affected aircraft** is the on-scene lead and may take every action in Sections 4–8. The **Aviation Safety Officer (Priya Natarajan)** is the notifications and regulatory lead and may assume IC when the FOM is unavailable. The **General Manager** is the accountable executive and the only person who authorizes statements through Corporate Communications.

### 2.2 Group incident team

| Position                          | Holder                                                         | Alternate                  |
| --------------------------------- | -------------------------------------------------------------- | -------------------------- |
| Incident Commander                | Director of Flight Operations                                  | Aviation Safety Officer    |
| Safety and notifications          | Aviation Safety Officer                                        | General Manager            |
| Technical lead (links, GCS, data) | Systems & Cybersecurity Lead (Tomás Reyes)                     | Payload & Calibration Lead |
| Site and logistics                | Fleet & Logistics Manager (Owen Castellano)                    | Campaign Lead              |
| Liaison to Harwick Police / CCSO  | Fleet & Logistics Manager                                      | Aviation Safety Officer    |
| Communications liaison            | General Manager with Corporate Communications (Celeste Marrow) | —                          |
| Scribe                            | Flight operations desk trainee assistant                       | GSO                        |

### 2.3 Where the team works

Hangar 2 (flight operations desk, 585-555-0140) is the Group's incident room; it has the fleet register, the site cards, the radio base on Crew Ch 3 and the shared incident log (`\\HUOG-NAS01\ops\incident-log\`). If Hangar 2 is unavailable (fire, evacuation, network outage) the team works from the hangar complex conference room on phones, with the paper copy of this plan from the FOM's go-bag.

### 2.4 Incident log

The scribe keeps a timed log from the first call: who reported, what was seen, each decision, each notification (who, when, by whom, what was said). The log is the basis for the Incident Report (Annex B), the FAA/NTSB record and the client notification; nothing is deleted from it.

## SECTION 3: INCIDENT LEVELS

| Level                        | Definition                                                                                                                                                                                                                                                                                                                                                         | Declared by      | Response                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Level 1 — Abnormal event** | Lost link with successful RTL; hard landing without damage beyond props; geofence hold; LAANC lapse; public complaint; an unknown drone seen near a Group site; battery warning without heat                                                                                                                                                                       | RPIC             | Flight day may continue after the RPIC and FOM agree; same-day report to the FOM and ASO; aircraft inspected if involved                                                            |
| **Level 2 — Incident**       | Crash or hard landing with airframe or payload damage; flyaway recovered within the flight area; minor injury treated on site; battery smoke or fire contained; drone of unknown origin repeatedly over a Group site; GNSS or link interference suspected; a Group aircraft outside its geofence                                                                   | RPIC or FOM      | Flights stop at the site; IC and incident team activated; notifications per Section 6; aircraft and GCS quarantined                                                                 |
| **Level 3 — Emergency**      | Flyaway leaving the flight area or heading toward the Class C airspace or any manned aircraft; any injury needing EMS; fire not immediately contained; crash onto a road, a building, the lodge, Millstone County Park or private property; any event during a public event at the adjacent Harwick Fairgrounds; any event likely to draw media or law enforcement | RPIC, FOM or ASO | 911 first; all Group flights stop; Harwick Police or CCSO on scene; General Manager and Corporate Communications notified within 15 minutes; regulatory notifications per Section 6 |

A level may be declared directly. The IC may raise a level at any time; only the IC lowers one.

## SECTION 4: CRASH, HARD LANDING AND PROPERTY DAMAGE

### 4.1 Immediate actions (crew)

1. RPIC: "AIRCRAFT DOWN" on Crew Ch 1; disarm if possible; all other aircraft land.
2. VO/SSL: keep people 15 m from the aircraft; batteries may be damaged.
3. Check for injuries (Section 5) before touching the aircraft.
4. Photograph the aircraft and the scene before moving anything; note the GCS screen (screenshot, time).
5. Only after the battery is confirmed cool: remove the packs to the sand bucket, recover the payload storage media, bag the aircraft.
6. Do not restart, re-arm or power-cycle the GCS; the Systems & Cybersecurity Lead needs the state.

### 4.2 Damage to property

- On base: Harwick Police (585-555-0111) takes the report and notifies Facilities; the Fleet & Logistics Manager documents the damage.
- At the Birch Hollow Range: the site manager (585-555-0170); damage to the lodge, the patio, docks or the property's fences goes to the IC the same hour.
- Private property or Millstone County Park: the crew does not enter without the owner or a deputy; CCSO is called to make contact; the Fleet & Logistics Manager handles the claim through the Group's insurer and risk manager.
- Damage over $500 to property other than the aircraft is an FAA-reportable accident (Section 6.2).

### 4.3 Water recovery

An aircraft in the lake or Millstone Creek is not recovered by the crew. The IC calls the site manager and CCSO; recovery uses the property's boat with life jackets or waits for the sheriff's marine unit. A wet lithium battery is treated as a fire risk for 24 hours.

## SECTION 5: INJURY AND MEDICAL

1. Call 911 for any injury beyond first aid, any loss of consciousness, any prop laceration to the face, neck or torso, any burn from a battery.
2. First aid from the field kit; the SSL meets the ambulance at the gate (Birch Hollow Range: the Dunmore Road gate, code card 7; Horton Field: the perimeter road by the equipment shed).
3. Notify Harwick Police (base) in parallel with 911; at the Birch Hollow Range 911 brings Dunmore Fire District EMS and CCSO.
4. The IC notifies the General Manager; for a trainee, the Human Resources is informed through the General Manager; for a staff member, Human Resources.
5. A serious injury or loss of consciousness is FAA-reportable within 10 days and NTSB-notifiable immediately (Section 6.2).

## SECTION 6: NOTIFICATIONS

### 6.1 Notification order

| Order | Who                                                        | When                                                                                                                                                                     | By whom                                |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1     | 911 (fire, EMS, law enforcement)                           | Immediately for Level 3 with injury, fire or a public hazard                                                                                                             | Anyone                                 |
| 2     | HWK Air Traffic Control Tower (exercise line 585-555-0199) | Immediately for a flyaway or loss of control that may enter the Class C surface area or exceed 400 ft AGL; otherwise within 5 minutes of any flyaway                     | RPIC                                   |
| 3     | Flight operations desk (585-555-0140) → FOM (IC)           | Immediately                                                                                                                                                              | RPIC or GSO                            |
| 4     | Harwick Police Department (585-555-0111)                   | Immediately for any Level 2 or 3 at the base; within 15 minutes for a Birch Hollow Range Level 3                                                                         | Fleet & Logistics Manager or IC        |
| 5     | CCSO (911 or 585-555-0120)                                 | Immediately for a Birch Hollow Range Level 3; for any aircraft lost outside the property; for any unknown drone that persists (Section 8.4)                              | IC or SSL                              |
| 6     | Aviation Safety Officer                                    | Within 15 minutes of any Level 2 or 3                                                                                                                                    | IC                                     |
| 7     | General Manager                                            | Within 15 minutes of any Level 3; same day for Level 2                                                                                                                   | ASO                                    |
| 8     | Corporate Communications (585-555-0160)                    | Within 15 minutes of any Level 3 or any event with a witness, a post or a reporter                                                                                       | General Manager                        |
| 9     | Systems & Cybersecurity Lead                               | Immediately for any lost link, flyaway, GNSS anomaly, unexpected parameter change or GCS behaviour; within 1 hour otherwise                                              | IC                                     |
| 10    | managed SOC (585-555-0155)                                 | Within 1 hour when a cyber cause is suspected (HUOG-ISP Section 9)                                                                                                       | Systems & Cybersecurity Lead           |
| 11    | Client program office                                      | Within 24 hours when client data, a client deliverable or a client-owned instrument is affected; immediately if client data may have been exposed (HUOG-ISP Section 7.5) | General Manager with the Campaign Lead |
| 12    | Compliance Officer (585-555-0165)                          | Same day when PL-02 or controlled data is lost, stolen or exposed                                                                                                        | Systems & Cybersecurity Lead           |

### 6.2 Regulatory notifications (ASO)

- **NTSB** (exercise line 585-555-0177): immediately, by telephone, for an unmanned-aircraft accident meeting 49 CFR 830.5 (death or serious injury, or substantial damage to the aircraft when it weighs 300 lb or more — none of the Group's aircraft do — or any aircraft involved in a collision with a manned aircraft).
- **FAA** (Harwick FSDO exercise line 585-555-0188, and the DroneZone accident report): within 10 calendar days for any Part 107.9 accident (serious injury or loss of consciousness; property damage over $500 other than to the aircraft).
- **FAA** also receives a courtesy call the same day for any flyaway that entered controlled airspace or caused an ATC advisory, any Remote ID failure in flight, and any LAANC violation.
- **FCC**: through the Systems & Cybersecurity Lead when an interference event involving PL-06 or the 915 MHz links is suspected.
- The ASO keeps a copy of every notification in the incident folder with the time, the person reached and the reference number given.

### 6.3 What to say

Callers use the field card script: who you are, what happened (facts only), where, when, what you have done, what you need, your callback number. Nobody speculates about cause, blame, cyber attack or client impact on a call to an outside party; those words come only from the General Manager through Corporate Communications or from the ASO in a regulatory report.

## SECTION 7: FIRE AND BATTERY EVENTS

### 7.1 Battery fire in the field

1. "BATTERY FIRE" on Crew Ch 1; everyone upwind, 10 m.
2. Do not try to extinguish a lithium battery fire with the dry-chemical extinguisher alone: use the sand bucket to smother a single pack; the extinguisher is for grass and gear around it.
3. Call 911 if the fire spreads to vegetation, a vehicle, the lodge or any structure; the Birch Hollow Range meadows burn in August.
4. Keep the pack in the sand for 24 hours; transport only in the field charging case's fire bag.
5. Level 2 minimum; Level 3 if 911 is called.

### 7.2 Fire in Hangar 1 or the battery room

Pull the alarm, evacuate per the Hangar Complex Emergency Procedures (CIS-EP-2025), call 911 and Harwick Police. Tell the fire department that the battery room holds lithium-polymer packs (B-001 to B-048, in the fire-rated cabinet) and that PL-02 contains a cooled sensor with a pressurized cooler. The Fleet & Logistics Manager brings the chemical inventory sheet to the assembly point.

### 7.3 Smoking or swollen pack

A pack that is hot, swollen or venting is placed in the sand bucket with gloves and watched for 30 minutes; the pack number is marked RETIRED in the battery book; the IC is told the same day (Level 1 unless it ignites).

## SECTION 8: FLYAWAY, AIRSPACE INCURSION AND UNKNOWN DRONES

### 8.1 Flyaway (HUOG-FOM 9.2 is the crew procedure; this section is the incident side)

- The incident is Level 3 as soon as the aircraft leaves the flight area or heads toward the HWK Class C surface area.
- The IC confirms the HWK Tower call was made and logs the time; the ASO calls the FSDO the same day.
- The Fleet & Logistics Manager contacts CCSO (Birch Hollow Range) or Harwick Police (base) with the last known track; crews search by vehicle; a Group aircraft found by the public is recovered only with a deputy present if it is on private property.
- The Systems & Cybersecurity Lead quarantines the GCS and any radio involved and retrieves the full telemetry and link logs before power-off (HUOG-ISP Section 9.4).
- The IC decides, with the ASO, whether other aircraft of the same type or firmware stay grounded until the cause is known. After the HL-24 event in June 2026 the whole mid-size fleet was grounded for two days.

### 8.2 Airspace incursion by a Group aircraft

An aircraft above its authorized ceiling, outside its LAANC area, inside the Class C surface area without authorization, or within 1 nm of a manned aircraft: the RPIC lands immediately; the RPIC calls HWK Tower if the aircraft is or was inside controlled airspace; the ASO reports to the FSDO the same day; the flight day ends; the Incident Report records the telemetry.

### 8.3 Near-miss with a manned aircraft

The VO's "TRAFFIC" call followed by an immediate descent is the standard action. Any pass closer than 500 ft is Level 3: the RPIC lands, calls HWK Tower with the time, position and the description of the aircraft, and the ASO files a report through the FSDO. The Group's aircraft logs and DAA-1 recording are preserved.

### 8.4 Unknown drone over a Group site or during a public event at the adjacent Harwick Fairgrounds

- The Group has no counter-UAS capability and **does not interfere with, capture, jam, or fly at another aircraft**. Interfering with an aircraft is a federal offense regardless of who flies it.
- Over a Group site: the RPIC lands Group aircraft; the SSL photographs the drone and looks for the operator (most operators are within 500 m with a controller in hand); the GSO notes whether the GCS or DAA-1 shows any Remote ID broadcast nearby; the IC calls CCSO (Birch Hollow Range) or Harwick Police (base) if the drone persists more than 10 minutes, flies over people, or returns. Level 1; Level 2 when it persists or interferes with a client collection.
- During a public event at the adjacent Harwick Fairgrounds: Harwick Police is the lead and uses its contracted detection vendor's console. The Group's only roles are to confirm whether any Group aircraft is airborne (the flight operations desk answers from the schedule and the fleet register within 5 minutes) and, if asked, to lend an RPIC to Harwick Police's command post to interpret Remote ID data. Group aircraft do not launch to look for or identify another drone. The General Manager joins the Harwick Police call when a reported drone is suspected to be a Group aircraft.
- The IC records the event; a persistent or repeated unknown drone over the Birch Hollow Range is reported to the FSDO by the ASO with the photographs and any Remote ID data.

### 8.5 Interference, GNSS anomalies and suspected link compromise

Treat as Level 2. Land all aircraft; preserve the GCS state; call the Systems & Cybersecurity Lead before anything is powered down; no further launches at the site that day; the HUOG-ISP incident playbook (Section 9) runs in parallel. If an aircraft responded to commands the crew did not send, or flew a path no one planned, the IC declares Level 3, the HWK Tower call applies if the aircraft is still airborne near controlled airspace, and the managed SOC and the FSDO are notified the same day.

## SECTION 9: SITE-SPECIFIC PROCEDURES

### 9.1 Horton Field (base)

- First responders: Harwick Police (585-555-0111) and Harwick Fire/EMS; ambulance access from the perimeter road by the equipment shed.
- Emergency landing zones: the field's south-west corner; the turf behind the equipment shed. Never the parking lots or the fairgrounds lawns.
- The public event at the adjacent Harwick Fairgrounds calendar is checked on the flight plan; on NO FLY days the Group has no aircraft out of Hangar 1 and the flight operations desk logs the fleet count at 0800 so Harwick Police can be told "all twelve aircraft are in the bay" with a timestamp.
- Crew Ch 3 reaches Hangar 2; the flight operations desk relays to Harwick Police.

### 9.2 Birch Hollow Range

- First responders: 911 (Dunmore Fire District EMS; CCSO). Nearest hospital by road: the SSL's site card lists the route; cellular coverage is good at the lodge and poor on the quarry bench, so the Quarry Flight Area crew keeps a radio relay at the lodge.
- Gate: the Dunmore Road gate stays unlocked while a crew is on site; the SSL meets responders there.
- Emergency landing zones: Lakeshore — the meadow's east end; Quarry — the bench's north end; Creek — the meadow by the gate. Never the lodge roof, patio, docks or Millstone County Park.
- Public contact: trail users and lodge guests ask questions; the SSL answers ("the Group survey flights, we're done by 3 pm"); nobody else does.
- Site manager (585-555-0170) is told of any Level 2 or 3 the same hour and of any damage, any 911 call and any media interest.

### 9.3 Client sites

The Site Survey Form (FOM-3) names the responders, the hospital and the landowner contact; the crew carries it. The IC calls the client's contact for any Level 2 or 3.

### 9.4 hangar complex

Fire, chemical and building emergencies follow CIS-EP-2025. For the Group, add: the battery cabinet in Hangar 1, the compressed-gas cylinder in Hangar 3 (payload cooling tests) and PL-02's cooler. The Fleet & Logistics Manager is the floor warden for the hangar suite.

## SECTION 10: PUBLIC INFORMATION

### 10.1 Who speaks

Only Corporate Communications (Celeste Marrow, 585-555-0160) speaks to the media. The General Manager is the Group's spokesperson when Corporate Communications asks for one. Crews, crews and staff refer every reporter, every social-media inquiry and every "is that your drone" email to Corporate Communications; they do not comment, confirm or deny, and do not post about an incident.

### 10.2 Holding statement (pre-approved)

"A the Group mission aircraft was involved in an incident today at [site]. Our first concern is for anyone affected; no one was injured [or: one person received medical attention]. We have notified the appropriate authorities and are reviewing the event with them. We will share more when we can."

### 10.3 Social media and trainees

Trainees on the crew are briefed each campaign day that photos and video of an incident are evidence for the investigation and are not posted. Corporate Communications monitors; the General Manager forwards anything the Group sees (a neighbor's post, a bystander's video, an aviation-forum thread) to Corporate Communications and the ASO, not to the crew chat.

### 10.4 Clients and partners

Client program managers hear from the General Manager (Section 6.1, item 11) before they hear from anyone else; the Campaign Lead does not email the client about an incident on their own. The CVAC and CP&L agreements require notice of any event affecting data integrity or delivery dates.

## SECTION 11: RECOVERY, INVESTIGATION AND RECORDS

### 11.1 Return to flight

An aircraft involved in a Level 2 or 3 event is DOWN until the post-incident inspection (HUOG-FOM 4.3), the Systems & Cybersecurity Lead's link and parameter review, and the ASO's sign-off. The site is reopened by the IC after the hazard that caused the event is addressed in the hazard log.

### 11.2 Investigation

The ASO leads; the Systems & Cybersecurity Lead leads the technical part (telemetry, link, GNSS, GCS, firmware, parameters); the FOM and the RPIC are interviewed within 48 hours; the Incident Report (Annex B, form FOM-4) is complete within 10 working days and goes to the General Manager and the safety meeting. When a cyber cause is confirmed the HUOG-ISP report replaces the technical section.

### 11.3 Records

Incident folder on the NAS (`\\HUOG-NAS01\ops\incident-log\<yyyy-mm-dd>-<tail>\`): the incident log, photos, GCS screenshots, telemetry, link logs, DAA-1 recording, notification record, Incident Report, regulator correspondence, client correspondence. Retained 10 years. The paper copy of the notification record stays with the ASO.

### 11.4 Hot wash

Within one week of any Level 2 or 3, the IC runs a one-hour hot wash with the crew, Harwick Police (public events at the adjacent Harwick Fairgrounds), the site manager (Birch Hollow Range) and Corporate Communications when they were involved; three things that went well and three to fix go into the hazard log.

## ANNEX A: CONTACT LIST (EXERCISE NUMBERS)

| Party                                                | Number             | Notes                                             |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------- |
| Emergency                                            | 911                | Fire, EMS, law enforcement                        |
| Harwick Police Department                            | 585-555-0111       | 24 h; base first responder; event command post    |
| Flight operations desk, Hangar 2                     | 585-555-0140       | Staffed during campaigns; Crew Ch 3 repeater      |
| Devin Alcott, FOM (IC)                               | 585-555-0141       | Mobile                                            |
| Priya Natarajan, ASO                                 | 585-555-0142       | Mobile                                            |
| Tomás Reyes, Systems & Cybersecurity Lead            | 585-555-0143       | Mobile                                            |
| Hannah Whitlock, Payload & Calibration Lead          | 585-555-0144       | Mobile                                            |
| Owen Castellano, Fleet & Logistics Manager           | 585-555-0145       | Mobile                                            |
| Marguerite Ostrowski, General Manager                | 585-555-0146       | Mobile                                            |
| Corporate Communications (Celeste Marrow)            | 585-555-0160       | Media, social, holding statements                 |
| managed SOC                                          | 585-555-0155       | 24 h                                              |
| IT helpdesk (ITSM)                                   | 585-555-0150       | Tickets                                           |
| Compliance Officer (Dana Kurtz)                      | 585-555-0165       | Business hours                                    |
| Calder County Sheriff's Office                       | 911 / 585-555-0120 | Birch Hollow Range; drone complaints; marine unit |
| Dunmore Fire District                                | 911                | Birch Hollow Range fire/EMS                       |
| Birch Hollow Lodge property manager (Rosa Lindqvist) | 585-555-0170       | Gate, lodge, events                               |
| HWK Air Traffic Control Tower                        | 585-555-0199       | Exercise line — flyaway / incursion               |
| FAA Harwick FSDO                                     | 585-555-0188       | Exercise line — accidents, incidents              |
| NTSB Response Operations Center                      | 585-555-0177       | Exercise line                                     |
| CP&L program office (Felix Amundsen)                 | 585-555-0180       | Utility inspection client                         |
| CVAC (Marisol Reyes-Tanaka)                          | 585-555-0185       | Agricultural cooperative partner                  |

## ANNEX B: INCIDENT REPORT FORM (FOM-4) — FIELDS

Date/time · Site and launch point · Aircraft tail and payload · Crew by role · Level declared and by whom · Narrative (facts, timeline from the incident log) · Injuries · Property damage · Airspace involvement (ceiling, LAANC reference, ATC contact) · Notifications made (who, when, reference) · Evidence preserved (telemetry, link logs, photos, GCS state) · Immediate cause · Contributing factors · Hazard log entries · Return-to-flight conditions · Signatures (RPIC, IC, ASO, General Manager)

## ANNEX C: FIELD CARDS

Each field kit carries laminated cards for: Crash / aircraft down · Injury · Battery fire · Lost link and flyaway (with the HWK Tower script) · Unknown drone · GNSS / interference · Notification order and numbers · Holding statement and "who speaks". The cards are Rev 2.0; a kit with Rev 1.x cards is not issued.
