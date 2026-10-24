# Rook County Emergency Communications District — Cyber Incident Response Playbook

Document Control Number: RCECD-CYB-2026 · Revision 2.1 · Effective Date: 03/01/2026 · Parent document: RCECD-OPS-2026 · Owners: Brent Harlow (911 Systems Manager) and Nadia Fenwick (County Information Security Officer) · Reviewed: Shelly Marquardt (Terminal Agency Coordinator), Greg Matthys (Rook County IT Director)

> **EXERCISE MATERIAL — for training use.** Rook County, the City of Halden, the Rook County Emergency Communications District, its people, partner agencies, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 09/01/2023 — All — First playbook after the county's 2023 phishing incident · 2.0 — 01/15/2025 — All — TDoS playbook; call-screening appliance on the 10-digit lines; CJIS incident form · 2.1 — 03/01/2026 — Sections 6, 8 — CAD trust checks before back-entry; swatting evidence handling

**Handling:** Restricted to RCECD supervisors, the Technical Lead, County IT and the TAC. Contains hostnames and network segments.

## Table of Contents

Section 1 Purpose · Section 2 What Sits Where · Section 3 Roles · Section 4 Detection and First Report · Section 5 Playbook T — Telephony Denial of Service · Section 6 Playbook C — CAD or County Network Compromise · Section 7 Playbook R — Recorder and Evidence · Section 8 Restoration and Trust Checks · Section 9 Reporting · Annex A Vendor and Partner Contacts · Annex B CJIS Security Incident Reporting

---

## SECTION 1: PURPOSE

A cyber incident at a 911 center is a life-safety incident first. This playbook tells the floor and the technical staff how to keep calls answered and units dispatched while a technical attack or failure is handled, who decides to isolate or shut down systems, how evidence is kept, and who must be told. The ECC Operations and Continuity Plan (RCECD-OPS-2026) governs rerouting, manual operations and evacuation.

## SECTION 2: WHAT SITS WHERE

Knowing which systems depend on the county network decides what a county-network incident takes away from the floor.

| System | Network | Depends on county AD / email? | If the county network is isolated |
|---|---|---|---|
| CallPoint i3 call-handling (911 and text-to-911) | Call-handling network (isolated, vendor-managed) | No | Keeps working |
| Call-handling map | Call-handling network | No | Keeps working (map data as of last update) |
| P25 radio consoles (Positions 7–12) | Radio network (isolated) | No | Keeps working |
| RespondCAD (CAD-APP01, CAD-DB01, CAD-GIS01) | CAD segment, firewalled from the county network | Yes (log-in through county AD) | Users already logged in stay up; new log-ins fail; interfaces to RMS and mobile data stop |
| Mobile data terminals in vehicles | Cellular VPN to CAD-MDS01 | Yes | Stop; units go to voice status |
| EchoVault recorder (REC-01) | CAD segment | Yes (storage on county SAN) | Recording continues to local buffer for 72 hours |
| 10-digit lines and admin phones | County voice system | Yes | May fail; ring-down lines to Tamarack and Sheriff stay up |
| IDACS / NCIC terminals | CJIS segment through Indiana State Police | Partly | Use the Sheriff's mobile terminals or call IDACS by phone |
| Email, Teams, file shares | County | Yes | Lost |

## SECTION 3: ROLES

| Role | Primary | Alternate | Decides |
|---|---|---|---|
| Incident Commander | Karen Voss, 911 Director | Luis Aldana, Operations Manager | Rerouting, manual operations for longer than one shift, evacuation |
| Technical Lead | Brent Harlow, 911 Systems Manager | Priyanka Shah, CAD Administrator | Shutting down or disconnecting RCECD systems, vendor engagement, trust checks |
| County security | Nadia Fenwick, County Information Security Officer | Greg Matthys, County IT Director | Isolating the county network, forensics, law-enforcement and CISA contact |
| Floor | On-duty Shift Supervisor | Senior telecommunicator | Going to cards, opening Position 12, call-screening rule changes on the 10-digit lines |
| CJIS | Shelly Marquardt, TAC | Andrea Kim | Reporting to the state CJIS Systems Agency |

## SECTION 4: DETECTION AND FIRST REPORT

First signs reported by the floor: a flood of calls with silence, ringing, recorded speech or the same caller conferencing several call takers; ANI numbers that repeat or are clearly invalid; CAD screens freezing or refusing new incidents; unit status changes nobody made; files on a workstation renamed; a pop-up on a supervisor PC. The supervisor calls the Technical Lead (555-0113) and County IT on-call (555-0121) and opens a log on ICS 214. Nobody powers off an affected CAD workstation; it is unplugged from the network and left on.

## SECTION 5: PLAYBOOK T — TELEPHONY DENIAL OF SERVICE

### T-1 Recognize

Call takers are often the first to notice. They may feel they cannot hang up on a 911 call. RCECD policy: after 10 seconds of silence, ringing or recorded audio with no response to two prompts, and no ALI location of a plausible caller, the call taker says "911, if you can hear me press any key", waits 5 seconds, marks the call "TDOS?" on the call-handling screen and releases it. The supervisor watches the pattern on the ACD wallboard.

### T-2 Contain

- **10-digit lines:** the GateKeeper call-screening appliance sits in front of the 10-digit lines (not the 911 trunks). The supervisor or Technical Lead turns on the stored "TDoS-strict" rule set (blocks repeated ANIs, anonymous calls without a valid caller ID attestation and calls matching recorded-audio patterns). Effect: some real callers on blocked numbers get a busy signal; they can still reach 911.
- **911 trunks (SIP trunk group A, SIP trunk group B):** RCECD cannot filter 911 calls itself. The Technical Lead calls the state ESInet network operations center (555-0119) to report the pattern, ask for call-source analysis and, if the queue stays above threshold, for overflow routing to Tamarack County Communications (OPS-DR-2).
- **Staff:** the supervisor opens Position 12 and moves the Position 7 police dispatcher to call taking only if police radio traffic allows.

### T-3 Preserve and report

The QA Coordinator exports call detail records and recordings for the TDoS period from REC-01. The Technical Lead emails the provider's ticket number to County security. County security reports to the FBI and CISA (Section 9).

## SECTION 6: PLAYBOOK C — CAD OR COUNTY NETWORK COMPROMISE

### C-1 Signs

Endpoint detection alerts from the county's managed SOC on a CAD workstation or server; CAD slow or refusing incidents; unexpected changes to unit status, run cards or addresses; a ransom note on any county machine.

### C-2 Decide (decision record CYB-DR-1)

The Technical Lead, County security and the Director decide together, within 15 minutes, whether to:

| Option | Gain | Cost |
|---|---|---|
| Keep CAD up and watch | Floor keeps CAD; no back-entry later | Compromise may spread; CAD data may be wrong |
| Firewall the CAD segment from the county network (pull the uplink on CAD-FW01) | Protects CAD from the county network | New log-ins fail; mobile data, RMS interface and email stop; recorder buffers locally |
| Shut down CAD | Stops any attacker action in CAD | Manual operations (cards) for the whole floor |

Whatever is chosen, the floor goes to cards (RCECD-OPS-2026 Section 7) if anyone sees CAD data they cannot trust.

### C-3 Data that must not be trusted until checked

Unit status, unit recommendations (run cards), premise hazard notes, address points, and any incident changed during the suspected compromise window. Dispatchers confirm unit availability by radio.

## SECTION 7: PLAYBOOK R — RECORDER AND EVIDENCE

Recordings of 911 calls, radio and text sessions are evidence. The QA Coordinator exports the recordings of any TDoS, swatting or cyber period to write-once media, logs the hash values and the chain of custody on form RCECD-F-21, and gives copies only to the requesting law-enforcement agency. Public records requests for the audio go to the County Attorney.

## SECTION 8: RESTORATION AND TRUST CHECKS

CAD returns to use only when:

1. County security confirms the CAD segment and servers are clean (or rebuilt from known-good images).
2. The CAD Administrator compares the unit roster, run cards for the 20 highest-volume response areas and the premise hazard file against the January 2026 baseline export, and signs form RCECD-F-24.
3. Five test incidents are created and closed at Position 11.
4. The supervisor announces "CAD back in service"; cards are back-entered by the overflow position within 24 hours.

## SECTION 9: REPORTING

| Who | When | By whom |
|---|---|---|
| County IT and the managed SOC (Hoosier Shield Managed Security) | Immediately | Supervisor or Technical Lead |
| State ESInet network operations center | Any 911 delivery problem or TDoS on 911 trunks | Technical Lead |
| Indiana Statewide 911 Board staff | Rerouting of all 911 calls; outage longer than 30 minutes | Director |
| Indiana State Police (CJIS Systems Agency) | Any incident that may affect criminal justice information, per CJIS Security Policy incident response requirements | TAC (Annex B) |
| FBI Indianapolis Field Office | TDoS, swatting pattern, extortion | County Information Security Officer / Law Enforcement Liaison |
| CISA (report.cisa.gov; Region 5 cybersecurity advisor) | TDoS or compromise | County Information Security Officer |
| MS-ISAC | Indicators and help | County Information Security Officer |
| Indiana Office of Technology / state cyber hub | Per state reporting requirement for political subdivisions | County Information Security Officer |
| Rook County Emergency Management and the EOC | Level 2 or 1 | Director |

## ANNEX A: VENDOR AND PARTNER CONTACTS

| Organization | Product / role | Number |
|---|---|---|
| Northwind Telecom | CallPoint i3 call-handling support (24/7) | 555-0131 |
| Keystone Public Safety | RespondCAD support (24/7 priority) | 555-0133 |
| EchoVault | Recorder support | 555-0135 |
| GateKeeper Voice Security | 10-digit call-screening appliance | 555-0137 |
| Hoosier Shield Managed Security | County SOC (24/7) | 555-0139 |
| State ESInet NOC | 911 call delivery | 555-0119 |

## ANNEX B: CJIS SECURITY INCIDENT REPORTING

The TAC completes the security incident response form from the CJIS Security Policy appendix and sends it to the Indiana State Police information security officer through the IDACS channel or by the phone number in the supervisor binder. The report states the date and time, the systems and terminals involved, whether criminal justice information may have been accessed, and actions taken. Copies stay with the TAC.
