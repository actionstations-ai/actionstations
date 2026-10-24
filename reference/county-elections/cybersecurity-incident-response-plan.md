# Lisle County Board of Elections — Cybersecurity Incident Response Plan

Document Control Number: LCBOE-CIRP-2026 · Revision 2.0 · Effective Date: 06/15/2026 · Parent document: LCBOE-COOP-2026 · Owners: Rohan Mehta (Elections IT Manager) and Trent Gallagher (Lisle County Chief Information Security Officer) · Reviewed: Gwen Hartley (Director), Marcus Bell (Deputy Director), Michael Strand (Assistant Prosecuting Attorney)

> **EXERCISE MATERIAL — for training use.** Lisle County, the City of Carrow, the Lisle County Board of Elections, its people, polling locations, contests, telephone numbers, hostnames, addresses and identifiers are simulated. No real candidate, party or election result is depicted.

**Record of Revisions:** 1.0 — 07/01/2024 — All — First plan, from the CISA readiness checklist · 1.1 — 03/01/2025 — Section 6 — Results website DDoS playbook · 2.0 — 06/15/2026 — All — Phishing and account-takeover playbook; voter-record integrity checks; insider-threat measures; public statement rules

**Handling:** Internal. Contains hostnames, account names and network details. Copies: Director, Deputy Director, Elections IT Manager, County CISO.

## Table of Contents

Section 1 Purpose · Section 2 Principles · Section 3 Roles · Section 4 What Is Connected and What Is Not · Section 5 Severity Levels · Section 6 Playbooks · Section 7 Voter-Record Integrity Checks · Section 8 Reporting · Section 9 Public Statements · Section 10 Recovery · Annex A Contacts · Annex B Indicators Seen in Election Phishing

---

## SECTION 1: PURPOSE

This plan sets out how the Board detects, contains and recovers from a cybersecurity incident affecting Board systems, and how it keeps voting going while it does. It applies to the Board network, email, the county voter registration system, the pollbook build process, the results website and the Board's social media accounts. The voting system (election management system, scanners and ballot-marking devices) is not networked; incidents touching it follow the chain-of-custody rules in LCBOE-COOP-2026 Section 8.3 as well as this plan.

## SECTION 2: PRINCIPLES

1. No eligible voter is turned away because a system is in doubt; provisional ballots and the backup paper lists exist for that.
2. Bipartisan pairs for every action on voter records and voting equipment, including incident response actions.
3. Preserve before fixing: logs and audit trails are election records (52 U.S.C. 20701, 22 months).
4. Say what is known and what voters should do; never guess at who did it.

## SECTION 3: ROLES

| Role | Primary | Alternate | Decides |
|---|---|---|---|
| Incident Commander | Gwen Hartley, Director | Marcus Bell, Deputy Director | Severity, Board notification, public statements with the PIO and counsel |
| Technical Lead | Rohan Mehta, Elections IT Manager | Trent Gallagher, County CISO | Disabling accounts, isolating systems, preserving logs, outside technical help |
| County Security | Trent Gallagher, County CISO | County IT on-call engineer | County network and Microsoft 365 tenant actions; managed SOC; law-enforcement and CISA reporting with the Director |
| Voter Registration | Beth Saylor, VR Manager | Nina Ruiz, VR Clerk (unless her account is involved) | Freezing record changes, comparisons with the statewide database, corrections |
| Voting Systems | Carla Nunez, Voting Systems Manager | Voting systems technician | Anything touching the EMS, scanners, BMDs or media |
| Legal | Michael Strand, Assistant Prosecuting Attorney | — | Litigation hold, records requests, notice to voters under state breach law |
| PIO | Jenna Whitlow | Gwen Hartley | Public and media messages |

## SECTION 4: WHAT IS CONNECTED AND WHAT IS NOT

| System | Connected to | Notes |
|---|---|---|
| County voter registration system "VoterTrack" (LCBOE-VR01, database LCBOE-SQL01) | County network; nightly synchronization with the statewide voter registration database | Staff log in with county accounts (Microsoft Entra ID) and a second factor; 14 accounts with edit rights |
| Pollbook build workstation LCBOE-PB01 | Not networked | Receives the pollbook export from VoterTrack on an encrypted USB drive, two-person transfer; loads the KnowInk Poll Pad data packages |
| Electronic pollbooks (KnowInk Poll Pad, 64 devices) | Closed cellular network between devices at the same location for "already voted" updates during early voting and Election Day | Not connected to VoterTrack |
| Election management system (ES&S Electionware, LCBOE-EMS01) | Air-gapped | In the locked count room, camera-covered, two-person access |
| ES&S DS200 scanners, ExpressVote BMDs, DS850 central scanner | Not networked | Sealed; media handled per chain-of-custody |
| Results website (results.lislevotes.example) | Hosted by the county's web host with DDoS protection | Results files carried from the EMS by write-once media to the upload workstation LCBOE-ENR01 |
| Email and files (Microsoft 365, LCBOE-FS01) | County tenant and network | Managed SOC monitors sign-ins |
| Board website and social media | Vendor-hosted | PIO and Director hold the accounts with hardware security keys |

## SECTION 5: SEVERITY LEVELS

| Level | Description | Response |
|---|---|---|
| CIRP 3 | Suspicious email reported, no click; single failed log-in alerts | IT Manager handles; logged |
| CIRP 2 | A staff account compromised; unauthorized change to Board data; results site degraded | COOP Level 2; Director, VR Manager, County CISO; Secretary of State's office informed |
| CIRP 1 | Voter records altered at scale, or any incident during early voting or on Election Day that affects voter check-in or results reporting | COOP Level 1; Board members informed; federal partners notified |

## SECTION 6: PLAYBOOKS

### 6.1 Phishing and account takeover

1. Disable the account in Entra ID and revoke sessions (County CISO); reset its second factor.
2. Look for mailbox rules (forwarding, deletion) and messages sent from the account in the past 30 days; recall or warn recipients of anything sent by the attacker.
3. Pull the VoterTrack audit trail for the account: every record viewed or changed, with times.
4. If records were changed: Playbook 6.2.
5. Preserve the original phishing email with full headers for the FBI and CISA.

### 6.2 Unauthorized voter-record changes

1. Freeze edits in the affected precincts (COOP-DR-5).
2. Run the integrity checks in Section 7.
3. Hold the next pollbook load until the affected records are reconciled; tell the Early Vote Center and poll workers which voters to offer a provisional ballot.
4. Correct records only from documentary evidence (voter's application, statewide database history), by a bipartisan pair, on form LCBOE-F-22.
5. Notify the Secretary of State's office the same day and agree how the statewide database will be checked.

### 6.3 Results website attack or outage

Switch to the static mirror page; post results files at the Board office and give printed copies to observers and media; confirm with the web host that the attack is mitigated; publish the source of truth (the Board's printed results) in every message.

### 6.4 Impersonation of the Board

Spoofed emails, texts or social media posts that appear to come from the Board (for example, a fake notice that a polling location moved): the PIO posts a correction within one hour on all Board channels; the Poll Worker Coordinator confirms with the affected polling location; the County CISO asks the platform or domain host to remove the content and reports it to CISA and the FBI.

### 6.5 Insider concerns

Unexplained access to the count room, copying of voting system media, or a staff member acting outside their duties: Voting Systems Manager and Director secure the equipment and the camera footage; counsel and the Sheriff's liaison are informed; equipment involved is not used until its integrity is confirmed with the Secretary of State's office.

## SECTION 7: VOTER-RECORD INTEGRITY CHECKS

| Check | Method | Owner |
|---|---|---|
| Audit-trail review | All VoterTrack changes in the window, by user, record and field | Beth Saylor with Rohan Mehta |
| Statewide comparison | Affected records compared with the statewide voter registration database record and history | Beth Saylor |
| Snapshot comparison | Affected records compared with the nightly export on LCBOE-FS01 and the offline copy taken before the window | Rohan Mehta |
| Mail ballot status | Any record showing "mail ballot requested" or "issued" checked against the mail ballot application file and the mailing log | Doug Pruett |
| Pollbook packages | Package hash recorded at build compared with the package loaded on each Poll Pad | Carla Nunez |

Results are recorded on LCBOE-F-22 and kept as election records.

## SECTION 8: REPORTING

| Who | When | By whom |
|---|---|---|
| County IT and the managed SOC (Buckeye Ridge Managed Security) | Immediately | Anyone who sees it |
| Ohio Secretary of State's office (elections and security staff) | Same day for CIRP 2; within one hour for CIRP 1 | Director |
| CISA (1-844-SAY-CISA, report@cisa.dhs.gov; Region 5 election security advisor) | CIRP 2 and 1 | County CISO |
| FBI Cincinnati Field Office election crimes coordinator; ic3.gov | CIRP 2 and 1; any extortion, impersonation or threat | Director |
| Ohio Cyber Reserve (through the Secretary of State or county EMA) | When more hands are needed | County CISO |
| U.S. Postal Inspection Service | Mail-related fraud or impersonation of mail ballot notices | Absentee Manager |
| Board members | CIRP 1 | Director |
| Cyber insurance (County Risk Pool) | Within 24 hours of CIRP 1 | Counsel |

## SECTION 9: PUBLIC STATEMENTS

Statements are approved by the Director with counsel and released by the PIO (COOP-DR-6). They say: what happened in plain terms, what is not affected (for example, that the scanners and the election management system are not connected to any network, when that has been confirmed), what voters should do (check their registration at the state lookup, vote as planned, ask for a provisional ballot if their record looks wrong), and when the next update comes. They do not name suspects, parties or candidates.

## SECTION 10: RECOVERY

A system returns to use when the County CISO confirms it is clean, the owner has completed the integrity checks, and the Director agrees. The pollbook load built after an incident is checked against the statewide database by a bipartisan pair before it is loaded. Lessons learned are recorded within 30 days, after the canvass if the incident occurs during an election.

## ANNEX A: CONTACTS

| Organization | Product / role | Number |
|---|---|---|
| Lisle County IT service desk | Network, email, identity | 555-0150 |
| Trent Gallagher, County CISO | Mobile | 555-0151 |
| Buckeye Ridge Managed Security SOC | 24/7 monitoring | 555-0158 |
| VoterTrack support (Tallgrass Civic Software) | County voter registration system | 555-0166 |
| ES&S customer support | Voting system | (number in Voting Systems Manager's binder) |
| KnowInk support | Poll Pad | (number in Voting Systems Manager's binder) |
| County web host | Results website and DDoS protection | 555-0168 |

## ANNEX B: INDICATORS SEEN IN ELECTION PHISHING

Messages that appear to come from the Secretary of State, a voting system vendor or the EAC with urgent "directive" or "updated procedures" subjects; links to log-in pages that imitate Microsoft 365; look-alike sender domains; requests to approve an unexpected multi-factor prompt; attachments named like official forms. Staff report them with the "Report Phish" button and do not forward them.
