# Domain dossier: `human_services` (crisis lines, mass care, reunification and child welfare)

Research for the behavioral health and human services epic (#697, spec 0464) and the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source (or, where noted, an official listing of it). **[U]** = not verified this session.

## 1. Scope

**Covers:** organizations that serve people in distress when a community is stressed: 988 Suicide & Crisis Lifeline centers and state 988 coordinators; mobile crisis teams; county and state behavioral health agencies; mass care and shelter teams (local government, Red Cross and other voluntary organizations, school and campus shelters); family reunification teams (school districts, hospitals, venues); child welfare and other social service agencies; disaster behavioral health and crisis counseling programs; social work programs.

**Exercise types this domain needs:**

- **Crisis line surge:** a community tragedy, viral media event or anniversary multiplies contacts while staff are short; leadership decides on overflow, rerouting, scripts and staffing.
- **Mass care shelter operations:** opening and running a general population shelter for a hurricane, wildfire or heat and power emergency, including people with access and functional needs, pets and service animals, registration and health services.
- **Family reunification:** after a school incident, evacuation or venue emergency, move children or patients back to families with identity checks, accountability and mental health support.
- **Child welfare continuity:** locate and serve children in care who are displaced, keep hotlines and investigations running, stay in contact with displaced staff.
- **Responder and staff behavioral health:** psychological first aid for responders and shelter staff over a long activation.
- **Continuity of operations:** telephony or text platform outage, cyber incident, staffing shortfall at a crisis center.

**Aliases:** 988 center, crisis center, crisis line, lifeline, hotline, behavioral health, mental health authority, mobile crisis, mass care, shelter operations, congregate care, reception center, reunification, family assistance, child welfare, children and family services, human services department, social services.

## 2. Organization and roles

| Title                                         | Abbrev. | Team           | What they decide                                                                                          |
| --------------------------------------------- | ------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| Crisis Center Director                        | DIR     | Crisis line    | Surge activation, overflow and backup arrangements, public statements, escalation to the state            |
| Shift / Clinical Supervisor                   | SUP     | Crisis line    | Queue priorities (calls, texts, chats), breaks and rotation, high-risk contact consults, staff wellbeing  |
| Workforce / Operations Manager                | OPS     | Crisis line    | Staffing, call-in, schedules, queue and wait-time reporting                                               |
| Telephony / IT Lead                           | IT      | Crisis line    | Platform outages, routing changes, failover                                                               |
| Crisis Counselor                              | CC      | Crisis line    | Contact handling; flags capacity and well-being problems                                                  |
| Mobile Crisis Team Lead                       | MCT     | Field          | Dispatch priorities, coordination with 911 and law enforcement                                            |
| State 988 Coordinator                         | S988    | State          | Funding, statewide routing and backup, communication with the national network administrator              |
| Shelter Manager                               | SM      | Mass care      | Opening, capacity, rules, staffing, reporting to the EOC                                                  |
| Shelter Health Services Lead                  | HSL     | Mass care      | Medical and functional needs support, referrals, infection control                                        |
| Shelter Mental Health Lead                    | SMH     | Mass care      | Psychological first aid, staff support, referrals                                                         |
| Disability Integration / FNSS Advisor         | FNSS    | Mass care      | Accessible space, communication access, durable medical equipment, personal assistance, supervision needs |
| Registration and Reporting Lead               | REG     | Mass care      | Resident registry, daily shelter counts, data to the shelter database                                     |
| Mass Care Branch Director (EOC)               | MCB     | Local EOC      | Site selection, shelter openings and closings, resource requests, sheltering for pets                     |
| Reunification Site Commander                  | RSC     | Reunification  | Site activation, flow, release authority, handling unaccompanied or unreleased students                   |
| Parent Check-in / Release Leads               | CHK/REL | Reunification  | Identity verification, student retrieval, release log                                                     |
| Child Welfare Director / Disaster Coordinator | CWD     | Child welfare  | Locating displaced children in care, hotline continuity, staffing, reporting to the state                 |
| Public Information Officer                    | PIO     | Communications | Public messages, rumor control, joint information system                                                  |

**Outside parties:** the national 988 network administrator and SAMHSA (statistics, backup routing), backup centers in other states, 911 centers (spec 0464 reuses `emergency_communications`), the local EOC and emergency manager, the Red Cross and other voluntary organizations (National VOAD), county public health, hospitals, school districts, law enforcement, state emergency management and human services agencies, FEMA and SAMHSA for crisis counseling grants, NCMEC for child reunification support, courts and juvenile justice, media, and the public on social media.

## 3. Systems

- **Crisis centers:** telephony and contact routing (calls, texts and chats from the national network), a case or contact record, a queue and wait-time dashboard, a shift schedule, a mobile crisis dispatch link, a state routing console **[U: vendor-neutral list; platform details differ by center]**.
- **988 routing:** calls route by approximate caller location (georouting) and texts by area code and chats by zip code; unanswered contacts reroute to national backup centers after about 2 minutes for calls and 5 minutes for texts and chats; Spanish-language contacts cannot be rerouted **[V: GAO-26-108114, status as of March 2026]**.
- **Shelters:** shelter registration and daily count reporting into the Red Cross shelter database, which FEMA's ESF #6 shelter system mirrors, publishing open shelters as a public map layer **[V: FEMA GIS service pages]**.
- **Reunification:** student information systems, rosters, ID check procedures, release logs, text notification, a reunification site map.
- **Child welfare:** a statewide child welfare information system, hotline intake, placement records **[U]**.
- **Dependencies:** commercial power, telecommunications, buses and buildings, interpreters, durable medical equipment and oxygen, medications, food service.

## 4. Products (what injects look like)

| Product                                                                                                         | From                       | Render                             |
| --------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------- |
| Daily contact report: offered, answered, abandoned, answer rate, average and longest wait, by contact type      | Crisis center              | data figure + table                |
| Network surge notice or backup activation notice                                                                | Network administrator      | text template                      |
| Queue wait-time board, staffing coverage chart                                                                  | Crisis center              | data figure                        |
| Counselor consult note, supervisor escalation, de-identified contact summary (fictional, no method details)     | Crisis center              | text template                      |
| Shelter status report (population vs. capacity, needs counts, supplies), open shelters list and map             | Shelter                    | data figure + table + map          |
| FNSS support request (equipment, communication access, personal assistance, supervision)                        | Shelter                    | form template                      |
| Shelter registration form, daily count, incident report, health referral                                        | Shelter                    | form templates                     |
| Reunification plan, site layout, roster, release log, parent notification text, "where is my child" call script | School / site              | templates + figure                 |
| Unaccompanied or unreleased student tracker                                                                     | Reunification              | status board                       |
| Displaced children in care list with contact status                                                             | Child welfare agency       | table + status board               |
| Crisis counseling program request (immediate services)                                                          | State to FEMA/SAMHSA       | document template                  |
| Psychological first aid handout (for adults, parents, responders)                                               | Disaster behavioral health | document (public-domain candidate) |
| Public statement, social media post, rumor-control notice, media inquiry                                        | PIO                        | existing templates                 |

## 5. Regulations, doctrine and documents

- **Child welfare disaster plans:** states' child welfare programs must have procedures for responding to a disaster, covering how the state identifies, locates and continues services for children displaced or adversely affected, responds to new cases in affected areas, and stays in contact with displaced staff (Social Security Act title IV-B, 42 U.S.C. 622(b)(16)) **[V: U.S. Code via search result; the paragraph text itself should be re-read before the spec is finalized]**. Counties file plans with states (California example) **[V]**.
- **Crisis counseling:** FEMA funds crisis counseling in presidentially declared disasters under Stafford Act section 416 (44 CFR 206.171): an Immediate Services Program of up to 60 days and a Regular Services Program of up to nine months; SAMHSA provides technical assistance **[V: FEMA release and CFR index, durations to confirm against current guidance]**.
- **Mass care:** ESF #6, Mass Care, Emergency Assistance, Temporary Housing, and Human Services (2016 annex) covers congregate sheltering, feeding, distribution of emergency supplies and reunification services; the National Mass Care Strategy (2012 roadmap, FEMA and the Red Cross with National VOAD) **[V]**.
- **Access and functional needs:** FEMA's Guidance on Planning for Integration of Functional Needs Support Services in General Population Shelters (November 2010) helps shelters support people with access and functional needs without creating a separate tier, and does not change legal obligations **[V: HSDL summary; the FEMA PDF could not be fetched this session]**. FEMA Shelter Field Guide (FEMA P-785) **[V: listing]**.
- **Reunification of children:** the Post-Katrina Emergency Management Reform Act created the National Emergency Family Registry and Locator System and the National Emergency Child Locator Center inside NCMEC (6 U.S.C. 774); FEMA keeps a readiness contract with NCMEC for the center and Team Adam deployments **[V: FEMA reunification page; page is dated, re-check]**. The Standard Reunification Method (The "I Love U Guys" Foundation) is a trademarked, copyrighted, widely used school method **[V: foundation site]**; the DOJ COPS publication "Student-Parent Reunification after a School Crisis" is a federal document **[V: title and host; content not read]**.
- **Psychological first aid:** the PFA Field Operations Guide, 2nd edition (2006), from the National Child Traumatic Stress Network and the National Center for PTSD, with eight core actions (contact and engagement, safety and comfort, stabilization, information gathering, practical assistance, connection with social supports, information on coping, linkage with collaborative services) **[V]**. The NCTSN page states no copyright or permission terms **[U: check the PDF before bundling]**.
- **Requirements to exercise:** no single federal exercise requirement for crisis lines or shelters was verified. Possible drivers: state 988 contracts and behavioral health licensing, accreditation of behavioral health providers, HSEEP-based exercise programs of emergency management agencies that include mass care **[U]**.

## 6. Data sources (free, public)

| Data                                                | Source                                                                                                                  | Notes                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Open shelters (point layer, status, population)     | FEMA GIS, `NSS/OpenShelters` FeatureServer; synced daily with the Red Cross database and polled every 20 minutes        | JSON, GeoJSON, 2,000-record query cap; historical snapshots are not offered, so replay needs data the user captured **[V: service pages]** |
| Electricity-dependent Medicare beneficiaries by ZIP | HHS emPOWER Map; yearly historical workbooks and a REST service on data.gov                                             | aggregate only; person-level file is restricted to public health authorities **[V]**                                                       |
| 988 contact volumes, answer rates, times to answer  | SAMHSA national statistics; network administrator monthly state statistics; GAO dataset for July 2022 to September 2025 | calls by state; texts and chats are not reported by state **[V: GAO-26-108114 and search summaries]**                                      |
| Social vulnerability by tract                       | CDC/ATSDR Social Vulnerability Index                                                                                    | **[U: current release and terms]**                                                                                                         |
| Disaster declarations and assistance                | OpenFEMA                                                                                                                | **[U]**                                                                                                                                    |

988 numbers worth knowing for realism **[V: GAO-26-108114]**: about 19.1 million calls, texts and chats were routed to crisis centers from July 2022 through September 2025; monthly calls rose from 245,905 to 460,264, texts from 33,279 to 119,747 and chats from 75,441 to 92,936; the call answer rate rose from about 83% to about 90%; calls averaged 31 to 39 seconds to answer; about 76% of calls were answered locally; state call answer rates in September 2025 ranged from about 57% to 100%; a June to July 2024 surge in texts and chats lowered answer rates. SAMHSA's near-term goal is for local centers to answer more than 90% of routed texts and chats by September 29, 2026.

## 7. Evaluation

- **Crisis line service level:** answer rate, abandonment, time to answer, in-state (local) answer share, rerouting to backup, by contact type; SAMHSA and the network administrator publish these measures **[V]**. A surge exercise tests decisions against these curves, not invented targets; defaults come from SAMHSA's published goal and are user-editable.
- **Shelter outcomes:** time from decision to open to doors open, occupancy against capacity, share of access and functional needs requests met, time to meet a request. The FNSS guidance defines the needs categories **[V: guidance summary; categories to confirm]**. Targets are the organization's own **[U: no published national target found]**.
- **Reunification:** time to reunify, students accounted for by minute, unreleased students at hour N, exceptions handled. Published methods describe the roles and steps, not a time standard **[U]**.
- **Child welfare:** share of displaced children in care located within the state's plan targets, hotline continuity **[U]**.
- **After a real event:** the Marjory Stoneman Douglas commission found the reunification process was ineffective because neither the school district nor the sheriff's office had plans or policies for orderly reunification, and families waited as long as 12 hours for word **[U: secondary reporting of the commission's 2019 follow-up report; read the FDLE-hosted report before citing in the pack]**.
- **HSEEP core capabilities:** Mass Care Services, Public Information and Warning, Operational Communications, Operational Coordination, Situational Assessment, Health and Social Services, Fatality Management Services (for notifications) **[V: capability names are HSEEP's; mapping is ours]**.

## 8. Threat families and scenario arcs

- **Hazard-driven:** crisis line surge after a community tragedy, mass care shelter opening (hurricane, wildfire, flood, heat and power loss), school or venue incident with reunification, disaster with displaced children in care, long-duration activation with responder stress.
- **Operations-driven (shared family "service degradation"):** telephony or text platform outage, staffing shortfall, cyber incident at a crisis center or child welfare system, misinformation (wrong number, fake closures).
- Arc for a surge: trigger event → first hour contacts and queue → overflow and backup → sustained demand and staff wellbeing → recovery and debrief. Arc for a shelter: decision to open → setup and registration → first night and needs → long stay and closing. Arc for reunification: incident → site activation → check-in and release → exceptions and unreleased students → close and support.

## 9. Reuse by other domains

Shelters and mass care appear in municipal, emergency management, k12_schools and campus (school and campus shelters), healthcare (surge, discharge), public_health (shelter infection control, heat), flooding, wildfire and weather (hurricane evacuations), humanitarian (camp management, spec 0469), and stadium_venue (venue evacuations). Reunification is used by k12_schools, campus, healthcare, stadium_venue and justice (active threat aftermath, spec 0465). The crisis line toolkit serves emergency_communications (988 and 911 interplay), municipal and k12_schools. Psychological first aid knowledge is useful in every domain's recovery phase.
