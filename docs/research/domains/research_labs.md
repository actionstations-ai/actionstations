# Domain dossier: `research_labs` (research laboratories and biosafety)

Research for the research labs epic (#699, spec 0466). Builds on the epidemiology toolkit (spec 0457), the regulatory clocks (spec 0426) and the cyber toolkits. Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

Scope note: exercises in this field concern incident management, notification, continuity and compliance. The dossier and the product describe what an organization decides and who it tells, never how to culture, handle, produce or modify any agent. Scenarios name no pathogen-specific technique, and generated injects must not include agent handling or production detail (see spec 0466 FR-4).

## 1. Scope

**Covers:** university, hospital, government and company research laboratories and the offices that support them: biosafety officers (BSOs), responsible officials (ROs) of select agent registrations, laboratory directors and principal investigators (PIs), environmental health and safety (EHS), institutional biosafety committees (IBCs), animal care and use programs, research compliance and institutional review boards (IRBs), research IT and data stewards, facilities and clinical occupational health, and graduate programs in biosafety.

**Exercise types this domain needs:**

- **Exposure response:** a laboratory worker has a potential exposure (needlestick, spill outside containment, aerosol-generating failure); response, medical evaluation, reporting and follow-up.
- **Select agent incident management:** an inventory discrepancy, a missing item, a release, a security breach or a failed alarm, handled under the entity's incident response plan with immediate notification and written reports.
- **Sample and data loss:** freezer failure or power loss threatening irreplaceable samples; liquid nitrogen supply; backup failure; ransomware on instrument computers or an electronic lab notebook; research data breach with IRB and sponsor notification.
- **Facility emergencies:** fire, flood, loss of ventilation or containment, evacuation with active work, workplace violence, bomb threat (the incident response plan elements below).
- **Animal facility emergency:** escape, disease outbreak in a colony, loss of environmental controls.
- **Regulatory inspection readiness:** unannounced inspection findings, corrective action and follow-up.

**Aliases:** biosafety, biosecurity, biosafety officer, BSO, responsible official, RO, select agent, FSAP, IBC, institutional biosafety committee, research compliance, lab manager, EHS, BSL-2, BSL-3, containment lab, vivarium, animal facility, freezer farm, biobank, core facility.

## 2. Requirements to exercise and report

- **Federal Select Agent Program (FSAP)**, run jointly by CDC (Division of Regulatory Science and Compliance) and USDA APHIS (Agricultural Select Agent Services); regulations at 42 CFR part 73, 7 CFR part 331 and 9 CFR part 121 **[V for 42 CFR 73 text; the others from the program's description in `food_agriculture` dossier, U]**.
- **Incident response plan drills (42 CFR 73.14):** each registered entity must have a written plan based on a site-specific risk assessment, covering theft, loss or release, inventory discrepancies, security breaches (including information systems), severe weather and natural disasters, workplace violence, bomb threats and suspicious packages, fire, gas leaks, explosions and power outages, plus contact information, roles and lines of authority, coordination with local emergency responders, rescue and medical duties, evacuation and decontamination. The plan "must be reviewed annually and revised as necessary," reviewed again after any drill, exercise or incident, and "drills or exercises must be conducted at least annually to test and evaluate the effectiveness of the plan." Drill records note how the plan was tested, problems found, corrective actions and participants **[V: eCFR text read this session]**. This is the strongest exercise requirement in the field and matches what the product produces.
- **Notification of theft, loss or release (42 CFR 73.19):** notify CDC or APHIS **immediately** on discovery of theft or loss (and appropriate federal, state or local law enforcement), and immediately on discovery of a release causing occupational exposure or occurring outside the primary barriers of the biocontainment area (CDC or APHIS only); a completed **APHIS/CDC Form 3** is due within **seven calendar days** in both cases **[V: eCFR text read this session]**. One FSAP training slide treated a Form 3 "not submitted within 3 days" as noncompliant, which conflicts with the regulation; the regulation controls **[V: search result, discrepancy noted]**. Reports are made through the eFSAP information system, the preferred method **[V: search summary]**.
- **FSAP statistics for realism:** the 2024 annual report (published September 2025) records 9 loss reports, of which 1 was recovered and 8 were determined to be record-keeping issues rather than actual loss of material **[V: search summary of the infographic; theft and release counts not confirmed]**. Most inventory "losses" in practice are records problems, which is a realistic exercise premise.
- **NIH Guidelines (recombinant or synthetic nucleic acid research):** institutions receiving NIH funds for such research have an IBC; the IBC must report significant problems, violations of the Guidelines and significant research-related accidents and illnesses to NIH OSP within 30 days (Section IV-B-2-b-(7)); a spill or accident in a BL2 laboratory resulting in an overt exposure must be reported immediately (Appendix G-II-B-2-k) **[V: OSP summary in search results plus many institutional policies; Guidelines PDF not opened this session]**. OSP also asks that incidents reported to another federal agency be reported to OSP **[V: search summary]**.
- **Draft NIH Biosafety Policy for Research Involving Biohazards (NOT-OD-26-112):** released August 19, 2026, comments to October 19, 2026; would replace the NIH Guidelines, extend oversight to all biohazards, and require notice to NIH within 24 hours of awareness for reportable incidents (such as potential laboratory-acquired infections or certain BSL-3/BSL-4 events) with a full report in 30 days; lower-risk incidents go to the IBC **[V: NIH notice read this session]**. It is a draft; a pack must carry the date and say so.
- **Guidance:** _Biosafety in Microbiological and Biomedical Laboratories_ (BMBL), 6th edition, 2020, a CDC and NIH publication **[V]**.
- **Institutional rules vary:** internal deadlines (a PI reports to the BSO within 24 hours or 7 days, for example) differ by institution **[V: examples from several university policies in search results]**. The product lets each institution set its own clock.
- Research data breaches bring HIPAA (if protected health information is held), the Common Rule and institutional IRB policies, state breach laws and sponsor terms **[U]**; these are reused from the regulatory clocks (spec 0426).
- No national exercise requirement for non-select-agent laboratories was found **[U]**; institutional biosafety programs set their own.

## 3. Organization and roles

| Title                                        | Abbrev. | Team           | What they decide                                                                                           |
| -------------------------------------------- | ------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| Responsible Official                         | RO      | Registration   | Notification to FSAP, Form 3 submission, restricting access, suspending work **[V: roles named in 73.14]** |
| Alternate Responsible Official               | ARO     | Registration   | Same, when the RO is absent                                                                                |
| Biosafety Officer                            | BSO     | Biosafety      | Incident classification, containment checks, medical referral, report to IBC                               |
| Principal Investigator / Laboratory Director | PI      | Laboratory     | Stop work, accounting for materials, staff exposure reports, corrective actions                            |
| Laboratory Manager                           | LM      | Laboratory     | Inventory, access lists, freezer and equipment alarms, supplies                                            |
| Institutional Biosafety Committee chair      | IBC     | Oversight      | Review of incidents, corrective action, reporting to the institution and NIH                               |
| Occupational Health physician/nurse          | OH      | Medical        | Exposure evaluation, post-exposure management, work restrictions                                           |
| Environmental Health and Safety director     | EHS     | Safety         | Decontamination, waste, fire, emergency response coordination                                              |
| Institutional Official / VP for Research     | IO      | Executive      | Institutional reporting to NIH and sponsors, press and legal strategy                                      |
| Research Compliance / IRB Director           | RC      | Compliance     | Notifications to IRB, sponsors, regulators; human subject and data incidents                               |
| Research IT / Data Steward                   | RIT     | IT             | Data breach containment, backups, instrument networks                                                      |
| Facilities / Security                        | FAC     | Facilities     | Access control logs, alarms, power, ventilation, emergency response                                        |
| Animal Facility Director / Veterinarian      | AFD     | Animal care    | Colony isolation, euthanasia decisions, animal care committee reporting                                    |
| University Communications / Legal Counsel    | PIO     | Communications | Public statement, media, counsel review                                                                    |

Titles and decisions follow 42 CFR 73.14 (RO, BSO, building owner and security contacts) **[V]** and typical institutional practice **[U]**.

**Outside parties:** CDC Division of Regulatory Science and Compliance and APHIS Agricultural Select Agent Services (FSAP), NIH Office of Science Policy, local health department and CDC for exposures, local fire and hazmat teams and law enforcement, FBI WMD coordinator for suspected criminal activity **[U]**, sponsors and funding agencies, accrediting bodies, insurers, neighbors and the press.

## 4. Systems and records

- Inventory management (for select agents, records with an audit trail; spreadsheet or LIMS), freezer and incubator monitoring with alarm and call-out systems, building automation (ventilation, pressure monitoring), access control, camera systems, liquid nitrogen supply, backup power.
- Electronic lab notebooks, instrument computers, sample tracking and biobank databases, research data repositories.
- Incident reporting forms (internal), APHIS/CDC Form 3 (theft, loss, release) **[V]**, IBC incident reports, occupational health records, OSHA recordkeeping **[U]**.

## 5. Products (what injects look like)

| Product                                                                                        | Render                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------ |
| Incident report (internal): who, what, where, when, exposure assessment, immediate actions     | text template                  |
| Notification matrix with clocks (immediate, 24 hours, 7 days, 30 days, institution-set)        | table figure and clock display |
| Form 3-style incident report worksheet (marked as an exercise, not the official form)          | text template                  |
| Inventory reconciliation sheet with a discrepancy                                              | table figure                   |
| Freezer or incubator temperature alarm log and trend, with the time the alarm was acknowledged | time-series figure             |
| Sample loss register (samples, value, replaceable or not, backups)                             | table figure                   |
| Access log extract, door alarm event                                                           | table figure                   |
| Occupational health exposure evaluation, work restriction memo                                 | text template                  |
| Stop-work order, corrective action plan, IBC meeting minutes                                   | text templates                 |
| Research data breach notice drafts (IRB, sponsor, participants)                                | text templates                 |
| Press statement, staff email, neighbors' letter, social posts                                  | existing templates             |
| Emergency responder briefing sheet (facility hazards, not agent detail)                        | text template                  |

## 6. Public-domain documents

CDC and NIH BMBL 6th edition **[V: exists; confirm license and size]**; the FSAP's incident notification and reporting training material and Form 3 print-only form **[V: exist on selectagents.gov; confirm license]**; 42 CFR part 73 text (eCFR) **[V]**; NIH Guidelines and the draft biosafety policy notice **[V]**; CDC and OSHA bloodborne exposure guidance **[U]**; CISA and HHS cyber exercise packages, already in `healthcare` and `public_health`. Link rather than copy any file whose license is unclear.

## 7. Data and simulation

No public datasets drive this field. Figures are simulated and labeled so:

- **Temperature alarm series:** compressor failure or door ajar, with set point, alarm threshold, call-out delay and a warming curve; sample viability windows are exercise parameters set by the designer, never biology claims.
- **Inventory discrepancy generator:** a count, expected vs observed, with the record-keeping causes that explain most real discrepancies **[V: 2024 FSAP statistic above]**.
- **Notification clock:** timers from discovery with the regulation's immediate and seven-day deadlines and the institution's own clocks.
- **Exposure follow-up list** (shared with spec 0457): contacts from a laboratory incident, fictional.
- Access logs, alarm events and backup status series.

## 8. Evaluation

- **Notification timing:** each required notification made, to whom, and minutes from discovery against the clock (immediate; Form 3 within 7 days; institutional deadlines) **[V for the federal clocks]**.
- **Exposure response:** time to medical evaluation and to stop-work/containment per the entity's protocol (protocol times are set by the institution) **[U: no national standard found]**.
- **Samples and data recovered:** share of irreplaceable samples moved to backup in the window; share of data restored.
- **Drill record completeness** as 42 CFR 73.14 requires: how the plan was tested, problems found, corrective actions and participants **[V]**.
- **Core capabilities (HSEEP):** Operational Coordination, Operational Communications, Public Information and Warning, Situational Assessment, Environmental Response/Health and Safety **[U: names to confirm]**.

## 9. Threat families and arcs

Laboratory exposure, inventory discrepancy, sample loss, facility emergency, animal facility emergency, research data breach, workplace violence or threat, and the shared **service degradation** family (monitoring system outage, alarm system failure, access control failure). Arc: discovery → immediate actions and containment → classify and notify → investigate → written reports → corrective action → return to work.

## 10. Reuse by other domains

Healthcare and campus (clinical laboratories, research hospitals), `public_health` (public health laboratories, exposure follow-up), animal health (veterinary diagnostic laboratories, spec 0460), K–12 (school science labs, with the facility emergency elements only), data center and cyber (research data breach), pharmacy (#696), construction and engineering (lab buildings, #704).
