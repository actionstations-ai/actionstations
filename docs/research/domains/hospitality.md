# Domain dossier: `hospitality` (hotels, resorts, tourism and cruise)

Research for the hospitality epic (#703, spec 0470) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** organizations that host guests away from home: hotels and resorts (single property and multi-property brands), cruise lines and their shoreside operations, destination and tourism boards, tour operators, and hospitality programs at colleges.

**Exercise types this domain needs:**

- **Outbreak at sea or in a property:** acute gastroenteritis (usually norovirus) among guests and crew; isolation, sanitation, health authority reporting, itinerary and boarding decisions.
- **Hurricane or severe weather:** a resort or an itinerary in the path; guest evacuation or shelter-in-place; ship routing and port changes.
- **Guest death or serious injury; missing guest or passenger overboard.**
- **Security incident:** an armed person or threat in a lobby, a crime on board.
- **Cyber attack on reservations, property management or keycards.**
- **Fire or life-safety event** in a tower; evacuation and guest accounting.

**Aliases:** hotel, resort, lodging, hospitality, cruise, cruise line, ship, tourism, destination, convention hotel, timeshare, vacation rental, guest services, front office, revenue management.

**Boundary with existing domains:** `commercial_facilities` already has a lodging profile with hotel roles, systems (property management system, keycards), guest emergencies, a hotel cyber scenario and the `pms_outage_board` and `guest_letter` templates. `port_maritime` has the cruise terminal on the shore side. `stadium_venue` covers events. This domain adds the cruise line and tourism board as organizations, plus outbreak-at-sea and guest-emergency products. Variants: **hotel or resort**, **cruise line (ship and shore)**, **tourism board**. The hotel variant extends `commercial_facilities` lodging by reference; do not copy its roles.

## 2. Organization and roles

**Cruise ship and shoreside:**

| Title                                   | Abbrev. | Team      | What they decide                                                                        |
| --------------------------------------- | ------- | --------- | --------------------------------------------------------------------------------------- |
| Master (captain)                        | MASTER  | Ship      | Safety of the ship, reports to authorities, itinerary changes, final authority on board |
| Staff Captain / Safety Officer          | SAFETY  | Ship      | Emergency stations, muster, drills, passenger accounting                                |
| Ship's Doctor / Medical Officer         | DOC     | Medical   | Case counts from the medical log, isolation, specimen collection, reports to CDC        |
| Hotel Director / Chief Housekeeper      | HOTEL   | Ship      | Cleaning and disinfection, food and beverage controls, guest services                   |
| Environmental / Public Health Officer   | EHO     | Ship      | Sanitation program, outbreak prevention and response plan                               |
| Security Officer                        | SEC     | Ship      | Crime reports, evidence, liaison with FBI and Coast Guard                               |
| Designated Person Ashore (DPA)          | DPA     | Shoreside | Link between ship and company (ISM Code role) **[U]**                                   |
| Fleet / Marine Operations               | OPS     | Shoreside | Itinerary, port agents, delays, boarding of the next voyage                             |
| Public Health / Medical Director ashore | MED     | Shoreside | Outbreak response coordination with CDC and port health                                 |
| Guest Care / Communications             | COMMS   | Shoreside | Guest messages, media statements, family hotline, social media                          |
| Legal / Risk                            | LEGAL   | Shoreside | Notices, claims, passenger rights                                                       |

**Hotel and resort (see `commercial_facilities` for the full table):** General Manager, Rooms Division Director, Director of Security, Chief Engineer, Director of Sales, Revenue Manager, HR, IT lead, Food and Beverage Director, Executive Housekeeper.

**Tourism board variant:** Destination Marketing Organization CEO, Visitor Services, Crisis communications lead, Industry partners liaison, Emergency management liaison.

Outside parties: CDC (Vessel Sanitation Program and quarantine stations), port health and the port authority, US Coast Guard, FBI, flag state and port state, local health departments, emergency management, the airline and ground transport partners, consulates, families, travel agents, press and social media.

## 3. Systems

- **Ship:** shipboard medical log and illness surveillance, safety management system, bridge and navigation, passenger and crew manifest and **muster/accounting** system, onboard Wi-Fi and phone, public address, CCTV, property management system and folio, food safety records.
- **Hotel and resort:** property management system, keycard locks, central reservations and channel manager, point of sale, guest Wi-Fi, fire alarm and mass notification, in-house guest list, shuttle and tour booking.
- **Shared:** reservation and loyalty databases (guest data), payment systems, call center, social media monitoring, weather feeds.

## 4. Products (what injects look like)

| Product                                                                                                      | Render                              |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Cumulative gastroenteritis report (24-hour and 4-hour reports, counts for passengers and crew, zero reports) | template (new)                      |
| Epidemic curve of cases by onset day, attack rate against the 2 percent and 3 percent lines                  | figure (epidemiology toolkit, #690) |
| Outbreak response checklist (isolation, cleaning, specimens, signage, food service changes)                  | template (new)                      |
| Passenger and crew letters (outbreak notice, cabin isolation, itinerary change, compensation offer)          | templates                           |
| Muster and accounting board (passengers and crew mustered, missing, cabins checked)                          | figure (new)                        |
| Itinerary and weather routing map with storm cone and port status                                            | figure (weather toolkit, spec 0449) |
| Incident report to FBI/Coast Guard for alleged crimes; man overboard checklist                               | templates (new)                     |
| In-house guest list and accountability board; evacuation status by floor                                     | template (existing hotel profile)   |
| Guest hotline script, family reunification message, media holding statement, social posts                    | existing communications templates   |
| PMS outage board, guest letter under the door                                                                | existing (`commercial_facilities`)  |

## 5. Regulations, doctrine and documents

**CDC Vessel Sanitation Program (VSP) and ship illness reporting** **[V: 42 CFR 71.21 text, CDC VSP pages]**

- **42 CFR 71.21(a):** the master of a ship destined for a US port must report "immediately" to the quarantine station the occurrence of any death or any ill person among passengers or crew in the 15 days before expected arrival (or since leaving a US port, whichever is shorter) **[V]**.
- **71.21(c):** for ships carrying 13 or more passengers, report the number of cases of acute gastroenteritis (AGE, including zero) 24 hours before arrival, and any later cases not less than 4 hours before arrival **[V]**.
- **Thresholds:** VSP provides support and technical assistance when ill people reach 2 percent or more of passengers or crew; it considers 3 percent or more an outbreak and investigates, and may investigate an unusual illness pattern below 3 percent **[V: CDC monitoring and outbreak response pages]**. At 2 percent and again at 3 percent a special report is submitted online **[V: infographic text on the CDC page]**. These thresholds apply to ships under VSP jurisdiction on voyages with US and foreign ports; the posting criteria changed over time **[V for the current wording; archive pages used older criteria]**.
- **Ship duties in an outbreak:** activate the outbreak prevention and response plan, increased cleaning and disinfection, collect stool specimens, isolate ill passengers and crew, consult CDC on cleaning and reporting, and tell passengers and crew to report illness. VSP may board, and may ask the cruise line to notify port authorities, delay boarding of the next voyage and arrange cleaning in the terminal **[V]**.
- **Case definition for AGE** (diarrhea: three or more episodes of loose stools in 24 hours or above normal for the person; or vomiting with one more symptom: loose stools, abdominal cramps, headache, muscle aches or fever of 38 C or more; nausea alone excluded) **[V: VSP 2025 Environmental Public Health Standards, section 4.1.1, read in full 2026-11-05]**.
- **Report points and levels in the 2025 standards** **[V: section 4.2]**: the 24-hour report is sent no less than 24 and no more than 36 hours before arrival; the 4-hour update no less than 4 hours before. Within 15 days of a US port a special report with a telephone call is due at 2 percent of passengers or of crew, and a second at 3 percent. The CDC outbreak page names only the 3 percent investigation level; 2 percent is a reporting trigger in the standards. Specimens begin at 2 percent (4.3.2); isolation is 24 hours after symptoms for passengers, 48 hours for food employees and 24 hours for other crew (4.4). The standards state no interval for the special reports.
- **Burden:** CDC's surveillance report for 2006-2019 counts 156 passenger and 16 crew outbreaks in the Maritime Illness Database and Reporting System and says about 90 percent of outbreaks with a known cause involved norovirus **[V: MMWR Surveillance Summary 70(6)]**.

**Safety at sea and crime reporting** **[U]**

- SOLAS Chapter III as amended from 2015: passengers newly embarked for more than 24 hours muster before or immediately on departure (before 2015 the muster was within 24 hours of embarkation); adopted after the Costa Concordia casualty. Verified only through search summaries of IMO material **[U]**.
- Cruise Vessel Security and Safety Act (46 U.S.C. 3507(g)): the line telephones the nearest FBI field office as soon as possible after homicide, suspicious death, a missing US national, kidnapping, assault with serious bodily injury, certain sexual offenses, firing or tampering with the vessel, or theft over $10,000, files a written report on the Department of Transportation website, and keeps a log open to the FBI and the Coast Guard; video recordings are kept at least 20 days under (b)(4) **[V: statute text read 2026-11-05]**.

**Hotels and resorts:** Hotel and Motel Fire Safety Act (FEMA/USFA) fire safety material, ready-to-use hurricane and active threat guidance from DHS and CISA (CISA Commercial Facilities sector CTEP situation manual, 2023, already referenced in `commercial_facilities`) **[U here; see that dossier]**. Fire and life-safety codes (NFPA 101, IFC) are copyrighted and are only named.

**Other candidates** **[U]:** CDC norovirus outbreak management guidance, FDA Food Code (public), state and local health code for lodging, EPA/CDC Legionella guidance for building water systems, DHS/CISA hurricane and cyber material. Verify license and URL at pack build.

## 6. Real events and lessons

- **Costa Concordia, 2012** (grounding with 32 deaths): led to the muster rule change above **[U]**. A shore-ship communication and evacuation timing case.
- **Norovirus on cruise ships:** recurring; the response is a published plan, not an invention, so the exercise tests execution and communications. Use CDC's public outbreak updates for realistic case counts and pacing **[V: CDC outbreak pages exist; a 2025 outbreak update was listed]**.
- **Hotel and casino cyber attacks (2023):** reservations, keycards and gaming floors disrupted for days; exercises must show degraded-mode operations (paper check-in, key cutting) **[U: from commercial_facilities dossier; do not name real companies in exercises]**.
- **Hurricane resort operations:** guest evacuation timing is driven by flight and road clearance, as in the hurricane decision timeline of spec 0449 FR-11.

## 7. Data sources (free, public)

| Data                                            | Source                                         | Notes                                                                                    |
| ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Cruise outbreak list with case counts and dates | CDC VSP outbreak updates                       | Public; use as pacing for simulated outbreaks; fictional ships and lines in the exercise |
| Hurricane tracks, cones, watches and warnings   | NHC archive (weather toolkit)                  | Reused by reference (spec 0449 FR-7)                                                     |
| Ship position history                           | AIS data (NOAA/BOEM MarineCadastre, US waters) | **[U: confirm coverage and license]**                                                    |
| Cruise crime statistics                         | DOT quarterly CVSSA reports                    | Public **[U: listed in search results, not opened]**                                     |
| Lodging occupancy and tourism volume            | Public tourism statistics                      | **[U]**                                                                                  |

Outbreak case data is simulated by the epidemiology toolkit's generator from parameters: ship size, attack rate, onset curve, isolation effect.

## 8. Evaluation

- **Guest safety and accounting:** time to account for every guest and crew member (muster or in-house list), number unaccounted at each point.
- **Authority notifications:** CDC and port health reports filed on time (24-hour and 4-hour reports; special reports at 2 and 3 percent), FBI/Coast Guard crime reports, flag state, local health department.
- **Outbreak control actions:** isolation, cleaning, specimens, boarding decision for the next voyage, documented with times.
- **Communications:** guest, family, media and employee messages consistent and timely (spec 0448 message consistency).
- **HSEEP core capabilities:** Public Health, Healthcare and EMS (Environmental Response/Health and Safety), Mass Care Services, Operational Communications, Public Information and Warning, On-scene Security, Protection and Law Enforcement, Fatality Management Services.

## 9. Threat families and scenario arcs

- **Health:** outbreak at sea or in a property (norovirus, Legionella, food-borne).
- **Natural hazards:** hurricane, flood, wildfire, earthquake affecting a property or itinerary.
- **Safety and security:** fire, armed threat, man overboard, serious injury, death.
- **Cyber:** reservations, PMS, keycards, guest data.
- Arc for outbreak at sea: first cluster in the medical log → threshold crossed (2 percent, then 3 percent) → reports to CDC and port → response plan, isolation, cleaning → guest and media communications → boarding decision for the next voyage → investigation and close-out.

## 10. Reuse by other domains

The outbreak-at-sea and guest-emergency products suit airlines and airports, campuses, long-term care, correctional facilities, large events and any congregate setting. Reuses the epidemiology toolkit (#690), weather toolkit, crisis communications (#691) and `commercial_facilities`, `port_maritime` and `stadium_venue` profiles by reference.

## Expert review (2026-11-11)

This is a model-led expert review, written from the standpoint of a cruise line and hotel group safety and public health director. It is not a review by a licensed or employed practitioner.

**Checked.** The domain profile with its six threat families and role sets, the outbreak at sea and guest emergency toolkits (glossary, conventions, realism rules, decision forms, measures, critical tasks), the CDC ship illness reporting regulation entry and its clocks, the report timing, medical advice and isolation lint rules, the hospitality guide and readme, and the previews of the cumulative illness report, response checklist, port health notification, boarding memo, guest letter, muster report, man overboard checklist, alleged crime report, notification checklist and hurricane departure plan.

**Sources.** 42 CFR part 71 including 71.21, read from the eCFR versioner API on 2026-11-11; the CDC Vessel Sanitation Program 2025 Environmental Public Health Standards (the pinned file, sha256 ad58b3aa…, sections 4.1 to 4.5); 46 U.S.C. 3507 (Cornell LII), including (a)(1)(D), (b)(4) and (g)(3)(A).

**Confirmed.** The reportable AGE case definition; the 24-hour report 24 to 36 hours before arrival and the cumulative 4-hour update; the 2 and 3 percent special reports within 15 days of a US port, with a telephone call at 2 percent; specimens from 2 percent; isolation of 48 hours for food employees and 24 hours for other crew and for passengers; the immediate report of death or illness to the quarantine station; the FBI telephone report as soon as possible for the listed incidents, the written report to the Department of Transportation website and the 20-day video retention. The muster, man overboard, alleged crime and hurricane products read correctly and stay at coordination level.

**Changed and why.**

- The reference title of 42 CFR 71.21 was wrong ("Sanitary, hygienic, and medical reporting"); the section is "Report of death or illness". Fixed in the regulation entry, the toolkit's document list and the documents manifest.
- The guest emergency convention put the family first and the authorities after. On a ship bound for a US port a death goes to the CDC quarantine station at once, and a reportable crime to the FBI as soon as possible; neither waits for the family. The convention and the fatality management critical task now say so, and the guide adds the quarantine station report.
- Outbreak at sea: the glossary adds that crew with onset up to 3 days before boarding count and that the VSP may ask for daily updates after a special report. The isolation convention now says passengers are advised to stay in cabins (the standards' wording) and crew return to work only with medical clearance. The guide follows.
- The man overboard glossary adds releasing a lifebuoy, the first action a practitioner expects.

**Defaults set.** The 30-minute allowance for the immediate report and the 60-minute allowance for the special reports stay as labelled exercise allowances; the standards state no interval. Notification order: required reports first, then the family before the consulate and before any public statement.

**Caveats left for the owner.**

- The guest death notification checklist preview has no row for the CDC quarantine station. Add one (for example: CDC quarantine station at the arrival port; telephone at once, then in writing (42 CFR 71.21(a)); Ship's Doctor for the Master; 23:05; Done) and regenerate that template's golden; the app could not be rendered in this review's environment.
- The immediate report trigger says "ill person"; 42 CFR 71.1 defines that term narrowly, and a hint pointing to the definition would help planners.
- Hotel-side content leans on the commercial facilities profile; a hotel fire and life-safety reviewer should look at the tower fire family.
