# Clinical systems toolkit

Included with Action Stations. This pack adds the `clinical_systems` toolkit, shared by health informatics, healthcare, public health, nursing and pharmacy exercises. A toolkit gives an exercise the expertise of one field; this one covers the records and messaging systems of a care organization.

## What it adds

- Writing guidance: terms (downtime, read-only viewer, back-entry, reconciliation, ADT, ORM and ORU, MRN, overlay), product conventions (as-of times, data-age stamps, phoned critical results) and realism rules.
- Outside parties and three advisor roles (clinical informatics liaison, interface analyst liaison, health information management liaison).
- Eight structured decisions: declare downtime, set restore order, hold, replay or discard a message class, release or hold results, open a duplicate or overlay merge, isolate devices, notify, and return to normal.
- Evaluation measures: outage to downtime declaration, declaration to all units on downtime procedures, orders and results lost or delayed, critical result communication, reconciliation progress, duplicate records created, restore order and notification clocks. The toolkit owns the downtime measures; the clinical care toolkit adds the bedside care measures and does not repeat these.
- Names for the charts and format checks the app provides for this field.

## Defaults and their sources

No published source sets one restore order or back-entry policy for every hospital; each source below asks the hospital to set its own. The defaults follow the dependencies and practices they name, and can be changed in the scenario.

- **Restore order:** registration (ADT) and patient identity, laboratory results, radiology, the EHR open to clinicians with order entry, pharmacy orders and dispensing cabinet profiles, and the eMAR last.
- **Back-entry:** downtime registrations, active orders and allergies are always entered; a downtime of 8 hours or less is entered in full; a longer one enters the last dose of each active medication and the latest vital signs and assessment and scans the rest. Every downtime ends with identity, medication (pharmacist verification) and results reconciliation before units leave paper.

Sources:

- ASTP/ONC SAFER Guides, Contingency Planning (2025 set): https://healthit.gov/clinical-quality-and-safety/safer-guides/
- ASPR TRACIE, Healthcare System Cybersecurity: Readiness and Response Considerations (2021, updated 2022): https://files.asprtracie.hhs.gov/documents/aspr-tracie-healthcare-system-cybersercurity-readiness-response.pdf
- ASPR TRACIE, Hospital Readiness and Response: Information Technology Failures and Cyber Incidents: https://files.asprtracie.hhs.gov/documents/hrrog-information-technology-failures-cyber-incidents.pdf
- Health Sector Coordinating Council, Operational Continuity – Cyber Incident checklist (version 1.1, 2022): https://healthsectorcouncil.org/occi/
- HIPAA Security Rule contingency plan, 45 CFR 164.308(a)(7): https://www.ecfr.gov/current/title-45/section-164.308
- CMS emergency preparedness, 42 CFR 482.15: https://www.ecfr.gov/current/title-42/section-482.15

All patients are synthetic. Nothing in this toolkit connects to a real system.

Facts were checked on 2026-11-15.
