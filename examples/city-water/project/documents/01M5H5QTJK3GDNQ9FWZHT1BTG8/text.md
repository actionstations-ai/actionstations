# City of Millbrook Department of Water & Sewer — OT / Cybersecurity Plan and Incident Response Playbook

Document Control Number: MDWS-OTSEC-2026 · Revision 1.3 · Effective Date: 03/01/2026 · Classification: DWS RESTRICTED — Protected Critical Infrastructure Information *(fictional marking)* Approved: Priya Nandakumar (SCADA / IT Security Manager) · Kevin Marsh (City IT Director) · Denise Albrecht (Director of Water Operations)

> **EXERCISE MATERIAL — for training use.** The City of Millbrook, its people, vendors, telephone numbers, hostnames, addresses and identifiers are simulated.

**Record of Revisions:** 1.0 — 09/15/2023 — All — First edition after the 2023 cybersecurity assessment · 1.1 — 04/01/2024 — Sections 4, 6 — Jump host MBW-JUMP-01 in service; vendor access windows · 1.2 — 06/30/2025 — Sections 3, 14 — 2025 OT assessment findings F-1 to F-6 · 1.3 — 03/01/2026 — Sections 8, 10 — Manual-operations matrix; CODE CLEARWATER playbook; Appendix A re-issued as MDWS-SCADA-APP-A Rev 3.0

## Table of Contents

Section 1 Purpose and Scope · Section 2 Governance and Roles · Section 3 Asset Inventory · Section 4 Network Architecture and Segmentation · Section 5 Identity and Access · Section 6 Remote Access · Section 7 Control-System Safeguards · Section 8 Manual Operations and Loss of SCADA · Section 9 Backups and Recovery · Section 10 Incident Response Playbook — CODE CLEARWATER · Section 11 Telemetry and Remote Sites · Section 12 Reporting and External Assistance · Section 13 Monitoring and Detection · Section 14 Training, Exercises and Assessment Findings · Annex A Contacts · Annex B Quick Reference

## SECTION 1: PURPOSE AND SCOPE

### 1.1 Purpose

This plan states how the Department of Water & Sewer (DWS) protects the control system that treats and moves Millbrook's drinking water, and what staff do when that system is attacked, fails, or cannot be trusted. It is the cybersecurity element of the Emergency Response Plan (MDWS-ERP-2026, Sections 7.5 and 11) required of community water systems serving more than 3,300 people, and it records the resilience improvements the 2025 Risk and Resilience Assessment (MDWS-RRA-2025) called for.

### 1.2 Basis

The plan follows the federal water-sector guidance in spirit rather than by quotation: reduce what is reachable from the internet, know every asset, replace default and shared credentials, segment IT from OT, keep tested backups, patch what can be patched and compensate for what cannot, train operators to recognise an attack, and rehearse the response. Where this plan says less than that guidance, Section 14 records the gap and the plan to close it.

### 1.3 Scope

In scope: the Riverside Water Treatment Plant (RWTP) control network, the plant PLCs (PLC-01 to PLC-06), the remote RTUs (RTU-01 to RTU-07), the telemetry radio and cellular links, the SCADA DMZ, the firewall MBW-FW-01, and the business systems that touch water operations — billing (MBW-CIS-01), AMI (MBW-AMI-01), LIMS (MBW-LIMS-01), GIS (MBW-GIS-01), the file server (MBW-FS-01), backups (MBW-BKP-01) and the security systems (MBW-PACS-01, MBW-NVR-01). Wastewater collection telemetry is covered by a separate annex (not part of this exercise set).

### 1.4 Planning Assumptions

The most consequential cyber event is an unauthorized change to chemical feed or high-service pumping that reaches customers before an operator notices; the second is loss of the SCADA servers or the business network for days, forcing manual plant operation and manual billing and customer service at the same time. Night and weekend staffing at RWTP is a single operator; remote sites are unstaffed.

## SECTION 2: GOVERNANCE AND ROLES

| Role | Name | Cyber Duties |
|---|---|---|
| SCADA / IT Security Manager | Priya Nandakumar | Owns this plan; firewall rule owner for MBW-FW-01; approves vendor remote-access windows; cyber incident lead; CISA/FBI/WaterISAC liaison |
| City IT Director | Kevin Marsh | Business network, Active Directory, email tenant, MBW-BKP-01, the city's SIEM; ransomware response on the business side; cyber-insurance notification |
| Plant Superintendent, RWTP | Ray Castellano | Decides manual control of the plant; owns the setpoint-change procedure; signs off return to automatic |
| Distribution Superintendent | Tom Okonkwo | Remote sites, telemetry, field verification of tank levels and pump status |
| Water Quality Manager | Marcus Oyelaran | Decides sampling and public-notice triggers after any control-system event (ERP Section 9) |
| Security & Emergency Manager | Luis Ferreira | PACS, CCTV, physical response, evidence custody, Carver County EMA liaison |
| Director of Water Operations | Denise Albrecht | Incident Commander; declares incident level (ERP Section 4); approves islanding the control network when Section 10.3 is invoked |
| Kessler Controls | Integrator (Jared Molina, Sam Whitfield) | AquaSight platform support under a ticketed window only (Section 6.2) |

RACI for the recurring tasks: firewall rule changes (R Nandakumar, A Albrecht, C Marsh, I Castellano); PLC logic changes (R Kessler Controls, A Castellano, C Nandakumar); account reviews (R Nandakumar quarterly, A Marsh); backup restore tests (R Marsh, A Nandakumar, I Castellano).

## SECTION 3: ASSET INVENTORY

The authoritative inventory is MDWS-SCADA-APP-A, Sections A.2 and A.3. Summary by zone:

| Zone | Assets | Owner |
|---|---|---|
| Control network 10.72.10.0/24 | MBW-SCADA-SRV01, MBW-SCADA-SRV02, MBW-HMI-01, MBW-HMI-02, MBW-HMI-03, MBW-EWS-01 | Nandakumar |
| Plant PLC network 10.72.20.0/24 | PLC-01 (intake), PLC-02 (chemical feed), PLC-03 (Filters 1–3), PLC-04 (Filters 4–6, backwash), PLC-05 (clearwells, High Service Pump Station), PLC-06 (plant utilities) | Castellano |
| Remote RTU network 10.72.30.0/24 | RTU-01 Hilltop Tank, RTU-02 Orchard Standpipe, RTU-03 Northgate Reservoir / Northgate Booster Station, RTU-04 Mill Road Booster Station, RTU-05 Eastfield Pump Station, RTU-06 Orchard Wellfield, RTU-07 Intake Structure 1 | Okonkwo |
| SCADA DMZ 10.72.250.0/24 | MBW-HIST-01 (historian), MBW-JUMP-01 (jump host) | Nandakumar |
| Business LAN 10.73.0.0/16 | MBW-CIS-01, MBW-AMI-01, MBW-LIMS-01, MBW-GIS-01, MBW-FS-01, MBW-BKP-01, MBW-DC-01, MBW-DC-02; security VLAN MBW-PACS-01, MBW-NVR-01, CAM-01 to CAM-18 | Marsh / Ferreira |

**Crown jewels** (loss or misuse has a public-health or city-wide consequence): PLC-02, PLC-05, MBW-SCADA-SRV01, RTU-01, MBW-AMI-01, MBW-CIS-01. Each has a named owner, an offline configuration copy (Section 9) and a manual fallback (Section 8).

## SECTION 4: NETWORK ARCHITECTURE AND SEGMENTATION

### 4.1 Zones

MBW-FW-01 separates four zones: the business LAN (10.73.0.0/16), the SCADA DMZ (10.72.250.0/24), the control network (10.72.10.0/24) and the field networks (10.72.20.0/24 plant PLCs, 10.72.30.0/24 remote RTUs). Field networks reach the control network only through the SCADA servers' polling interfaces. There is no direct internet route from 10.72.x.x except as listed in the rule table.

### 4.2 Firewall Rule Table (MBW-FW-01, excerpt)

| Rule | From | To | Service | Purpose | Owner / Note |
|---|---|---|---|---|---|
| FW-R-05 | Business LAN | MBW-HIST-01 | HTTPS | Read-only historian dashboards for management and the lab | Nandakumar |
| FW-R-09 | Business LAN (named IT and SCADA admins) | MBW-JUMP-01 | RDP with MFA | Only approved path into the control network | Nandakumar |
| FW-R-11 | MBW-JUMP-01 | MBW-EWS-01, MBW-SCADA-SRV01, MBW-SCADA-SRV02 | RDP | Vendor and engineering sessions, recorded | Nandakumar |
| FW-R-14 | Control network | MBW-DC-01, MBW-DC-02 | AD trust ports | SCADA domain MBWSCADA trusts MILLBROOK (Section 5.3) | Marsh |
| FW-R-15 | Control network | MILLBROOK patch server | HTTPS | Monthly patch pull | Marsh |
| **FW-R-17** | MBW-EWS-01 | MBW-BKP-01 | SMB | Nightly copy of HMI application, PLC programs and historian exports to the business-side backup server | Marsh; **SCADA-to-business SMB, flagged F-5** |
| **FW-R-22** | MBW-HMI-02 | Internet (DosaTech relay service) | HTTPS outbound | ScreenBridge remote-support agent for DosaTech metering-pump VFD diagnostics (Section 6.4) | Added 11/2024 at commissioning; **open finding F-3** |
| FW-R-30 | Remote RTU network | MBW-SCADA-SRV01/02 | Poll protocol | RTU polling via radio gateway | Nandakumar |
| FW-R-31 | RTU-05 cellular modem | MBW-SCADA-SRV01/02 | Poll protocol over carrier VPN | Eastfield Pump Station, cellular only | Buckeye Telemetry manages the carrier VPN |

### 4.3 Known Segmentation Weaknesses

- FW-R-17 and FW-R-14 together give a compromised business-side administrator account a path to MBW-EWS-01 and the SCADA servers without passing through MBW-JUMP-01.
- FW-R-22 is an outbound connection that terminates on a vendor relay the city does not control; sessions arriving through it are not recorded by DWS.
- The RTU-05 modem exposes a vendor web configuration page on the carrier side (Section 11.3).

## SECTION 5: IDENTITY AND ACCESS

### 5.1 Accounts

Individual named accounts are required on MBW-SCADA-SRV01/02, MBW-EWS-01 and MBW-JUMP-01. Operator HMIs use **shared shift accounts OPS_SHIFT_A, OPS_SHIFT_B and OPS_SHIFT_C**, one per crew, because AquaSight ties screen permissions to the account and the plant has three crews; the audit log therefore records the crew and the HMI node, not the person. The paper Control Room log is the record of who was on the console.

### 5.2 Multi-Factor Authentication

MFA (hardware token or authenticator app) is enforced on MBW-JUMP-01, on all MILLBROOK domain-admin accounts and on the email tenant. MFA is not possible on the HMIs or on the RTU-05 modem page.

### 5.3 Active Directory Trust

The control network runs its own domain, MBWSCADA. A **one-way trust (MBWSCADA trusts MILLBROOK)** lets City IT domain administrators log on to MBW-SCADA-SRV01, MBW-SCADA-SRV02 and MBW-EWS-01 for patching and backup jobs. The trust means a MILLBROOK domain-admin credential stolen on the business side is a valid credential on the SCADA servers. Breaking the trust is step 3 of Section 10.3 and is reversible from MBW-DC-01 once the business network is clean.

### 5.4 Supervisor PIN on the HMIs

Setpoint changes outside the normal band (Section 7.1) require a supervisor PIN entered on the HMI faceplate. The PIN is a four-digit code **identical on MBW-HMI-01, MBW-HMI-02 and MBW-HMI-03** and is known to every operator on every crew, because the single night operator must be able to make the change without a supervisor present. Changing the PIN requires Kessler Controls (it is compiled into the HMI application).

### 5.5 Reviews and Separations

Quarterly account review by the SCADA / IT Security Manager of all accounts on the control network, MBW-JUMP-01 and the RTU-05 modem; same-day disable of control-network and jump-host accounts on separation; vendor accounts disabled after each window (Section 6.2). The 2025 review found the account `kessler_jmolina` enabled for 11 days after its window closed (finding F-4).

## SECTION 6: REMOTE ACCESS

### 6.1 Policy

No person or vendor has standing remote access to the control network. All interactive remote access is through MBW-JUMP-01 under FW-R-09 and FW-R-11, with MFA, a named account, a ticket and a session recording. Staff do not use personal devices or consumer remote-desktop tools on any DWS system. Read-only historian dashboards on MBW-HIST-01 (FW-R-05) are the only data path offered to the business side; the historian cannot write to the control network.

### 6.2 Kessler Controls Window Procedure

1. Kessler Controls opens a support ticket naming the technician (Jared Molina or Sam Whitfield), the systems to be touched and the work.
2. The SCADA / IT Security Manager approves a window (date, start, end, scope) and enables the named account on MBW-JUMP-01.
3. The technician connects with MFA; the session is recorded on MBW-JUMP-01; an RWTP operator watches MBW-HMI-01 for the duration of any PLC or HMI change.
4. PLC logic changes follow the change-management steps in Section 7.4 and the return-to-automatic checklist in Section 8.4.
5. At the end of the window the SCADA / IT Security Manager **manually** disables the account and records the ticket number, start and end in the remote-access log. The account has no automatic expiry (finding F-4).

### 6.3 After-Hours Support

After hours, Kessler Controls can be reached on the escalation line (Annex A), but the window can only be opened by Priya Nandakumar. **There is no alternate approver with administrator rights on MBW-JUMP-01.** If she cannot be reached, the plant runs manually (Section 8) until she is.

### 6.4 ScreenBridge Exception (DosaTech)

During the 11/2024 commissioning of the replacement chemical metering pumps and VFDs, DosaTech Metering Systems installed its **ScreenBridge** remote-support agent on **MBW-HMI-02** in the Chemical Building so its engineers could read VFD diagnostics without a site visit. The agent connects outbound to the DosaTech relay under FW-R-22 and presents the full HMI desktop to whoever authenticates at the relay. It uses the shared account **`dosatech_svc`**, which has operator rights on the Chemical Feed screens. The account password appears in the DosaTech commissioning report filed at \\MBW-FS-01\Engineering\Commissioning\DosaTech-2024. The 2025 OT assessment recorded this as **finding F-3: remove the agent or route the vendor through MBW-JUMP-01**; it remains open because the pump warranty terms reference the agent. Sessions through ScreenBridge are not recorded by DWS and do not appear in the MBW-JUMP-01 log; the only trace is the HMI audit log (which shows account `dosatech_svc` on node MBW-HMI-02) and the firewall's connection log for FW-R-22.

## SECTION 7: CONTROL-SYSTEM SAFEGUARDS

### 7.1 Setpoint Limits (chemical feed and pumping)

| Tag | Function | Normal band | HMI alarm | PLC hard limit | Change requires |
|---|---|---|---|---|---|
| CL2-FC-201 | Pre-chlorination dose | 1.0–3.0 mg/L | High 4.0 | 6.0 mg/L | Operator |
| CL2-FC-202 | Post-chlorination dose | 1.5–3.5 mg/L | High 5.0 / Low 1.0 | 6.0 mg/L | Operator; above 4.0 supervisor PIN |
| **NAOH-FC-203** | Caustic (sodium hydroxide) dose for pH adjustment | **8–14 mg/L** | pH AIT-302 high 8.5 / low 6.8 | **40 mg/L** (PLC-02 clamp) | Operator; **above 20 mg/L supervisor PIN** |
| F-FC-204 | Fluoride dose | 0.6–0.8 mg/L | AIT-303 high 1.2 | 2.0 mg/L | Supervisor PIN |
| ALUM-FC-205 | Coagulant dose | 15–30 mg/L | High 45 | 60 mg/L | Operator |
| HSP-1/2/3 speed | High-service pump speed | 60–95 % | PIT-501 high 95 psi / low 55 psi | 100 % | Operator |
| BP-301/302/303 speed | Northgate Booster Station | 55–90 % | PIT-622 low 40 psi | 100 % | Operator |

Independent of SCADA, a hard-wired high-high pH switch **PSH-302** at pH 9.5 trips the NAOH-FC-203 metering pump contactor and sounds a local horn in the Chemical Building; it does not depend on PLC-02 or any HMI. There is no equivalent independent stop for a *low* caustic dose (finished pH drifting acidic) or for chlorine overfeed; those rely on HMI alarms and the 2-hour grab samples.

### 7.2 Interlocks

PLC-02 stops all chemical feed when plant flow FIT-501 is below 500 gpm; PLC-05 blocks HSP start when Clearwell 1 level LIT-401 is below 4.0 ft; PLC-05 stops HSP-1/2/3 at PIT-501 above 110 psi. Interlocks live in the PLCs and cannot be changed from an HMI; they can be changed from MBW-EWS-01.

### 7.3 Alarm Philosophy

See MDWS-SCADA-APP-A, Section A.5. Priority 1 alarms call the duty operator's phone through the AlarmCall autodialer; priorities 2–4 display only. A setpoint change itself raises no alarm; it is written to the audit log (Section A.9).

### 7.4 Change Management

Every PLC logic, HMI application or setpoint-limit change needs a change record (Form OT-2) approved by the Plant Superintendent, a pre-change backup of the affected program (Section 9), an operator witnessing the change, and a post-change comparison of HMI values against local instruments. Emergency changes may be made first and recorded within 24 hours.

## SECTION 8: MANUAL OPERATIONS AND LOSS OF SCADA

### 8.1 Capability

RWTP can run in manual for **72 hours** with **two operators per shift** (normal staffing is one). DG-1 carries the plant with 72 hours of fuel. In manual: chemical metering pumps run on local HOA switches with stroke and speed dials set from the dose tables in the O&M binder; HSP-1/2/3 run in HAND from the motor control centre; filters are backwashed on headloss read at the local gauges; chlorine residual, pH and turbidity are grab-sampled **every 2 hours** and recorded on Form OPS-9.

### 8.2 Remote Sites in Manual

Hilltop Tank level is read from the sight gauge, Northgate Reservoir from the float board, Orchard Standpipe from the level gauge at the base; distribution crews phone readings to the Control Room **every 2 hours** and keep a route log. Northgate Booster Station falls back to local pressure-switch auto on PIT-622; Mill Road Booster Station and Eastfield Pump Station run in local HAND as directed. Wells W-1 to W-3 are started locally at the wellfield.

### 8.3 Failure-Mode Matrix

| Failure | What Still Works | What Is Lost | Required Action |
|---|---|---|---|
| MBW-SCADA-SRV01 and SRV02 down | PLCs hold last setpoints; local HOA; PSH-302 | All remote control; HMI displays; AlarmCall callouts; historian | Two operators per shift; manual mode per 8.1; Level 2 (ERP 4) if longer than 30 minutes |
| HMI values not trusted (CODE CLEARWATER) | Local instruments; grab samples; PSH-302 | Confidence in any displayed value | Compare HMI to local gauges; Plant Superintendent decides manual; Section 10 |
| PLC-02 fault or suspected tampering | Metering pumps in HAND; PSH-302 | Flow-paced dosing; chemical interlocks | Manual dosing from dose tables; grab samples every hour until stable |
| PLC-05 fault | HSP in HAND; mechanical pressure gauges | Clearwell level interlock; pressure control | Operator stationed at the High Service Pump Station |
| Hilltop repeater RP-1 down | RTU-01 (cellular backup); RTU-05 (cellular); plant | Telemetry from RTU-02, RTU-03, RTU-04, RTU-06 — HMI shows last values with stale flag | Field readings every 2 hours (8.2); Section 11.2 |
| Business network down (ransomware) | Control network if islanded in time (10.3); plant in auto | CIS, AMI reads, LIMS, GIS, email, MBW-BKP-01, PACS administration | Section 10.5; manual billing and customer-service workarounds |
| Loss of utility power | DG-1 for the plant; UPS 4 h for SCADA | Remote booster sites without generators (Mill Road, Eastfield) | Portable generators per ERP 7.2 |

### 8.4 Return to Automatic

Before any PLC or HMI returns to service after an incident: confirm the program matches the last known-good backup (Section 9), confirm setpoints against Section 7.1, run 24 hours with hourly grab samples matching HMI values within analyzer tolerance, and obtain the Plant Superintendent's signature on Form OT-3.

## SECTION 9: BACKUPS AND RECOVERY

- Nightly: MBW-EWS-01 copies the HMI application, PLC programs and historian exports to **MBW-BKP-01** on the business LAN under **FW-R-17**. MBW-BKP-01 also holds the CIS, AMI, GIS and LIMS backups — one server holds every recovery copy the city has.
- Monthly: MBW-BKP-01 is written to tape; tapes go to the City Hall vault. Offline, but one copy and up to 30 days old.
- Last verified restore test: 11/2025 — rebuilding the HMI application on a spare workstation took **6 hours**; the SCADA server rebuild was not tested.
- **Known gap (finding F-2):** the PLC-02 program copy on MBW-BKP-01 is from 03/2025; the chemical-feed logic change made in 08/2025 (flow-pacing revision) was never backed up. The only current copy of that logic is in PLC-02 itself and on Jared Molina's laptop.
- Kessler Controls keeps project files for its customers, but its contract gives no recovery-time commitment.

## SECTION 10: INCIDENT RESPONSE PLAYBOOK — CODE CLEARWATER

### 10.1 Code Word

"**CODE CLEARWATER**" announced on radio channel DWS-1 means: suspected cyber attack on, or unauthorized operation of, the control system. On hearing it, every operator stops non-essential work, compares the HMI values for their area against local instruments and the last grab sample, and reports the comparison to the Control Room. The Plant Superintendent (or the duty operator if the Superintendent is unreachable) decides whether the plant goes to manual.

### 10.2 Triage Questions (first 15 minutes)

1. Is any chemical dose or finished-water value outside its normal band? Does the grab sample agree with the analyzer?
2. Did a setpoint change in the audit log that no one on shift made? From which node and account?
3. Is any remote session active (MBW-JUMP-01 log; FW-R-22 connection log; AquaSight session list)?
4. Are HMI values changing while local instruments are steady, or steady while the process is changing?
5. Is the business network also affected (City IT ticket queue, email, CIS)?

### 10.3 Island the Control Network

Approved by the Director (or the Plant Superintendent if the Director cannot be reached within 15 minutes). Steps, performed by the SCADA / IT Security Manager or City IT on her instruction:

1. Confirm the plant is stable in manual or local auto (Section 8); station an operator at the Chemical Building and one at the High Service Pump Station.
2. Disable **FW-R-17** and **FW-R-22** on MBW-FW-01; disable FW-R-09 except for one named incident-response account.
3. Break the **MBWSCADA → MILLBROOK trust** from MBW-DC-01 (or block FW-R-14 if the domain controllers are themselves suspect).
4. Disconnect the SCADA DMZ uplink; MBW-HIST-01 and MBW-JUMP-01 go dark.
5. Disable every vendor account on MBW-JUMP-01 and the `dosatech_svc` account on MBW-HMI-02; stop the ScreenBridge service.
6. Verify each PLC is on LOCAL at its cabinet selector (PLC-02 and PLC-05 first), and that RTUs still poll.
7. Record each step with time on Form ERP-1; do not power off or reimage any host (Section 10.7).

### 10.4 Suspected Setpoint Tampering Checklist

- [ ] Operator: read the current dose and setpoint for every chemical feed on MBW-HMI-02; compare with the dose table and the last grab sample; note any value above the normal band in Section 7.1
- [ ] Operator: place the affected metering pump in HAND at the local HOA at the dose-table value; confirm PSH-302 is armed
- [ ] Water Quality Manager: grab samples at the Clearwell 1 outlet, the High Service Pump Station discharge and the first distribution tap on River Road; repeat every 30 minutes until three consecutive normal results; calculate the volume of affected water from FIT-501 and the time window
- [ ] SCADA / IT Security Manager: export the audit log for the last 72 hours; identify the node, account and remote session; invoke Section 10.3 if the change came from a remote session or an unknown account
- [ ] Director: decide with the Water Quality Manager and Carver County Public Health whether any affected water left the plant and whether a Do Not Drink notice is required (ERP Section 9)
- [ ] Notify per Section 12

### 10.5 Ransomware on the Business Network Checklist

- [ ] City IT: isolate affected hosts; disable FW-R-17, FW-R-22 and FW-R-14 immediately (do not wait for the full Section 10.3 decision); stop backup jobs so MBW-BKP-01 is not overwritten; pull the MBW-BKP-01 network cable
- [ ] SCADA / IT Security Manager: check MBW-SCADA-SRV01/02 and MBW-EWS-01 for encryption or new services; if clean, confirm the control network is islanded and the plant stays in automatic with an operator watching MBW-HMI-01; if not clean, Section 8 manual operations
- [ ] Customer Service: switch to the paper intake form and the printed critical-customer list; MBW-CIS-01 and the customer portal are assumed unavailable; no disconnections for non-payment until restored
- [ ] Distribution: AMI reads stop when MBW-AMI-01 is down — meters store 45 days of interval data; no action needed for billing within that window
- [ ] Lab: LIMS unavailable — record results on the paper bench sheets; compliance reports to DDAGW are still due on their dates
- [ ] Security & Emergency Manager: MBW-PACS-01 administration is unavailable — door controllers keep granting from cache; post guards at the Chemical Building and the Control Room
- [ ] City IT Director: notify the cyber-insurance carrier within 48 hours; engage the retained incident-response firm through the carrier; do not pay or communicate with the actor without the City Manager and counsel
- [ ] Notify per Section 12; the PIO uses the cyber holding statement (MDWS-PCP-2026, Section 10)

### 10.6 Telemetry Outage / Stale Data Checklist

- [ ] Control Room: list every tag with the stale flag and its last update time; do not acknowledge the stale alarm without recording it
- [ ] Distribution: dispatch to Hilltop Tank first (RP-1 and the sight gauge), then Northgate Reservoir, Orchard Standpipe, Mill Road Booster Station; phone readings every 2 hours
- [ ] SCADA / IT Security Manager: confirm whether the outage is radio (RP-1 power, antenna, Buckeye Telemetry), the radio gateway, or a server; a telemetry outage during an unusual flow or pressure trend is treated as CODE CLEARWATER until explained
- [ ] Plant: hold HSP discharge pressure at the Zone 1 target by PIT-501 at the plant and watch FIT-501 for a main-break signature (ERP Section 6.6)

### 10.7 Evidence Preservation

Do not power off, reimage or "clean" MBW-SCADA-SRV01/02, MBW-HMI-01/02/03 or MBW-EWS-01 unless life safety requires it. Export the AquaSight audit log and historian trends for the window; copy MBW-JUMP-01 session recordings and the MBW-FW-01 logs (FW-R-09, FW-R-17, FW-R-22, FW-R-31); preserve MBW-NVR-01 footage (30-day overwrite) and MBW-PACS-01 controller logs; photograph HMI screens with a phone before any change; keep the paper Control Room log. Chain of custody on **Form SEC-4**, held by the Security & Emergency Manager.

## SECTION 11: TELEMETRY AND REMOTE SITES

### 11.1 Radio Network

Licensed 900 MHz radio from the plant mast to the **Hilltop Tank repeater RP-1**; RTU-02 (Orchard Standpipe), RTU-06 (Orchard Wellfield), RTU-03 (Northgate) and RTU-04 (Mill Road) are reached only through RP-1. RTU-01 at Hilltop Tank has a cellular backup; RTU-05 at Eastfield Pump Station is cellular only. RTU-07 is on fiber. Polling is every 30 seconds; a site missing three polls is flagged stale on the HMI.

### 11.2 Stale Data Behaviour

When a site stops answering, the HMI holds the last value and shows a grey stale flag beside it. The stale alarm is priority 3 and is acknowledged often enough that operators have learned to clear it reflexively; a held tank level can look normal for hours. **RTU-02 cannot be reached by any path without RP-1.**

### 11.3 RTU-05 Cellular Modem

The Buckeye Telemetry modem at Eastfield Pump Station carries a web configuration page reachable from the carrier network. The default password was changed in 2024; the firmware is from 2021 and the vendor has no newer release. The modem is listed as finding F-6.

### 11.4 Site Security Links

PACS and CCTV at the remote sites (CAM-11 to CAM-17) run on the business security VLAN, not the control network; Orchard Standpipe's hatch switch ZS-611 has been out of service since 07/2024 (WO-24-1187) and RTU-02 reports it closed at all times (ERP Section 8).

## SECTION 12: REPORTING AND EXTERNAL ASSISTANCE

| Event | Report to | Clock |
|---|---|---|
| Any confirmed or strongly suspected cyber intrusion on the control network, or unauthorized operation of equipment | CISA (24/7) | Within 24 hours; immediately if chemical feed or pumping was operated without authorization. Note: once the federal critical-infrastructure incident-reporting rule applies to DWS, the clock is 72 hours and ransom payments 24 hours; this plan keeps the shorter 24-hour target |
| Suspected intentional act (contamination, sabotage, extortion) | FBI (cyber task force) | Immediately |
| Any cyber event affecting water quality, pressure or the ability to monitor either | Ohio EPA DDAGW (district engineer; 24-h line after hours) | Within 24 hours; immediately for intentional contamination |
| Any cyber incident | WaterISAC | Within 24 hours (information sharing; not a regulatory report) |
| Ransomware or data breach on the business network | Cyber-insurance carrier; Ohio data-breach notification counsel | Within 48 hours (carrier); per counsel |
| Any event that may need the county EOC | Carver County EMA | On declaration of Level 2 or 3 (ERP Section 4) |
| Platform support, recovery | Kessler Controls (ticket; after hours via escalation line) | As needed; window per Section 6.2 |

External help: CISA's free assessments and incident assistance, the FBI for attribution and evidence, WaterISAC for indicators, OHWARN member utilities for operators who can run a similar plant manually (ERP Section 12), and the incident-response firm retained through the insurance carrier.

## SECTION 13: MONITORING AND DETECTION

- **Business side:** the city's SIEM collects MBW-DC-01/02 authentication logs, MBW-FW-01 logs and endpoint alerts; City IT reviews alerts during business hours and the SIEM pages the on-call IT technician for priority alerts after hours.
- **Control network:** the AquaSight audit log records every login, logout, setpoint change, alarm acknowledgement and mode change with node, account and timestamp (MDWS-SCADA-APP-A, A.9). The SCADA / IT Security Manager reviews it weekly. Nothing pages anyone when a setpoint changes.
- **Not monitored:** RTU serial and radio links; ScreenBridge sessions (only the FW-R-22 connection count is logged); the RTU-05 modem page; PLC program downloads from MBW-EWS-01 (AquaSight logs the session, not the download).
- **Operator detection cues** (trained annually): a cursor moving on an HMI with no one at the console; a faceplate opening on its own; a setpoint that differs from the dose table; HMI values that do not follow the process; analyzers disagreeing with grab samples; a stale flag during an abnormal trend; customer complaints of taste, odour or colour clustered in one zone.

## SECTION 14: TRAINING, EXERCISES AND ASSESSMENT FINDINGS

### 14.1 Training

All operators: annual cyber-awareness session built around the detection cues in Section 13 and the CODE CLEARWATER drill; SCADA / IT staff: vendor platform training and one external ICS security course per year; City IT: ransomware tabletop with DWS annually.

### 14.2 Exercises

A control-system tabletop every year and a manual-operations drill (plant to HAND for four hours on a low-demand day) every two years. The last drill (10/2025) found that the second operator took 55 minutes to arrive and that the dose tables in the O&M binder predated the 08/2025 flow-pacing change.

### 14.3 Open Findings (2025 OT Assessment)

| Finding | Description | Owner | Status |
|---|---|---|---|
| F-1 | Shared HMI shift accounts and a single supervisor PIN across all HMIs (Sections 5.1, 5.4) | Nandakumar / Kessler Controls | Open — needs HMI application rebuild, quoted for FY2027 |
| F-2 | PLC-02 backup outdated; 08/2025 logic not captured (Section 9) | Castellano / Kessler Controls | Open — scheduled with next vendor window |
| **F-3** | **ScreenBridge agent on MBW-HMI-02 outside the jump-host path; shared account `dosatech_svc`; password in the commissioning report on MBW-FS-01** (Section 6.4) | Nandakumar / DosaTech | Open — warranty review with Purchasing |
| F-4 | Vendor jump-host accounts have no automatic expiry; `kessler_jmolina` left enabled 11 days (Sections 5.5, 6.2) | Nandakumar | Open — scripted expiry in test |
| F-5 | FW-R-17 (SCADA-to-business SMB) and the MBWSCADA → MILLBROOK trust give business-side credentials a path to the SCADA servers (Sections 4.3, 5.3) | Marsh / Nandakumar | Open — dedicated OT backup appliance budgeted FY2027 |
| F-6 | RTU-05 cellular modem web page reachable from the carrier network; firmware 2021 (Section 11.3) | Okonkwo / Buckeye Telemetry | Open — replacement modem on order |

## ANNEX A: CONTACTS

| Organization | Contact | Telephone |
|---|---|---|
| RWTP Control Room (24 h) | Duty operator | (555) 031-2244 |
| SCADA / IT Security Manager | Priya Nandakumar | (555) 031-2280 / (555) 034-1144 |
| City IT Director | Kevin Marsh | (555) 031-2300 / (555) 034-1188 |
| Plant Superintendent | Ray Castellano | (555) 031-2240 / (555) 034-1122 |
| Distribution Superintendent | Tom Okonkwo | (555) 031-2260 / (555) 034-1133 |
| Water Quality Manager | Marcus Oyelaran | (555) 031-2230 / (555) 034-1155 |
| Security & Emergency Manager | Luis Ferreira | (555) 031-2290 / (555) 034-1166 |
| Director of Water Operations | Denise Albrecht | (555) 031-2200 / (555) 034-1101 |
| Kessler Controls | Support desk / escalation (after hours) | (555) 039-4400 / (555) 039-4411 |
| DosaTech Metering Systems | Support | (555) 039-5500 |
| Buckeye Telemetry | Radio and modem support | (555) 039-9100 |
| Veridian Meter Systems | AMI support | (555) 039-6600 |
| Pinnacle Utility Billing | Hosted CIS support | (555) 039-7700 |
| CISA | 24/7 operations | (555) 038-8800 |
| FBI | Cleveland-area field office, cyber task force | (555) 038-7100 |
| WaterISAC | Member desk | (555) 038-6000 |
| Ohio EPA DDAGW | Paul Grieve, district engineer / 24-h emergency line | (555) 037-1500 / (555) 037-1555 |
| EPA Region 5 | Water Division | (555) 038-5000 |
| Carver County EMA | Director Sandra Pruitt | (555) 032-4000 |
| Millbrook Police | Dispatch | (555) 032-7000 |

## ANNEX B: QUICK REFERENCE

Code word **CODE CLEARWATER** on DWS-1 (Section 10.1) · Island steps: FW-R-17, FW-R-22, FW-R-09 off → break MBWSCADA trust → DMZ uplink out → vendor accounts and `dosatech_svc` off → PLCs LOCAL (Section 10.3) · Control 10.72.10.x / PLC 10.72.20.x / RTU 10.72.30.x / DMZ 10.72.250.x / Business 10.73.x.x (Section 4) · Jump host MBW-JUMP-01 only (Section 6) · Caustic NAOH-FC-203 normal 8–14 mg/L, PIN above 20, PLC clamp 40, PSH-302 trips at pH 9.5 (Section 7.1) · Manual ops 72 h, two operators, grab samples every 2 h (Section 8) · Evidence: Form SEC-4 (Section 10.7) · Reports: CISA 24 h, FBI immediately, DDAGW 24 h, insurer 48 h (Section 12)
