# Ottawa River Regional Medical Center — Cyber Incident Response Plan

Document Control Number: ORRMC-CIRP-2026 · Revision 2.3 · Effective Date: 02/01/2026 · Parent document: ORRMC-EOP-2026 · Owners: Marcus Hale (Information Security Officer) and Raymond Okafor (Director of IT) · Reviewed: Joyce Tanaka (Chief Privacy Officer), Peter Lindqvist (Clinical Engineering Manager), the hospital's outside counsel

> **EXERCISE MATERIAL — for training use.** Ottawa River Regional Medical Center, its people, vendors, hostnames, addresses and identifiers are simulated. Toledo, Lucas County and the named public agencies are real.

**Record of Revisions:** 1.0 — 04/10/2023 — All — First plan · 2.0 — 05/20/2024 — Sections 4, 6 — Medical device containment · 2.1 — 11/05/2024 — Section 8 — Downtime coordination · 2.2 — 09/15/2025 — Section 7 — Breach assessment worksheet · 2.3 — 02/01/2026 — All — Alignment with HHS cybersecurity performance goals

**Handling:** Internal. Contains hostnames and account names. Copies: HCC binder, IT on-call binder, Information Security Officer, outside counsel.

## SECTION 1: PURPOSE AND RELATIONSHIP TO THE EOP

This plan tells ORRMC how to detect, contain and recover from a cyber incident and how technical decisions are made together with patient care. The Emergency Operations Plan (ORRMC-EOP-2026) governs hospital command; the EHR Downtime Procedures Annex (ORRMC-DT-ANX-2026) governs clinical work during an outage. When the two meet, patient safety decides: Information Security may isolate a system, but the Administrator on Call, with the Chief Medical Officer, decides when that isolation changes how patients are cared for.

## SECTION 2: ROLES

| Role | Primary | Alternate | Decides |
|---|---|---|---|
| Incident Commander (HICS) | Helen Marchetti, COO (Administrator on Call) | Dr. Samuel Obuya, CMO | Downtime level, diversion, evacuation, public statements |
| Information Security Officer (ISO) | Marcus Hale | Lena Fischer | Containment and eradication, forensic hold, law-enforcement and CISA contact |
| Director of IT | Raymond Okafor | Nadia Petrov | Network isolation, shutdown, restore order |
| Clinical Engineering | Peter Lindqvist | Hao Tran | Medical device isolation and manual operation |
| Chief Medical Information Officer | Dr. Priya Raman | | Clinical risk of EHR and device decisions |
| Chief Privacy Officer | Joyce Tanaka | Daniel Whitfield | HIPAA breach risk assessment and notices |
| Legal / outside counsel | General Counsel | Outside cyber counsel | Privilege, ransom, regulator communication |
| Public Information Officer | Kevin Dunmore | Alicia Moreno | Statements; works only from facts cleared by the ISO and the CPO |

## SECTION 3: SEVERITY LEVELS

| Level | Description | Hospital action |
|---|---|---|
| Cyber 3 | Single endpoint or account; no clinical function affected | ISO handles; no HCC |
| Cyber 2 | One clinical or business system degraded, or suspected compromise of a medical device segment | EOP Level 2; HCC opens; Clinical Engineering and nursing leaders join |
| Cyber 1 | Ransomware or destructive attack on the EHR, network core or several clinical systems; confirmed data theft; compromise of life-support-connected devices | EOP Level 1; downtime; Policy Group (CEO, COO, CMO, CNO, General Counsel) informed within 30 minutes |

## SECTION 4: DETECTION AND FIRST REPORT

Anyone who sees a ransom note, an encrypted file, an unexpected device behavior or a suspicious logon calls the IT service desk (ext. 5-0100) and does not turn off the machine unless told to. The managed detection service calls the IT on-call phone for high-severity alerts. The IT on-call opens the incident in the ticket system and calls the ISO within 15 minutes of a likely Cyber 2 or 1. The ISO starts an incident log with times in UTC and local time, decisions and who made them.

## SECTION 5: CONTAINMENT DECISIONS

| Decision | Who | Clinical effect to weigh |
|---|---|---|
| Disconnect the EHR application and database servers from the network | ISO with Director of IT; AOC informed | EHR down; downtime procedures; viewer feed also cut |
| Disable the interface engine (ORRMC-INT01/02) | ISO | Orders and results stop flowing between systems; manual delivery |
| Disconnect the downtime viewer feed | ISO | Viewer shows data as of the last refresh |
| Block the internet at the perimeter | Director of IT | Cloud messaging, remote access and vendor support stop |
| Isolate the device network (10.40.x.x) or a segment | ISO with Clinical Engineering | Networked monitors and pumps keep working locally but lose central view and drug-library updates; imaging and lab analyzers stop sending |
| Shut down the building management system (ORRMC-BMS01) | Director of Facilities with the ISO | HVAC and negative-pressure rooms need manual checks |
| Reset all passwords and disable remote access | ISO | Staff locked out; use of break-glass accounts |
| Take the hospital to diversion for ambulances | AOC with ED medical director | Lucas County EMS is notified; patients go to neighbouring hospitals |

Evidence is preserved before systems are wiped: memory images and disk images of affected hosts, firewall and authentication logs, copies of ransom notes. Outside counsel engages the forensic firm so the work is under privilege.

## SECTION 6: MEDICAL DEVICES

Clinical Engineering keeps the inventory of 9,400 networked devices with manufacturer, software version, network segment and manual fallback. When a device is thought to be compromised, the response is: tell the unit; put the device on manual operation or replace it; isolate the segment only if the ISO and the Clinical Engineering Manager agree that the risk of staying connected outweighs the loss of central monitoring; contact the manufacturer; report to the FDA and the manufacturer as required; keep infusions running per the pump's local program. Devices that cannot be safely isolated are monitored by a nurse at the bedside.

## SECTION 7: DATA, PRIVACY AND BREACH QUESTIONS

The Chief Privacy Officer starts the HIPAA risk assessment as soon as it is possible that protected health information was accessed. Ransomware that encrypts protected health information is treated as a presumptive breach unless the assessment shows a low probability of compromise (45 CFR 164.402). If a breach is confirmed: notice to affected individuals without unreasonable delay and within 60 calendar days of discovery (45 CFR 164.404); media notice and notice to HHS at the same time when 500 or more residents of a state are affected (164.406, 164.408); smaller breaches are logged and reported to HHS within 60 days after year end. The hospital also considers Ohio notification law and its insurer's notice conditions. The Board and Medicare/Medicaid contacts are informed by the CEO.

Ransom: the hospital does not decide to pay on the first day. The decision belongs to the Policy Group with outside counsel, the insurer and the FBI, and considers sanctions screening and patient safety.

## SECTION 8: REPORTING AND OUTSIDE HELP

The ISO reports to: the FBI Cleveland Field Office and CISA; H-ISAC; the Ohio Department of Health and the Lucas County Emergency Management Agency (through the HCC Liaison Officer); the cyber insurer; the managed detection service; the EHR vendor's incident desk; and HHS Office for Civil Rights when a breach is confirmed. The Liaison Officer asks the regional healthcare coalition for support (for example loaned laptops, printers and downtime supplies) and informs neighbouring hospitals of diversion.

## SECTION 9: RECOVERY AND VERIFICATION

Restore in this order: network core, identity, DNS; the EHR database and applications; interface engine; pharmacy, laboratory and imaging; monitoring and pump servers; bed management and messaging; revenue cycle. Before restoring, the ISO verifies that backups predate the intrusion (the immutable cloud copy of the EHR database is the source of last resort); rebuilds domain controllers; rotates every credential; and scans each restored host. A restore is not an all-clear: the ISO watches for re-infection for at least 72 hours, and the Chief Medical Information Officer signs off clinical use after a check of high-alert medication data, allergy lists and pump drug libraries. HIM and the clinical leads reconcile the record under the Downtime Annex.

## SECTION 10: AFTER ACTION

Within 30 days of closing the incident, the ISO and the Emergency Management Director hold a hot wash and write an after action report with corrective actions tracked in the Emergency Management Committee. Exercises of this plan satisfy part of the twice-yearly testing requirement in 42 CFR 482.15(d).

## ANNEX A: PLAYBOOK SUMMARIES

**Ransomware on clinical servers:** isolate, preserve, activate downtime, assess data theft, restore from clean backups, notify. **Medical device compromise:** manual operation, segment isolation decision, manufacturer and FDA contact. **Business email compromise or phishing of staff:** reset credentials, review mail rules, check for payroll or vendor payment redirects. **Vendor or supply-chain compromise:** disconnect vendor remote access, ask the vendor for indicators, check logs. **Denial of service on public sites:** the patient portal and website are separate from clinical systems; the PIO tells patients where to call.
