# Halverson Unified School District — Cyber Incident Response Plan

Document Control Number: HUSD-CIRP-2026 · Revision 2.0 · Effective Date: 09/01/2026 · Owner: Victor Han (Chief Technology Officer) · Maintained by: Priya Castellanos (Information Security Manager) · Approved: Dr. Renata Solberg (Superintendent), Elise Marchetti (General Counsel)

> **EXERCISE MATERIAL — for training use.** The Halverson Unified School District, its schools, people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 01/20/2025 — All — First plan, built from the CISA K-12 recommendations (MFA, patching, tested backups, reduced exposure, an exercised IR plan, training) · 1.1 — 08/18/2025 — Sections 6, 9 — Extortion and data-leak playbook; Northwest Schools Risk Pool breach-coach panel · 2.0 — 09/01/2026 — All — Annex H cross-references; state assessment window procedures; offline roster export; Tallgrass MDR onboarding; contact refresh

**Handling:** Restricted. Contains network names and response contacts. Paper copies: CTO office safe, District EOC go-box, Information Security Manager go-bag.

## Table of Contents

Section 1 Purpose and Scope · Section 2 Roles · Section 3 Severity Levels · Section 4 Detection and Reporting · Section 5 First Hour Checklist · Section 6 Ransomware and Extortion Playbook · Section 7 Containment and Isolation · Section 8 Evidence · Section 9 Notifications and Reporting · Section 10 School-Day Continuity · Section 11 Recovery and Verification · Section 12 Exercises · Annex A Decision Records · Annex B Contacts

## SECTION 1: PURPOSE AND SCOPE

This plan governs the district's response to a cyber incident affecting HUSD systems or data, including systems hosted by vendors that hold HUSD student or staff records. It covers the business network, the school networks, Google Workspace for Education, the student information system, phones, building systems reachable from the network, and the 1:1 Chromebook fleet. The Emergency Operations Plan (HUSD-EOP-2026, Annex H) governs what schools do while systems are down.

## SECTION 2: ROLES

| Role | Primary | Alternate | Decides / owns |
|---|---|---|---|
| Incident Lead | Victor Han, CTO | Priya Castellanos | Declares a cyber incident and its severity, directs containment, briefs the Incident Commander |
| Technical Lead | Priya Castellanos, Information Security Manager | Jared Okafor, Network Manager | Triage, isolation, evidence, liaison with Tallgrass MDR, DFIR firm, MS-ISAC, K12 SIX and CISA |
| Systems Lead | Jared Okafor, Network Manager | Melissa Grant, Systems Administrator | Domain controllers, servers, backups, firewall, Wi-Fi |
| Applications Lead | Melissa Grant, Systems Administrator | Student Information Coordinator | PowerSchool SIS, Clever, ParentSquare, Tyler Munis, Transfinder |
| Incident Commander (EOC) | Marcus Delacroix, Director of School Safety | Angela Pruitt | Runs the district EOC and the school-day consequences |
| Legal | Elise Marchetti, General Counsel | Outside counsel | Privilege, breach-notice analysis, extortion contact, law enforcement |
| Communications | Lauren Achebe, Chief Communications Officer | Tomás Rivera | Staff, family and media messages; social-media monitoring |
| Policy Group | Dr. Renata Solberg, Superintendent | Dr. Calvin Ostrowski | Closures, testing decisions, any payment question |

The Incident Lead works through Legal Counsel once a data-theft or extortion element is suspected, so the DFIR engagement and its reports are directed by counsel.

## SECTION 3: SEVERITY LEVELS

| Severity | Description | Examples | Response |
|---|---|---|---|
| S1 Low | Single user or device, no data exposure | One phished account reset, blocked malware on a Chromebook | Helpdesk with Technical Lead review |
| S2 Moderate | Several accounts or one system degraded; possible exposure | Compromised staff mailbox sending phish, SIS slowness from unauthorized report exports | Technical Lead, Incident Lead notified, MDR engaged |
| S3 High | District system unavailable or confirmed data theft | Ransomware on servers, encrypted file shares, confirmed exfiltration | Incident Lead declares; EOC partial activation; Legal and insurer engaged |
| S4 Critical | Several district systems down during instruction, extortion, or safety systems affected | Ransomware plus leak-site posting; phones and HVAC controls down; threats to families | Full EOC; Policy Group; law enforcement |

## SECTION 4: DETECTION AND REPORTING

- Tallgrass MDR watches endpoint alerts (Microsoft Defender for Endpoint on servers and staff Windows laptops), firewall logs and Google Workspace audit logs 24/7 and calls the Technical Lead within 15 minutes of a high-severity alert.
- Staff report suspected incidents to the Technology Help Desk (ext. 4357, helpdesk@halversonusd.example); after hours, the help desk line forwards to the on-call technician.
- Any staff member who receives an extortion message, a ransom note on a screen or a call claiming to hold district data reports it immediately and does not reply.

## SECTION 5: FIRST HOUR CHECKLIST

1. Technical Lead confirms the alert with MDR; opens an incident record (CIRP Form 1) with times.
2. Incident Lead decides severity; for S3 or S4 calls the Director of School Safety and General Counsel.
3. Preserve before you wipe: no reimaging, no restore, no reboot of affected servers until the Technical Lead approves (Section 8).
4. Contain (Section 7) at the smallest effective scope first; widen if spread continues.
5. Notify the Northwest Schools Risk Pool cyber claims line (policy condition: within 24 hours of discovery) and accept its breach coach and DFIR firm.
6. Start the communications log; the PIO drafts the first staff message.
7. Decide whether instruction and state testing continue (Section 10).

## SECTION 6: RANSOMWARE AND EXTORTION PLAYBOOK

### 6.1 Recognizing the pattern

Ransomware groups that hit schools commonly steal data before they encrypt, post a ransom note with a leak-site link and a deadline, and then pressure the district through direct emails to staff and parents and through posts of sample files (federal #StopRansomware advisories on Vice Society and Rhysida describe this pattern against the education sector). Expect the actor to contact families, local media and the Board directly.

### 6.2 Actions

1. Contain per Section 7; protect backups first (Section 11.1).
2. Legal Counsel notifies the FBI Portland Field Office and reports to CISA; the Technical Lead shares indicators with MS-ISAC and K12 SIX.
3. No one engages the actor except through counsel and the insurer's negotiator, and only after a Policy Group decision. Paying does not guarantee data deletion; the district's starting position is not to pay (Annex A, record CIRP-2).
4. The PIO prepares for parent questions about specific records (IEPs, health, discipline, custody notes) before any sample appears.
5. Legal Counsel and the DFIR firm determine what was taken; the district does not confirm an actor's claims until verified.

### 6.3 Data the district holds that drives notification

| Data set | System | Sensitivity |
|---|---|---|
| Student demographics, schedules, grades, attendance | PowerSchool SIS (HUSD-SIS cloud tenant) | FERPA education records |
| IEPs, 504 plans, evaluations | Special-education case management (cloud) and scanned files on HUSD-FS02 | FERPA; highly sensitive |
| Health records, medication logs, immunizations | Nurse module and HUSD-FS02 Health share | FERPA; highly sensitive |
| Custody orders, protective orders, pick-up restrictions | SIS alerts plus scanned files on HUSD-FS02 | Safety-critical |
| Staff HR and payroll (SSNs, bank details) | Tyler Munis (HUSD-ERP01 on premises) | Oregon breach-notice personal information |
| Discipline and threat-assessment records | SIS discipline module and HUSD-FS02 BTA share | FERPA; highly sensitive |

## SECTION 7: CONTAINMENT AND ISOLATION

| Step | Action | Authority | Effect on schools |
|---|---|---|---|
| C-1 | Disable compromised accounts, revoke Google and Entra sessions, reset passwords | Technical Lead | Minimal |
| C-2 | Isolate affected endpoints in Defender | Technical Lead | Affected staff offline |
| C-3 | Block the District Service Center data center from the school WAN at HUSD-FW01 | Incident Lead | Schools lose file shares, print and Munis; Google Workspace, Chromebooks and cloud SIS keep working through the local internet breakouts |
| C-4 | Disconnect HUSD-FW01 from the internet | Incident Lead with Superintendent informed | Cloud services still reachable from schools; district VoIP (hosted on HUSD-PBX01) down for inbound calls to the District Service Center |
| C-5 | Shut down the virtual host cluster HUSD-VH01 to HUSD-VH03 | Incident Lead, Policy Group informed | All on-premises systems down, including Munis payroll, file shares, the building automation server HUSD-BAS01 and the visitor-management server |

Building automation: if HUSD-BAS01 is isolated or down, HVAC controllers continue on their local schedules; Facilities sets winter occupied mode by hand at each school.

## SECTION 8: EVIDENCE

Collect a memory image and disk image of at least one affected server before shutdown when safe; preserve firewall, VPN, Defender and Google Workspace logs (Google audit logs export to the evidence bucket within 24 hours, since some log retention is short); photograph ransom notes on screens; keep the extortion emails with full headers. Chain of custody on CIRP Form 3.

## SECTION 9: NOTIFICATIONS AND REPORTING

| Who | When | By | Notes |
|---|---|---|---|
| Northwest Schools Risk Pool | Within 24 hours of discovery | CFO / Legal | Policy condition; breach coach assigned |
| FBI Portland Field Office | S3/S4, as soon as practical | Legal | Also for threats to families |
| CISA | S3/S4, as soon as practical | Technical Lead | report@cisa.gov; CIRCIA requirements not final as of this revision |
| MS-ISAC / K12 SIX | After law enforcement is told | Technical Lead | Indicators only |
| Oregon Department of Education | S3/S4 same day | Superintendent's office | Form J-7; also the Assessment Office if state testing is affected |
| Board of Education | S3/S4 same day | Superintendent | Executive session for legal advice |
| Staff | Within 2 hours of S3/S4 | PIO | Use cell text and printed notices if email is down |
| Families | Within 4 hours if the school day is affected; data-exposure notices per Legal | PIO / Legal | Oregon breach-notice law; templates in EOP Annex C |
| Oregon Attorney General | If notice to more than 250 Oregon residents is required | Legal | Per Oregon breach-notice law as counsel advises |

## SECTION 10: SCHOOL-DAY CONTINUITY

- **Instruction:** schools stay open unless safety systems (phones, PA, door access, fire panel monitoring) or heat are lost, or a credible threat accompanies the incident. The Policy Group decides.
- **State testing:** the Assessment Coordinator pauses sessions on the CTO's instruction and calls the Oregon Department of Education; students' answers in the state platform are held by the state, not by HUSD.
- **Attendance and health:** paper forms from the EOP; nurses use the printed medical-alert list.
- **Transportation:** Transfinder is cloud-hosted; if it is unavailable, drivers use the printed route sheets in each bus binder.
- **Nutrition:** point-of-sale offline mode; meals served regardless of account balances.

## SECTION 11: RECOVERY AND VERIFICATION

1. Backups: Veeam backups on HUSD-BK01 with an immutable copy in the cloud vault (30-day retention); the offline tape copy is taken every Friday. Verify the backup set predates the intrusion before restoring.
2. Rebuild domain controllers HUSD-DC01 and HUSD-DC02 from clean media if the domain is compromised; reset all passwords including service accounts and the krbtgt account twice.
3. Restore in this order: identity, firewall and VPN, phones, Munis payroll, file shares, building automation, everything else.
4. Verification sign-off (CIRP Form 4) by the Technical Lead and the DFIR firm before any system rejoins the network.
5. After-action review within 30 days.

## SECTION 12: EXERCISES

One cyber tabletop per year with the Policy Group, EOC staff and principals; the 2026–27 exercise is set during the state assessment window and tests containment (Section 7), extortion handling (Section 6) and family communication.

## ANNEX A: DECISION RECORDS

| Record | Decision | Date | By |
|---|---|---|---|
| CIRP-1 | The CTO may order steps C-1 to C-4 without further approval; C-5 requires the Superintendent to be informed | 09/01/2026 | Superintendent |
| CIRP-2 | Starting position: the district does not pay ransoms; any exception needs the Policy Group, counsel, the insurer and law-enforcement consultation | 08/18/2025 | Board of Education |
| CIRP-3 | Open finding: legacy local-admin password shared on the 2019-imaged staff laptops (LAPS rollout 60 percent complete) | 06/30/2026 | Information Security Manager |
| CIRP-4 | Open finding: VPN appliance HUSD-VPN01 firmware two releases behind; upgrade scheduled for winter break | 09/15/2026 | Network Manager |

## ANNEX B: CONTACTS

| Contact | Number / address |
|---|---|
| Technology Help Desk | ext. 4357 · 541-555-0170 · helpdesk@halversonusd.example |
| Tallgrass MDR SOC | 877-555-0158 |
| Northwest Schools Risk Pool cyber claims | 800-555-0156 |
| FBI Portland Field Office | 503-555-0150 |
| CISA | report@cisa.gov · 888-282-0870 |
| PowerSchool support (district account) | 866-555-0172 |
| ParentSquare support | 888-555-0173 |
| Oregon Department of Education, Assessment Office | 503-555-0175 |
