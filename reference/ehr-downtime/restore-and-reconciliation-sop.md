# Lakemont Community Hospital — Restore, Reconciliation and Breach Assessment SOP (IS-14-C)

Owner: Director of Clinical Informatics with the HIM Director and the Privacy and Security Officer

## 1. Before the EHR opens

The Clinical Systems Lead tells the Incident Commander the state of each system. The EHR is opened to clinicians only after:

1. the identity check (MPI) passes its test set (10 known patients, 3 known duplicates);
2. the LIS interface has replayed all queued results and a sample of 25 results has been checked against the lab printouts;
3. the engine queue depths for orders and ADT are at zero or have been dispositioned (see section 2);
4. the database integrity check is clean and replication to the secondary has resumed.

If clinicians must be given the EHR earlier for safety, the Incident Commander records the reason and the risk: nurses see no results, may re-order tests, and may chart on records that will later be merged.

## 2. Hold, replay or discard

The Clinical Systems Lead asks the Incident Commander, the CMIO and the department head to decide for each message class:

- **Replay** when the message is still clinically valid and the identity check passed (for example, ADT admissions, lab results for current inpatients).
- **Hold** when a human must review first (for example, orders more than 4 hours old, medication orders, results for discharged patients).
- **Discard** when a message is stale or superseded (for example, orders already placed on paper and carried out, duplicate registrations).

Discard decisions are logged with the class, the count and the decision-maker. A message class discarded without a record is a reportable loss to the command center.

## 3. Results release

Results held during downtime are released after validation. Critical results received by phone during downtime are logged on paper and re-entered. A result that arrives in the EHR on a patient who was reassigned to a new record number is held until HIM has resolved the identity.

## 4. Reconciliation

Reconciliation brings paper records in line with the electronic record. For each unit:

- entering nurses and clerks key orders, MAR entries, vital signs and notes from paper;
- a second person checks each entry against the paper before the paper form is scanned;
- the unit reports "items entered and checked" and "items remaining" to the command center hourly;
- the HIM Director tracks overall completion; the target is 100% within 72 hours of the end of downtime, and 90% within 24 hours.

Pharmacy reconciles the Downtime Medication Log with the MAR and with the dispensing cabinet counts. Any discrepancy of a controlled substance is reported to the Pharmacy Operations Manager at once.

## 5. Duplicate records

Downtime registrations and "ZZ-Trauma" names produce duplicates. HIM reviews all downtime encounters in the first 24 hours after restore. A merge is opened only by the Record Integrity Specialist, with a second review by the HIM Director for patients currently admitted. If one chart contains another person's data (an overlay), the Specialist freezes both charts, tells the attending provider and pharmacist, and does not unmerge until the clinical team has reviewed the active orders.

## 6. Return to normal

The Incident Commander declares return to normal after: EHR and interfaces stable for 2 hours; all units reported ready; no critical open items; a final message to staff. Reconciliation may continue after the declaration; the command center closes only when reconciliation is closed or the open items have owners and dates.

## 7. Breach risk assessment

If the cause was a security event, or if downtime left patient information exposed, the Privacy and Security Officer:

1. determines whether protected health information (PHI) was acquired, accessed, used or disclosed in a way not permitted;
2. applies the four-factor risk assessment: the nature and extent of the PHI, the unauthorized person who used it, whether it was actually acquired or viewed, and the extent to which risk has been mitigated;
3. decides, with legal counsel, whether the event is a reportable breach. Discovery is the first day the event is known or should reasonably have been known, which can be before the investigation ends;
4. starts the notification clocks: individual notice without unreasonable delay and no later than 60 days after discovery; notice to the HHS Office for Civil Rights at the same time if 500 or more people are affected (an annual log if fewer); notice to prominent media if more than 500 residents of one state are affected. Minnesota's own breach law and any contractual notice to the cyber insurer and business associates run in parallel;
5. keeps a decision log with times.

An outage with no sign of unauthorized access is not a breach, but is documented as an incident with the reasoning.

## 8. After-action

Within 14 days the Clinical Systems Lead and the CMIO hold a hot wash with unit managers and produce an after-action report that lists: time to declaration, time for all units to be on procedures, orders and results lost, delayed or duplicated, critical results late, duplicate records created, reconciliation time and percent complete, the restore order used, and notification clocks met. Corrective actions go on the Steering Committee tracker with owners and dates.
