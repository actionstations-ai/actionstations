# Domain dossier: `justice` (law enforcement, corrections and courts)

Research for the law enforcement, corrections and courts epic (#698, spec 0465) and the toolkit framework (#648, spec 0448). Researched 2026-11-05. **[V]** = checked this session against a primary or official source (or, where noted, an official listing of it). **[U]** = not verified this session.

**Level of detail rule for this field.** Action Stations exercises command, coordination and decisions: who is in charge, which agencies are at the table, what the public and families are told, what continues to run. It does not teach tactics. Nothing in this domain, its toolkit or its examples describes entry methods, weapon handling, tactical positioning, ways to defeat security measures, or how to plan an attack; radio traffic and logs are written at the level of units, building-level locations and status. The spec turns this into generator rules, lint and tests (spec 0465 FR-7).

## 1. Scope

**Covers:** municipal police and sheriff's offices, campus and transit police, state agencies as partners; jails and prisons (administrators, shift commanders, health services); state and local courts and their administrators, clerks, security, IT and public information; prosecutors and public defenders as outside parties; law schools and criminal justice programs.

**Exercise types this domain needs:**

- **Active assailant response and unified command:** the first hour of a multi-agency response: recognizing the incident type, establishing command, mutual aid, rescue coordination with fire and EMS, public information, family reunification, and the long investigation. Complex coordinated attacks add simultaneous sites.
- **Crisis negotiation:** activating a negotiation team, the information flow between negotiators, the incident commander and the tactical commander, welfare checks, and what leadership decides when talks stall.
- **Missing child and AMBER alert:** deciding whether criteria are met, entering data into the national crime database, issuing the alert, tip handling and media.
- **Civil unrest:** crowd events, mutual aid, communications with organizers, curfew decisions, legal advisor input.
- **Corrections emergencies:** a disturbance, a medical emergency, a facility lockdown, an evacuation after a hazard, count discrepancies, staffing shortfalls, loss of power or communications.
- **Court continuity:** ransomware that takes out the case management system, courthouse evacuation, a security incident in a courtroom, a pandemic or severe weather closure; speedy trial and emergency hearing questions.
- **Evidence and chain of custody:** property room failure, mislabeled evidence, audit discrepancies, and their effect on cases.

**Aliases:** police, sheriff, law enforcement, patrol, dispatch, SWAT, tactical, negotiators, detention, jail, prison, corrections, DOC, court, judiciary, clerk of court, court administrator, bailiff, evidence unit, property room.

## 2. Organization and roles

| Title                                     | Abbrev.      | Team              | What they decide                                                                                     |
| ----------------------------------------- | ------------ | ----------------- | ---------------------------------------------------------------------------------------------------- |
| Chief of Police / Sheriff                 | CHIEF        | Executive         | Agency posture, requests for outside help, public statements, legal exposure                         |
| Incident Commander                        | IC           | Incident command  | Incident objectives, establishing the command post, unified command with fire/EMS and other agencies |
| Patrol / Field Supervisor                 | SUP          | Field             | First-arriving command, status reports, handoff of command                                           |
| Communications Supervisor (dispatch)      | COMMS        | Dispatch          | Channel assignments, resource tracking, interoperability, call-taker priorities                      |
| Tactical Commander                        | TAC          | Specialized units | Advises the IC on options; **role appears, tactical detail does not**                                |
| Negotiation Team Leader                   | NEG          | Specialized units | Activates the team, briefs the IC, recommends strategy at the decision level                         |
| Operations / Logistics / Planning Section | OPS/LOG/PLAN | ICS staff         | Staging, mutual aid, reunification site, resource requests, shift planning                           |
| Investigations Commander                  | INV          | Investigations    | Scene control, evidence, witness handling, joint investigation with other agencies                   |
| Public Information Officer                | PIO          | Communications    | Media, social media, joint information center, family communication coordination                     |
| Victim / Family Services Coordinator      | VSC          | Support           | Reunification and notification, family assistance center                                             |
| Legal Advisor                             | LEGAL        | Staff             | Authority for orders, use of mutual aid, public records, liability                                   |
| Warden / Jail Administrator               | WARDEN       | Corrections       | Lockdown, external help, public statements, population management                                    |
| Shift Commander (corrections)             | SHIFT        | Corrections       | Facility response, counts, staffing                                                                  |
| Health Services Administrator             | HSA          | Corrections       | Medical emergencies, transfers to hospitals, infection control                                       |
| Presiding Judge                           | JUDGE        | Court             | Orders to close, to continue or to move hearings, emergency orders                                   |
| Court Administrator / Clerk of Court      | CTADM        | Court             | Continuity of operations, staffing, filings, docket, communications                                  |
| Court Security Commander                  | CTSEC        | Court             | Courthouse security and evacuation (often the sheriff)                                               |
| Court IT Director                         | CTIT         | Court             | System recovery, backups, e-filing, remote hearings                                                  |
| Prosecutor and Public Defender leads      | DA/PD        | Outside parties   | Case impact, speedy trial and detention questions, evidence                                          |

**Outside parties:** fire and EMS, the local EOC, neighboring and state agencies (mutual aid, state police), federal partners (FBI and others), 911 centers (the existing `emergency_communications` domain), hospitals, school districts and campuses, the state court administrative office, the county or state IT security office and CISA, the public defender and bar, families and advocacy groups, news media and the public on social media, and oversight bodies.

## 3. Systems

- **Law enforcement:** computer-aided dispatch (CAD) with unit status and incident chronology, records management, land mobile radio systems with interoperability channels, next generation 911, vehicle location, camera and license plate reader systems, mass notification, the national crime information database for missing and wanted persons, evidence and property management **[U: systems vary; the dossier is vendor-neutral]**.
- **Corrections:** jail or offender management system (population, classification, movement, medical), control room and door control, camera systems, radio, inmate telephone and video visitation, commissary, health records **[U]**.
- **Courts:** case management system, electronic filing, jury management, courtroom audio/video and remote hearing platforms, public website and records portals, payment systems, statewide systems run by the administrative office **[U]**.
- **Dependencies:** power, network and telephone, buildings and transport (prisoner transport), interpreters, hospitals, bail and pretrial services.

## 4. Products (what injects look like)

| Product                                                                                                                     | From                 | Render                                |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------- |
| CAD incident chronology and unit status board (building-level locations only)                                               | Dispatch             | data figure + table                   |
| Radio traffic transcript (fictional, coordination-level)                                                                    | Dispatch             | text template                         |
| ICS forms for the incident (incident briefing, objectives, organization, communications plan)                               | Command post         | existing ICS templates                |
| Unified command briefing, mutual aid request, staging and reunification site plan                                           | Incident command     | document templates                    |
| Joint information center statements, media advisory, social media post, rumor-control notice                                | PIO                  | existing templates                    |
| Family assistance and reunification notice                                                                                  | Victim services      | text template (shared with spec 0464) |
| Negotiation log (fictional; contact times, subject welfare indicators at the level of "agreed to speak", decision requests) | Negotiation team     | log template                          |
| AMBER alert activation worksheet (criteria checklist), data entry confirmation, alert text, tip log                         | Investigations       | form + text templates                 |
| Corrections count sheet, movement log, incident report, lockdown notice, population dashboard                               | Jail / prison        | data figure + templates               |
| Evidence chain-of-custody log, audit discrepancy memo, property room inventory                                              | Evidence unit        | log templates                         |
| Court closure order, emergency docket order, e-filing outage notice, remote hearing notice, jury notice, public statement   | Court                | document templates                    |
| Court continuity status board (essential functions, recovery status)                                                        | Court administration | status board                          |
| Ransomware note and system outage tickets (non-functional, fictional)                                                       | Court IT             | existing templates                    |

## 5. Regulations, doctrine and documents

- **Unified command is the planning norm for active shooter incidents:** the U.S. Fire Administration's guide for fire/EMS and law enforcement calls for a single incident command post and unified command, and a PIO with a joint information system **[V: USFA active shooter guide, as returned by search]**. FEMA's "Planning Considerations: Complex Coordinated Terrorist Attacks" (2018) offers a six-step planning process **[V: FEMA announcement and PDF title; PDF indexed as a draft, use the final]**. CISA's "Planning and Response to an Active Shooter" (2021) **[V: listing]**.
- **Real after-action material:** the Justice Department's Critical Incident Review of the Robb Elementary response (January 18, 2024) found that no one established an incident command structure while officers from several agencies arrived, that officers should have treated the event as an active shooter incident immediately, and that agencies in a county or region should sign memoranda of understanding saying who leads a multiagency response **[V: DOJ review as reported by several outlets; COPS review page cops.usdoj.gov/uvalde listed; report body not read]**. The COPS Office and Police Foundation review of the Orlando Pulse nightclub response (2017) is a second public critical incident review **[V: listing]**.
- **AMBER Alert:** the Justice Department's recommended criteria: law enforcement has a reasonable belief that an abduction occurred; believes the child is in imminent danger of serious bodily injury or death; has enough descriptive information to issue an alert; the child is 17 or younger; and the child's name and critical data, including the Child Abduction flag, have been entered into the national crime information database. The program says to enter data immediately and that omitting the entry "undermines the entire mission" **[V: amberalert.ojp.gov]**. The criteria are recommendations; states set their own **[V: secondary summary]**.
- **Corrections emergencies:** National Institute of Corrections guides: "A Guide to Preparing for and Responding to Emergencies in Correctional Facilities" (2025, 237 pages), the 2009 jail guide (NCJ 228582) with self-audit checklists for smaller and larger jails, and the 2005 prison guide **[V: NIC library pages; copyright status not stated on the page, federal publications expected public domain, check each]**.
- **Courts:** the National Center for State Courts' "Cybersecurity basics for courts" (2025) covers incident response teams and putting cyber playbooks into continuity and recovery plans; NCSC continuity guidance frames essential functions and recovery time objectives; a resolution of the Conference of Chief Justices and Conference of State Court Administrators calls for cybersecurity response plans inside continuity plans, tested regularly **[V: NCSC pages, search summaries]**. Federal judiciary continuity guidance **[U: not found public]**.
- **Crisis negotiation:** the FBI's Crisis Negotiation Unit recommends at least three negotiators per incident (primary negotiator, coach, team leader who coordinates with the commander); local teams describe intelligence roles as well **[V: OJP abstract as returned by search; the FBI document itself not read; agency structures vary]**.
- **Requirements to exercise:** state and local mandates for active threat drills in schools, accreditation programs for law enforcement and corrections, and homeland security grants that require HSEEP-based exercises are likely drivers; none were verified this session **[U]**.

## 6. Data sources (free, public)

| Data                                               | Source                                                                                                                                                                        | Notes                                                                                                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Police calls for service (CAD fields)              | City open data portals, for example Seattle Police "Call Data" (event number, queue time, arrival time, response category) and San Francisco law enforcement dispatched calls | Seattle releases more than 95% of calls without latitude and longitude and updates daily; San Francisco publishes a real-time dispatched calls dataset **[V: portal pages]**           |
| Active shooter incident counts and characteristics | FBI annual "Active Shooter Incidents in the United States" reports                                                                                                            | the 2023 report counts 48 incidents with 244 casualties including 105 killed, 26 states; 2019 to 2023 total 229 **[V: FBI press release and PDF as returned by search; PDF not read]** |
| Jail population, admissions                        | BJS "Jail Inmates in 2024" statistical tables                                                                                                                                 | average daily population 667,700 and a rate of 194 per 100,000 in 2024; 7.6 million admissions in the year ending June 2023; CSV downloads **[V]**                                     |
| Crime data                                         | FBI Crime Data Explorer                                                                                                                                                       | **[U: not checked]**                                                                                                                                                                   |
| Court statistics                                   | NCSC and state court administrative offices                                                                                                                                   | **[U]**                                                                                                                                                                                |

Real court cyber incidents give realistic shapes for simulation: the Los Angeles County Superior Court shut nearly all network systems after a July 19, 2024 attack, closed all 36 courthouses for a time and reopened on July 23 with reduced functions; the Kansas statewide judiciary reported a security incident in October 2023 that disrupted nearly every district court while paper and fax filings were accepted **[U: news and trade reporting; court orders are the primary sources to read before citing]**.

## 7. Evaluation

- **Time to unified command:** from first arrival to a staffed command post with unified command and a named IC, per agency present. The Robb Elementary review makes this the central measure for active assailant exercises **[V: finding as above]**.
- **Public and family communication:** time to first public statement, time to a family reunification or assistance center, consistency of statements across agencies (spec 0448 message consistency).
- **AMBER decision quality:** time from report to alert issue; whether the criteria checklist was completed; whether database entry preceded the alert **[V: criteria; no published time standard found]**.
- **Corrections:** time to accurate count, time to restore control of an area, medical response time; targets belong to the facility **[U]**.
- **Court continuity:** time to resume each essential function against its recovery time objective, backlog and filings handled by fallback, communication to the bar and public **[V: NCSC framing]**.
- **Evidence:** time to identify scope of a chain-of-custody problem, cases notified **[U]**.
- **HSEEP core capabilities:** Operational Coordination, Operational Communications, Public Information and Warning, On-scene Security Protection and Law Enforcement, Situational Assessment, Mass Search and Rescue Operations, Forensics and Attribution, Cybersecurity (courts), Mass Care Services (reunification) **[V: capability names are HSEEP's; mapping is ours]**.

## 8. Threat families and scenario arcs

- **Incident-driven:** active assailant (single and complex coordinated), barricaded subject with negotiation, missing or abducted child, civil unrest, corrections disturbance or medical emergency, evidence integrity failure.
- **Operations-driven (shared "service degradation"):** court ransomware, courthouse evacuation, jail power or communications loss, dispatch system failure (links to the `emergency_communications` domain), staffing shortfall.
- Arc for an active assailant: first reports → first-arriving command and recognizing the incident → command post and unified command → public information and family reunification → investigation and scene → recovery, notification and review. Arc for court ransomware: detection → shutdown decisions → closure and notification → fallback operations → restoration in priority order → review.

## 9. Reuse by other domains

Unified command, dispatch and public information appear in municipal, k12_schools and campus (school and campus police), stadium_venue, transit and airport (transit and airport police), healthcare (workplace violence), elections (threats at polling places), commercial_facilities and port_maritime. Reunification and family notification reuse the human services toolkit (spec 0464). Court ransomware and continuity reuse the cyber scenarios of every domain and the data_center_it domain. The justice toolkit's dispatch pieces reuse `emergency_communications`.

## Expert review (2026-11-11)

Model-led expert review from the standpoint of a law enforcement and corrections emergency manager who has run court continuity planning. It is not a review by a licensed or employed practitioner.

**Checked:** the domain profile (roles, threat families, phase beats, decision points, prompt guidance), the justice toolkit (glossary, realism rules, decision forms, metrics, critical tasks), the coordination-level guardrails, the count sheet, corrections report, court order, court notice and AMBER worksheet preview data, the jail count and court outage simulators, and the user guide.

**Sources:** AMBER Alert recommended criteria (amberalert.ojp.gov, as recorded above and matched by the worksheet); County of Riverside v. McLaughlin, 500 U.S. 44 (1991), for the 48-hour probable cause determination after a warrantless arrest; the DOJ COPS critical incident review of the Uvalde response (January 2024), already cited.

**Changed and why:**

- Count: the glossary now defines the out-count (people logged out to court, a hospital or work release) and the recount before a discrepancy is treated as an escape; counts that ignore the out-count are the most common source of a false "short" count. A corrections beat now names the out-count, and another names the victim notification service and the prosecutor when someone stays unaccounted for. The victim notification service and victim advocates are an outside party.
- Court continuity: a realism rule and a service degradation beat now keep first appearances and probable cause determinations for people in custody running during an outage, with protective orders and juvenile detention hearings. The emergency docket order preview already showed this.
- The National Center for Missing & Exploited Children is named correctly in the toolkit and the missing child family.

**Defaults set:** time to unified command 30 minutes, family center 60 minutes and accurate count 60 minutes are kept as planner-editable targets; an hour to clear a count is a fair outer bound for a facility of a few hundred. AMBER issue window 120 minutes kept; no national time standard exists.

**Caveats:** the jail count simulator compares each area with its assigned population and lets the movement log explain the difference; facilities that keep a running in-area expected count will read the sheet differently. State first appearance rules vary (24 to 72 hours); the guide tells planners to use their own. Tactical content remains excluded by design.
