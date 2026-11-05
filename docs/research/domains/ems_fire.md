# Domain dossier: `ems_fire` (EMS, fire and hazardous materials response)

Research for the EMS, fire and hazmat epic (#689, spec 0456) and the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session (often because the official site blocked automated access, noted where it applies).

## 1. Scope

**Covers:** the agencies that respond on the street: EMS agencies (public, private, hospital-based, volunteer), fire departments (career, combination, volunteer), hazardous materials teams, technical rescue teams, 911 telecommunicators and dispatch centers as they dispatch these units, regional healthcare coalitions as the hospital side of a mass casualty incident, and paramedic and fire science programs.

**Extends, does not duplicate:**

- `emergency_communications` already makes the 911 center the exercising organization (CAD failure, TDoS, manual dispatch cards, `911_cad_entry`, `radio_call`). This domain makes the **responders** the exercising party and adds a dispatch toolkit for CAD incident views and radio traffic from their side. Both can run in one exercise.
- `healthcare` carries the hospital (HICS activation, surge, decontamination). The hospital side of a mass casualty incident is played there; this domain provides the field side and the destination decisions.
- `chemical` carries the plant's emergency response, RMP exercises and CHEMTREC. This domain carries the fire department and hazmat team that responds to the gate.
- `municipal` lists a fire chief role; this domain gives the department its own profile.

**Exercise types this domain needs:**

- **Mass casualty incident (MCI):** bus crash, building collapse, explosion, mass shooting with a rescue task force, event crowd injuries. Triage, treatment, transport, hospital destination, family reunification.
- **Hazmat release:** a transportation or fixed-facility release; identify the material, set isolation and protective actions (shelter in place or evacuate), decontaminate, coordinate with the chemical facility and the healthcare coalition.
- **Structure fire and command transfer:** size-up, accountability, mayday, transfer of command, mutual aid.
- **Technical rescue:** trench, confined space, structural collapse (see spec 0471).
- **Dispatch and communications:** the field side of CAD failure, radio interoperability, simultaneous incidents.
- **Regulatory exercise:** the RMP tabletop and field exercises for chemical facilities require local responders to participate **[V: 40 CFR 68.96; first tabletop before 21 Dec 2026 then every three years, field exercise before 15 Mar 2027 then at least every ten years, evaluation report within 90 days]**.

**Aliases:** EMS, ambulance, paramedic, EMT, fire department, fire rescue, firefighter, fire chief, hazmat team, haz-mat, hazardous materials, technical rescue, USAR, MCI, mass casualty, 911 responder, healthcare coalition, EMS agency, fire district.

## 2. Organization and roles

Mass casualty command uses the NIMS Incident Command System with a **Medical Branch** (or Medical Group) under Operations. USFA's EMS mass incident templates place the Triage, Treatment and Patient Transportation Group Supervisors under the Medical Branch Director; the transportation group includes a Medical Communications Coordinator and air and ground ambulance coordinators; titles vary by jurisdiction **[V: USFA/NEMSMA, Operational Templates and Guidance for EMS Mass Incident Deployment, June 2012; the FEMA ICS reference guide notes that local titles differ]**.

| Title                                              | Abbrev. | Team          | What they decide                                                                         |
| -------------------------------------------------- | ------- | ------------- | ---------------------------------------------------------------------------------------- |
| Incident Commander                                 | IC      | Command       | Strategy, command transfers, declaring an MCI, requesting mutual aid and state resources |
| Safety Officer                                     | SO      | Command staff | Hot, warm and cold zones, PPE level, collapse and secondary-device concerns, rehab       |
| Public Information Officer                         | PIO     | Command staff | Casualty counts, hospital information, family reunification messaging                    |
| Operations Section Chief                           | OPS     | Operations    | Tactics across suppression, rescue, EMS and hazmat branches                              |
| Medical Branch Director / Medical Group Supervisor | MED     | Operations    | Establishes triage, treatment and transport groups; hospital capacity and destinations   |
| Triage Unit Leader                                 | TRIAGE  | Medical       | Triage method (START, SALT or local), sequencing, tag counts, patient flow to treatment  |
| Treatment Unit Leader(s)                           | TX      | Medical       | Treatment areas by priority (Immediate, Delayed, Minor), morgue, resources to treat      |
| Patient Transportation Group Supervisor            | TRANS   | Medical       | Ambulance staging, loading, destination assignment, air resources                        |
| Medical Communications Coordinator                 | MEDCOM  | Medical       | Calls hospitals for capability and capacity, relays destination decisions                |
| Hazmat Group Supervisor / Hazmat Technician        | HAZMAT  | Operations    | Identification, isolation, entry and decontamination, product control                    |
| Decontamination Unit Leader                        | DECON   | Hazmat        | Mass decon corridors, gross decon, patient handoff                                       |
| Fire Suppression Group/Branch Supervisor           | FIRE    | Operations    | Attack, search, ventilation, water supply, accountability                                |
| Technical Rescue Team Leader                       | TRT     | Operations    | Rescue plan for trench, collapse, confined space                                         |
| Staging Area Manager                               | STAGE   | Logistics/Ops | Arriving units, release, rehab                                                           |
| Dispatcher / Telecommunicator                      | DISP    | Dispatch      | Unit assignment, mutual aid alerts, tone-outs, 911 call load                             |
| EMS Medical Director (physician)                   | MD      | Advisory      | Protocol deviations, triage and treatment policy during an MCI, field termination        |
| Healthcare coalition / hospital liaison            | HCC     | Outside party | Regional bed counts, diversion, patient tracking, surge                                  |

**Hazmat responder levels:** OSHA's HAZWOPER standard defines first responder awareness level, first responder operations level, hazardous materials technician, hazardous materials specialist and incident commander as the emergency response levels **[V: 29 CFR 1910.120 Appendix E, Part C.b; training hours in paragraph (q) [U]]**. The incident commander "is the individual who, at any one time, is responsible for and in control of the response effort" and the post "should be occupied by the most senior, appropriately trained individual present" **[V: Appendix E]**.

**Outside parties:** 911 centers, hospitals and the healthcare coalition, medical examiner, American Red Cross and mass care, public health, utilities (gas, electric shutoffs), the chemical facility and its emergency coordinator, CHEMTREC and the shipper, state fire marshal, NTSB or CSB for investigations, law enforcement, schools and venues, the media.

## 3. Systems

- **Computer-aided dispatch (CAD),** mobile data terminals and automatic vehicle location, radio systems (conventional, trunked, interoperability channels), station alerting, electronic patient care records (ePCR), triage tags and tracking, regional hospital capacity and patient tracking systems, medical communications centers.
- **Hazmat instruments:** multi-gas meters, photoionization detectors, radiation detectors, chemical identification instruments, air monitoring; plume modeling with ALOHA and MARPLOT from the CAMEO suite, free from EPA **[V]**; the Emergency Response Guidebook.
- **Fire and rescue:** thermal imaging, SCBA, accountability boards, apparatus GPS, hydrant maps, pre-incident plans, structural monitoring for collapse.
- **Data exchange:** NEMSIS national EMS data standard and database; NFIRS for fire incident reporting **[U]**.

## 4. Products (what injects look like)

| Product                                                                                                                               | From                 | Render                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| CAD incident view (call type, address, units, timestamps, notes), unit status board                                                   | dispatch             | existing `911_cad_entry`, `status_board`; new CAD views                                |
| Radio traffic transcript (dispatch, command, tactical, mayday)                                                                        | radio                | existing `radio_call`                                                                  |
| Triage tag (color, ID number, vitals, injuries) and MCI patient list                                                                  | triage               | new template; counts as figure                                                         |
| Triage, treatment and transport counts by priority; patient tracking board                                                            | Medical Branch       | status board figure                                                                    |
| Hospital capacity and status board (beds by level, trauma, burn, pediatric, diversion)                                                | healthcare coalition | status board figure                                                                    |
| ICS 201, 202, 203, 205 (radio plan), 207 (incident organization chart), 213, 214, 215/215A (operational planning and safety analysis) | command              | existing prefills plus new ones **[U: form list against FEMA ICS forms booklet]**      |
| Medical Branch/Group worksheet, patient transportation log, treatment area assignments                                                | Medical Branch       | new templates                                                                          |
| Placards, labels and shipping paper for a hazardous load (UN number, class, packing group)                                            | carrier              | existing `hazmat_shipping_paper` (proposed in the chemical dossier), new placard image |
| Emergency Response Guidebook guide page for a material and the isolation and protective action table row                              | PHMSA ERG            | see section 5; handled by the licensing decision                                       |
| Isolation and protective action zone map (circle and downwind square) with wind                                                       | hazmat               | map figure from case data                                                              |
| Air monitoring log, decontamination corridor layout, entry team briefing                                                              | hazmat               | new templates                                                                          |
| Fire size-up, accountability report (PAR), mayday report                                                                              | fire                 | new templates                                                                          |
| Technical rescue plan, shoring and cribbing log                                                                                       | TRT                  | new template                                                                           |
| Family reunification notice, hospital information release                                                                             | PIO                  | existing `reunification_notice`, `press_release`                                       |
| Social posts, bystander video stills, calls to 911, press inquiries                                                                   | people               | existing templates                                                                     |

## 5. Regulations, doctrine and documents (public domain candidates)

**Emergency Response Guidebook 2024 (ERG).** Published by PHMSA with Transport Canada and Mexico's SCT; the 2024 edition updates the tables of labels, markings and placards, revises the road and rail vehicle identification tables, adds guidance on evacuation or shelter in place, spill control and lithium battery response, and expands the glossary **[V: GPO bookstore page]**. Structure: white pages (initial response, GHS symbols, agents without ID numbers), yellow pages to find a material by UN/NA number, blue pages by name, orange pages the numbered guides, and green pages the table of initial isolation and protective action distances **[V: PHMSA ERG 2024 presentation and Transport Canada page, via search]**. Table 1 gives distances by day or night and by small (55 gallons or less) or large spill; the protective action distance is the 90th percentile value for each category; the initial isolation zone is a circle and the protective action zone a downwind square whose side equals the distance; Table 3 covers large spills of the six most common toxic-inhalation hazard gases by container type and wind speed **[V: PHMSA ERG 2024 pages via search]**. The guides give an immediate precautionary measure of 25 m for solids, 50 m for liquids and 100 m for gases **[V: Transport Canada page]**.

**Licensing is the open question.** PHMSA offers the ERG free (PDFs in English, Spanish and French, and a free app) **[V: search summary of PHMSA page]**, but the PHMSA and Transport Canada pages block automated access, and no explicit public-domain statement was found in this or earlier dossiers (the chemical and gas pipeline dossiers record the same); Transport Canada states reproduction terms that refer to US DOT and Transport Canada **[V: Transport Canada page]**. Until the owner confirms terms with PHMSA (the earlier dossier notes ERGComments@dot.gov), the pack does not bundle ERG text or tables. See spec 0456 FR-6.

| Source                                                                                                                                               | What it covers                                                               | Status                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| USFA, _Operational Templates and Guidance for EMS Mass Incident Deployment_ (June 2012, written by the National EMS Management Association for USFA) | MCI plan templates, including a marathon event example; medical branch roles | **[V: read the PDF]**; public-domain status of a contractor-written USFA work **[U]** |
| USFA, EMS Medical Director Handbook                                                                                                                  | Medical direction                                                            | **[U]** (title seen in search)                                                        |
| FEMA NIMS (October 2017) and ICS forms booklet; FEMA ICS reference guide (March 2023)                                                                | Command structure, forms                                                     | US federal works; already in the `generic` library                                    |
| OSHA 29 CFR 1910.120 (HAZWOPER) and 1910.134                                                                                                         | Emergency response levels, plans                                             | **[V: 1910.120 Appendix E]**                                                          |
| EPA 40 CFR 68.96 RMP exercises and EPA fact sheet 550-F-25-001                                                                                       | Local responder participation in facility exercises                          | **[V: 68.96]**                                                                        |
| CDC/ASPR mass casualty triage material                                                                                                               | SALT guideline, see section 7                                                | **[U]**                                                                               |
| Massachusetts Emergency Management Agency, after action report on the 2013 Boston Marathon bombings (2015)                                           | Real MCI lessons                                                             | **[U]** (summarized from news coverage; state work, terms unknown)                    |
| NFPA standards (1710, 1730, 472, 704), NENA and APCO standards, ENA triage kits                                                                      | Copyrighted references                                                       | link only                                                                             |

**Mass casualty triage.** START sorts adults into minor (green), delayed (yellow), immediate (red) and expectant (black) using ability to walk, breathing rate (the immediate cutoff is above 30 per minute), capillary refill over 2 seconds and following commands **[V: StatPearls at NCBI, EMS Mass Casualty Management]**. SALT (sort, assess, lifesaving interventions, treatment and/or transport) came from an expert panel coordinated by the National Association of EMS Physicians with CDC funding and published by Lerner and colleagues in 2008 (Disaster Medicine and Public Health Preparedness 2, supplement 1); it includes an expectant category and lifesaving interventions; no federal mandate identifies one method, so state and local authorities choose **[U: secondary sources only; the primary paper could not be fetched]**. JumpSTART is the pediatric variant **[U]**. The app should support START, SALT and a free-text local method rather than prescribe one.

## 6. Data sources (free, public)

| Data                                        | Source                                                                                         | Notes                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EMS activations, response times (aggregate) | NEMSIS public-release research dataset (NHTSA Office of EMS, hosted at the University of Utah) | a request form yields a download link; the 2023 release covered 54,190,579 activations from 14,369 agencies; no patient, agency or hospital identifiers; aggregate dashboards need no login **[V: search summaries of NEMSIS pages]**. Use for realistic call mixes and times, not for replay. |
| Fire incident statistics                    | USFA National Fire Incident Reporting System (NFIRS) public data                               | **[U]** (the USFA data page returned 404)                                                                                                                                                                                                                                                      |
| Toxic plume modeling                        | ALOHA with MARPLOT (EPA CAMEO suite)                                                           | free downloads; red, orange and yellow threat zones; models toxic and flammable gas clouds, BLEVEs, pool and jet fires and vapor cloud explosions **[V]**                                                                                                                                      |
| Chemical properties                         | CAMEO Chemicals                                                                                | **[V: part of the suite]**; fields to use **[U]**                                                                                                                                                                                                                                              |
| Weather at the scene                        | NWS observations through the weather toolkit                                                   | wind speed and direction drive the plume and protective actions                                                                                                                                                                                                                                |
| Hospitals and trauma centers                | CMS and HHS public data sets; HIFLD hospital layer                                             | **[U]**                                                                                                                                                                                                                                                                                        |
| Hydrants, stations, roads                   | OpenStreetMap-derived and local open data                                                      | **[U]**; already used by the map view (spec 0436)                                                                                                                                                                                                                                              |
| Real MCI timelines                          | after-action reports (Boston 2013 and others)                                                  | published, not data feeds                                                                                                                                                                                                                                                                      |

There is no free feed of real patients or real dispatch logs; the toolkit simulates them (spec 0456 FR-9).

## 7. Evaluation

- **Triage and transport:** time from first unit on scene to triage complete; counts by priority at each time; time to first Immediate patient transported; share of Immediate patients going to an appropriate hospital (trauma, burn, pediatric) versus the nearest; no single hospital receiving more than its stated capacity.
- **Hazmat:** protective actions against the ERG table distances for the material, spill size and time of day (threshold timing: the isolation zone established and the downwind zone alerted or evacuated before the plume reaches it); correct identification of the material; decon established before patient contact beyond the cold zone.
- **Command and accountability:** command established and announced; command transfers documented; personnel accountability report (PAR) intervals; mayday handling time; span of control (ICS).
- **Message consistency:** casualty counts and hospital information agree between command, the PIO and hospitals.
- **Lessons (Boston Marathon, 2015 MEMA review, from news coverage [U]):** every patient transported to area hospitals survived, credited to rapid triage and transport; all critically injured patients reached hospitals within 50 minutes; 20 hospitals treated 219 patients; EMS arrived without enough triage tags; the report cited the lack of a single integrated operational plan for all public safety organizations.
- **HSEEP core capabilities:** Operational Coordination, On-scene Security, Protection and Law Enforcement, Public Health, Healthcare and Emergency Medical Services, Environmental Response/Health and Safety, Fire Management and Suppression, Mass Search and Rescue Operations, Operational Communications, Logistics and Supply Chain Management, Public Information and Warning.

## 8. Threat families and arcs

- **MCI:** dispatch and size-up → MCI declaration and command → triage → treatment areas → transport and destinations → hospital surge and reunification → demobilization and critical incident stress.
- **Hazmat:** call and identification → isolation and protective action → entry, rescue and decon → product control → recovery and investigation.
- **Structure fire:** dispatch → size-up and attack → accountability and mayday → command transfer and mutual aid → overhaul and investigation.
- **Technical rescue:** access and stabilization → rescue plan → extrication → medical handoff.
- **Service degradation (shared family):** CAD or radio failure, hospital diversion cascade, apparatus or staffing shortage, simultaneous incidents.

## 9. Reuse by other domains

Hazmat and MCI products serve `chemical` and `industrial` (the plant's call to the fire department), `transit` and `freight_rail` (derailments, bus crashes), `stadium_venue` and `campus` (crowd injuries), `airport` (aircraft rescue and firefighting, mass casualty), `healthcare` (surge from the street), `k12_schools`, `municipal`, `emergency_communications` (the 911 side), `port_maritime`, `gas_pipeline` and `energy_utility` (gas explosions), and the construction toolkit (spec 0471, collapse rescue). The dispatch toolkit gives the justice field (#698) its CAD views.

## 10. Related toolkits

Clinical care (#685) for patient detail, vitals and SBAR at the hospital end; weather (spec 0449) for wind; wildfire (#694) for fires in the wildland-urban interface; spill and plume (spec 0455) for the plume figure; structures (spec 0471) for collapse; maps (spec 0436).
