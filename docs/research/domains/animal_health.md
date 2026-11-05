# Domain dossier: `animal_health` (animal disease response, veterinary and animal agriculture)

Research for the animal health epic (#693, spec 0460). Builds on the epidemiology toolkit (spec 0457) and the weather and flooding toolkits. Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** state animal health officials (state veterinarians) and their staff, USDA APHIS Veterinary Services field and emergency staff as an outside party, accredited and practicing veterinarians, diagnostic laboratories, commercial producers and integrators (poultry, swine, dairy, beef), livestock markets and processors, extension specialists, veterinary schools, county fairs and livestock shows, animal shelters and sheltering of pets and livestock in disasters, and zoos.

The existing `food_agriculture` domain covers the food and farm business side (processors, recalls, food defense) and already has a foreign animal disease seed and an `animal_health_quarantine_order` template. This domain covers the animal health agency and veterinary response and extends `food_agriculture` and `public_health` by reference.

**Exercise types this domain needs:**

- **Foreign animal disease (FAD) response:** a first detection of highly pathogenic avian influenza (HPAI), African swine fever (ASF), foot-and-mouth disease (FMD) or another transboundary disease, from suspicion through quarantine, control area, depopulation, disposal, surveillance and release. APHIS names FMD, ASF, New World screwworm and HPAI as its critical threats for its multi-year exercise plan **[V: VS NTEP FY2027–2029 plan]**.
- **Movement control and continuity of business:** permits for movement of animals, milk, eggs and products out of a control area, and keeping unaffected producers operating.
- **Zoonotic spillover:** disease in animals with exposed workers (shared with spec 0457).
- **Disaster animal care:** shelter evacuation, livestock rescue in floods, barn fires, heat or cold stress, feed and water shortage.
- **Diagnostic laboratory network exercises:** sample surge across state laboratories and the reference laboratory.
- **Vaccination logistics (FMD, where policy allows):** vaccination teams, cold chain, chain of custody, data management.

**Aliases:** state veterinarian, animal health, department of agriculture, livestock, poultry, dairy, bird flu, avian influenza, HPAI, ASF, FMD, screwworm, foreign animal disease, FAD, animal disease, USDA APHIS, vet school, extension, livestock show, fair, animal shelter.

## 2. Requirements to exercise

- **USDA APHIS Veterinary Services (VS)** runs a National Training and Exercise Program (NTEP), established in 2014, that adheres to NIMS and HSEEP. Its Training and Exercise Strategy and Plan for fiscal years 2027–2029 describes progressive exercises (seminars and workshops, tabletops, drills, functional and full-scale exercises), an annual Training and Exercise Planning Workshop, corrective action tracking, and alignment of the 20 VS FAD Preparedness and Response Plan (PReP) critical activities with the National Preparedness Goal core capabilities **[V: plan PDF read this session]**.
- Reported results: 123 training and exercise activities in fiscal year 2025; a foot-and-mouth disease vaccination full-scale exercise ("Fire Break 2026") and six New World screwworm tabletop exercises in fiscal year 2026; about 250 volunteers a year over 13 years **[V: same plan]**. The plan says NTEP supports state-level tabletops through Emergency Coordinators **[V]**.
- The plan notes a 2026 New World screwworm incident was under way while it was written, for which NTEP ran standard workshops and tabletops for states, territories and industry **[V]**.
- There is no federal rule requiring producers or states to exercise on a schedule that this research verified. States and industry exercise by agreement, through APHIS cooperative agreements and state plans **[U]**. Treat HSEEP use as the norm in the field, not as a compliance requirement.
- A second APHIS program carries the same acronym (NTEP under APHIS Directive 1810.2, an agency-wide NIMS training and exercise policy) **[V: search result titles]**. Use "VS NTEP" in text to avoid confusion.

## 3. Doctrine and public documents

- **FAD PReP:** the national preparedness and response strategy for foreign animal diseases, with manuals: 1-0 Roles and Coordination (September 2022), 2-0 Response Strategies (October 2015), 3-0 Incident Information Management and Reporting (February 2018), 4-0 Investigation Manual (2022), 5-0 Partial List of FAD Stakeholders (December 2015), 6-0 Permitted Movement (February 2017); disease pages for ASF, HPAI, FMD, virulent Newcastle disease and New World screwworm. The page was last modified September 25, 2026 and lists no manual as superseded **[V: APHIS FAD PReP page]**. The page lists no individual Red Books or playbooks inline.
- **Red Books (disease response plans) are public.** The **HPAI Response Plan: The Red Book** (updated May 22, 2017) and the **FMD Response Plan: The Red Book** (updated October 2020; the PDF footer reads "DRAFT") are posted by APHIS and were read this session **[V]**. A newer edition of either was not found **[U]**. State plans cite them; for example Washington State's HPAI cross-sector playbook (September 2025) follows FAD PReP **[V: search result, not read in full]**.
- **Premises designations** (HPAI and FMD plans, the same set): Infected Premises (IP), Contact Premises (CP), Suspect Premises (SP), At-Risk Premises (ARP), Monitored Premises (MP), Free Premises (FP), Vaccinated Premises (VP, a secondary designation) **[V]**. **Zones and areas:** Infected Zone (IZ) around infected premises; Buffer Zone (BZ) around the IZ or a contact premises; Control Area (CA) = IZ + BZ; Surveillance Zone (SZ) outside the CA, part of the Free Area (FA); Vaccination Zones, either containment (inside a CA) or protection (outside) **[V]**.
- **HPAI minimum sizes:** IZ perimeter at least 3 km beyond infected premises; BZ at least 7 km beyond the IZ; CA at least 10 km beyond the closest infected premises; SZ at least 10 km wide, with sizes adjusted by epidemiology, movement patterns, wildlife and terrain **[V: HPAI Red Book Table 5-5]**.
- **HPAI stamping-out goal:** infected poultry depopulated within 24 hours of a presumptive positive classification, or as soon as possible after, in the quickest, safest, most humane way; with limited resources, prioritize the premises with the highest potential for spread **[V: Red Book Box 4-3]**. Tracing information is entered in the Emergency Management Response System (EMRS) ideally at intervals of 24 hours or less **[V]**.
- **FMD sampling frequencies** (guideline): contact premises every 5 days for 14 days; at-risk and monitored premises every 10 days until 56 days after the last detected case; surveillance zone premises every 21 days until 56 days after the last detected case **[V: FMD Red Book Table 4-2]**.
- **HPAI in dairy cattle:** APHIS federal orders require pre-movement testing of lactating dairy cattle moving interstate (April 2024) and provide for raw milk samples to be given to APHIS on request (December 2024); the **National Milk Testing Strategy** is a five-stage framework that starts with testing milk silos at processing plants and moves to herd-level testing, with state status set by herd-level results, not silo results alone; a state page says that from April 2026 cattle from states with Unaffected status no longer need pre-movement testing, while an APHIS FAQ (January 2026) says the order remains in force, so check current rules **[V: APHIS pages and state page, conflicting dates noted]**.
- **Continuity of business:** Secure Poultry Supply (broilers, eggs, turkeys) sets the criteria for monitored premises to move product by permit; Secure Pork, Milk and Beef supply plans are parallel efforts **[V for poultry via Red Book; U for the others]**.
- **Reporting:** accredited veterinarians report suspected foreign animal disease to the State Animal Health Official and APHIS (9 CFR 161.4) **[U: from general knowledge, carried over from the `food_agriculture` dossier]**. Indemnity and compensation rules (9 CFR part 53) **[U]**. WOAH reporting of confirmed cases by the national authority **[U]**.
- **Lessons:** the Red Books state that they reflect the 2014–15 HPAI outbreak (the largest animal health incident in U.S. history at that time), the 2016 Indiana event and the 2018 ARMAR FMD functional exercise **[V]**. APHIS says bulk milk tank testing used as a screening tool in 2024 informed its expanded milk surveillance **[V]**. No formal after-action report for the dairy response was found **[U]**.

## 4. Organization and roles

| Title                                             | Abbrev. | Team                 | What they decide                                                                                     |
| ------------------------------------------------- | ------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| State Veterinarian / State Animal Health Official | SAHO    | State command        | Quarantine, control area boundaries (with APHIS), permits, state emergency declaration request       |
| APHIS Area Veterinarian in Charge                 | AVIC    | Federal (outside)    | Federal case classification, indemnity, resources, incident management team                          |
| Incident Commander / Unified Command              | IC      | Command              | Objectives, operational periods; the state and USDA run a unified command                            |
| Epidemiology Section Chief                        | EPI     | Planning             | Tracing, premises designations, zone changes, surveillance plan                                      |
| Operations: Quarantine and Movement Control       | MOVE    | Operations           | Checkpoints, permits, movement exceptions                                                            |
| Operations: Depopulation and Disposal             | DEPOP   | Operations           | Method, sequence, personnel safety, carcass disposal site, cleaning and disinfection                 |
| Laboratory Director (NAHLN laboratory)            | LAB     | Laboratory           | Sample prioritization, presumptive result, shipment to the National Veterinary Services Laboratories |
| Producer / Complex Manager / Integrator           | PROD    | Industry             | Biosecurity, depopulation access, continuity, employee health, contracts                             |
| Extension Specialist                              | EXT     | Outreach             | Producer communication, backyard flock owners, fair exhibitors                                       |
| Public Health Veterinarian / Epidemiologist       | PHV     | Public health        | Worker exposure follow-up, antiviral prophylaxis, human case reporting                               |
| Public Information Officer                        | PIO     | Command staff        | Consumer messages (food safety), producer notices, rumor control                                     |
| Emergency Manager (county)                        | EM      | Local                | Support for road checkpoints, disposal sites, sheltering animals                                     |
| Animal Shelter Director / Animal Services         | ASD     | Disaster animal care | Evacuation, pet-friendly shelter, intake, reunification                                              |

Titles from the NTEP plan and general practice **[V for NPIC, NAHLN, NVSL, EMRS, IMT; U for the table as a whole]**.

**Outside parties:** APHIS (NPIC, NVSL, Field Operations), CDC and state health (zoonoses), FDA and USDA FSIS, state emergency management, law enforcement (checkpoints), trading partners, commodity groups and cooperatives, auction markets, haulers, rendering and landfill operators, wildlife agencies (wild bird and feral swine), tribal governments, and the media.

## 5. Systems

- **EMRS** (Emergency Management Response System) for tracing, premises records and situation reports **[V]**.
- NAHLN and NVSL for diagnostics: presumptive result at a NAHLN laboratory, confirmation at NVSL **[V]**.
- Premises identification numbers, animal disease traceability systems, movement permit systems, GIS, state emergency operations systems, incident action plan tools (ICS 201, 202, 205, 213, 214).
- Operational dependencies: power and ventilation in barns, cold chain for vaccine, feed and water, trucking, disposal sites.

## 6. Products (what injects look like)

| Product                                                                                    | Render                                       |
| ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Premises map with designations and zones (IZ, BZ, CA, SZ), radii shown                     | map figure                                   |
| Premises table (id, species, head count, designation, status, last sample)                 | table figure                                 |
| Quarantine order, hold order, control area notice                                          | text template (exists in `food_agriculture`) |
| Movement permit request and decision (reason, species, destination, testing)               | text template                                |
| Presumptive positive notice, NVSL confirmation, lab result sheet                           | text template                                |
| Situation report, incident action plan pages, resource request                             | existing ICS templates                       |
| Depopulation and disposal tracker (premises, head, method, status, disposal site capacity) | status board                                 |
| Epidemic curve of confirmed premises, tracing diagram (contacts in and out)                | data figure (toolkit 0457)                   |
| Sampling schedule by designation (table above)                                             | table figure                                 |
| Indemnity claim worksheet                                                                  | text template                                |
| Producer letter, fair or show cancellation notice, consumer FAQ, press release             | text templates                               |
| Worker health monitoring log                                                               | text template                                |
| Social posts, hotline notes, producer messages                                             | existing templates                           |

## 7. Free public data for replay and figures

| Data                                                            | Source                                                               | Notes                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| HPAI confirmations in commercial and backyard flocks since 2022 | APHIS page and its data table; CDC mirrors a CSV; DataLumos archive  | county, state, flock type, birds affected, confirmation date **[V: page exists; columns not read]** |
| HPAI detections in livestock (dairy)                            | APHIS HPAI livestock pages                                           | **[U: table fields]**                                                                               |
| Wild bird and mammal detections                                 | APHIS and USGS                                                       | **[U]**                                                                                             |
| Animal and farm inventories by county                           | USDA National Agricultural Statistics Service, Census of Agriculture | **[U]**                                                                                             |
| County boundaries, roads, rivers                                | Census TIGER, existing map data                                      | used for zone maps                                                                                  |

APHIS flock records are anonymous by design: they give county and flock type, not farm names or addresses, so replay keeps the project's naming rule. Real premises locations are never shown; premises in a scenario are fictional points placed by the scenario.

## 8. Simulation

- **Premises generator:** fictional premises with species, head counts and density consistent with a county's farm inventory, on the map.
- **Spread model:** a simple stochastic spread between premises by distance kernel and movement links (parameters in the scenario), producing infected premises over time, a tracing network and an epidemic curve, using the epidemiology toolkit's compartment tools at premises level.
- **Zone calculator:** control area geometry from infected premises using the plan's minimum sizes (HPAI 3/7/10 km, SZ 10 km), with the option to override.
- **Depopulation capacity model:** crew capacity per day, disposal site capacity, backlog.
- All labeled simulated.

## 9. Evaluation

- **Time to quarantine and control area set-up** after a presumptive positive (HPAI goal: depopulation within 24 hours of presumptive positive, a decision-timing benchmark from the Red Book **[V]**).
- **Premises surveyed on schedule** against the sampling frequencies by designation **[V]**.
- **Continuity of business:** movement permits decided within the exercise's service target; share of unaffected premises able to move product.
- **Depopulation and disposal throughput** against backlog.
- **Message consistency** between state, industry and public health.
- **Core capabilities (HSEEP):** NTEP aligns to National Preparedness Goal core capabilities **[V]**; typical ones include Operational Coordination, Public Information and Warning, Situational Assessment, Supply Chain Integrity and Security, Environmental Response/Health and Safety **[U: names to confirm]**.

## 10. Threat families and arcs

HPAI in commercial poultry, HPAI in dairy cattle, ASF introduction, FMD with movement standstill and vaccination, New World screwworm incursion, virulent Newcastle disease, zoonotic spillover to workers, disaster animal care (shelter evacuation, barn fire, flooded farms), and the shared **service degradation** family (EMRS outage, laboratory backlog, checkpoint staffing shortfall). Arc: suspicion → presumptive positive → quarantine and zones → tracing and surveillance → depopulation and disposal → cleaning and release → recovery and trade.

## 11. Reuse by other domains

`food_agriculture` (processors, trade, recalls), `public_health` (zoonoses, worker health), emergency management and municipal (checkpoints, disposal sites, fair cancellations), campuses with vet schools or farms, port and freight (animal and feed shipments), K–12 and county fairs (4-H and FFA shows), wildlife and zoo operators, humanitarian response (animal health in disasters, #702). The premises, zones and movement-control figures feed the logistics toolkit (#695).
