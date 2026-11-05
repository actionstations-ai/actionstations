# Domain dossier: `nursing` (nursing practice, nursing education and clinical care)

Research for the nursing epic (#685, spec 0452), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the nurses who run a unit during an emergency and the programs that teach them: staff nurses and charge nurses, nurse managers and directors, house supervisors, rapid response and resuscitation teams, infection prevention nurses, nurse educators in hospital education departments, long-term care nursing staff, and prelicensure and graduate nursing programs (simulation labs, clinical faculty).

**How it relates to existing domains.** The `healthcare` dossier models the hospital as an organization and already includes the Chief Nursing Officer (CNO) in its HICS roles. `nursing` does not replace it: it is the **unit-level and classroom view of the same hospital**, with the players as nurses and nurse leaders deciding about patients in beds. It extends `healthcare` for hospital exercises and stands alone for nursing education, where the "organization" is a fictional teaching hospital unit. Long-term care and nursing home variants borrow from the CMS emergency preparedness rule for long-term care **[U: 42 CFR 483.73 not read this session]**. The new content is the **clinical care toolkit** (section 4 and spec 0452): vital-signs monitors and early warning scores, lab results, medication administration records, SBAR handoffs, triage tags and a staffing grid. It reuses the clinical systems toolkit (spec 0451) for downtime care.

**Two ways to play, one library.**

- **Tabletop play:** a facilitated group exercise, as in spec 0448, with injects, discussion and a hot wash. A unit-level surge, an evacuation, a downtime shift.
- **Unfolding case study:** a single patient story that **unfolds** in stages. At each stage the learner sees new data (vitals, labs, a family concern), then answers prompts aligned to the NCSBN Clinical Judgment Measurement Model; the next stage depends on what they decided. Used in simulation labs, orientation programs and rapid response training. The same patient, figures and data tables serve both modes.

**Exercise types this domain needs:**

- **Unit surge and mass casualty triage** (START/SALT, charge nurse decisions on beds, staff and supplies).
- **Evacuation** of an ICU, NICU or a floor, with horizontal and vertical movement.
- **Deteriorating patient and rapid response** (an unfolding case study).
- **Medication error and disclosure.**
- **Outbreak on a unit** (C. diff, norovirus): isolation, cohorting, staffing.
- **Staffing crisis and agency nurses.**
- **Active threat on a unit.**
- **Downtime care with paper charts.**
- **Heat or power loss in a long-term care facility.**

**Aliases:** nursing, nurses, charge nurse, nurse manager, rapid response, RRT, med-surg, ICU nursing, NICU, nurse educator, nursing school, nursing program, simulation lab, clinical simulation, unfolding case study, long-term care nursing, patient care unit.

## 2. Organization and roles

Hospital command roles are in the `healthcare` dossier (section 2). Nursing adds unit-level roles. Titles are common usage **[U: they vary]**.

| Title                                                  | Abbrev.  | Team            | What they decide                                                                                              |
| ------------------------------------------------------ | -------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| Chief Nursing Officer                                  | CNO      | Executive       | Hospital-wide nursing staffing, paper workflows, transfers, bed capacity (HICS Operations role in many plans) |
| Nurse manager / unit director                          | NM       | Unit leadership | Unit staffing, reassigning nurses, calling in staff, evacuation order of patients on the unit                 |
| Charge nurse                                           | CN       | Unit            | Assignments each shift, bed moves, escalation to the house supervisor, triage on a surge                      |
| House supervisor / nursing supervisor                  | HS       | Hospital        | Cross-unit resource moves, diversion input, first call at night                                               |
| Staff nurse (RN)                                       | RN       | Unit            | Assessment, medication administration, escalation, handoff, documentation under downtime                      |
| Licensed practical/vocational nurse, nursing assistant | LPN, CNA | Unit            | Delegated tasks, vital signs, resident care in long-term care                                                 |
| Rapid response / resuscitation team nurse              | RRT      | Response team   | Bedside assessment on a call, transfer to a higher level of care                                              |
| Infection prevention nurse                             | IP       | Quality         | Isolation, cohorting, outbreak notification to public health                                                  |
| Nurse educator / clinical instructor                   | EDU      | Education       | Prebriefing and debriefing, scenario objectives, learner assessment                                           |
| Nurse informaticist (CNIO)                             | CNIO     | Clinical IT     | Downtime workflows (spec 0451)                                                                                |
| Patient and family                                     | PT       | Outside         | Questions, consent, complaints, social media                                                                  |

**Outside parties:** physicians and advanced practice providers, pharmacy, respiratory therapy, laboratory, security, EMS, other hospitals receiving transfers, staffing agencies, unions, state board of nursing and department of health, accreditors, public health, families, local media, nursing school clinical placement coordinators.

## 3. Systems and tools (the toolkit's subject matter)

- **Monitoring:** bedside monitor and central telemetry station (heart rate, blood pressure, respiratory rate, oxygen saturation, temperature), alarms.
- **Early warning scores:** composite scores that turn vital signs into an escalation trigger. The Royal College of Physicians' NEWS2 (2017) is based on six physiological parameters and its published response thresholds include urgent clinical review at a score of 5 or more and emergency assessment at 7 or more **[V: secondary papers on the RCP report; the RCP states charts must be reproduced in color and not modified, and the license for reuse is unconfirmed]**. Other scores exist (MEWS, pediatric PEWS) **[U]**. The toolkit supports a configurable score and treats any named published score as optional, used only after its license is confirmed.
- **Medication administration record (MAR)** and barcode scanning; the paper downtime MAR (clinical systems toolkit).
- **Laboratory and imaging results**, critical value call-backs.
- **Handoff and communication:** SBAR (Situation, Background, Assessment, Recommendation) and I PASS the BATON are published in the AHRQ TeamSTEPPS materials **[V: AHRQ pages for the definitions; license status of the materials U]**.
- **Triage:** START and SALT (Sort, Assess, Lifesaving Interventions, Treatment and/or Transport). SALT came from a 2006 consensus process convened with the CDC and National Association of EMS Physicians that produced the Model Uniform Core Criteria, published as Lerner et al., 2008 **[V: ASPR TRACIE and PubMed records]**. Accuracy evidence is mixed; all systems showed substantial under-triage in comparisons **[V]**.
- **Staffing and assignment:** assignment sheets, acuity and patient-to-nurse ratios, a staffing grid (needed, scheduled, called in, agency).
- **Isolation tools:** precaution signs, cohort lists, supply carts.
- **Nurse call, paging and secure messaging.**

## 4. Products (what injects look like)

Existing templates that fit are listed in the `healthcare` dossier (section 8): `status_board`, `sitrep`, `ics_201_prefill`, `phone_call`, `radio_call`, `memo`, `email`, `text_message`, `pa_announcement`, `downtime_med_admin_form`, `facebook_post`, `news_article`. The clinical care toolkit **adds**:

| Product                                                                        | Render                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| Bedside monitor display and vital-signs flowsheet (trends over hours)          | figure from case data                      |
| Early warning score chart: parameters, score, trigger and recommended response | figure and table                           |
| Lab results panel (with reference ranges, critical flags)                      | table template                             |
| Medication administration record (scheduled, given, held, late)                | table template                             |
| SBAR handoff form and read-back                                                | template                                   |
| Triage tag (START/SALT category, findings) and a unit triage board             | template and status board                  |
| Staffing grid and assignment sheet                                             | table / status board                       |
| Rapid response call record                                                     | template                                   |
| Patient event report (medication error, fall), disclosure conversation notes   | templates                                  |
| Isolation and cohort board                                                     | status board                               |
| Evacuation priority list and evacuation tracking sheet                         | table template                             |
| Family message, nurse social media post, union or press statement              | existing templates                         |
| Unfolding case study stage card (new data, prompt, response options)           | template (case study mode, spec 0452 FR-9) |
| Debriefing guide and learner feedback form                                     | template                                   |

All patients are synthetic. Clinical content in injects is plausible, reviewed and marked as exercise content.

## 5. Standards, requirements and documents

**Verified this session:**

- **Simulation replacing clinical hours [V: NCSBN "Simulation Guidelines for Prelicensure Nursing Education Programs," read in full text].** The NCSBN National Simulation Study (Hayden, Smiley, Alexander, Kardong-Edgren and Jeffries, 2014) was a longitudinal, randomized, controlled study in ten programs (5 BSN, 5 ADN) that followed students through all clinical courses and their first six months of practice. It found no statistically significant differences in knowledge acquisition and clinical performance between groups using 10 percent or less simulation, 25 percent, or 50 percent. All participating programs required at least 600 clinical hours. NCSBN's guidelines say programs may use simulation for up to 50 percent of clinical experience and refer to the INACSL standards for facilitator preparation and evaluation. Individual state boards set their own rules **[U per state; the Louisiana board posts the 50 percent language, one example]**.
- **Clinical Judgment Measurement Model (CJMM) [V: NCSBN test plans and an OpenStax overview].** The six cognitive operations are **recognize cues, analyze cues, prioritize hypotheses, generate solutions, take action, evaluate outcomes** ("compare observed outcomes to expected outcomes"). The model has layers: layer 3 is the six operations and layer 4 the environmental and individual factors (time pressure, resources, culture, experience, cognitive load) that shape decisions. The NCLEX-RN and NCLEX-PN test plans effective April 2023 describe case studies as sets of six items measuring each of the six operations; clinical judgment is measured through three case studies of 18 scored items on the RN exam. The NCSBN source page URL at ncsbn.org/14798.htm returned 404 this session, so the model's own pages are cited through the test plans **[U: re-check]**. NCLEX item content is NCSBN's; the toolkit writes its own items and does not copy exam items or claim equivalence to NCLEX scoring.
- **INACSL Healthcare Simulation Standards of Best Practice [V: INACSL page and the 2021 Clinical Simulation in Nursing series, via search].** The standards were first published in 2011 and the 2021 edition renamed them the Healthcare Simulation Standards of Best Practice and added Prebriefing: Preparation and Briefing and Professional Development; the four cornerstones are Prebriefing, Facilitation, Professional Integrity and Debriefing, alongside standards on Simulation Design, Operations, Outcomes and Objectives and Evaluation of Learning and Performance, and a glossary. All simulation-based activities require a planned debriefing process, and one purpose of prebriefing is a psychologically safe environment **[V: glossary and secondary]**. The standards are copyrighted: cited, not bundled. **[U: exact 2021 standard titles to re-check on inacsl.org, which blocked automated fetch this session.]**
- **Hospital exercise requirements that involve nursing in every scenario [V]:** 42 CFR 482.15(d)(2) and Joint Commission EM.16.01.01 (see the `health_informatics` dossier, section 5, for the verified text); 482.15(b)(2) requires "a system to track the location of on-duty staff and sheltered patients."
- **AHRQ CANDOR (Communication and Optimal Resolution) toolkit [V: AHRQ pages]:** eight modules with slides and facilitator notes for responding to harm events; the initial disclosure conversation should occur within 60 minutes after an event is identified, with a Disclosure Lead; a federal publication, license to confirm **[U]**. Use for the medication error and disclosure scenario.
- **AHRQ Hospital Evacuation Decision Guide (2010) [V: existence and framing via the archived AHRQ page; full text not read]:** a decision supplement for pre-event and post-event evacuation, not a formula; horizontal movement is typically considered before vertical movement **[U: in a hospital protocol, not the guide]**.

**Not verified:** state staffing ratio laws (vary by state), Magnet or accreditation requirements, long-term care rule details (42 CFR 483.73), CDC isolation precaution guidelines text.

**Public-domain candidates for the library pack:** AHRQ TeamSTEPPS and CANDOR materials, AHRQ evacuation guide, ASPR TRACIE mass casualty triage and evacuation resources, CDC infection control guidance, the CMS Appendix Z interpretive guidance, FEMA Healthcare Facilities and Power Outages; NCSBN guideline documents are copyrighted and cited, not bundled.

## 6. Data sources (free, public)

| Data                                             | Source                                      | Notes                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plausible vitals and lab ranges and time courses | MIMIC-IV Clinical Database Demo v2.2 (ODbL) | 100 patients, open access without credentialing **[V]**; use for value ranges, not as named patients                                                                        |
| Synthetic patients and histories                 | Synthea (Apache 2.0)                        | **[V]**                                                                                                                                                                     |
| Nursing home daily nurse staffing                | CMS Payroll-Based Journal public files      | daily nurse hours per facility with census, CSV on data.cms.gov; not comparable to older staffing forms; some erroneous values remain **[V: search results and CMS pages]** |
| Triage evidence and field triage guidelines      | ASPR TRACIE, CDC MMWR                       | documents, not data feeds **[V]**                                                                                                                                           |
| Drug shortage list (for medication scenarios)    | FDA drug shortages via openFDA              | see spec 0463                                                                                                                                                               |

There is no public feed of real bedside data. Case data is **simulated** (spec 0448 FR-10): a generator draws a physiologic course from a named trajectory (sepsis, bleed, respiratory failure) and the learner's actions change it.

## 7. Evaluation

- **Clinical judgment steps:** for each unfolding case stage, whether the learner recognized the relevant cues, analyzed them, prioritized the leading hypotheses, generated reasonable solutions, took an appropriate action and evaluated the outcome. Scoring is against the author's or generator's key with partial credit, shown with its reasoning; the scale is this app's own and is not an NCLEX score.
- **Handoff quality:** SBAR completeness (each element present, read-back done) scored from the recorded handoff.
- **Time to escalation:** time from the first abnormal early warning score to the rapid response call; from the first critical lab value to the provider notification.
- **Tabletop measures:** unit decisions on beds, staffing and evacuation order against a priority list; triage accuracy (under- and over-triage counts) on a scripted victim set; infection control decisions; time to downtime workflows (with spec 0451).
- **INACSL-style prebriefing and debriefing:** the session record shows a prebrief (objectives, ground rules, psychological safety) and a structured debrief; case study mode prompts the facilitator through both and records them.
- **HSEEP core capabilities (tabletop):** Mass Care Services, Public Health Healthcare and EMS, Operational Coordination, Operational Communications, Situational Assessment, Fatality Management Services where relevant.

## 8. Real events and lessons (for scenario seeds)

All dated and attributed.

- **Hurricane Sandy, NYU Langone, October 2012 [V: Pediatrics 2014 paper on the NICU evacuation via secondary summaries; nursing study in J Nursing Scholarship 2017].** One report counts 21 neonates evacuated to receiving hospitals within about 4.5 hours; another counts 22 neonates within an evacuation of 46 critically ill patients out of 323 total, so figures are cited as approximate **[U for exact counts]**. Themes: clear command structure, backups, situational awareness, regional coordination, flexibility, attention to families and transport resources. A nurse study concluded preparedness education should include more hands-on exercises, "low-tech" options for power loss and specific policies on nurses' disaster roles. Seed: vertical evacuation of an ICU or NICU.
- **Hollywood Hills nursing home, Florida, September 2017 [V: news reports; consistent on core facts, differing on counts].** After Hurricane Irma knocked out a transformer that powered the air conditioning, residents died: eventually 14 deaths were reported, and 12 of the 14 were ruled homicides; the state suspended the facility's license. Seed: heat and power loss in long-term care. I could not verify a specific state rule on generators.
- **Scripps Health and neighboring hospitals, May 2021 [V]:** see the `health_informatics` dossier, section 8: ransomware next door raised census and ambulance arrivals. Seed: a surge on a unit caused by a neighbor's outage.

## 9. Threat families and scenario arcs

- **Hazard-driven (existing families):** mass casualty, infrastructure failure, infectious disease, active threat, natural hazard.
- **Service degradation (shared) clinical forms:** downtime care, staffing shortfall, supply shortage, medical gas or monitor failure.
- **Clinical event family (new for case studies):** deteriorating patient, medication error, fall, workplace violence on a unit.
- **Arc for an unfolding case study:** presentation → first assessment → change in condition → escalation → treatment → reassessment → handoff and debrief (each stage is a decision point).
- **Arc for unit surge:** notification → unit readiness (staff, beds, supplies) → arrivals and triage → sustained care → decompression → recovery and debrief.

## 10. Reuse by other domains

The clinical care toolkit serves `healthcare`, `health_informatics` (the unit side of downtime), pharmacy (spec 0463), public health, EMS and fire (triage, handoffs), campus and K-12 (school nurse), stadium and venue (first aid and medical tent), behavioral health, hospitality and cruise (shipboard medical), humanitarian response and any domain with a medical branch. The MCI triage toolkit (EMS epic) shares the START/SALT tag templates; whichever is built first defines them once.
