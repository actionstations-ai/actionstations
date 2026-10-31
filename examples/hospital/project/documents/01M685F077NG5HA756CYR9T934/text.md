# Ottawa River Regional Medical Center — EHR Downtime Procedures Annex

Document Control Number: ORRMC-DT-ANX-2026 · Revision 3.2 · Effective Date: 02/01/2026 · Parent document: ORRMC-EOP-2026 · Owners: Dr. Priya Raman (Chief Medical Information Officer) and Carol Beckett (Chief Nursing Officer) · Reviewed: Raymond Okafor (Director of IT), Joyce Tanaka (Chief Privacy Officer)

> **EXERCISE MATERIAL — for training use.** Ottawa River Regional Medical Center, its people, vendors, hostnames and identifiers are simulated.

**Record of Revisions:** 3.0 — 03/01/2024 — All — Downtime viewer BCA-VIEW01 introduced · 3.1 — 11/05/2024 — Sections 4, 6 — Lessons from the November downtime drill · 3.2 — 02/01/2026 — Sections 3, 8 — Unplanned downtime longer than 24 hours; reconciliation order

**Handling:** Internal. Printed copies are in every downtime cart (one per nursing unit, ED, PACU, the Outpatient Dialysis Center, Pharmacy, Laboratory, Imaging, Registration).

## SECTION 1: PURPOSE

This annex tells clinical and support staff how to keep treating patients safely, record what they do and recover the record when the CareLine EHR (ORRMC-EHR-APP01 to -APP04, database ORRMC-SQL01/02) or the systems around it are unavailable, planned or not. It is the "system of medical documentation" required by 42 CFR 482.15(b)(5), and the HIPAA Security Rule contingency plan (45 CFR 164.308(a)(7)) for the record.

## SECTION 2: DOWNTIME LEVELS AND WHO DECLARES

| Level | Condition | Declared by | Staff action |
|---|---|---|---|
| Brownout | The EHR is slow or one module (for example results or eMAR) is unavailable | IT on-call after 10 minutes of unresolved impact | Use the downtime viewer for that function; keep charting in the EHR where it works |
| Downtime | The EHR is unavailable to one or more units | IT on-call with the Nursing Supervisor | Switch to paper for the affected functions; open the downtime cart; the Nursing Supervisor pages the whole hospital |
| Extended downtime | Expected or actual loss of more than four hours | Administrator on Call | EOP Level 2 or 1; HCC opens; unit census reports hourly; consider diversion and elective case delays |

Downtime is announced by overhead page ("Downtime, Downtime, Downtime: electronic health record, effective now") and by phone tree, because secure messaging may be affected.

## SECTION 3: DOWNTIME CART AND FORMS

Each cart holds: current paper order sets and the downtime medication administration record (MAR); blank patient identification labels and wristbands with the "DT-" numbering series (DT-000001 to DT-999999, issued by block to each unit); nursing flowsheets; admission, transfer and discharge forms; paper requisitions for laboratory, imaging and blood bank; the Patient Movement Log; pens; flashlights; and a quick reference card with phone numbers. Forms are reprinted every quarter and stored as PDFs on the downtime viewer and on a locked USB drive in the HCC.

## SECTION 4: THE DOWNTIME VIEWER (BCA-VIEW01)

BCA-VIEW01 is a read-only copy of active inpatients' key data: demographics, allergies, active orders, active medications, the last 72 hours of results, problem list and code status. It is refreshed from the EHR every 15 minutes and also writes a PDF report set to each unit's downtime printer every four hours (the "census and MAR packet"). Staff use the viewer to see what was happening when the EHR stopped. The viewer does not accept entries. If a cyber incident is suspected, Information Security may disconnect the viewer's feed; it then shows the last good copy with a banner giving the refresh time. The printed packet is the last resort.

## SECTION 5: CLINICAL PROCEDURES

**Registration:** register on paper using the DT- number, record two identifiers, and keep the face sheet in the downtime record. The ED uses a paper tracking board in the triage area.

**Orders:** use paper order sets; verbal orders are read back and signed within 24 hours. Pharmacy verifies all new medication orders before the first dose except in emergencies.

**Medications:** nurses give medications from the downtime MAR. Automated dispensing cabinets switch to "override" mode and release only a limited list; each override is logged on the paper record and counted by Pharmacy each shift. Smart pumps continue to run their programmed therapy; the drug library cannot be updated, so staff double-check high-alert drug rates with a second nurse. Barcode scanning is unavailable; two-person verification replaces it for high-alert drugs and blood.

**Laboratory:** specimens are labeled with the downtime label and sent with a paper requisition. Critical results are phoned to the unit and recorded in the log with read-back. Results are delivered by runner, fax or phone. Stat tests are prioritised.

**Imaging:** studies continue on modalities; images stay on the modality and PACS. Radiologists read from PACS where it works; reports are dictated and delivered by paper. When PACS is down, studies are saved locally on the modality and read on its console.

**Blood bank:** crossmatch and issue use the manual process with a second-person check. Emergency-release blood is used per protocol.

**Monitoring:** bedside monitors work without the network. The central telemetry station may not; units assign a nurse to the bedside for telemetry patients or use portable monitors.

**Dialysis:** treatments continue on the dialysis machines using paper flowsheets; machine settings are checked against the paper prescription by two clinicians.

**Discharge:** printed discharge instructions and prescription handoff on paper; e-prescribing is unavailable, so prescriptions are phoned or faxed by the prescriber, or handwritten for controlled substances where state law permits.

## SECTION 6: COMMUNICATION DURING DOWNTIME

Telephone, runners, overhead paging and two-way radios. Units send the Planning Section a census, acuity count and available-bed count at the top of each hour. Each department head names a downtime lead. Ancillary departments (Pharmacy, Laboratory, Imaging) appoint a runner coordinator.

## SECTION 7: PATIENT SAFETY WATCHES

During any downtime lasting more than one shift, the Chief Nursing Officer and the Chief Medical Officer review: missed doses and duplicate orders; delayed critical results; identification errors; falls and pressure injuries; delayed discharges and transfers. Each unit tracks near-misses on a downtime issue log.

## SECTION 8: RECOVERY AND RECONCILIATION

When Information Technology reports the EHR available, the Administrator on Call approves return to normal. Recovery follows this order: (1) Information Security confirms in writing that the restored environment is safe for clinical use; (2) Health Information Management scans all paper records; (3) registration reconciles DT- numbers to real medical record numbers; (4) units enter active orders and the last 24 hours of administration by a designated second-person check, then late-entry the earlier record as a scanned document; (5) Pharmacy reconciles ADC counts and orders; (6) Laboratory and Imaging post results manually entered on paper; (7) the downtime viewer is reset. Entries made during recovery are marked "late entry — downtime". Staff must not use the restored EHR for high-alert medications until the pump drug library and barcode scanning are confirmed working.

If data were lost between the last backup and the failure, HIM, the Chief Medical Information Officer and the Chief Privacy Officer decide how to treat the gap and whether any patient or regulator notice is needed.

## SECTION 9: PLANNED DOWNTIME

Planned downtime for upgrades is scheduled on Tuesday between 02:00 and 05:00 with 14 days' notice, printed packets distributed the evening before and elective procedures rescheduled where the downtime overlaps. A downtime drill is run on at least two units each quarter and the whole hospital once a year.

## ANNEX A: SYSTEM RESTORE PRIORITY (EHR)

| Priority | System | Target |
|---|---|---|
| 1 | Network core, identity, DNS | 4 hours |
| 2 | EHR database and applications, interface engine | 8 hours |
| 3 | Pharmacy, LIS, PACS | 8 hours |
| 4 | Patient monitoring central server, pump server | 12 hours |
| 5 | Bed management, secure messaging | 12 hours |
| 6 | Revenue cycle | 72 hours |
