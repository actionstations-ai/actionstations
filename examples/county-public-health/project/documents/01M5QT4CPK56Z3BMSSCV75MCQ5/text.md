# Marston County Health Department — Cyber Incident Response Annex

Document Control Number: MCHD-CYB-ANX-2026 · Revision 1.2 · Effective Date: 02/01/2026 · Parent document: MCHD-EOP-2026 · Owners: Wes Tran (Informatics Lead, MCHD) and Pamela Ruiz (Marston County IT Director) · Reviewed: Ian Becker (County Information Security Officer), Frank Delaney (County Counselor)

> **EXERCISE MATERIAL — for training use.** Marston County, the City of Ellery, the Marston County Health Department, its people, partners, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 08/01/2024 — All — First annex, written after the county's 2024 phishing incident · 1.1 — 03/15/2025 — Sections 5, 7 — Clinic HIPAA hybrid-entity notes; IIS interface pause procedure · 1.2 — 02/01/2026 — All — Data-integrity checks for SlotWise and the IIS export; paper-mode triggers; contact update

**Handling:** Internal. Contains hostnames and account names. Copies: DOC kit binder, Informatics Lead, County IT Director, County Information Security Officer.

## Table of Contents

Section 1 Purpose and Relationship to the County Plan · Section 2 Roles · Section 3 Severity Levels · Section 4 Detection and First Report · Section 5 Containment Decisions · Section 6 Data Integrity · Section 7 Privacy and Breach Questions · Section 8 Reporting and Outside Help · Section 9 Recovery and Verification · Section 10 Paper Mode · Annex A Playbooks · Annex B Contacts

## SECTION 1: PURPOSE AND RELATIONSHIP TO THE COUNTY PLAN

Marston County IT runs the network, identity, email, file shares, backups and the managed security service for every county department, MCHD included. The county's Cyber Incident Response Plan (MC-CIRP-2025) governs the technical response. This annex tells MCHD what to do while County IT works: which public health functions are affected, who decides to pause interfaces or go to paper, how to judge whether health data can be trusted again, and what MCHD must tell KDHE, partners and the public. The public health response to any outbreak in progress continues under MCHD-EOP-2026.

## SECTION 2: ROLES

| Role | Primary | Alternate | Decides |
|---|---|---|---|
| Incident Commander (MCHD) | Dr. Joanna Pruitt, Health Officer | Dr. Samuel Achebe | Paper mode for the department; public statements about MCHD data |
| Informatics Lead | Wes Tran | Jenna Fowler, Data Analyst | Pausing the IIS export and SlotWise; data-integrity checks; state system accounts |
| County IT Director | Pamela Ruiz | Marcus Oyler, Network Manager | Network isolation, shutdown of servers, restore order |
| County Information Security Officer | Ian Becker | Bluestem Managed Security (SOC) shift lead | Evidence preservation, forensics, law-enforcement and CISA contact |
| Privacy Officer (clinics) | Rachel Holtz, Director of Public Health Nursing | Frank Delaney | HIPAA breach risk assessment for clinic records |
| Legal | Frank Delaney, County Counselor | Assistant County Counselor | Notice obligations, records requests, ransom questions (the county does not pay; Board policy 2023-14) |
| Public Information Officer | Lena Abernathy | Marisol Ortega | Public and partner messaging about the outage and any data exposure |

## SECTION 3: SEVERITY LEVELS

| Level | Description | MCHD action |
|---|---|---|
| Cyber 3 | Single device or account; no essential function affected | Informatics Lead tracks; no activation |
| Cyber 2 | One MCHD essential function degraded (EHR, file share, SlotWise, fax server) or a suspected data-integrity problem in health data | EOP Level 2; consider pausing interfaces |
| Cyber 1 | County network ransomware or multiple MCHD systems down; or confirmed alteration or theft of health records | EOP Level 1; paper mode; Policy Group informed |

## SECTION 4: DETECTION AND FIRST REPORT

Typical first signs: a clinic nurse cannot open ClinicTrack; files on the MCHD-FS01 shares renamed with an unfamiliar extension; SlotWise appointment lists that do not match the paper sign-in; the KDHE Immunization Program calling about odd records in the nightly IIS file; a Bluestem SOC alert on an MCHD workstation; a fax that never arrives.

Anyone who sees one calls the County IT Service Desk (555-0171) and tells the Informatics Lead. They do not power off a machine that shows a ransom note; they unplug its network cable and leave it on, and note the time, the machine name (label on the case) and what was on the screen.

## SECTION 5: CONTAINMENT DECISIONS

### 5.1 Who decides

County IT decides network isolation and server shutdowns. MCHD decides what to stop sending outside the county and when to go to paper. The two decisions are coordinated by phone between Pamela Ruiz and Wes Tran within 30 minutes of a Cyber 2 or Cyber 1 call.

### 5.2 Interface pause (decision record CYB-DR-2)

The nightly HL7 VXU export from ClinicTrack to the state IIS (job IIS-EXPORT-NIGHTLY on MCHD-INT01, 01:30) is paused when:

- ClinicTrack or MCHD-INT01 is suspected compromised; or
- the export file contains records that do not match the clinic's paper or EHR counts (Section 6); or
- KDHE asks MCHD to stop.

Pausing means records will reach the state IIS late, and clinicians and schools checking the IIS will not see recent MMR doses. The PIO prepares a line for schools: "Doses given at MCHD clinics since [date] may not show in the state registry; parents can bring the paper record."

### 5.3 What MCHD does not do

MCHD staff do not reset passwords for others, do not reinstall software, do not contact the attackers, and do not post about the incident on social media. Only the County Counselor and the Policy Group discuss ransom demands.

## SECTION 6: DATA INTEGRITY

Health data is only useful if it is right. During and after an incident the Informatics Lead checks:

| Data set | Check | Owner |
|---|---|---|
| Vaccination records (ClinicTrack) | Daily dose count per clinic against the paper sign-in sheets and the vaccine inventory drawn down in ColdSentry | Wes Tran with clinic managers |
| IIS export file | Record count and a 20-record sample against ClinicTrack before release; any dose with a lot number not in MCHD inventory is held | Wes Tran |
| SlotWise appointments | Appointment counts and contact numbers against booking confirmations; any bulk change made outside business hours is flagged | Jenna Fowler |
| Outbreak line list (SharePoint) | Version history checked for edits by accounts outside the Epi team; printed copy from the last operational period is the reference | Dr. Neha Raman |
| State surveillance system | Not under county control; MCHD checks that new cases match phone reports and tells KDHE of any difference | Colin Mercer |

If a check fails, the data set is marked "not trusted" on the DOC status board and the paper copy becomes the record until the Informatics Lead and the owner sign off on the reconciliation (form MCHD-F-62).

## SECTION 7: PRIVACY AND BREACH QUESTIONS

MCHD is a hybrid entity. The immunization, family planning, STD and TB clinics are HIPAA-covered components; disease surveillance and contact tracing records are not, and are protected by Kansas law on the confidentiality of disease reports. The Privacy Officer and the County Counselor decide, for each data set, whether an incident is a reportable breach and which clock applies (for the clinics, HIPAA notice to individuals without unreasonable delay and no later than 60 days after discovery). MCHD does not confirm or deny to the media that any individual's record was affected until that review is done.

## SECTION 8: REPORTING AND OUTSIDE HELP

| Who | When | By whom |
|---|---|---|
| County IT and Bluestem Managed Security | Immediately | Anyone who sees it |
| KDHE (Epidemiology and Immunization programs) | Within 4 hours of a Cyber 2 or Cyber 1 call, and before any change to how reports reach the state | Informatics Lead |
| FBI Kansas City Field Office (cyber) | Cyber 1 or any extortion | County Information Security Officer |
| CISA (report.cisa.gov or Region 7 cybersecurity advisor) | Cyber 1 | County Information Security Officer |
| MS-ISAC | Cyber 1, for indicators and help | County Information Security Officer |
| Kansas Intelligence Fusion Center | Cyber 1 | County Information Security Officer |
| Cyber insurance carrier (Plains Mutual Risk Pool) | Within 24 hours of a Cyber 1 call | County Counselor |
| Hospitals, clinics and schools that send or receive MCHD data | When an interface is paused or a channel changes | Liaison Officer |

## SECTION 9: RECOVERY AND VERIFICATION

Systems return in this order unless the Incident Commander changes it: (1) phones and the fax server MCHD-FAX01, (2) email, (3) ClinicTrack EHR, (4) the file shares and the outbreak SharePoint site, (5) SlotWise, (6) the IIS export. A system returns only when County IT says it is clean and the owner has run the data-integrity check in Section 6. The IIS export restarts with a catch-up file that KDHE has agreed to receive; doses given on paper are entered and double-checked before the catch-up file is built.

## SECTION 10: PAPER MODE

Paper mode is declared by the Incident Commander (decision record CYB-DR-1). In paper mode:

- Disease reports are taken by phone on MCHD-F-10; investigators work cases in the state surveillance system from the two DOC laptops on LTE hotspots, not from county workstations.
- Clinics vaccinate on MCHD-F-40 with lot numbers from the printed inventory; no clinic is cancelled for lack of computers.
- POD and clinic appointments are taken by the Information Line on paper booking sheets.
- The line list is kept on paper (MCHD-F-12) and photographed to KDHE by secure email from a KDHE-issued account if county email is down.

## ANNEX A: PLAYBOOKS

**A-1 Ransomware on the county network.** County IT isolates; MCHD declares Cyber 1, paper mode, pauses the IIS export, moves epidemiology to DOC laptops, notifies KDHE, prepares the outage message for the public and partners.

**A-2 Suspected alteration of health data.** Informatics Lead freezes the data set (read-only), compares with paper and inventory, informs KDHE if the state systems received it, preserves logs for the County Information Security Officer. No correction is made until the comparison is documented.

**A-3 Phishing of an MCHD account with state system access.** Informatics Lead asks KDHE to disable the user's state accounts; County IT resets the county account and reviews mailbox rules; Epi checks recent actions in the state system under that user.

**A-4 Fax server failure during an outbreak.** Labs and clinics are told by phone to call reports to 555-0142; KDHE provides a temporary fax number.

## ANNEX B: CONTACTS

| Organization | Contact | Number |
|---|---|---|
| Marston County IT Service Desk | On-call engineer | 555-0171 |
| Pamela Ruiz, County IT Director | Mobile | 555-0172 |
| Ian Becker, County Information Security Officer | Mobile | 555-0173 |
| Bluestem Managed Security SOC (24/7) | Shift lead | 555-0177 |
| Wes Tran, Informatics Lead | Mobile | 555-0145 |
| Corvane Health (ClinicTrack EHR support) | Priority line | 555-0182 |
| SlotWise support | Support desk | 555-0184 |
| ColdSentry monitoring | 24/7 line | 555-0186 |
