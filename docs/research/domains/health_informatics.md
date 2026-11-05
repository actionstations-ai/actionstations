# Domain dossier: `health_informatics` (clinical IT, EHR operations and downtime)

Research for the health informatics epic (#684, spec 0451), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the people who run, secure and recover the clinical information systems of a hospital or health system, and the programs that train them: CIOs, CMIOs and CNIOs, clinical informaticists and EHR analysts, interface and integration analysts, health information management (HIM), clinical engineering (biomed), privacy and security officers when the problem is clinical systems, and health informatics degree programs.

**How it relates to existing domains.** The `healthcare` dossier (docs/research/domains/healthcare.md) already models the hospital as an organization: HICS roles, systems, cyber seeds and HIPAA clocks. `health_informatics` does not replace it. It is a **variant of the same organization seen from the clinical IT desk**: the exercise stays inside the hospital's incident command, but the players are the informatics and IT roles, the failure is a clinical system, and the decisions are about downtime procedures, restore order, data integrity and reconciliation rather than diversion alone. The `public_health` domain (health departments) is not extended; the connection is through notifiable-condition feeds in section 3. The new content is the **clinical systems toolkit** (section 4 and spec 0451), which any domain can use (a nursing exercise on downtime care, a pharmacy exercise on e-prescribing loss, an EMS exercise on a failed hospital feed).

**Exercise types this domain needs:**

- **Downtime exercises:** planned or unplanned EHR unavailability of 4, 24 or 72 hours or more, from the downtime declaration through paper workflows, read-only viewer use, recovery and back-entry (reconciliation).
- **Cyber tabletop with a clinical-IT lens:** ransomware where the questions are restore order, whether to bring the EHR up before the interface engine, and which results to trust.
- **Data integrity and identity:** patient identity overlays after a merge, interface message duplication or loss, wrong-patient results.
- **Clinical decision support and device safety:** alerts firing wrongly after an update, infusion pump library or vulnerability, telemetry loss.
- **Third-party failure:** cloud EHR, clearinghouse, telehealth platform, a security-agent update that crashes endpoints.
- **Privacy incident:** snooping, misdirected disclosure, breach risk assessment and notification clocks.

**Aliases:** clinical informatics, health IT, clinical IT, EHR team, CMIO office, clinical applications, HIM, health information management, biomedical informatics, nursing informatics, CNIO, EHR downtime, informatics program.

## 2. Organization and roles

Roles layer onto the HICS roles in the `healthcare` dossier (section 2). Titles are common usage **[U: org charts vary]**.

| Title                                       | Abbrev. | Team           | What they decide                                                                                                   |
| ------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Chief Information Officer                   | CIO     | IT leadership  | Declaring downtime, restore sequence, vendor escalation, spending authority                                        |
| Chief Medical Information Officer           | CMIO    | Clinical IT    | Which clinical workflows are unsafe on paper, order-set and alert changes, clinical sign-off before systems return |
| Chief Nursing Information Officer           | CNIO    | Clinical IT    | Nursing downtime workflows, MAR and handoff safeguards, unit readiness for paper and for recovery                  |
| Chief Information Security Officer          | CISO    | Security       | Containment, isolation, forensics, which systems may reconnect                                                     |
| Downtime coordinator / EHR command lead     | DTC     | Clinical IT    | Staffing the downtime command post, printing and distributing forms, tracking unit status, scheduling back-entry   |
| Clinical informaticist / EHR analyst        | CIA     | Clinical IT    | Report-based downtime data (census, med lists, results), build fixes, post-recovery validation                     |
| Interface / integration analyst             | INT     | Infrastructure | Queue handling, replaying or discarding messages, interface restart order                                          |
| HIM director                                | HIM     | Records        | Paper record scanning and indexing, legal record integrity, release of information during downtime                 |
| Director of Clinical Engineering / Biomed   | CE      | Clinical eng.  | Device isolation, manual alternatives, vendor patching windows                                                     |
| Laboratory, radiology, pharmacy IT liaisons | DEPT    | Departments    | Manual result reporting, critical result call-backs, dispensing cabinet override                                   |
| Patient access / registration manager       | REG     | Revenue cycle  | Downtime registration, medical record number allocation, duplicate prevention                                      |
| Chief Privacy Officer                       | CPO     | Compliance     | Breach risk assessment, notification clocks                                                                        |
| House supervisor / Administrator on call    | AOC     | Command        | Operational decisions at night, diversion, resource moves                                                          |
| Patient safety officer                      | PSO     | Quality        | Event reporting during downtime, near-miss capture, post-recovery safety review                                    |

**Outside parties:** EHR vendor and cloud host, interface engine vendor, device manufacturers, managed security provider and incident response firm, cyber insurer and breach counsel, claims clearinghouse, health information exchange and regional data exchange, public health reporting systems, state survey agency, HHS Office for Civil Rights, FBI, CISA, healthcare coalition and neighboring hospitals, patients and families, local media. The hospital's accreditor and CMS survey agency appear after the event.

## 3. Systems (the toolkit's subject matter)

- **EHR modules:** registration and ADT, orders (CPOE), results review, clinical documentation, electronic medication administration record (eMAR) with barcode scanning, clinical decision support (CDS), scheduling, OR management, bed management and patient flow, the patient portal. Vendor products are named only as examples in the `healthcare` dossier; templates here are vendor-neutral.
- **Downtime tools:** a read-only business continuity access (BCA) viewer, downtime reports printed on a schedule (census, medication lists, allergies, upcoming orders), pre-printed paper forms and patient label sheets, a downtime command post.
- **Interfaces:** an interface engine carrying HL7 v2 messages (admit/discharge/transfer, orders, results) and FHIR resources between the EHR, laboratory (LIS), radiology (RIS and PACS), pharmacy, dispensing cabinets, devices, billing and external parties. Common v2 message types are ADT (A01 admit, A03 discharge, A08 update), ORM (order) and ORU (result) **[V: secondary summaries; HL7 v2 is a licensed specification, so the toolkit uses realistic structures and does not bundle the standard text]**.
- **Identity:** an enterprise master patient index (MPI), medical record number assignment, merge and unmerge tools.
- **Public health feeds:** electronic lab reporting and immunization submissions **[U]**.
- **Devices:** infusion pumps and smart-pump libraries, bedside monitors and central stations, networked imaging, lab analyzers; building systems are in the `healthcare` dossier.

## 4. Products (what injects look like)

Existing templates that fit are listed in the `healthcare` dossier (section 8): `ehr_downtime_notice`, `hl7_interface_monitor`, `hics_251_status`, `status_board`, `downtime_med_admin_form`, `patient_portal_banner`, `breach_notification_letter`, `device_safety_communication`, `helpdesk_ticket`, `siem_alert`, `sitrep`, `email`. The clinical systems toolkit **adds** these (not duplicates):

| Product                                                                                                    | Render                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| EHR screen (patient list, results review, MAR, order entry) in normal, degraded and read-only states       | template with synthetic patients     |
| Downtime census and bed board report (unit, bed, patient label, acuity, isolation, as-of time)             | template                             |
| Downtime paper forms: order sheet, lab and radiology requisition, nursing flowsheet, registration form     | templates                            |
| HL7 v2 message view and FHIR resource view (raw and decoded), with a deliberately wrong field              | template with syntax-checked content |
| Interface error queue and message replay worklist                                                          | status board / table figure          |
| Results backlog report when systems return (count by department, oldest item, critical flags)              | table and time series figure         |
| Reconciliation worklist (orders and documentation to back-enter, by unit, status)                          | table                                |
| Patient identity worklist (possible duplicates, overlays, merges pending)                                  | table                                |
| CDS alert log and override report                                                                          | table / time series                  |
| Downtime time series: queued messages, interface latency, unit status (green/amber/red), staff on downtime | time series and status board figures |
| Breach risk assessment worksheet                                                                           | template (four factors, section 5)   |
| Recovery readiness checklist and go/no-go sheet                                                            | template                             |

Patients in every product are synthetic. HL7 FHIR is licensed CC0 **[V: hl7.org FHIR license page]**, so FHIR resource shapes can be reproduced; third-party code systems inside it (SNOMED CT, DICOM) are not covered by that license **[V]**.

## 5. Requirements, doctrine and documents

**Verified this session against primary text:**

- **CMS emergency preparedness, 42 CFR 482.15(d)(2) [V: eCFR]:** the hospital "must conduct exercises to test the emergency plan at least twice per year." It must participate in an **annual** full-scale exercise that is community-based, or, when one is not accessible, conduct an annual individual, facility-based functional exercise; an actual emergency that activates the plan exempts the hospital from the next such exercise. It must also conduct an **additional annual exercise** that may be a second full-scale or functional exercise, a mock disaster drill, or a facilitator-led tabletop "using a narrated, clinically-relevant emergency scenario, and a set of problem statements, directed messages, or prepared questions designed to challenge an emergency plan." It must analyze the response, keep documentation of all drills, tabletops and events, and revise the plan. The training and testing program is reviewed and updated at least every 2 years. **Correction to the fields catalog:** the rule does not say "a full-scale exercise every two years"; the two-year cycle applies to program review and training, and the full-scale (or functional) exercise is annual.
- **Subsistence and records, 482.15(b) [V]:** the plan covers "food, water, medical, and pharmaceutical supplies"; a system to track staff and sheltered patients; and "a system of medical documentation that preserves patient information," protects confidentiality and keeps records available. This is the CMS hook for downtime documentation exercises.
- **Joint Commission EM.16.01.01 [V: Joint Commission "Requirements for Hospital Programs," generated 2025-09-30, copyrighted so cited and not bundled]:** "The hospital plans and conducts exercises to test its emergency operations plan and response procedures." EP 1 requires a written annual testing plan based on likely emergencies, the plan, after-action reports and improvement plans, and six critical areas (communications, staffing, patient care and clinical support, safety and security, resources and assets, utilities). EP 2 requires two exercises a year: one operations-based (full-scale community-based, or functional facility-based when community-based is not possible), and one other that may be a mock drill or a facilitator-led tabletop, seminar or workshop; an actual activation exempts the next operations-based exercise but not discussion-based ones. **EM.17.01.01 [V]** requires the multidisciplinary committee to review all exercises and actual incidents and their AARs, and EP 3 requires updates to the hazard vulnerability analysis, emergency management program, emergency operations plan, communications plan and continuity of operations plan every two years or more often. Joint Commission standard numbers and text change; re-check before relying on an edition.
- **HIPAA Security Rule contingency plan, 45 CFR 164.308(a)(7) [V: eCFR]:** data backup plan, disaster recovery plan and emergency mode operation plan are **Required**; **testing and revision procedures** ("periodic testing and revision of contingency plans") and **applications and data criticality analysis** are **Addressable**. Addressable does not mean optional, but it is the accurate label for the testing specification. This is the HIPAA basis for exercising downtime and recovery; the Rule does not say how often.
- **Breach assessment and clocks [V: eCFR 164.402, 164.404 through 164.410, verified in the `healthcare` dossier]:** four risk factors (nature and extent of the PHI; the unauthorized person; whether the PHI was actually acquired or viewed; the extent mitigated); individual notice without unreasonable delay and no later than 60 calendar days after discovery. The proposed HIPAA Security Rule update (NPRM January 2025) is **not final**; trade and law-firm reports in mid-2026 put final action in 2027 **[U: secondary; check reginfo.gov RIN 0945-AA22]**. Treat it as pending.
- **HHS 405(d) Health Industry Cybersecurity Practices (HICP), 2023 edition [V: downloaded main document]:** five threats (social engineering, ransomware, loss or theft of equipment or data, insider accidental or malicious data loss, attacks against network connected medical devices) and ten cybersecurity practices (email protection; endpoint protection; access management; data protection and loss prevention; asset management; network management; vulnerability management; security operation centers and incident response; network connected medical devices; cybersecurity oversight and governance). Practice 8 and 9 are the incident response and device ones. HICP is voluntary; its status as a "recognized security practice" under the 2021 HITECH amendment is described in the `healthcare` dossier **[V there]**.
- **ONC (ASTP) SAFER Guides, Contingency Planning guide [V: existence and scope via ASTP/secondary summaries]:** safety practices for planned and unplanned EHR unavailability; later revisions added ransomware practices. A U.S. federal publication; confirm license and current edition when building the pack **[U]**.
- **ASPR TRACIE EHR downtime collection [V: topic collection located]:** federal technical-assistance resources including EHR downtime readiness and recovery plans, analyses of patient safety event reports during downtime, and a cybersecurity incident downtime operations checklist **[U: each document's date and license to verify]**.

**Public-domain candidates for the library pack:** HICP documents, ASPR TRACIE downtime and cybersecurity resources, the CMS State Operations Manual Appendix Z, SAFER Guides, CISA Healthcare and Public Health tabletop packages, HHS OCR ransomware fact sheet (see the `healthcare` dossier section 9 for verified URLs and sizes). Joint Commission, NFPA and vendor documents are named, not bundled.

## 6. Data sources (free, public)

The field has little replayable operational data; it has good **synthetic** data.

| Data                                                            | Source                                                 | Notes                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic patient populations and records (FHIR R4, C-CDA, CSV) | Synthea (MITRE), Apache License 2.0                    | generates fictional patients **[V: GitHub README]**                                                                                                        |
| Intensive-care clinical records, 100-patient demo               | MIMIC-IV Clinical Database Demo v2.2 (PhysioNet)       | ODbL 1.0, open access without credentialing for the demo **[V]**; real de-identified patients, so use for shapes of labs and vitals, not as named patients |
| FHIR resource definitions and examples                          | HL7 FHIR specification, CC0                            | **[V]**                                                                                                                                                    |
| Breach history                                                  | HHS OCR breach portal (breaches affecting 500 or more) | public list **[U: confirm fields and terms]**                                                                                                              |
| Outage facts for replay                                         | Company statements and filings                         | see section 8; facts are dated and attributed, not data feeds                                                                                              |

Case data for this field is mostly **simulated** (spec 0448 FR-10): a downtime generator produces consistent census, queues and backlogs from parameters.

## 7. Evaluation

- **Time to downtime procedures:** declaration to all units on paper workflows, per unit.
- **Safe-care measures:** orders and results not lost (count in transit at downtime start versus recovered), critical results communicated, medication administration continuity (late or missed doses), wrong-patient events caught.
- **Reconciliation after recovery:** time to back-enter, percent reconciled, discrepancies found, duplicate patient records created.
- **Notification clocks met:** HIPAA 60-day outer limit and earlier internal targets, state law, law-enforcement contact, regulator and accreditor contacts (spec 0426 regulatory clocks).
- **Restore decisions:** sequence against clinical priority (a restore-order decision scored against a clinician-defined priority list), diversion decisions.
- **HSEEP core capabilities:** Operational Communications, Operational Coordination, Public Information and Warning, Situational Assessment, Cybersecurity, Logistics and Supply Chain Management, Health and Social Services.

The Joint Commission's six critical areas (section 5) are used as grouping headings in the after-action report for hospital exercises.

## 8. Real events and lessons (for scenario seeds)

All dated, attributed and not presented as current.

- **Ascension, May 2024 [V: company statements and filings].** Detected unusual activity on network systems on 2024-05-08; care teams "initiated established downtime procedures and protocols"; EHR access restored across the system by mid-to-late June 2024 (the company's filings give mid-June in one place and "by June 30, 2024" in another). Lasting effects reached insurance verification, claims submission and payment processing. Seed: weeks of downtime, with the recovery sequence and reconciliation as the main problem.
- **CommonSpirit Health, October 2022 [U: trade press only, accounts differ].** Reports describe recovery taking roughly two to three weeks at most hospitals and more than a month at some. Seed: uneven recovery across facilities.
- **Scripps Health, May 2021, and effects on neighbors [V: Dameff et al., JAMA Network Open 2023;6(5):e2312270, via a university copy and abstract summaries].** Two emergency departments next to a San Diego health system suffering a month-long ransomware attack saw a rise in census (about 15 percent in daily mean, reported figures differ by source), more ambulance arrivals and more stroke code activations (59 before, 103 during, 65 after). The authors conclude such attacks should be considered a **regional disaster**. Seed: the neighbor's exercise. Check the exact figures against the paper before quoting them in a pack **[U for the exact numbers]**.
- **Change Healthcare, February 2024 [V: HHS OCR FAQ cited in the `healthcare` dossier; pharmacy effects V via press].** A clearinghouse outage disrupted claims, eligibility and pharmacy processing. Seed: third-party failure; the pharmacy side is in spec 0463.
- **CrowdStrike update, 2024-07-19 [V: AHA advisory; study figures U].** Hospitals canceled elective services for part or all of a day and used downtime procedures and manual restoration. A university study counted 759 of 2,232 hospitals with data losing responsiveness in at least one internet-connected service, with median downtime about five hours; the vendor disputed the methodology, so treat these as contested **[U]**. Seed: a non-malicious endpoint failure.

## 9. Threat families and scenario arcs

- **Hazard-driven (existing families):** ransomware and cyber, third-party failure, insider, infrastructure failure.
- **Service degradation family (shared with 0449 and 0450), clinical forms:** EHR unavailable (planned/unplanned), interface failure or message loss, identity overlay, wrong alerts, device network loss, telehealth outage.
- **Arc for an unplanned EHR downtime:** detect and declare → switch to paper workflows (first hour) → sustain (shifts 2 and 3, backlog of paper forms, lab and pharmacy manual workarounds) → restore in clinical priority order → validate and reconcile → return to normal, safety review and notification clocks.

## 10. Reuse by other domains

The clinical systems toolkit serves `healthcare` (the main host), `public_health` (lab reporting feeds), nursing (spec 0452, downtime care on the unit), pharmacy (spec 0463), EMS and fire (hospital feed failures, diversion data), behavioral health and human services, research labs (sample tracking systems), and any organization with an EHR-like records system (veterinary practices, campus health). Cyber and regulatory clocks toolkits are reused, not duplicated.
