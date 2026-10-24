# Teague Valley Chemical Company, Corbin Falls Works — Process Control and Cybersecurity Plan (OT Incident Response Playbook)

Document Control Number: TVCC-CFW-OTSEC-2026 · Revision 2.0 · Effective Date: 02/01/2026 · Owner: Victor Anand (Process Control and OT Engineer) · Approved: Graham Pruitt (Plant Manager), Lena Fischer (Corporate IT Security Director) · Annex to TVCC-CFW-ERP-2026, Section 11

> **EXERCISE MATERIAL — for training use.** Teague Valley Chemical Company, the Corbin Falls Works, its people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 05/01/2023 — All — First issue after the TRITON awareness briefing · 1.1 — 11/15/2024 — Sections 4, 6 — Remote-access approval log; ransomware playbook · 2.0 — 02/01/2026 — All — Reissued with the 2025 ChemLock-based security assessment findings; SIS integrity playbook (Play 2); notification matrix

## Table of Contents

Section 1 Purpose and Scope · Section 2 Principles · Section 3 Roles · Section 4 Remote Access · Section 5 Detection and Triage · Section 6 Playbooks · Section 7 Isolation Levels · Section 8 Evidence · Section 9 Reporting and Outside Help · Section 10 Restoration and Validation · Section 11 Training and Exercises · Annex A Remote-Access Log Format · Annex B Contact List

## SECTION 1: PURPOSE AND SCOPE

This plan covers cyber incidents that could affect the safe operation of the Works: the Emerson DeltaV DCS, the Triconex SIS, the historian, the railcar scales, fixed gas detection and the siren panel (the operational technology, OT), and business-network incidents (ransomware, email compromise) that could affect shipping papers, SDS access or the plant's ability to notify neighbors. Systems and addresses are in TVCC-CFW-FPD-2026, Section 6.

Security of chemicals of interest against theft and diversion follows the voluntary ChemLock-based Site Security Plan (TVCC-CFW-SSP-2025). The Chemical Facility Anti-Terrorism Standards (CFATS) program lapsed on 28 July 2023; the Works still uses the CFATS Risk-Based Performance Standard 8 (cyber) as its checklist because it remains the clearest description.

## SECTION 2: PRINCIPLES

1. **Process safety first.** A cyber incident in a chlorine plant is a process safety event until proven otherwise. The Incident Commander under the ERP is in charge; the OT Engineer advises.
2. **Field over screen.** When an HMI value and a field observation disagree, the field observation wins; operators confirm valve positions and levels locally.
3. **The SIS is the last line.** No SIS bypass, reset or logic change while the cause of an unexplained trip or failure to trip is unknown. The Triconex key switch stays in RUN; finding it in PROGRAM or REMOTE is itself an incident.
4. **Disconnect early.** Disabling vendor remote access and opening the link between the OT DMZ and the business network costs little; do it on suspicion.
5. **Preserve before rebuild.** Engineering workstations, the jump host and the firewalls are evidence.

## SECTION 3: ROLES

| Role | Person | Alternate | Responsibilities |
|---|---|---|---|
| OT Incident Lead | Victor Anand, Process Control and OT Engineer | Megan Sorrell, Instrument and Electrical Lead | Triage of control-system anomalies; isolation; SIS integrity checks; liaison with Ridgeline Automation, Emerson and Schneider Electric support |
| IT Incident Lead | Kyle Brandt, Site IT Lead | Lena Fischer, Corporate IT Security Director | Business network, email, SAP, endpoint detection, the corporate SOC |
| Operations | Shift Supervisor on duty; Lorna Pike, Operations Superintendent | — | Manual operation, safe park, cell-room trip decision (ERP 6.3) |
| Security | Bryce Holloway, Facility Security Officer | — | Physical access review, FBI liaison, evidence custody |
| Compliance | Renee Castillo, EHS Manager | — | Release reporting if a release results; record of regulator contacts |
| Communications | Janelle Brooks, Community Relations Manager | — | Statements; no technical detail without the Incident Commander |
| Legal | Diane Okafor, Corporate Legal Counsel | — | Ransom questions, insurer, law-enforcement requests |

## SECTION 4: REMOTE ACCESS

- Ridgeline Automation (integrator for the DeltaV DCS and the Triconex SIS, Pittsburgh) is the only vendor with remote access. Emerson and Schneider Electric support work through Ridgeline or on site.
- Path: corporate vendor VPN (MFA) → jump host TVC-JMP-01 in the OT DMZ → remote desktop to EWS-01 (DCS) or TS-EWS-01 (SIS).
- Every session needs an entry in the remote-access log (Annex A) approved by the OT Engineer **before** it starts: requester, purpose, target host, MOC number for any change, start and end time.
- Known gaps (FPD 6.3): standing firewall rule to TS-EWS-01 (F-1); shared `rl-support` account (F-3). Until they are closed, the CCR checks TVC-JMP-01's active sessions at each shift change.
- The OT Engineer or the Incident Commander can disable all vendor access at once: disable the vendor VPN group (corporate IT, 24-hour line) **and** shut down TVC-JMP-01 (CCR rack room, labelled power switch).

## SECTION 5: DETECTION AND TRIAGE

| Sign | Where it shows | First check |
|---|---|---|
| A setpoint, mode or valve command nobody on shift made | DeltaV event journal on OWS-01 to OWS-04 | Who was logged in; was a remote session open on TVC-JMP-01 |
| SIS trip without a process cause, or no trip when the process demanded one | Triconex sequence-of-events (SOE) log on TS-EWS-01; first-out display | Key switch position; controller diagnostics; logic version against the archive |
| Display disagrees with the field (valve shown closed, field sees open) | Outside operator report | Limit switch wiring; SIS output state; DCS Modbus link health |
| New or unexpected logins on TVC-JMP-01, EWS-01, TS-EWS-01 | Windows security logs forwarded to the corporate SIEM | Remote-access log entry exists? |
| Ransom note, encrypted files on the business network | Office PCs, SAP, file shares | Isolate per Play 3; check OT DMZ |
| Historian TVC-PI-01 shows gaps or values that differ from the DCS | PI and DeltaV trends | Network, time sync; tampering |

The board operator reports any of these to the Shift Supervisor, who calls the OT Engineer (24-hour on call). The OT Engineer decides within 30 minutes whether it is a suspected cyber incident and tells the Incident Commander.

## SECTION 6: PLAYBOOKS

### Play 1 — Unexplained DCS change

1. Operations puts the affected loop in MANUAL and confirms the field state.
2. Disable vendor remote access (Section 4).
3. Export the DeltaV event journal and the user-login history; photograph the screens.
4. Compare the current control strategy with the last approved backup.
5. Call Ridgeline Automation support to confirm whether anyone from Ridgeline was connected.

### Play 2 — SIS integrity (trip without cause, failure to trip, key switch not in RUN)

1. **Do not reset, bypass or download.** Put the affected unit in a safe state by field action: close the hand valves (HV-311 to HV-314 at the rail spots, tank outlet hand valves in the Chlorine Storage Building), stop transfers, consider the cell-room trip (ERP 6.3).
2. Check the Triconex key switch on TRI-1; if it is not in RUN, record the position with a photograph, leave it, and treat the event as a suspected attack.
3. Disconnect TS-EWS-01 from the network (pull the cable, do not power it off) and isolate the SIS segment at FW-SIS.
4. Export the SOE log and the controller diagnostics from TRI-1 with a clean laptop from the OT Engineer's kit.
5. Compare the running logic with the archived logic file (offline USB archive, FPD 6.3 F-4) with Schneider Electric support.
6. Until the logic is validated, every SIS-protected operation is stopped or run under continuous field watch with the hand valves manned.

This play exists because of the 2017 attack on a petrochemical plant's safety controllers (publicly known as TRITON or TRISIS), in which the attackers reached the SIS engineering workstation and the controllers tripped the plant when their changes failed.

### Play 3 — Ransomware on the business network

1. Corporate IT isolates the affected hosts; the OT Engineer opens (disconnects) FW-OT2 between the OT DMZ and the business network.
2. The plant keeps running on the DCS if the OT network is clean; shipping stops if SAP and the shipping-paper printer are down. **No chlorine railcar or truck leaves without proper shipping papers**; the paper fallback (pre-printed bills of lading in the shipping office safe, typed by hand) is approved by the Logistics Manager.
3. SDS: use the CCR paper binder.
4. Community notification does not depend on the business network: the siren panel is in the CCR; CAER-Text is sent by the Teague County OEM; the PIO laptop works on a cellular hotspot.
5. No contact with the extortionists without Legal.

### Play 4 — Release with a possible cyber cause

When a chlorine release coincides with an unexplained control-system state (for example ESD-310 shown closed while the field sees the release continuing):

1. Treat the release under the ERP first: hand valves, ERT entry, sirens, notifications.
2. Run Play 2 in parallel; the OT Engineer joins the Incident Commander in the CCR.
3. The FSO tells the FBI; the OT Engineer reports to CISA; the EHS Manager's NRC report states the release facts only (cause "under investigation").
4. No unit restarts until Section 10 is complete.

## SECTION 7: ISOLATION LEVELS

| Level | Action | Effect | Authority |
|---|---|---|---|
| 1 | Disable vendor VPN group and shut down TVC-JMP-01 | No remote support | OT Engineer |
| 2 | Open FW-OT2 (OT DMZ from business network) | Historian data not visible to the business; no remote patching | OT Engineer |
| 3 | Open FW-OT1 (control network from OT DMZ) | DCS runs as an island; no historian collection | OT Engineer with the Incident Commander |
| 4 | Isolate the SIS segment at FW-SIS; disconnect TS-EWS-01 | SIS runs alone; no SOE collection over the network | OT Engineer with the Incident Commander |
| 5 | Safe park / shutdown of the affected unit | Production loss; cell room trip if Unit 300 cannot take chlorine | Operations Section Chief with the Incident Commander |

## SECTION 8: EVIDENCE

Photograph screens and the Triconex key switch; export logs before any change; keep the jump host, EWS-01 and TS-EWS-01 powered and disconnected; record who touched what on Form OT-3 (chain of custody); the FSO keeps the evidence locker key. The corporate incident-response retainer (Mandiant) can be engaged through Corporate IT Security.

## SECTION 9: REPORTING AND OUTSIDE HELP

| Who | When | Who calls |
|---|---|---|
| CISA (24/7 central, report@cisa.gov) | Any suspected cyber incident affecting the OT network or safety | OT Engineer |
| FBI field office (cyber squad) | Suspected deliberate attack, extortion | FSO |
| Corporate SOC and Corporate IT Security | Any incident | IT Incident Lead |
| Ridgeline Automation, Emerson, Schneider Electric | Technical support, logic comparison | OT Engineer |
| Cyber insurer | Within 24 hours of a confirmed incident | Legal |
| NRC, SERC, LEPC, OSHA | If a release or injury results (ERP Section 5) | EHS Manager |

There is no sector-specific cyber incident reporting mandate for chemical facilities today; the Works reports to CISA voluntarily and as Corporate policy requires.

## SECTION 10: RESTORATION AND VALIDATION

1. Rebuild compromised workstations from known-good images; change all passwords and the `rl-support` account.
2. Download the SIS logic from the archived, approved file; the OT Engineer and Schneider Electric support compare checksums and test every affected SIF (proof test) before the unit restarts.
3. Pre-startup safety review (PSSR) under PSM for any change; MOC for any temporary measure.
4. Restore vendor access only by per-session firewall rules (F-1 closed) and individual accounts (F-3 closed).
5. Plant Manager approval and notice to Teague County OEM before restart (ERP Section 14).

## SECTION 11: TRAINING AND EXERCISES

Board operators are trained on Plays 1 and 2 every year. A cyber inject is included in the 2026 RMP tabletop exercise (ERP Section 13) so that the notification and community-protection steps are exercised with a control-system cause.

## ANNEX A: REMOTE-ACCESS LOG FORMAT

| Field | Example |
|---|---|
| Session no. | RA-26-0112 |
| Requester / company | J. Talbot, Ridgeline Automation |
| Account | rl-support |
| Target host | TS-EWS-01 |
| Purpose | Review SOE log after the 01/12 nuisance trip of SIF-302 |
| MOC no. | n/a (read only) |
| Approved by / time | V. Anand, 01/14/2026 09:05 |
| Start / end | 09:10 / 09:55 |

## ANNEX B: CONTACT LIST (simulated numbers)

| Contact | Number |
|---|---|
| OT Engineer Victor Anand (24-hour on call) | 304-555-0145 |
| Instrument and Electrical Lead Megan Sorrell | 304-555-0148 |
| Site IT Lead Kyle Brandt | 304-555-0149 |
| Corporate IT 24-hour line | 412-555-0150 |
| Corporate IT Security Director Lena Fischer | 412-555-0151 |
| Ridgeline Automation 24-hour support | 412-555-0173 |
| FSO Bryce Holloway | 304-555-0146 |
| Legal Diane Okafor | 412-555-0152 |
