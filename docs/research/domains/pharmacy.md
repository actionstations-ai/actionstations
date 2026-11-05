# Domain dossier: `pharmacy` (health-system and community pharmacy, drug supply)

Research for the pharmacy epic (#696, spec 0463), built on the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the people who procure, prepare, verify and dispense medications and the programs that train them: hospital and health-system pharmacy (directors, operations managers, clinical pharmacists, buyers, technicians, informatics pharmacists, compounding and sterile products staff, controlled substance diversion specialists), community and chain pharmacy (pharmacists-in-charge, technicians), compounding pharmacies, immunization and vaccine programs, pharmacy benefit operations where they touch dispensing, and colleges of pharmacy.

**How it relates to existing domains.** The `healthcare` dossier already lists the Director of Pharmacy (`lab_pharm`) among the hospital roles and the pharmacy information system and dispensing cabinets among its systems. `pharmacy` does not replace it: it is a **department view of the same hospital**, and also a **community pharmacy** variant that has no equivalent today. The `public_health` domain covers vaccine programs from the health department side; pharmacy adds the cold chain at the clinic or pharmacy. Three toolkits are **reused, not rebuilt**: the **clinical systems toolkit** (spec 0451: interfaces, downtime, e-prescribing feeds), the **clinical care toolkit** (spec 0452: medication administration record, lab results, handoffs) and a **supply chain** toolkit (#695, not yet specified) for shipments and inventory. The new content is the **pharmacy toolkit**: shortage and allocation boards, dispensing and verification queues, cold chain temperature logs and excursion reports, diversion reports and recall notices.

**Exercise types this domain needs:**

- **Critical drug shortage and allocation:** a manufacturer outage cuts supply; the shortage team assesses, allocates, substitutes and communicates.
- **Pharmacy systems outage:** claims switch or e-prescribing failure; a pharmacy information system or dispensing cabinet failure in a downtime.
- **Compounding error:** a sterile preparation mix-up, a contaminated batch or an out-of-spec beyond-use date.
- **Controlled substance diversion:** anomalous cabinet usage, a loss, reporting to DEA and the board.
- **Cold chain failure:** a refrigerator or freezer failure holding vaccines or biologics, power loss, an excursion.
- **Dispensing during a disaster:** emergency refills, prescriptions without records, the pharmacy open or closed in a storm.
- **Recall:** a product recall or contamination notice that reaches patients.

**Aliases:** pharmacy, hospital pharmacy, health-system pharmacy, community pharmacy, retail pharmacy, chain pharmacy, compounding pharmacy, outsourcing facility, sterile compounding, pharmacy school, college of pharmacy, drug shortage, medication supply, vaccine storage, cold chain.

## 2. Organization and roles

Titles are common usage **[U: org charts vary]**. Hospital command roles are in the `healthcare` dossier.

| Title                                              | Abbrev. | Team         | What they decide                                                                                                          |
| -------------------------------------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Director of Pharmacy                               | DOP     | Leadership   | Shortage response, allocation rules, spending authority, what to tell the incident commander, emergency formulary changes |
| Pharmacy operations manager                        | OPS     | Operations   | Staffing, workflow changes, queue priorities, downtime procedures                                                         |
| Drug shortage coordinator / buyer                  | BUY     | Purchasing   | Alternate suppliers, wholesaler allocations, gray-market refusal, order quantities                                        |
| Clinical pharmacist (critical care, oncology, ID)  | CP      | Clinical     | Therapeutic alternatives, dose conversions, which patients have priority                                                  |
| Medication safety officer                          | MSO     | Quality      | Error risk of each substitution, event review                                                                             |
| Pharmacy informatics pharmacist                    | INF     | Informatics  | Build changes for substitutes, order set edits, label changes, interface and cabinet issues (links to spec 0451)          |
| Sterile compounding supervisor / designated person | DP      | Compounding  | Stop or release batches, beyond-use dates, cleanroom status, outsourcing decisions                                        |
| Controlled substance diversion specialist          | CSD     | Compliance   | Investigation of anomalies, reporting, interviews with HR and security                                                    |
| Pharmacy technician lead                           | TECH    | Operations   | Fill, restock and cabinet loading priorities                                                                              |
| Pharmacy and Therapeutics (P&T) committee chair    | PT      | Governance   | Emergency approvals and restrictions                                                                                      |
| Vaccine coordinator                                | VAX     | Immunization | Storage unit monitoring, excursion response, transfer of vaccine, notification of the immunization program                |
| Pharmacist-in-charge (community)                   | PIC     | Community    | Store operations, refill and cash policy during outages, controlled substance reporting                                   |

**Outside parties:** drug wholesaler and manufacturer representatives, group purchasing organization, FDA (drug shortages, recalls, importation), DEA field division, state board of pharmacy, state and local health department, immunization program and the vaccines manufacturer, CDC, insurers and pharmacy benefit managers, the claims switch, prescribers, patients and caregivers, the healthcare coalition and neighboring hospitals (loans of drugs), poison control, the media.

## 3. Systems and identifiers

- **Pharmacy information system** (order verification, profiles), **automated dispensing cabinets** (stock, overrides, discrepancy reports), IV workflow and compounding systems, barcode verification, the electronic prescribing network and claims **switch**, wholesaler ordering portals, inventory management, temperature monitoring (digital data loggers, alarms), the state prescription drug monitoring program **[U]**.
- **Cold chain.** The CDC Vaccine Storage and Handling Toolkit (July 2026 edition) states vaccine storage ranges: refrigerators between 2 and 8 °C (36 to 46 °F) and freezers between -50 and -15 °C (-58 to +5 °F); one product is stored in a narrower frozen range, so storing it alongside others needs care; units should have a **digital data logger** with a buffered probe, a current certificate of calibration, and a backup device; it covers temperature excursions and emergency vaccine storage and transport **[V: downloaded and read]**. Any reading outside the manufacturer's labeled range is an excursion that needs immediate action: label exposed vaccine "do not use" and hold it separately until a viability decision is made **[V: toolkit and Pink Book via search, text partly read]**.
- **Identifiers in documents:** National Drug Codes (NDC, as in the FDA shortage data), lot numbers and expiration dates, prescription numbers, DEA registration numbers (fictional in exercises), unit-of-use and package sizes. NDCs and lot numbers in exercise products are fictional except when quoting dated FDA shortage records as history.

## 4. Products (what injects look like)

Existing templates that fit (see the `healthcare` dossier section 8): `memo`, `email`, `phone_call`, `status_board`, `sitrep`, `regulatory_notice`, `official_letter`, `press_release`, `text_message`, `downtime_med_admin_form`, `helpdesk_ticket`. The medication administration record and lab results come from the clinical care toolkit (spec 0452); interface and downtime products from the clinical systems toolkit (spec 0451). The pharmacy toolkit **adds**:

| Product                                                                                                            | Render                             |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Drug shortage board (drug, presentation, on-hand days, usage per day, expected recovery, status, allocation tier)  | status board and table             |
| Shortage assessment form: operational (supply, timing, duration) and therapeutic (affected patients, alternatives) | template                           |
| Allocation and restriction memo, therapeutic interchange table, emergency P&T approval                             | templates                          |
| Substitution safety checklist (concentration, dose, device, labeling, look-alike risk)                             | template                           |
| Dispensing queue and verification queue (age of oldest item, count, priority flags)                                | table and time series figure       |
| Claims and e-prescribing outage notice; pharmacy workaround sheet (manual claims, cash, emergency supply)          | templates                          |
| Cold chain temperature log and data logger report (min, max, time outside range)                                   | time series figure with range band |
| Temperature excursion report and vaccine viability decision form                                                   | templates                          |
| Controlled substance discrepancy and diversion report (anomalous usage, overrides, wasted doses, by user and unit) | table and time series figure       |
| Theft or loss notice and DEA Form 106 worksheet (data fields only, not the form)                                   | templates                          |
| Recall notice and recall response log (lots, quantity received, dispensed, on hand, patients to contact)           | templates                          |
| Compounding batch record and out-of-spec result                                                                    | templates                          |
| Patient letter or call script for a recall or shortage                                                             | template                           |

## 5. Requirements, doctrine and documents

**Verified this session against primary text:**

- **Hospital pharmaceutical services, 42 CFR 482.25 [V: eCFR].** A pharmacy directed by a registered pharmacist; drugs and biologicals kept in a secure area; controlled drugs "kept locked within a secure area"; "abuses and losses of controlled substances must be reported" to the individual responsible for the pharmaceutical service; drug administration errors, adverse drug reactions and incompatibilities "must be immediately reported" (482.25(b)(6)). The text has no disaster or shortage provisions.
- **Emergency plan, 42 CFR 482.15(b)(1) and (d)(2) [V: eCFR].** The plan's subsistence needs include "food, water, medical, and pharmaceutical supplies"; exercises: two a year, with a facilitator-led tabletop allowed as the additional annual exercise (see the `health_informatics` dossier, section 5, for the full text, and for Joint Commission EM.16.01.01). Pharmacy therefore appears in the CMS plan through supplies and in every hospital exercise.
- **Theft or loss of controlled substances, 21 CFR 1301.76(b) [V: eCFR].** The registrant must notify the DEA Field Division Office in writing "within one business day of discovery," and must also file a DEA Form 106 electronically through DEA's Diversion Control Division secure network application "within 45 days after discovery of the theft or loss." Factors for judging significance include quantity in relation to the type of business, the specific substances, links to specific individuals, patterns over time, diversion likelihood, and local trends. This corrects the `healthcare` dossier, which said "within one business day" for Form 106 without the electronic 45-day step **[V]**.
- **Manufacturer notice of shortages, FD&C Act section 506C (21 U.S.C. 356c) [V: FDA guidance and summaries via search; statute text not read].** Applicable manufacturers must notify FDA at least six months before a permanent discontinuance or interruption likely to cause a meaningful disruption in supply, or as soon as practicable, and in no case later than five business days after the event; FDA issues a noncompliance letter on failure; the notice duty rests on the finished-product manufacturer, not on other supply chain entities. **[U: the 2023 draft guidance update was not checked for finalization.]**
- **Drug Supply Chain Security Act [V: FDA August 2026 notice via search].** FDA extended the small-dispenser exemption (25 or fewer full-time pharmacists and technicians in the corporate entity) from the electronic, interoperable exchange of transaction information to November 27, 2027; other requirements remain. Relevant to a recall tracing scenario for small pharmacies.
- **Managing shortages, ASHP Guidelines (Fox and McLaughlin, Am J Health Syst Pharm 2018;75:1742-1750) [V: ASPR TRACIE and AHRQ PSNet records; the article text not read].** A shortage team; an operational assessment (shortage details, timing, duration) and a therapeutic assessment (affected patient groups and alternatives); an impact analysis, a plan, communication to staff and patients and implementation. The guideline is copyrighted: cited, not bundled. Details beyond the summaries are **[U]**.
- **USP <797> and <800> [V: multiple secondary sources agree; USP's own text not read].** The revised <797> became official November 1, 2023 with Category 1, 2 and 3 compounded preparations and beyond-use-date rules; <800> covers hazardous drugs. Enforcement dates are set by state boards and accreditors **[U]**. USP chapters are copyrighted: cited, not bundled.
- **CDC Vaccine Storage and Handling Toolkit (July 2026) [V]:** public CDC publication; see section 3. It is a U.S. federal work and a library candidate (confirm license).
- **Regulatory clocks:** 21 CFR 1301.76(b) above; FDA MedWatch and recall reporting **[U]**; state board of pharmacy reporting and state controlled substance rules vary **[U]**.

**Public-domain candidates for the library pack:** the CDC Vaccine Storage and Handling Toolkit, FDA drug shortage and recall pages and guidance on 506C notification, 42 CFR 482.25 and 21 CFR 1301.76 as generated regulation extracts, ASPR TRACIE drug shortage and pharmacy emergency resources **[U: individual documents to list]**, FEMA Healthcare Facilities and Power Outages, the CMS Appendix Z guidance (see the `healthcare` list). ASHP, USP and Joint Commission documents are named, not bundled.

## 6. Data sources (free, public)

| Data                                          | Source                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FDA drug shortage records                     | openFDA drug shortages endpoint (api.fda.gov/drug/shortages.json) | **[V: called this session]**: 1,597 records, `last_updated` 2026-11-04; fields include generic name, package NDC, availability (for example "Limited Availability"), update type, initial posting date, related info with estimated recovery, contact, and an `openfda` block with manufacturer, route, RxCUI; carries a disclaimer not to use it for medical decisions; no key needed |
| Drug recalls, enforcement reports             | openFDA drug enforcement endpoint                                 | **[U: not called this session]**                                                                                                                                                                                                                                                                                                                                                       |
| NDC directory                                 | FDA NDC database / openFDA                                        | **[U]**                                                                                                                                                                                                                                                                                                                                                                                |
| Vaccine storage ranges and excursion guidance | CDC toolkit                                                       | **[V]**                                                                                                                                                                                                                                                                                                                                                                                |
| Synthetic prescriptions and patients          | Synthea (Apache 2.0)                                              | **[V]**                                                                                                                                                                                                                                                                                                                                                                                |

The shortage data is **real, dated and replayable**: the app can fetch the shortage list for a drug class as of a date, with the user's consent and a size estimate, and use it as the "shortage board" for a real past or current shortage. Because the endpoint reflects the current state (the database has no stated history by date, **[U]**), replay of a past shortage uses dated press-release narratives for the story and the current records for the data shapes. Cold chain data is **simulated** (a unit with a power or compressor failure and a temperature curve).

## 7. Evaluation

- **Patients affected by shortages:** count of patients for whom the planned drug was unavailable, delayed or substituted, by tier; number of doses delayed.
- **Safe substitutions:** substitutions that passed the safety checklist versus those that did not; wrong-concentration or look-alike events that occurred in the scenario.
- **Cold chain losses contained:** time from alarm to action, doses at risk, doses discarded, doses saved by a correct viability decision, patients needing revaccination or recall.
- **Allocation fairness and consistency:** rules applied consistently across units; message consistency between pharmacy, clinicians and patients (spec 0448).
- **Diversion handling:** time from anomaly to investigation, to the DEA one-business-day notice, to Form 106 filing (within 45 days), whether patient safety was addressed.
- **Recall response:** time from notice to quarantined lots, to patient contact.
- **HSEEP core capabilities:** Supply Chain Integrity and Security, Logistics and Supply Chain Management, Public Health Healthcare and EMS, Operational Coordination, Operational Communications, Public Information and Warning.

## 8. Real events and lessons (for scenario seeds)

All dated and attributed.

- **IV fluid shortage after Hurricane Helene, 2024 [V: multiple trade and public-health reports; FDA/HHS actions].** Flooding damaged Baxter's North Cove, North Carolina plant, reported to supply about 60 percent of U.S. IV and dialysis solutions; hospitals received allocations (a state health department reported 40 to 50 percent for some products); FDA and HHS approved temporary imports of IV and peritoneal fluids from five Baxter facilities abroad (23 products assessed); ASHP wrote to HHS, ASPR and FDA on October 8, 2024; production lines restarted in November 2024; shortages were expected to extend into early 2025. A Massachusetts health system warned in October 2024 and said it had faced similar challenges after Hurricane Maria in 2017. The 2017 episode itself was **[U]**. Seed: a single-plant shortage with allocations, imports and substitutions.
- **Change Healthcare cyberattack, February 2024 [V: press reports; HHS OCR FAQ cited in the `healthcare` dossier].** The attack was discovered on February 21, 2024; the company processes claims and pharmacy requests for more than 340,000 physicians and 60,000 pharmacies; pharmacies reported being unable to process prescriptions, and chose between switching networks, accepting cash or processing claims manually; payments were delayed. Seed: a claims outage in a community pharmacy and a health-system outpatient pharmacy.
- **Carboplatin and other oncology injectables [V: openFDA record read this session].** The first shortage record returned lists carboplatin injection (a manufacturer's NDC) as "Limited Availability," initial posting date April 2023, with an estimated recovery of December 2028 in the related-information field. This is a record-level fact; the broader 2023 oncology shortage narrative is **[U]**. Seed: oncology allocation.
- **Drug diversion cases [U]:** well-documented in the literature and press, none verified this session; seeds use composite cases built on the 21 CFR 1301.76 factors.

## 9. Threat families and scenario arcs

- **Hazard-driven (existing families):** natural hazard (power loss, flooding), infectious disease, mass casualty (dispensing during a disaster).
- **Service degradation (shared) pharmacy forms:** claims or e-prescribing outage, dispensing cabinet failure, system downtime, supply chain disruption.
- **Pharmacy-specific families (new):** drug shortage, compounding error, controlled substance diversion, cold chain failure, recall.
- **Arc for a critical shortage:** early signal (wholesaler allocation notice) → shortage team convenes and assesses → conservation and allocation rules → substitutions and build changes → communication (staff, patients) → import or alternate sourcing → recovery and lessons.
- **Arc for a cold chain failure:** alarm → verify and move product → viability decision → patient impact (revaccination, recall) → report and corrective action.

## 10. Reuse by other domains

The pharmacy toolkit serves `healthcare` and `nursing` (spec 0452), `health_informatics` (spec 0451), `public_health` (vaccine programs and mass dispensing sites), EMS and fire (drug boxes and shortages), long-term care, behavioral health (controlled substance handling), humanitarian response (cold chain in the field), animal health and veterinary medicine (drug supply and cold chain), research labs (reagent cold storage), and the supply chain toolkit (shipments, lot tracing).
