# Lakemont Community Hospital — Information Systems Downtime and Recovery Plan

Policy IS-14 · Owner: Director of Clinical Informatics · Approved by the Information Systems Steering Committee, revised March 2026

## 1. Purpose and scope

Lakemont Community Hospital is a 142-bed community hospital in Duluth, St. Louis County, Minnesota, with an emergency department (ED) of 28 treatment spaces, a 12-bed intensive care unit, a labor and delivery unit, and two outpatient clinics on campus. This plan governs any loss of, or loss of trust in, the clinical systems the hospital depends on to deliver care: the electronic health record (EHR, product name "Lakechart" in staff speech), the laboratory information system (LIS), the radiology information system and picture archiving system (RIS/PACS), the pharmacy system and automated dispensing cabinets, and the interface engine that carries messages between them.

It applies to planned downtime (patching, upgrades) and unplanned downtime (hardware failure, database corruption, network loss, cyber incident). Ransomware and other security incidents are handled by the Cyber Incident Annex, which this plan follows once the Security Officer takes command.

## 2. Roles

- **Downtime Incident Commander:** the Administrator on Call until the Chief Medical Information Officer (CMIO, Dr. Priya Raman) arrives; then Dr. Raman. Declares and ends downtime.
- **Clinical Systems Lead:** Marcus Ellery, Director of Clinical Informatics. Runs the technical recovery with the vendor and decides restore sequencing with the Incident Commander.
- **Chief Nursing Officer (CNO):** Ruth Okafor. Owns unit readiness and the nursing downtime workflow.
- **Nursing House Supervisor (night and weekend):** acts as operations lead until day staff arrive; directs unit readiness.
- **Laboratory Manager:** Tomas Nygaard. Owns the LIS and the critical result call list.
- **Pharmacy Operations Manager:** Alicia Voss. Owns the pharmacy system, automated dispensing cabinet overrides and the medication reconciliation list.
- **Health Information Management (HIM) Director:** Janelle Brandt. Owns paper forms, scanning, record identity and duplicate repair.
- **Privacy and Security Officer:** Gregory Pruitt. Decides whether an event is a security incident and runs the HIPAA breach risk assessment.
- **Public Information Officer:** Hannah Lindqvist, Director of Communications.

## 3. Downtime levels

| Level | Meaning | Examples | Who declares |
|---|---|---|---|
| 1 | Degraded; clinicians can still chart | Slow response, one interface delayed | Clinical Systems Lead |
| 2 | EHR read-only or intermittently unavailable under 4 hours | Database failover in progress | Incident Commander |
| 3 | EHR unavailable or untrusted, expected over 4 hours | Storage failure, restore from backup | Incident Commander |
| 4 | Level 3 plus loss of the interface engine or suspected malicious cause | Ransomware, data corruption | Incident Commander with the Security Officer |

Declaration is by overhead page, the 4-digit downtime hotline (ext. 5505, outbound text group "Downtime Alert"), and a call from the House Supervisor to each charge nurse. The target is every unit on downtime procedures within 60 minutes of declaration. Units report back to the House Supervisor with the time they were on procedures; an unreported unit is called after 15 minutes.

## 4. First hour checklist

1. The first person to notice loss of the EHR calls the IS Help Desk (ext. 5500). The help desk technician checks the status dashboard and pages the on-call systems analyst.
2. The on-call analyst confirms scope within 15 minutes: which systems, which interfaces, whether the downtime viewer (the read-only report workstation described in section 6) is available.
3. The Incident Commander declares a downtime level. For Level 3 or 4 the hospital command center opens in the Boardroom (second floor, ext. 5520).
4. The Clinical Systems Lead opens a case with the EHR vendor at its priority-one support line and a case with the interface engine vendor if message flow is affected. Vendor case numbers are logged on the command board.
5. The Laboratory Manager and the Pharmacy Operations Manager each confirm the manual state of the LIS and the dispensing cabinets and report within 30 minutes.
6. The Privacy and Security Officer is told at once so a security cause can be ruled in or out. If a cause cannot be ruled out in 60 minutes the event is handled as a suspected security incident.
7. Admissions and transfers: the ED stays open; the Incident Commander and the ED Medical Director (Dr. Sofia Lindgren) decide within 2 hours whether to divert elective admissions or ambulances.

## 5. Safe care during downtime

Patients keep receiving care on paper under the Downtime Procedures SOP (IS-14-A). Five risks are watched from the command center: lost or delayed orders, lost or delayed results, duplicate or mismatched patient identity after restore, unsafe medication administration, and critical results not communicated. The CNO and the Laboratory Manager together keep a running count of orders and results lost, delayed or duplicated, by message class (orders, results, ADT events, medication administrations, charges).

Critical results are telephoned by the laboratory to the responsible nurse or provider within 60 minutes of result verification, with read-back, and logged on the Critical Result Call Log.

## 6. Downtime viewer and backups

- A read-only downtime viewer holds a copy of each admitted patient's problem list, allergies, active orders, medication administration record (MAR) and last 24 hours of results, refreshed every 4 hours. It sits on two workstations in the ED, ICU and pharmacy, and on one in each other nursing unit. Its data are as of the last refresh and are stamped with that time.
- Each unit keeps a downtime binder (forms, a census sheet and a printed MAR from the last refresh). HIM reviews binders quarterly.
- Backups: nightly full backup and 15-minute transaction log shipping to the secondary data center at the Hermantown medical office building. The tested restore time for the production database is 6 hours; the last full test (November 2026 target) is the basis for the 24-hour planning assumption in section 8.

## 7. Restore and return to normal

Restore follows the priority order in the Restore and Reconciliation SOP (IS-14-C), set by the Incident Commander on the advice of the Clinical Systems Lead, the CMIO, the Laboratory Manager and the Pharmacy Operations Manager. Return to normal is declared only when the EHR is restored, interfaces are replaying correctly, the identity check passes and every unit has reported readiness. Reconciliation of paper to electronic record then follows and is tracked by unit.

## 8. Communication

- Staff: overhead page, text group, and an update on the hospital intranet banner every 2 hours.
- Patients and families: unit managers and the PIO supply a standard statement. The PIO handles media and social posts and clears all statements with the Incident Commander.
- Partners: the St. Louis County Health Department, regional ambulance services (via Duluth dispatch), the state health information exchange, and neighboring hospitals if diversion is requested.
- Regulators: if the Privacy and Security Officer finds a reportable breach, the HIPAA clocks (individual notice within 60 days of discovery, HHS notice, and media notice if more than 500 residents of a state are affected) apply; discovery is the first day the event is known or reasonably should have been known. The Minnesota Department of Health is informed of any significant disruption to patient care.

## 9. Planning assumption

The plan is built for an unplanned outage of 24 hours. Beyond 24 hours the Incident Commander considers diverting ambulances, canceling elective procedures, requesting staffing support, and asking the Minnesota Hospital Association's mutual-aid contact for help.
