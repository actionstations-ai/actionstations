# Domain dossier: `public_health` (local or state health department) — NEW

Researched 2026-10-24. "Verified" means checked against the primary source this session; anything else is marked unverified.

## 1. Scope

- **Covers:** county / city / district local health departments (LHDs), state health departments (SHDs) and their public health labs, tribal health departments, and multi-county health districts. The profile is about the governmental public-health agency, not care delivery (that is `healthcare`).
- **Aliases users might type:** health department, public health, LHD, county health, state health department, department of health, DOH, DPH, board of health, health district, public health agency, epidemiology, PHEP.
- **CISA sector:** Healthcare and Public Health (HPH) Sector. Government facilities overlap (the agency is also a government entity).
- **Sector Risk Management Agency:** HHS, with ASPR as the coordinating office. CDC funds and sets standards for state and local public-health preparedness through the PHEP cooperative agreement (Public Health Service Act §319C-1, 42 U.S.C. 247d-3a; not re-fetched).
- **Overlap:** `municipal` (the county EOC), `water_utility` (boil-water advisories are issued with or by the health department under state rules), `healthcare` (coalition partner).

## 2. Organization and roles

Titles are the common ones at U.S. LHDs and SHDs; individual agencies differ (titles not verified against a single standard).

| Key       | Title                                                      | Abbr. | Team                                     | Decides                                                                                                 |
| --------- | ---------------------------------------------------------- | ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ho        | Health Officer / Health Director / Health Commissioner     | HO    | Command / Executive                      | Health orders (isolation, quarantine, closure), declaring a local public-health emergency, policy group |
| mo        | Medical Director / Chief Medical Officer                   | MD    | Medical / Epidemiology                   | Clinical guidance, standing orders for countermeasure dispensing, health alerts                         |
| prep      | Public Health Emergency Preparedness Coordinator           | PHEP  | Command staff / Planning                 | Departmental Operations Center (DOC) activation, IMS staffing, plans, exercises                         |
| epi       | Lead Epidemiologist / Communicable Disease Program Manager | Epi   | Operations: Surveillance & Investigation | Case definitions, contact tracing, outbreak declaration, data release                                   |
| lab       | Public Health Laboratory Director                          | Lab   | Operations: Laboratory                   | Testing priorities, LRN (Laboratory Response Network) sample routing, chain of custody                  |
| eh        | Director of Environmental Health                           | EH    | Operations: Environmental Health         | Restaurant / pool closures, boil-water and drinking-water advisories, vector control, food recalls      |
| pio       | Public Information Officer                                 | PIO   | Command staff                            | HAN / press / social media, rumor control, translation, CERC                                            |
| mcm       | Medical Countermeasures / SNS Coordinator                  | MCM   | Logistics                                | Request and receipt of Strategic National Stockpile materiel, POD activation, cold chain                |
| nurse     | Director of Public Health Nursing / Clinic Operations      | PHN   | Operations: Clinical Services            | Vaccination clinics, POD staffing, home visits                                                          |
| it        | IT Director / Informatics Lead (often county IT)           | IT    | IT / Informatics                         | Surveillance systems, ELR/eCR feeds, immunization registry, network isolation                           |
| liaison   | Liaison to EOC / Healthcare Coalition                      | LNO   | Command staff                            | Seat in the county EOC (ESF-8), coalition coordination                                                  |
| legal     | Agency Counsel / County Attorney                           | Legal | Legal                                    | Authority for orders, data-sharing limits, records requests                                             |
| volunteer | Volunteer Coordinator (Medical Reserve Corps unit leader)  | MRC   | Logistics                                | Volunteer activation and credentialing                                                                  |
| finance   | Finance / Administration Section Chief                     | Fin   | Finance                                  | Emergency procurement, cost tracking for reimbursement                                                  |

## 3. Systems

**IT:**

- Disease surveillance / case management system: e.g. CDC's NEDSS Base System (NBS), or commercial platforms such as Maven.
- Electronic laboratory reporting (ELR) and electronic case reporting (eCR) feeds, often via the APHL AIMS platform / Reportable Conditions Knowledge Management System.
- Syndromic surveillance: e.g. CDC NSSP BioSense Platform / ESSENCE.
- Immunization Information System (IIS) / immunization registry.
- Laboratory information management system (LIMS) at the public health lab.
- Vital records (birth / death registration, EDRS).
- Health Alert Network (HAN) messaging and partner alerting (e.g. Everbridge-type mass notification).
- Inventory / countermeasure tracking (e.g. CDC IRIS, unverified current name), cold-chain monitoring.
- Environmental health inspection / permitting database.
- Clinic EHR and billing (WIC, STD, TB, family planning clinics).
- Public website, data dashboards, call center / hotline.
- County shared services: email, AD, ERP / payroll, SIEM (often via county IT).

**OT / physical:**

- Public health lab building systems: BSL-3 suite HVAC and directional airflow, autoclaves, freezers (-80 °C) with temperature alarms.
- Vaccine refrigerators / freezers with remote temperature monitoring.
- Access control and CCTV at the lab and clinics.
- POD (point of dispensing) sites: school gyms and community centers, run on temporary IT.

**Identifiers seen in health department documents (fact categories):**

- **POD sites** (`POD 3 – Lincoln High School`): proposed `pods`, alnum, lint yes.
- **Clinics / district offices** (`North District Clinic`): proposed `clinics`.
- **Outbreak / case numbers** (`OB-2026-0147`, `Case 24-05581`): proposed `outbreaks`, token, not linted.
- **Health districts / service areas**: reuse `wards`-style `districts`.
- **Lab specimen / accession IDs** (`PHL-26-031882`): token, scene detail only.
- **Public water systems** (PWSID, e.g. `ST1234567`): shared with `water_utility`.
- **Food establishments** (permit numbers): token.

## 4. Outside parties and media

- **Federal:** CDC (Emergency Operations Center, Epi-Aid, the PHEP program office), ASPR (SNS, the HPP program, regional emergency coordinators), FDA (food recalls, EUA), USDA FSIS (meat / poultry outbreaks), EPA (drinking water), FBI WMD coordinator (bioterrorism joint investigation), CISA, FEMA region.
- **State / local:** state health department (or local, depending on which one exercises), state public health lab, county emergency management / EOC, county IT, school districts, sheriff / police, medical examiner / coroner, county board / council, state epidemiologist.
- **Partners:** healthcare coalition, hospitals and infection preventionists, long-term-care facilities, pharmacies, community health centers, Medical Reserve Corps, Red Cross, faith and community organizations, tribal nations, universities.
- **Associations (copyrighted output):** NACCHO, ASTHO, CSTE, APHL.
- **Vendors:** surveillance-platform vendor, LIMS vendor, IIS vendor, mass-notification vendor, cold-chain monitor vendor, courier.
- **ISAC:** Health-ISAC (some SHDs are members); MS-ISAC for the government side (fee-based since federal funding ended 2025-09-30 per Route Fifty and other trade press; secondary sources).
- **Media channels:** local TV, a health reporter's email, a parent group on Facebook, a viral TikTok or X post with false claims, a school-district email to parents, a county commissioner's post, harassment of the health officer by email or voicemail, a Spanish-language radio station.

## 5. Regulatory drivers and plans

| Plan                                                                     | Legal basis                                                                                                                                                                                                              | Contents                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| All-hazards public health emergency operations plan (EOP / ESF-8 annex)  | PHEP cooperative agreement requirements (PHS Act §319C-1) and the CDC _Public Health Emergency Preparedness and Response Capabilities_ (Oct 2018, updated Jan 2019, **verified**: 15 capabilities); county EOP (CPG 101) | Concept of operations, IMS / DOC activation levels, ESF-8 role in the county EOC                                             |
| Medical countermeasure (MCM) dispensing and distribution plan / POD plan | PHEP Capabilities 8 (MCM Dispensing and Administration) and 9 (Medical Materiel Management and Distribution); CDC Operational Readiness Review (unverified current name)                                                 | SNS request chain, receipt-stage-store site, POD locations and staffing, throughput, security                                |
| Crisis and emergency risk communication plan                             | PHEP Capability 4 (Emergency Public Information and Warning); CDC CERC                                                                                                                                                   | Spokespersons, message maps, translation, rumor control, HAN                                                                 |
| Pandemic / infectious disease plan                                       | PHEP; state law                                                                                                                                                                                                          | Surveillance triggers, nonpharmaceutical interventions (Capability 11), isolation and quarantine legal process               |
| Continuity of operations plan (COOP)                                     | FEMA continuity guidance (Federal Continuity Directive 1 binds federal agencies; SLTT use the Continuity Guidance Circular, not fetched this session)                                                                    | Essential functions (disease reporting, vital records, lab), orders of succession, alternate sites                           |
| Public health lab biosafety / select agent plans                         | 42 CFR Part 73 (Select Agent Program; not re-fetched)                                                                                                                                                                    | Security, incident response, and a reporting duty for theft / loss / release                                                 |
| Communicable disease reporting rules                                     | State law and administrative code (varies)                                                                                                                                                                               | Reportable-condition list, timelines (e.g. "immediately by phone" for Category A agents; timing varies by state, unverified) |
| Information security program                                             | State law, HIPAA where the department runs covered clinics (hybrid entity)                                                                                                                                               | Clinics may be HIPAA covered components; surveillance data is usually governed by state confidentiality law                  |

The 15 CDC PHEP capabilities (verified from the PDF table of contents): 1 Community Preparedness; 2 Community Recovery; 3 Emergency Operations Coordination; 4 Emergency Public Information and Warning; 5 Fatality Management; 6 Information Sharing; 7 Mass Care; 8 Medical Countermeasure Dispensing and Administration; 9 Medical Materiel Management and Distribution; 10 Medical Surge; 11 Nonpharmaceutical Interventions; 12 Public Health Laboratory Testing; 13 Public Health Surveillance and Epidemiological Investigation; 14 Responder Safety and Health; 15 Volunteer Management.

ASPR's newer _National Health Care Preparedness and Response Capabilities_ is in "Pre-decisional Review" per the ASPR FAQ page (verified 2026-10-24). Don't bundle it; the 2017-2022 HCC capabilities remain the referenced edition.

## 6. Common operational workflows

- **DOC / IMS activation:** the PHEP coordinator recommends an activation level, the health officer approves, and an ICS 201 is opened. The liaison takes the ESF-8 seat in the county EOC. Operational periods are often 12 h or 24 h.
- **Outbreak investigation:** a signal arrives (ELR spike, ESSENCE alert, clinician call, lab result). Epi assigns an outbreak number, interviews cases, defines a case definition, and does contact tracing. Environmental health inspects; the lab confirms. HAN goes to clinicians and the PIO issues a press release.
- **Health Alert Network (HAN):** levels Alert / Advisory / Update / Info Service (CDC HAN categories; local HANs mirror them, unverified per jurisdiction). The medical director signs.
- **Notifiable-disease reporting up:** LHD to state (per state rule), state to CDC through NNDSS. Immediately notifiable conditions are reported to CDC by phone within 4 h or 24 h per the CSTE list (unverified this session).
- **SNS / MCM request:** the LHD asks the state, the state asks CDC / ASPR, then materiel goes to the receipt-stage-store warehouse, then PODs. Security escort, cold chain and the inventory system are required.
- **Isolation / quarantine orders:** the health officer issues an order under state statute. It is served by staff or law enforcement, and court enforcement is available. Templates are state-specific.
- **Boil-water / do-not-drink advisory:** the water system and the drinking-water program (state primacy agency, or the LHD under delegation) issue it. The EPA Public Notification Rule requires Tier 1 public notice "as soon as practical but no later than 24 hours" (40 CFR 141.202; not re-fetched this session).
- **Cyber incident at the department:** county IT runs it with the county CIRP. Typical impacts are surveillance and IIS downtime, loss of ELR feeds (manual fax / phone reporting from labs and hospitals), and a breach of clinic PHI (HIPAA 60-day clock if the clinic is a covered component; see `healthcare` dossier §6). CIRCIA is not in force (see the healthcare dossier).
- **Forms:** ICS 201/202/203/204/205/213/213RR/214/215, HAN message, health order template, line list (outbreak spreadsheet), POD throughput tally, chain-of-custody form (lab), SNS request form (state-specific), CDC case-report forms.

## 7. Exercise scenarios (seeds)

1. **Cyber:** Ransomware on county IT takes down the surveillance system and the immunization registry during a measles outbreak. Labs revert to fax, and contact tracing goes to spreadsheets. (CISA HPH CTEP Oct 2023; CISA Local Governments CTEP Nov 2023 case studies.)
2. **Infectious disease:** A multi-county foodborne outbreak is traced to a regional caterer. Epi, environmental health, the lab and a USDA/FDA recall have to be coordinated, and a viral review post names the wrong restaurant. (CDC CERC _Messages and Audiences_, 2018.)
3. **Medical countermeasures:** A bioterrorism (anthrax) letter is found at a mail facility. A 48-hour mass prophylaxis campaign needs SNS requests and POD security, and a POD loses connectivity. (CDC PHEP Capabilities 8 and 9.)
4. **Insider / data:** A contact-tracing contractor exports the case list and posts names on a forum. The questions are state confidentiality law vs. HIPAA hybrid-entity status, plus public trust. (PHEP Capability 6 Information Sharing.)
5. **Harassment / physical security:** Threatening voicemails and a doxxing post target the health officer after a closure order. A protest at the clinic follows, and a staff member gets a suspicious package. (Pattern recorded in CDC CERC "Psychology of a Crisis" (2019) on public anger, not fetched this session; no specific report cited.)
6. **Infrastructure failure / cold chain:** A power outage plus a failed vaccine-freezer alarm means the department must decide whether to discard doses. Inventory is re-reported while the remote temperature-monitor vendor is offline.
7. **Natural hazard:** A heat wave combined with rolling blackouts calls for cooling-center openings, vulnerable-population outreach, medical surge and fatality management. (PHEP Capabilities 5, 7, 10; FEMA _Healthcare Facilities and Power Outages_.)
8. **Water / environmental:** A water utility reports a SCADA anomaly and possible chemical overfeed. The health department issues a do-not-drink advisory, symptom surveillance runs through ESSENCE, and the advisory is translated. (Ties to the `water_utility` pack.)
9. **Mass gathering:** A large festival or sports final brings syndromic surveillance, a heat-illness cluster, and a measles exposure notice to thousands of attendees.
10. **Disinformation:** A deepfake video of the health officer "announcing" a mandatory quarantine circulates, and the call center is overwhelmed. (CDC CERC Introduction 2018: "Be First, Be Right, Be Credible".)

## 8. Inject templates

Existing templates that fit: `press_release`, `email`, `email_forward`, `memo`, `official_letter` (health order, CDC letter), `regulatory_notice`, `phone_call`, `voicemail` (threat), `text_message`, `facebook_post`, `tweet`, `tiktok_video_card`, `reddit_post`, `news_article`, `news_chyron_still`, `media_inquiry_phone_slip`, `helpdesk_ticket`, `error_dialog`, `system_log`, `siem_alert`, `ransom_note`, `sitrep`, `status_board`, `ics_201_prefill`, `ics_203_prefill`, `field_report` (field team), `scene_photo`, `map_annotation` (outbreak map), `incident_alert_notification`.

New templates proposed:

| Template id            | What it is                                                                                     | Fields                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health_alert_network` | HAN message to clinicians and partners                                                         | issuing agency, HAN number, category (Health Alert / Advisory / Update / Info Service), date/time, subject, summary, background, recommendations for clinicians, reporting instructions (phone/fax), lab testing guidance, contact, distribution list, signature (medical director) |
| `boil_water_advisory`  | Public drinking-water advisory (boil / do not drink / do not use), shared with `water_utility` | advisory type, water system name, PWSID, affected area, reason, issued date/time, what to do, expected duration, who to contact, languages, mandatory "Tier 1" language placeholder, issuing authority                                                                              |
| `health_order`         | Isolation / quarantine / closure order                                                         | order type, legal authority (statute placeholder), person or premises, effective date/time, duration, conditions, appeal rights, signature of health officer, service record                                                                                                        |
| `syndromic_alert`      | Syndromic surveillance chart/alert (ESSENCE-style)                                             | syndrome / query name, geography, date range, observed count series, expected baseline, alert level (yellow/red), facilities contributing, comment                                                                                                                                  |
| `outbreak_line_list`   | Spreadsheet line list as a scene artifact                                                      | outbreak ID, case ID, onset date, age band, sex, ZIP / area, exposure, lab status, hospitalized, outcome (synthetic rows only)                                                                                                                                                      |
| `pod_throughput_board` | POD status board                                                                               | POD id and name, status (setting up / open / closed), people served, per-hour throughput, wait time, doses on hand, staff on site, issues                                                                                                                                           |
| `cold_chain_alarm`     | Vaccine storage temperature alarm                                                              | unit id, location, current temp, min/max, excursion start, duration, product lots affected, acknowledge user                                                                                                                                                                        |
| `lab_result_report`    | Public health lab report / ELR message rendered as a report                                    | lab name, accession, specimen type, collection date, test, result, interpretation, LRN reference, reported to, chain-of-custody note                                                                                                                                                |

## 9. Public-domain documents to bundle

Verified 2026-10-24 (HTTP 206 with `%PDF` magic or a downloaded file; sizes in bytes). No copyright notice, FOUO marking or TLP:AMBER+ found in text scans.

| #   | Title                                                                                                                                      | Publisher                                   | Edition                                     | Landing page                                                           | File URL                                                                                                            | Type / size                | PD basis                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Public Health Emergency Preparedness and Response Capabilities: National Standards for State, Local, Tribal, and Territorial Public Health | CDC (Division of State and Local Readiness) | October 2018, updated January 2019 (176 pp) | https://www.cdc.gov/readiness/php/capabilities/index.html              | https://www.cdc.gov/readiness/media/pdfs/CDC_PreparednesResponseCapabilities_October2018_Final_508.pdf              | PDF, 6.0 MB (6,297,660 B)  | CDC publication, 17 U.S.C. §105                                                                                                                                             |
| 2   | CERC: Crisis and Emergency Risk Communication — Introduction (2018 Update)                                                                 | CDC                                         | 2018 (11 pp)                                | https://www.cdc.gov/cerc/php/cerc-manual/index.html                    | https://www.cdc.gov/cerc/media/pdfs/CERC_Introduction.pdf                                                           | PDF, 0.9 MB (973,133 B)    | CDC, §105                                                                                                                                                                   |
| 3   | CERC: Messages and Audiences (2018 Update)                                                                                                 | CDC                                         | 2018 (10 pp)                                | same                                                                   | https://www.cdc.gov/cerc/media/pdfs/CERC_Messages_and_Audiences.pdf                                                 | PDF, 2.5 MB (2,585,213 B)  | CDC, §105                                                                                                                                                                   |
| 4   | Health Care Coalition Response Plan Template                                                                                               | HHS ASPR TRACIE                             | Updated July 2026 (25 pp)                   | https://asprtracie.hhs.gov/                                            | https://files.asprtracie.hhs.gov/documents/aspr-tracie-hcc-response-plan-508.pdf                                    | PDF, 0.4 MB (471,141 B)    | HHS ASPR program publication, §105 (TRACIE staffed under contract; no copyright notice)                                                                                     |
| 5   | CISA Tabletop Exercise Package: Healthcare and Public Health Sector — Situation Manual                                                     | CISA                                        | Updated October 2023                        | https://www.cisa.gov/resources-tools/resources/cybersecurity-scenarios | https://www.cisa.gov/sites/default/files/2025-01/Healthcare-and-Public-Health-CTEP-Situation-Manual-102023-508.docx | DOCX, 4.4 MB (4,618,634 B) | CISA, §105. **Caveat:** template contains selectable TLP:GREEN/AMBER handling blocks and an FOUO header option; the published blank is TLP:CLEAR. Shared with `healthcare`. |
| 6   | Planning Considerations for Cyber Incidents: Guidance for Emergency Managers                                                               | FEMA (with CISA)                            | November 2023 (57 pp)                       | https://www.fema.gov/emergency-managers/national-preparedness/plan     | https://www.fema.gov/sites/default/files/documents/fema_planning-considerations-cyber-incidents_2023.pdf            | PDF, 1.1 MB (1,152,951 B)  | FEMA, §105. Shared with `municipal`. Only "copyright" hits are in a list of incident impacts.                                                                               |

Optional (verified, but large or older):

- CERC: Crisis Communication Plans (Last Updated 2014, 69 pp), https://www.cdc.gov/cerc/media/pdfs/CERC_Crisis_Communication_Plans.pdf, PDF 10.6 MB (11,123,388 B). Over the ~10 MB guideline.
- CERC: Working with the Media (2014, 37 pp), https://www.cdc.gov/cerc/media/pdfs/CERC_Working_with_the_Media.pdf, PDF 9.8 MB (10,297,164 B).

Total of the 6 core files: about 15.4 MB (5 are unique to this pack if #5 and #6 are shared).

Download note: cdc.gov rejects curl's default headers with 403. A browser User-Agent with `Accept`/`Accept-Language` headers succeeds.

## 10. Useful links (not bundled)

| Title                                                           | Publisher                         | URL                                                                                                                   | Why not bundled                                             |
| --------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| CDC CERC manual chapter index                                   | CDC                               | https://www.cdc.gov/cerc/php/cerc-manual/index.html                                                                   | HTML hub (chapters bundled individually above)              |
| National Health Care Preparedness and Response Capabilities FAQ | ASPR                              | https://www.aspr.gov/readiness-response/healthcare-readiness/workforce-capacity-capability/frequently-asked-questions | HTML; the document itself is a pre-decisional draft         |
| CDC Health Alert Network                                        | CDC                               | https://emergency.cdc.gov/han/ (not fetched this session)                                                             | HTML; real HAN messages are useful as style references only |
| NACCHO Project Public Health Ready / MCM resources              | NACCHO                            | https://www.naccho.org/                                                                                               | Copyrighted                                                 |
| ASTHO preparedness resources                                    | ASTHO                             | https://www.astho.org/                                                                                                | Copyrighted                                                 |
| CSTE notifiable conditions list                                 | CSTE                              | https://www.cste.org/                                                                                                 | Copyrighted; timing should be verified per state            |
| PHAB accreditation standards                                    | Public Health Accreditation Board | https://phaboard.org/                                                                                                 | Copyrighted                                                 |
| WHO PHEOC framework / handbook                                  | WHO                               | https://www.who.int/                                                                                                  | WHO copyright (CC BY-NC-SA on many items, not PD)           |

## 11. Sources

- https://www.cdc.gov/readiness/php/capabilities/index.html (via WebFetch)
- https://www.cdc.gov/readiness/media/pdfs/CDC_PreparednesResponseCapabilities_October2018_Final_508.pdf (downloaded; TOC scanned)
- https://www.cdc.gov/cerc/php/cerc-manual/index.html (via WebFetch, chapter list and dates)
- https://www.cdc.gov/cerc/media/pdfs/CERC_Introduction.pdf ; CERC_Messages_and_Audiences.pdf ; CERC_Crisis_Communication_Plans.pdf ; CERC_Working_with_the_Media.pdf (downloaded)
- https://stacks.cdc.gov/view/cdc/120677/cdc_120677_DS1.pdf (CERC Introduction mirror, verified 206)
- https://files.asprtracie.hhs.gov/documents/aspr-tracie-hcc-response-plan-508.pdf
- https://www.aspr.gov/readiness-response/healthcare-readiness/workforce-capacity-capability/frequently-asked-questions
- https://www.cisa.gov/resources-tools/resources/cybersecurity-scenarios ; HPH CTEP docx (downloaded, text scanned)
- https://www.fema.gov/sites/default/files/documents/fema_planning-considerations-cyber-incidents_2023.pdf
- MS-ISAC funding (secondary): https://www.route-fifty.com/cybersecurity/2025/10/federal-funding-runs-out-cyber-info-sharing-center/408612 ; https://www.theregister.com/2025/09/30/cisa_kills_cis_agreement/
