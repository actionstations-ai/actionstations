# Lakemont Community Hospital — Clinical Systems, Interfaces and Vendors

Reference for IS-14 · Maintained by Clinical Informatics, Extension 5500

## 1. Systems of record

| System | Use | Host | Notes |
|---|---|---|---|
| Lakechart EHR (vendor-hosted application, locally hosted database) | Orders, notes, MAR, ADT, registration | Primary data center, Duluth; secondary at the Hermantown medical office building | 1,150 named users; 410 concurrent at the day peak |
| Laboratory information system (LIS) | Specimen tracking, results | Lab server room | 6,800 results per day |
| RIS/PACS | Radiology orders, images | Radiology | 190 exams per day |
| Pharmacy system and automated dispensing cabinets (46 cabinets) | Verification, inventory, dispensing | Pharmacy | Cabinets keep a local list for 12 hours of offline operation |
| Interface engine ("the engine") | Routes messages among systems | Two virtual servers, one active, one standby | 38 interfaces; about 150,000 messages per day |
| Master patient index (MPI) and identity check | Matches registrations to existing records | Part of the EHR | Check runs on every registration and every inbound message that carries demographics |
| Patient portal and scheduling | Patients, outpatient clinics | Cloud | Depends on EHR |

## 2. Interface classes

Messages are grouped for downtime decisions into classes:

- **ADT** (admit, discharge, transfer, registration): about 2,400 per day.
- **Orders** (to lab, radiology, pharmacy): about 22,000 per day.
- **Results** (lab, radiology, pathology reports): about 38,000 per day.
- **Medication administration** (cabinet and barcode scanning): about 31,000 per day.
- **Charges and billing**: about 40,000 per day.
- **Outbound public health feeds:** electronic lab reporting and immunizations to the Minnesota Department of Health, and the regional health information exchange (HIE) feed.

If the engine stops, each source system queues its messages for up to 8 hours; beyond that, queues begin to drop. When the engine returns, queued messages replay in order, but replay can send stale orders and results for patients who have since been discharged or whose identity has changed. The identity check must therefore be verified first and replay must pass through it.

## 3. Restore order

The planned clinician-priority order for restoration after a full outage is:

1. **Identity check** (the MPI), so no record is created or matched wrongly.
2. **Laboratory interface**, because results drive acute decisions (potassium, troponin, blood cultures, type and screen).
3. **EHR** open to clinicians for charting and ordering.
4. **Pharmacy interface**, last, because it requires pharmacist validation of every queued order and re-verification of dispensing cabinet inventories.

Clinical Informatics and the CMIO may change the order if conditions require; the reason is recorded on the command board. Opening the EHR to clinicians before the lab interface is validated is a known hazard: nurses chart a patient as having "no results" when results are waiting in the queue.

## 4. Monitoring

- A status dashboard on the IS Help Desk wall and in the command center shows engine queue depth per interface, EHR response time and database replication lag.
- The engine alerts at a queue depth of 1,000 messages and pages the on-call analyst at 5,000.
- Replication lag to the secondary site is normally under 30 seconds; the plan treats a lag over 15 minutes as a loss of the secondary.

## 5. Vendors and contacts

- **EHR vendor support:** priority-one line answered 24 hours; the contract target is a call back within 30 minutes. The vendor can fail over a hosted component but cannot restore the locally hosted database; Lakemont's infrastructure team does that.
- **Interface engine vendor:** support line answered in business hours; after hours the on-call engineer calls back in about 2 hours.
- **Laboratory system and pharmacy system vendors:** each has an after-hours line; the LIS vendor keeps a downtime kit of cabling and instructions.
- **Regional HIE:** can buffer outbound feeds for 72 hours.
- **State reporting:** the Minnesota Department of Health reporting portal accepts manual case reports by fax and phone.
- **Cyber insurer's breach coach:** called by the Privacy and Security Officer if a breach is possible.
- **Managed security provider:** 24-hour security operations center; calls the Security Officer on a high-severity alert.

## 6. Network and facilities

- Two core network switches in separate closets; wireless covers all clinical areas. A diesel generator powers the data center and nursing units and carries the load for 48 hours.
- Downtime workstations (the ones with the read-only viewer) are on a separate virtual network and the downtime printers are connected by cable to those stations.

## 7. People

- Clinical Systems Lead: Marcus Ellery, ext. 5502.
- On-call systems analysts: Ananya Desai (nights, ext. 5503) and Kyle Brandvold (days, ext. 5504).
- Record Integrity Specialist: Elena Moreau, ext. 5431.
- Laboratory Manager: Tomas Nygaard, ext. 5411.
- Pharmacy Operations Manager: Alicia Voss, ext. 5601.
- Hospital operator: ext. 0.
- Command center line (Boardroom): ext. 5520. All outside numbers in the exercise use the 218-555-01xx range.
