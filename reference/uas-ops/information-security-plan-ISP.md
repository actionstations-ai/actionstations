# Harwick UAS Operations Group — Information Security Plan: Ground Control Stations and Data Pipeline (ISP)

> **EXERCISE MATERIAL — for training use.** The organization, people, procedures, numbers, frequencies, addresses and identifiers in this plan are simulated. Hostnames, addresses, vendors, clients and control numbers do not correspond to any real system.

Document Control Number: HUOG-ISP-2026 · Revision 1.3 · Effective Date: 09/01/2026 · Classification: Internal
Approved: Marguerite Ostrowski (General Manager) · Tomás Reyes (Systems & Cybersecurity Lead, plan owner) · Reviewed: managed security provider (SecureWatch MSSP), Compliance Officer

**Record of Revisions:** 1.0 — 10/01/2024 — All — First issue · 1.1 — 04/01/2025 — Section 5 — 915 MHz link configuration standard · 1.2 — 11/15/2025 — Sections 7, 8 — Client data classes, DC-HPC transfer gateway · 1.3 — 09/01/2026 — Sections 4, 6, 9 — GCS baseline 03.2026-B, backup verification, incident playbooks for link compromise and ransomware

## Table of Contents

Section 1 Purpose and Scope · Section 2 Roles · Section 3 System Description · Section 4 Ground Control Station Security · Section 5 Links, GNSS and Radio · Section 6 Data Pipeline and Backups · Section 7 Mission and Client Data Handling · Section 8 Access, Identity and Vendors · Section 9 Incident Response Playbooks · Section 10 Monitoring and Logging · Section 11 Review and Exercises · Annex A Asset Inventory · Annex B Contact List · Annex C Known Gaps

---

## SECTION 1: PURPOSE AND SCOPE

### 1.1 Purpose

The Group's aircraft are flown from laptops, over radio links, with position from satellites, and the product of every flight is data a client is paying for. This plan sets how those laptops, links and data are protected, and what the Group does when they are not.

### 1.2 Scope

Ground control stations GCS-01 to GCS-06, the payload laptop PAY-01, RTK base stations RTK-1 and RTK-2, the field router FIELD-RTR-1, the ADS-B receiver DAA-1, aircraft flight controllers and firmware, the C2/telemetry and RTK radio links, the operations NAS HUOG-NAS01, the processing workstations HUOG-PROC01/02, the calibration workstation HUOG-CAL01, the Group's firewall HUOG-FW01, the Group's space on the data-center processing cluster DC-HPC, the client transfer gateway DC-XFER01, and the OEM cloud services the aircraft and GCS software use. Base identity, email and the ITSM are owned by corporate IT and are referenced, not governed, here.

### 1.3 Relationship to other plans

The Flight Operations & Safety Manual (HUOG-FOM) sets the operational rules this plan's controls support (configuration baseline, parameter changes, no updates in the field). The Emergency Response Plan (HUOG-ERP) is the incident command structure; this plan's Section 9 playbooks run under its Incident Commander when a flight is involved and under the Systems & Cybersecurity Lead otherwise. The the Group information security policy (HUOG-POL-8.1) and the MSSP incident procedures apply to everything here.

## SECTION 2: ROLES

| Role | Holder | Responsibilities |
|---|---|---|
| Systems & Cybersecurity Lead | Tomás Reyes | Plan owner; GCS baseline and updates; link and radio configuration; firewall; NAS and backups; incident lead for cyber events; liaison to the managed SOC and the Compliance Officer |
| General Manager | Marguerite Ostrowski | Accountable; approves client data agreements; decides on client and regulator notification with the ASO; authorizes paying no ransom (Section 9.3) |
| Director of Flight Operations | Devin Alcott | Enforces the field rules; owns the parameter change log with the Systems & Cybersecurity Lead; Incident Commander when aircraft are involved |
| Payload & Calibration Lead | Hannah Whitlock | Owns calibration data integrity, the ground-truth records and PL-02 export-control handling |
| Data Center Operations lead | Lin Zhou (Data Center Operations) | DC-HPC accounts, scratch and project storage, DC-XFER01 |
| Fleet & Logistics Manager | Owen Castellano | Physical security of Hangar 1 and Hangars 2 and 3; asset tags; visitor sign-in; removable-media custody |
| Campaign Leads | Per campaign | Classify the campaign's data (Section 7.2); approve releases with the Systems & Cybersecurity Lead |
| managed SOC | SecureWatch MSSP | 24 h monitoring of HUOG-FW01 logs; incident coordination; forensics |
| Compliance Officer | Dana Kurtz | Technology control plans; PL-02 and controlled data determinations |

## SECTION 3: SYSTEM DESCRIPTION

### 3.1 Networks

| Network | Range | Hosts | Egress |
|---|---|---|---|
| Flight Ops VLAN | 10.17.40.0/24 | GCS-01 to GCS-04, RTK-1/2, PAY-01, HUOG-CAL01 when docked | Through HUOG-FW01; Internet only to the OEM update and licensing endpoints during the Tuesday 0700–0900 update window |
| Data VLAN | 10.17.41.0/24 | HUOG-NAS01 (10.17.41.5), HUOG-PROC01 (10.17.41.11), HUOG-PROC02 (10.17.41.12), HUOG-CAL01 (10.17.41.20) | Through HUOG-FW01; SMB from base only for Group accounts |
| Data Center Operations | 10.17.60.0/24 | DC-LOGIN01, DC-XFER01, project storage `/projects/huog/` | Corporate-managed |
| Field LAN | 192.168.88.0/24 | Field laptops, DAA-1 (192.168.88.40), FIELD-RTR-1 (192.168.88.1) | Cellular uplink; VPN to the office network when the GCS needs the NAS |
| Corporate | — | Identity, email, ITSM, the OEM fleet portal (cloud) | — |

### 3.2 Flows

Mission plans are built on the GCS in Hangar 2 and carried to the field on the GCS itself. In the field the GCS talks to the aircraft over the C2 link and to RTK-1/2 over 433 MHz; PAY-01 talks to the payload over the aircraft's data link or a tether at the launch pad; DAA-1 feeds the air-traffic display over the field LAN. After the flight, logs and payload data are copied from the GCS and the payload drives to HUOG-NAS01 in Hangar 2 (never over the cellular uplink), processed on HUOG-PROC01/02 with the calibration files, and the products are pushed to DC-HPC for the heavy processing. Client deliverables leave through DC-XFER01 (SFTP, client-specific accounts) or the client's own portal; nothing leaves by email attachment or personal cloud storage.

### 3.3 Cloud services

The OEM flight app and fleet portal (flight records, firmware, no-fly database, geofence unlocks) for UAS-01 to UAS-10; the LAANC application; the mission-planning software's license server; the the Group's single sign-on. The open-source ground station on GCS-04 and the UAS-11/UAS-12 autopilots use no cloud service.

## SECTION 4: GROUND CONTROL STATION SECURITY

### 4.1 Baseline

GCS-01 to GCS-03 run the configuration baseline **03.2026-B** (operating system build, OEM flight software, mission-planning software, drivers, radio firmware) documented in `\\HUOG-NAS01\it\baselines\`. GCS-04 runs the Linux baseline **L-2026.2** with the open-source ground station pinned to a reviewed release. GCS-05/06 are managed tablets enrolled in the Group's mobile-device management. Any difference from the baseline is a discrepancy recorded in the asset inventory (Annex A).

### 4.2 Hardening

- Local administrator accounts disabled for crews; crews sign in with corporate accounts in the "HUOG-Pilots" group; the Systems & Cybersecurity Lead holds the local admin credential in the corporate password vault.
- Full-disk encryption; screen lock at 5 minutes; USB mass storage limited to the Group's encrypted drives (serials in Annex A); Bluetooth off except for the OEM controller pairing.
- Endpoint protection from the corporate standard, reporting to the managed SOC; the OEM flight software folders are the only exclusions and are listed in Annex A.
- No email client, no browser sign-in to personal accounts, no personal software. The GCS is a flight instrument.
- Automatic updates disabled; the Systems & Cybersecurity Lead applies updates in the Tuesday window after testing on GCS-03 and a hover test at Horton Field. OEM in-app update prompts in the field are declined (HUOG-FOM 4.2).

### 4.3 Firmware

Aircraft firmware, radio firmware and autopilot builds are downloaded only by the Systems & Cybersecurity Lead, hash-checked against the vendor's published hashes, stored in `\\HUOG-NAS01\it\firmware\` and recorded in the fleet register. UAS-12's mission autopilot build 4.6.0-dev is compiled on HUOG-PROC02 from the Group's repository; the build hash is in the parameter change log.

### 4.4 Parameters and geofences

Parameter sets (failsafe actions, lost-link timers, RTL altitude, geofence) are exported after every change to `\\HUOG-NAS01\ops\param-log.md` with the hash of the parameter file. The pre-flight checklist (HUOG-FOM 8.3) compares the GCS parameter screen with the site card; a mismatch grounds the aircraft until the Systems & Cybersecurity Lead reviews it.

### 4.5 Physical custody

GCS laptops live in the locked cabinet in Hangar 2 (key with the Fleet & Logistics Manager and the FOM) and are signed out on the kit log. In the field the GCS is never left unattended in a vehicle; overnight at a client site it goes to the hotel room, not the car. A lost or stolen GCS is a Section 9.5 incident within the hour.

## SECTION 5: LINKS, GNSS AND RADIO

### 5.1 C2 links

OEM aircraft use the manufacturer's frequency-hopping, encrypted link on 2.4/5.8 GHz with the controller paired to the aircraft; pairing is done in Hangar 2 and recorded. UAS-11 and UAS-12 use 915 MHz telemetry radios configured per the Group's link standard: unique network id per aircraft, encryption enabled with a key generated by the Systems & Cybersecurity Lead and loaded on both radios, the default network id and key never used, transmit power 100 mW, the configuration backed up to the NAS. Radios are labelled with the aircraft tail and are not swapped between aircraft without re-keying.

### 5.2 Link monitoring

The GSO watches link quality (RSSI, packet loss) on the GCS; link quality below 50 % for 10 seconds is an abort criterion (HUOG-FOM 9.5). Telemetry logs for every flight are kept with the flight log. An unexplained drop in link quality, a second ground station appearing in the OEM app's device list, telemetry from the aircraft that does not match what the RPIC sees, or any command the RPIC did not send is a Section 9.1 incident.

### 5.3 GNSS

Aircraft use GNSS with RTK corrections from RTK-1/2 on the 433 MHz link. GNSS is not authenticated; spoofing and jamming are known risks. Indicators and the crew response are in HUOG-FOM 9.3; the technical investigation (comparing aircraft GNSS logs with RTK base logs, DAA-1's own GNSS and the survey receivers SV-1/SV-2) is in Section 9.1. The Group has no GNSS interference detector; the MSSP has been asked to fund one (Annex C).

### 5.4 Remote ID

Remote ID broadcasts are unencrypted by design and reveal the aircraft's serial, position and the control station position. Crews are told that anyone with a phone app can see the launch point; the lodge parking pad and the Horton Field shed are therefore the only launch points used, and the GCS is not left there unattended.

### 5.5 Field Wi-Fi and hotspots

FIELD-RTR-1 provides the field LAN; its admin password is the purchase default (hazard HL-29, Annex C). Personal hotspots are banned at the launch point after the HL-24 lost-link event. DAA-1 and PAY-01 join the field LAN only.

## SECTION 6: DATA PIPELINE AND BACKUPS

### 6.1 Storage

| Store | Contents | Protection |
|---|---|---|
| GCS and payload drives | Current campaign's raw data until copied | Encrypted; copied to the NAS the same day, wiped after verification |
| HUOG-NAS01 (10.17.41.5) | Flight logs, raw payload data, calibration files, ops records, baselines, firmware | RAID; nightly snapshots (14 days); SMB with per-group permissions |
| HUOG-PROC01/02 | Working copies during processing | Local only; no long-term storage |
| DC-HPC `/projects/huog/` | Processed products, large hyperspectral cubes, client deliverables in preparation | Off-site backup; project-level permissions |
| DC-XFER01 | Outbound deliverables, 30-day retention | Per-client SFTP accounts; audit log |
| OEM fleet portal (cloud) | Flight records for UAS-01 to UAS-10 | Vendor-controlled; Group account with MFA |

### 6.2 Backups

- NAS → the offline backup drives OB-1 and OB-2 (rotated weekly; the one not in use is in the General Manager's office safe); and → the off-site backup service nightly.
- DC-HPC project storage is backed up by Data Center Operations (nightly incremental, 90 days).
- Restore test: quarterly, the Systems & Cybersecurity Lead restores one campaign's folder from OB-x and from the off-site backup service and records the time taken. The last recorded test (06/2026) restored a 1.2 TB campaign in 9 hours from the off-site backup service and 3 hours from OB-2. The 09/2026 test is overdue (Annex C).
- Calibration files (`\\HUOG-NAS01\calibration\`) are additionally versioned in the Group's source repository because a corrupted calibration silently corrupts every product.

### 6.3 Integrity

Raw data folders get a manifest of SHA-256 hashes when copied to the NAS; processing scripts verify the manifest before they start; deliverables carry a manifest the client can verify. A product generated from a calibration file whose hash does not match the versioned copy is not delivered.

## SECTION 7: MISSION AND CLIENT DATA HANDLING

### 7.1 Why it matters

The Group's reputation with clients rests on delivering calibrated data on time and on not exposing it. A client deliverable that is late, altered or leaked is a reportable event to that client and, for some agreements, to the Compliance Officer.

### 7.2 Data classes

| Class | Examples | Handling |
|---|---|---|
| **Public** | Published papers, demo imagery of Horton Field | No restriction |
| **Internal** | Flight logs, maintenance records, most trainee projects | Group accounts only |
| **Client-confidential** | CVAC field imagery (farm boundaries, yield estimates), CP&L task-order data, client collections | Named-user access; DC-XFER01 or the client portal only; no personal devices; client notified of any exposure within the agreement's time (CP&L: 24 hours; CVAC: 5 days) |
| **Export-controlled** | PL-02 technical data, SAR (PL-06) raw data and processing code, anything the Compliance Officer designates | Technology control plan TCP-2025-07; US persons only; stored only in the `\\HUOG-NAS01\controlled\` share and the DC-HPC controlled project; never on a GCS; never on a tablet; the Compliance Officer notified the same day of any loss or exposure |

The Campaign Lead assigns the class in the Campaign Plan (HUOG-FOM 5.1); the Systems & Cybersecurity Lead sets the folder permissions before the first flight day.

### 7.3 Export control

PL-02 and PL-06 and their data are covered by technology control plan TCP-2025-07. Only the persons on the TCP roster operate them, process their data or access the controlled shares; contract pilots and client observers are not added without the Compliance Officer's determination. PL-02 travels in its locked case, is never left in a vehicle, and its loss is reported the same day.

### 7.4 Client deadlines

The CP&L task order requires Deliverable D-3 (calibrated hyperspectral cubes from the Lakeshore Flight Area summer campaign) by the 15th of the month following the final collection, with a 10-day cure period; late delivery without notice is a contract default. CVAC's growing-season products are due within 7 days of each collection. Campaign Leads track deadlines on the Group calendar; the General Manager is told of any risk to a date a week ahead.

### 7.5 Client notification

A client is notified by the General Manager (with the Campaign Lead) when its data may have been exposed, altered or destroyed, when a deliverable will be late, or when an incident touches an instrument the client owns. The notification states facts, the data affected, what the Group is doing and when the next update comes; speculation about attackers or other clients' data is left out. The MSSP is consulted first when law enforcement is involved.

## SECTION 8: ACCESS, IDENTITY AND VENDORS

### 8.1 Accounts

The Group's single sign-on with MFA for everything that supports it (NAS, DC-HPC, the OEM fleet portal, the LAANC application, the ITSM). Groups: HUOG-Pilots (GCS sign-in), HUOG-Data (NAS data shares), HUOG-Controlled (TCP roster), HUOG-Admins (the Systems & Cybersecurity Lead and one alternate). Trainee accounts expire at the end of each quarter unless renewed by the Director of Flight Operations. A departing crew member's access is removed the day they leave; the Fleet & Logistics Manager collects keys and drives.

### 8.2 Vendors and remote access

The OEM has no remote access to the Group's systems; support is by exported logs. The mission-planning software vendor's license server is reached outbound only. The GCS vendor's remote-support tool was removed from the baseline in 03.2026-B after it was found installed on GCS-02. Data Center Operations administers DC-HPC under the service agreement. No vendor VPN exists into the Group VLANs.

### 8.3 Removable media

The Group's encrypted drives (serials in Annex A) are the only removable media used with the GCS and the NAS; they are signed out on the kit log and wiped after each campaign. A found USB drive is given to the Systems & Cybersecurity Lead unopened.

### 8.4 Physical

Hangar 2, Hangar 3 and Hangar 1 are on the hangar access-control system with badge readers; the GCS cabinet and the controlled share's media safe are keyed; visitors sign in with the Fleet & Logistics Manager and are escorted. CCTV at the Hangar 1 roll-up door and the loading dock is Harwick Police's.

## SECTION 9: INCIDENT RESPONSE PLAYBOOKS

### 9.0 Common first steps

1. Whoever notices tells the Systems & Cybersecurity Lead (585-555-0143) and, if a flight is involved, the RPIC lands and the HUOG-ERP applies.
2. Do not power off, reboot or "clean" anything; disconnect from the network if told to; screenshot and photograph.
3. Open a ticket with the IT helpdesk (585-555-0150) tagged HUOG-SEC and notify the managed SOC (585-555-0155) within 1 hour for any Level 2 or 3 event (HUOG-ERP Section 3).
4. The Systems & Cybersecurity Lead starts the incident log (`\\HUOG-NAS01\ops\incident-log\`, or paper when the NAS is affected) and names a scribe.
5. The General Manager decides, with the ASO, on client, regulator and law-enforcement notifications (Section 7.5, HUOG-ERP Section 6).

### 9.1 C2 link compromise, interference or GNSS spoofing

Indicators: commands the RPIC did not send; a second controller or ground station in the device list; telemetry that disagrees with what the VO sees; GNSS position jumps, satellite count drop under clear sky, RTK fix lost at the base and the aircraft at the same time, a moved home point; DAA-1 and the GCS disagreeing on the aircraft's position; link quality collapsing at the same time each day.

Actions: land everything (manual/attitude mode if GNSS is suspect); preserve the GCS and radio state; retrieve the full telemetry and link logs and the RTK base logs before power-off; note every transmitter visible at the site (crew hotspots, vehicles, the lodge Wi-Fi, other drones); photograph the launch area and any vehicle that left; compare aircraft GNSS logs with RTK-1/2, DAA-1 and SV-1/SV-2 logs; re-key the 915 MHz radios and re-pair the OEM controllers before any further flight; report interference to the FCC through the MSSP when the evidence supports it; report to the FSDO through the ASO when an aircraft left its authorization. If a flight controller or GCS shows modified parameters or firmware the aircraft and GCS are quarantined for forensics and the fleet of that type is grounded until the baseline is verified.

### 9.2 Malware on a GCS

Indicators: endpoint alert; unexpected processes; the OEM app asking to re-pair or re-activate; a parameter file with a new hash; the GCS contacting addresses outside the update endpoints (HUOG-FW01 log). Actions: isolate the GCS (pull the cable, Wi-Fi off, do not power off); ground the aircraft it controls; managed SOC forensics; rebuild from the baseline image on a spare (GCS-03 is the designated spare during a rebuild); verify the aircraft firmware hash and parameters before flight; review the kit log for who used the GCS and which drives were connected.

### 9.3 Ransomware on the NAS, the processing workstations or DC-HPC project storage

Indicators: encrypted or renamed files, a ransom note, the NAS snapshot schedule disabled, processing scripts failing manifest checks, the client deliverable folder unreadable, DC-HPC project storage showing mass changes.

Actions:
1. Isolate: HUOG-FW01 blocks the Data VLAN from the office network; the NAS is disconnected; the processing workstations are powered down only on the MSSP's instruction (memory may be needed); the Data Center Operations lead freezes `/projects/huog/` and reports whether the off-site backup is intact.
2. Scope: which shares, which campaign folders, whether `\\HUOG-NAS01\controlled\` and the calibration share are touched, whether the GCS laptops were connected since the last known-good time (a GCS that mounted the NAS during the infection window is treated as infected and grounded).
3. Backups: the offline drive OB-x in the safe is the recovery source of record; it is not connected until the MSSP confirms the environment is clean; the off-site backup service's last good snapshot is identified.
4. Deadlines: the General Manager decides within 4 hours whether client deadlines (Section 7.4) are at risk and notifies the clients with facts; CP&L's 24-hour exposure notice applies if its data may have been read, not only encrypted.
5. Ransom: the Group does not pay; the General Manager records the decision; the MSSP coordinates with the Group's counsel and law enforcement (the FBI field office through the MSSP).
6. Recovery order: calibration share (verify against the repository hashes) → ops records → the campaign with the nearest deadline → the rest. Restored raw data is verified against its manifest before any processing.
7. Lessons: the restore time measured in the quarterly test is compared with what recovery took.

### 9.4 Flyaway or unplanned flight with a suspected cyber cause

Runs under the HUOG-ERP Incident Commander. The Systems & Cybersecurity Lead quarantines the GCS, the controller and any radio; retrieves telemetry, link logs, parameter files and the OEM app logs before power-off; checks the OEM fleet portal for a geofence unlock or a firmware push the Group did not request; checks the parameter change log for unrecorded changes (hazard HL-27); and briefs the ASO before the FSDO call so the report states what is known and what is suspected.

### 9.5 Lost or stolen GCS, drive or payload

Within the hour: corporate account password resets for anyone signed in on it; the OEM fleet portal session revoked; the device marked lost in mobile-device management (tablets); a Harwick Police or CCSO report; the Compliance Officer the same day if PL-02, PL-06 data or a controlled drive is involved; clients per Section 7.5 if their data was on it (a GCS used in the field holds the current campaign's raw data until it is copied).

### 9.6 Client data exposure

Any evidence that client-confidential or controlled data was read, copied or sent outside the pipeline (a DC-XFER01 download from an unknown address, a crew member's personal cloud sync, an email attachment, a public post with imagery): preserve logs, identify the data and the recipient, MSSP and Compliance Officer as above, the General Manager notifies the client within the agreement's time.

## SECTION 10: MONITORING AND LOGGING

- HUOG-FW01 sends logs to the MSSP SIEM; alerts for any Flight Ops VLAN host contacting the Internet outside the update window, any new outbound destination from the Data VLAN, and any SMB session to the controlled share from outside HUOG-Controlled.
- NAS audit logs for the calibration and controlled shares are retained one year.
- DC-XFER01 logs every login and transfer; the Systems & Cybersecurity Lead reviews them monthly.
- The OEM fleet portal's activity log is exported monthly to the NAS.
- GCS endpoint protection reports to the managed SOC in real time; DAA-1 recordings are kept 90 days.
- The Systems & Cybersecurity Lead checks the firewall alerts each morning; the managed SOC calls 585-555-0143 for anything rated high outside business hours.

## SECTION 11: REVIEW AND EXERCISES

This plan is reviewed each August with the MSSP and after any Section 9 incident. The Group runs one cyber tabletop a year (joined with the HUOG-ERP tabletop when possible) and one restore test a quarter. The 2026 tabletop scenario is "ransomware on the NAS ten days before CP&L Deliverable D-3".

## ANNEX A: ASSET INVENTORY (EXTRACT)

| Asset | Tag | Hostname / address | Baseline | Notes |
|---|---|---|---|---|
| GCS-01 | HUOG-0101 | HUOG-GCS01 · 10.17.40.11 | 03.2026-B | Dual C2 radios |
| GCS-02 | HUOG-0102 | HUOG-GCS02 · 10.17.40.12 | 03.2026-B | Remote-support tool removed 03/2026 |
| GCS-03 | HUOG-0103 | HUOG-GCS03 · 10.17.40.13 | 03.2026-B | Designated spare / update test unit |
| GCS-04 | HUOG-0104 | HUOG-GCS04 · 10.17.40.14 | L-2026.2 | UAS-12 only; open-source ground station |
| GCS-05, GCS-06 | HUOG-0105/0106 | Managed tablets | MDM | UAS-07 to UAS-10 |
| PAY-01 | HUOG-0110 | HUOG-PAY01 · 10.17.40.31 | 03.2026-B | Payload control |
| RTK-1, RTK-2 | HUOG-0121/0122 | 10.17.40.21/22 | Vendor fw 2.8 | 433 MHz corrections |
| FIELD-RTR-1 | HUOG-0130 | 192.168.88.1 | Vendor fw | Default admin password (HL-29) |
| DAA-1 | HUOG-0140 | 192.168.88.40 | — | ADS-B receiver, air-traffic display |
| HUOG-NAS01 | HUOG-0201 | 10.17.41.5 | NAS OS 7.2 | Shares: flightlogs, ops, calibration, controlled, it, campaigns |
| HUOG-PROC01/02 | HUOG-0211/0212 | 10.17.41.11/12 | Workstation 2026.1 | Processing |
| HUOG-CAL01 | HUOG-0220 | 10.17.41.20 | Workstation 2026.1 | Calibration shop instruments |
| HUOG-FW01 | HUOG-0301 | 10.17.40.1 / 10.17.41.1 | Corporate firewall standard | Syslog to the MSSP SIEM |
| Encrypted drives | HUOG-D01 to HUOG-D08 | — | — | Kit-log custody |
| Offline backup drives | OB-1, OB-2 | — | — | One in the General Manager's safe |
| DC-LOGIN01, DC-XFER01 | Data Center Operations | 10.17.60.x | Corporate | `/projects/huog/` |

Endpoint-protection exclusions on the GCS baseline: the OEM flight software program folder and its log folder; the mission-planning software's cache folder. No other exclusions are permitted.

## ANNEX B: CONTACT LIST (EXERCISE NUMBERS)

Systems & Cybersecurity Lead, Tomás Reyes — 585-555-0143 · Alternate admin, Nadia Okonkwo — 585-555-0147 · managed SOC — 585-555-0155 (24 h) · IT helpdesk — 585-555-0150 · Data Center Operations lead, Lin Zhou — 585-555-0157 · Compliance Officer, Dana Kurtz — 585-555-0165 · General Manager — 585-555-0146 · ASO — 585-555-0142 · FOM — 585-555-0141 · CP&L program office — 585-555-0180 · CVAC — 585-555-0185 · Corporate Communications — 585-555-0160 · Harwick Police — 585-555-0111

## ANNEX C: KNOWN GAPS (09/2026)

| Id | Gap | Owner | Target |
|---|---|---|---|
| HL-29 | FIELD-RTR-1 admin password is the purchase default | Systems & Cybersecurity Lead | 10/2026 |
| HL-27 | Parameter change log for UAS-12 incomplete after the 07/2026 timer test | FOM | 09/2026 |
| ISP-G1 | No GNSS interference detector at either site | FY27 budget request | FY27 |
| ISP-G2 | Quarterly restore test for 09/2026 not yet run | Systems & Cybersecurity Lead | 09/30/2026 |
| ISP-G3 | OB-1 found in the Hangar 2 cabinet rather than the safe during the 08/2026 audit | Fleet & Logistics Manager | Closed 08/20/2026 |
| ISP-G4 | CVAC imagery for the 2026 season still on a crew member's HUOG-PROC01 working folder after delivery | Campaign Lead | 09/2026 |
| ISP-G5 | OEM fleet portal account shared between the FOM and the Fleet & Logistics Manager (one MFA device) | Systems & Cybersecurity Lead | 10/2026 |
