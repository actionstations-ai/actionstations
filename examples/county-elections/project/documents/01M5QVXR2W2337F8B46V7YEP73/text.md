# Lisle County Board of Elections — Election Contingency and Continuity of Operations Plan

Document Control Number: LCBOE-COOP-2026 · Revision 3.1 · Effective Date: 08/15/2026 · Approved: Gwen Hartley (Director) · Marcus Bell (Deputy Director) · adopted by the four-member Board at its 08/11/2026 meeting

> **EXERCISE MATERIAL — for training use.** Lisle County, the City of Carrow, the Lisle County Board of Elections, its people, polling locations, contests, telephone numbers, hostnames, addresses and identifiers are simulated. No real candidate, party or election result is depicted.

**Record of Revisions:** 2.0 — 07/01/2024 — All — Rebuilt on the EAC COOP Template (August 2023) · 3.0 — 06/15/2026 — All — Election-day operations center moved to the Annex; insider-threat and phishing measures; Drop Box 1 camera · 3.1 — 08/15/2026 — Sections 5, 8, Annex A — 2026 general election calendar; polling location changes; contact update

## Table of Contents

Section 1 Purpose, Authority and Scope · Section 2 Situation and Assumptions · Section 3 Organization and Roles · Section 4 Essential Functions by Election Phase · Section 5 Election Calendar · Section 6 Activation and the Election Operations Center · Section 7 Polling Location Disruptions · Section 8 Voter Registration and Pollbook Contingencies · Section 9 Threats, Security and Suspicious Mail · Section 10 Public Information and Rumor Control · Section 11 Records Preservation · Section 12 Training and Exercises · Annex A Contact List · Annex B Forms · Annex C Decision Records

## SECTION 1: PURPOSE, AUTHORITY AND SCOPE

### 1.1 Purpose

This plan tells the Lisle County Board of Elections (LCBOE) how to keep every eligible voter able to vote and every ballot counted when something goes wrong: a system failure, a cyber incident, a threat, bad weather or the loss of a building. It follows the structure of the U.S. Election Assistance Commission (EAC) COOP Template and its guidance: essential functions, orders of succession, delegations, alternate facilities, communications and reconstitution.

### 1.2 Authority

The Board conducts elections in Lisle County under state election law and the directives and advisories of the Ohio Secretary of State. The Board has four members, two from each of the two major political parties; the Director and Deputy Director are of different parties, and every action touching ballots, voting equipment or voter records is done by a bipartisan pair. The Lisle County Prosecuting Attorney is the Board's legal counsel.

### 1.3 Scope

All elections conducted by the Board; this revision is written for the 2026 general election. It covers the Board office and Early Vote Center, the warehouse and central count, the 12 polling locations, Drop Box 1, mail ballots and the systems listed in LCBOE-SYS-2026.

### 1.4 Coordinated Documents

| Document | Number | Revision |
|---|---|---|
| Cybersecurity Incident Response Plan | LCBOE-CIRP-2026 | 2.0 |
| Facilities, Precincts and Systems Description | LCBOE-SYS-2026 | 3.1 |
| Poll Worker Manual, 2026 General Election | LCBOE-PWM-2026G | — |
| Lisle County Emergency Operations Plan | LC-EOP-2025 | — |

## SECTION 2: SITUATION AND ASSUMPTIONS

- Lisle County has 81,200 registered voters in 24 precincts voting at 12 polling locations (LCBOE-SYS-2026, Section 3). The City of Carrow (population 38,900) is the county seat.
- Early in-person voting takes place only at the Early Vote Center in the Board office, 18 South Market Street, Carrow. Mail ballots are returned by mail, in person, or in Drop Box 1 outside the Board office.
- Voters check in on electronic pollbooks loaded from the county voter registration system, which synchronizes with the statewide voter registration database. Each polling location also receives a printed backup list of registered voters.
- Ballots are hand-marked paper ballots counted on ES&S DS200 precinct scanners; each polling location has an ES&S ExpressVote ballot-marking device for accessible voting. Mail and provisional ballots are counted on a DS850 central scanner. The election management system is air-gapped.
- The Board office uses county IT for its network, email (Microsoft 365) and identity; the voting system is not connected to any network.

## SECTION 3: ORGANIZATION AND ROLES

| ICS role | Primary | Alternate | Responsibilities |
|---|---|---|---|
| Incident Commander | Gwen Hartley, Director | Marcus Bell, Deputy Director | Plan activation, polling location relocation, requests to the Board and counsel, public statements |
| Election Operations Center Lead | Marcus Bell, Deputy Director | Alicia Grant, Poll Worker Coordinator | Hotline, rovers, staffing and logistics |
| Elections IT Manager | Rohan Mehta | Trent Gallagher, County Chief Information Security Officer | Board network, pollbook loads, voter registration system access, results website, isolation |
| Voting Systems Manager | Carla Nunez | Voting systems technician on duty | Logic and accuracy testing, chain of custody, seals, vendor escalation |
| Voter Registration Manager | Beth Saylor | Nina Ruiz, Voter Registration Clerk | County voter registration system, list maintenance, provisional ballot research |
| Absentee / Mail Ballot Manager | Doug Pruett | Absentee clerk on duty | Mail ballots, USPS coordination, Drop Box 1 collection |
| Poll Worker Coordinator | Alicia Grant | Rover supervisor | Poll worker recruitment and training, troubleshooting hotline, rovers |
| Security | Lt. Ray Duchesne, Lisle County Sheriff's Office election liaison | Board facilities supervisor | Warehouse and office access, ballot transport escorts, threats to staff, protests |
| Public Information Officer | Jenna Whitlow, Communications Coordinator | Gwen Hartley | Voter information, rumor control, media |
| Legal | Michael Strand, Assistant Prosecuting Attorney | Prosecutor's civil division on call | Court filings (hours extension), records requests, litigation hold |
| Emergency Management Liaison | Kurt Haney, Lisle County EMA Director | EMA duty officer | County EOC, generators, weather and hazards |

Board members: Ruth Ann Kessler (Chair), Thomas Ivey, Delia Morgan, Frank Oduya.

## SECTION 4: ESSENTIAL FUNCTIONS BY ELECTION PHASE

| Phase | Essential function | Maximum interruption | Fallback |
|---|---|---|---|
| Pre-election (to 35 days out) | Voter registration processing; ballot proofing and printing; logic and accuracy testing | 3 days | Paper registration log; alternate printer |
| Early voting and mail (35 days to Election Day) | Early in-person voting at the Early Vote Center; mail ballot issue and receipt; Drop Box 1 collection | 2 hours | Paper backup list and provisional ballots; alternate Early Vote Center room at the County Administration Building |
| Election Day | Voting at 12 polling locations; hotline and rovers | 30 minutes per location | Paper backup lists, emergency paper ballots, provisional ballots, relocation |
| Election night | Ballot return, central count, unofficial results | 4 hours | Results by printed tapes posted at the Board office |
| Canvass | Provisional research, reconciliation, audit, certification | Statutory deadline | Alternate count room at the County Administration Building |

## SECTION 5: ELECTION CALENDAR (2026 GENERAL ELECTION)

| Date | Milestone |
|---|---|
| 09/19/2026 | Military and overseas ballots sent |
| 10/05/2026 | Voter registration deadline |
| 10/06/2026 | Early in-person voting and mail ballot issue begin |
| 10/27/2026 | Pollbook data for Election Day built from the county voter registration system (first load) |
| 10/31/2026 | Final pollbook load; poll worker supply pickup |
| 11/02/2026 | Early in-person voting ends |
| 11/03/2026 | Election Day, polls open 06:30 to 19:30 |

Contests on the Lisle County ballot (fictional for this exercise): county commissioner; Carrow City Council District 1, District 2, District 3 and District 4; Measure A (Lisle County library levy); Measure B (Carrow charter amendment on council terms). There are no other districts or measures on the 2026 ballot in Lisle County.

## SECTION 6: ACTIVATION AND THE ELECTION OPERATIONS CENTER

| Level | Trigger | Actions |
|---|---|---|
| Level 3 — Monitoring | Single-location problem fixed by a rover; one-off system error | Hotline logs the ticket; Deputy Director informed |
| Level 2 — Partial | Two or more locations affected; voter records in question; a credible threat; a cyber incident affecting a Board system | Election Operations Center opened in the Board conference room; Director, IT, VR and PIO present; Secretary of State's office informed |
| Level 1 — Full | Voting interrupted at any location for more than 30 minutes; Early Vote Center closed; county-wide system failure | All roles; Board members informed; counsel consulted on court relief; County EOC liaison |

The Election Operations Center keeps the incident log (form LCBOE-F-07) and a status board of every polling location and the Early Vote Center.

## SECTION 7: POLLING LOCATION DISRUPTIONS

Poll workers call the hotline (555-0140). The Poll Worker Coordinator sends a rover. Options, in order: fix on site; switch to the backup paper list and emergency paper ballots; relocate (decision record COOP-DR-3, Director with a bipartisan Board pair; relocation notice LCBOE-F-15 posted at the old site with directions); ask counsel to seek extended hours from the court (COOP-DR-4).

## SECTION 8: VOTER REGISTRATION AND POLLBOOK CONTINGENCIES

### 8.1 Pollbook down or offline

Poll workers use the printed backup list. A voter who is not on the list, or whose record shows a mail ballot already requested or issued when the voter says otherwise, votes a provisional ballot (form LCBOE-F-20). No eligible voter is turned away.

### 8.2 Voter records in question (decision record COOP-DR-5)

If the Voter Registration Manager or the IT Manager suspects that voter records in the county system were changed without authority:

1. Freeze changes in the county voter registration system for the affected precincts (only the VR Manager and Director may lift).
2. Compare the affected records with the statewide voter registration database and the last good export (the nightly export kept for 30 days on LCBOE-FS01 and on offline media).
3. Do not push the next pollbook load until the comparison is done; if needed, build the pollbook load from the statewide data and the reconciled records.
4. Tell the Secretary of State's office the same day.
5. Instruct the Early Vote Center and poll workers to offer a provisional ballot to any voter whose record looks wrong.

### 8.3 Chain of custody

Voting equipment, memory media and ballots move only with a bipartisan pair, sealed, with the seal numbers on the chain-of-custody log (LCBOE-F-11). A broken or mismatched seal is reported to the Voting Systems Manager before the equipment is used.

## SECTION 9: THREATS, SECURITY AND SUSPICIOUS MAIL

- Threats to staff or poll workers: report to the Sheriff's election liaison and log; the Sheriff's Office decides on patrols.
- Suspicious mail (powder, odor, leaking): do not open further; leave the room, close the door, call 911; notify the U.S. Postal Inspection Service and the FBI. Mail ballot processing moves to the alternate room at the County Administration Building.
- Protests: lawful observation and protest are allowed outside the legal distance from the entrance; the Sheriff's liaison manages any obstruction.

## SECTION 10: PUBLIC INFORMATION AND RUMOR CONTROL

The PIO is the only voice of the Board to the media, with the Director. The PIO keeps a rumor log (LCBOE-F-25) and posts "Rumor vs. Fact" answers on lislevotes.example and the Board's social media accounts. Messages state what is known, what voters should do, and where to get help; they never speculate about who is responsible. The Board works with the EAC/CISA Election Infrastructure Incident Response Communications Guide.

## SECTION 11: RECORDS PRESERVATION

Federal law (52 U.S.C. 20701) requires the Board to keep all records and papers relating to voting in a federal election for 22 months after the election. During any incident the Director issues a litigation hold through counsel; logs, emails, system audit trails and paper records related to the incident are kept even if a system is rebuilt.

## SECTION 12: TRAINING AND EXERCISES

Poll workers are trained before each general election. Staff exercise this plan once a year; this tabletop covers voter-record integrity, phishing and false claims during early voting.

## ANNEX A: CONTACT LIST

| Organization | Contact | Number |
|---|---|---|
| LCBOE poll worker hotline | Election Operations Center | 555-0140 |
| LCBOE main line (public) | Front desk | 555-0141 |
| Gwen Hartley, Director | Mobile | 555-0142 |
| Marcus Bell, Deputy Director | Mobile | 555-0143 |
| Rohan Mehta, Elections IT Manager | Mobile | 555-0144 |
| Lisle County IT on-call | Service desk | 555-0150 |
| Lisle County Sheriff's Office | Lt. Ray Duchesne | 555-0152 |
| Lisle County EMA | Kurt Haney | 555-0154 |
| Lisle County Prosecuting Attorney | Michael Strand | 555-0156 |
| Ohio Secretary of State, Elections Division | Regional liaison | (number in Director's binder) |
| FBI | 1-800-CALL-FBI; Cincinnati Field Office election crimes coordinator | (direct number in Director's binder) |
| CISA | 1-844-SAY-CISA; report@cisa.dhs.gov | — |
| U.S. Postal Inspection Service | 1-877-876-2455 | — |
| U.S. Election Assistance Commission | 1-866-747-1471 | — |
| Channel 9 newsroom | Assignment desk | 555-0161 |
| The Carrow Courier | Government reporter | 555-0163 |

## ANNEX B: FORMS

LCBOE-F-07 Incident log · LCBOE-F-11 Chain-of-custody log · LCBOE-F-15 Polling location relocation notice · LCBOE-F-20 Provisional ballot affirmation · LCBOE-F-22 Voter record correction record · LCBOE-F-25 Rumor log.

## ANNEX C: DECISION RECORDS

| Record | Decision | Owner |
|---|---|---|
| COOP-DR-1 | Activation level | Director |
| COOP-DR-2 | Move the Early Vote Center to the alternate room | Director with a bipartisan Board pair |
| COOP-DR-3 | Relocate a polling location | Director with a bipartisan Board pair |
| COOP-DR-4 | Ask counsel to seek extended hours | Director and Board |
| COOP-DR-5 | Freeze voter record changes and hold a pollbook load | Voter Registration Manager with the Director |
| COOP-DR-6 | Public statement on a security incident | Director with the PIO and counsel |
