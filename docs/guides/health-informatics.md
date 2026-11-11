# Health informatics and clinical IT

The health informatics pack gives an exercise the work of the people who run, secure and recover a hospital's clinical systems: the CIO, CMIO and CNIO, the downtime coordinator, EHR and interface analysts, health information management, clinical engineering, the privacy officer and the patient safety officer. The failure is a clinical system (the EHR, an interface, the master patient index, a decision support rule, a fleet of networked devices or a hosted service), and the decisions are about keeping care safe on paper, the order systems come back in, which data to trust and how to reconcile what was written by hand.

It suits hospital and health system IT and informatics teams, emergency management committees that need a downtime or cyber exercise, and health informatics degree programs.

Everything here is exercise content, not clinical guidance, legal advice or a security procedure. Every patient, record number, hospital and vendor is fictional; no real EHR product is named.

## Domain or toolkit

The pack has two parts, and you can use either one.

- The **Health informatics and clinical IT** domain describes the clinical IT desk of a fictional hospital or health system. It is the same organization as the hospital (healthcare) domain seen from the systems side: the exercise stays inside the hospital's incident command, and the players are the informatics and IT roles. Choose it when the people you are exercising run the systems. A role set for an **informatics program lab** gives a faculty facilitator and student analysts a synthetic hospital with no access to real systems.
- The **Clinical systems** toolkit adds the same expertise to any other organization. A hospital exercise run from the command center, a nursing unit working a downtime shift, a pharmacy that has lost its order interface or a health department whose lab reporting feed has stopped can turn it on without choosing the domain. See [Toolkits](toolkits.md). The app proposes it when the brief mentions an EHR, downtime, paper charts, an interface engine, HL7 or FHIR, a results backlog, reconciliation, duplicate records or a clearinghouse, and for the health informatics, hospital, nursing, pharmacy and public health kinds of organization.

For a full hospital exercise, run the scenario on the hospital domain and turn on the clinical systems toolkit, or run it on this domain and bring the hospital command roles in. The domain also suggests the **Media environment** toolkit (patient and family posts, reporters) and the **Pharmacy and drug supply** toolkit (dispensing cabinets and e-prescribing in a downtime). For the unit side of a downtime, add the **Clinical care** toolkit described in [Nursing and clinical care](nursing.md).

## Scenario families

Six families come with the domain, each with its own arc of phases, alongside the cyber, insider and infrastructure failure families:

- **EHR downtime, planned or unplanned:** detect and declare, paper workflows, sustain and decide, restore and reconcile.
- **Interface failure or message loss:** a quiet gap, size the loss, a safe workaround, replay and verify. Orders and results may be missing without anyone noticing.
- **Patient identity overlay or duplicate:** a mismatch, scope the overlay, contain and correct, verify and notify.
- **Clinical decision support firing wrongly:** alerts that fire for the wrong patients, fire constantly or stop firing after a build change.
- **Device network loss or vulnerability:** infusion pumps, monitors or imaging lose their network, or a vulnerability forces isolation.
- **Third-party or hosted service failure:** a cloud EHR host, a claims clearinghouse, a telehealth platform or a security-agent update fails and the hospital cannot fix it itself.

## What the toolkit knows

- **Downtime** is a period when a clinical system is unavailable and care continues on paper. A **read-only viewer** shows a copy of recent chart data with a data-age stamp ("Data current as of 14:05"), and a **downtime report** (census, medication list, results) is only as current as its as-of time. Neither can show anything newer.
- **Back-entry** is entering paper records after recovery; **reconciliation** compares paper, system and department records to find what is missing, duplicated or misfiled.
- **Interfaces** carry HL7 v2 messages (ADT for admit, discharge and transfer; ORM for orders; ORU for results) and FHIR resources between the EHR, laboratory, radiology, pharmacy and devices. A queue grows at the arrival rate minus the drain rate.
- An **overlay** (two patients in one record) is more dangerous than a **duplicate** (one patient, two records). Downtime registration uses a reserved block of record numbers, so some duplicates after recovery are expected.
- **Restore order matters.** Registration messages restart before orders and results so that later messages find their patient, and queues are emptied or held before an interface is stopped or restarted. Releasing results before downtime registrations are matched to the master patient index risks wrong-patient results. Opening the EHR to clinicians before the results interfaces have caught up leaves a chart that looks complete but is missing results.
- Critical results are phoned with read-back and logged, never only emailed. Status colors always carry a word: green OK, amber degraded, red down.

## Products

Templates for the system downtime notice, the HL7 interface engine monitor, the laboratory result report, an EHR screen in its normal, degraded and read-only states, the downtime census and bed board report, downtime paper forms (order sheet, flowsheet, registration), an HL7 v2 or FHIR message view with the raw text beside the decoded table, the breach risk assessment worksheet with its four factors, the recovery readiness checklist and go/no-go sheet, and a one-page hospital exercise record. The domain also uses the help desk ticket, system log, security alert, service status page, breach notification letter, regulatory report form and the usual messages and media.

The message view is checked as it is written: the HL7 v2 text must be well formed (pipe-delimited segments such as MSH, PID, PV1, ORC, OBR and OBX), a FHIR resource must have the right shape, and the decoded table must agree with the raw message. A message with a deliberately wrong field is a good inject, as long as the scenario says that is the point.

The exercise record lists findings and corrective actions with an owner and a due date, the plan revisions and the committee review. Its findings use the six critical areas of the Joint Commission's emergency management standards as revised in 2022 (communications, staffing, patient care and clinical support, safety and security, resources and assets, and utilities). The Joint Commission revises its text, so check your current edition. The record is an aid, not a compliance claim; your compliance office decides which requirement an exercise satisfies.

## Figures

Figures are drawn from data, never from AI images, each with a text summary and a data table, and every status is a word and a symbol as well as a color:

- **Interface status dashboard:** each feed, inbound or outbound, with its state (running, queue growing, stopped, in error), queue depth and last message.
- **Message queue series:** queued messages over time by feed, with an alert line if you set one.
- **Unit status board:** each unit as on downtime procedures, partly ready or not ready, with the staff working on paper.
- **Results backlog:** results waiting when systems return, by department, with the oldest item and the critical results among them.
- **Reconciliation progress:** items entered and remaining by unit.
- **Downtime timeline:** the events of the downtime in order, such as the declaration, each system's return and the end of reconciliation.

## Decisions in live play

Players record structured decisions, each with a time:

- **Declare downtime** for one or more systems, planned or unplanned, with the expected duration and who is told.
- **Set restore order:** the systems and interfaces from first to last (for example identity check, lab interface, EHR, pharmacy interface), with the reason.
- **Hold, replay or discard a message class** on one interface, with the orders or results at risk.
- **Release or hold results** until they are validated.
- **Open a duplicate or overlay merge**, or freeze two records.
- **Isolate devices**, naming the device class, the units and the manual alternative.
- **Notify** a person, team or outside party.
- **Report reconciliation progress** for one unit (items entered and checked, items remaining, discrepancies found), and **Close reconciliation** with what is still open.
- **Return to normal** for one or more systems.

Three advisor roles can sit with the players: a clinical informatics liaison (what the EHR and the downtime tools can and cannot do), an interface analyst liaison (what replaying, holding or discarding a message class would do) and a health information management liaison (what paper must be kept and what a merge does to the legal record).

## What the evaluation shows

Open the scenario's Evaluation tab and choose **Compute field metrics** after a live session (see [Evaluation metrics](evaluation-metrics.md)). Each measure shows its inputs and caveats and says n/a when nothing was recorded.

- **Declaration to all units on downtime procedures:** minutes from the downtime declaration to each unit working on paper, against a 60-minute target. It measures how fast the procedures reached the units. The time from the outage to the declaration is a separate measure in the clinical care toolkit, so an after-action report can say which link was slow.
- **Orders and results lost, delayed or duplicated**, by message class.
- **Critical results communicated within target:** 60 minutes by default. Organizations set their own target; tighten it to match your policy.
- **Reconciliation time and percent complete**, by unit, from the progress players reported, until reconciliation is closed.
- **Duplicate records created.**
- **Restore order against the clinician priority list:** a rank correlation and the share of pairs in the same order. The default list is identity check, lab interface, EHR, pharmacy interface: downtime registrations are matched first, results catch up next so the chart is complete when clinicians return, and the pharmacy interface and cabinet profiles follow once paper orders are back-entered and verified. The list is the clinicians' judgment for the scenario, not a standard; change it for your hospital and read the score with the reasons players gave. Names are compared loosely, so "Lab interface" matches lab_interface.
- **Notification clocks met** for the HIPAA breach notification rule.

The measures that count units, results and records read them from the scenario's case data. When a scenario does not carry them, the measure says so and the others still run.

## Clocks and requirements

Switch on the **HIPAA Breach Notification Rule** in Project settings, Compliance, to show its clocks under the exercise clock (see [Getting started](getting-started.md)). From the day a breach is discovered: notice to individuals without unreasonable delay and no later than 60 calendar days; notice to HHS within 60 days when 500 or more people are affected (for fewer, within 60 days after the end of the calendar year; the clock shows the 500-or-more case); and notice to prominent media within 60 days when more than 500 residents of a state or jurisdiction are affected. State breach laws can be shorter and are not modeled. A proposed update to the HIPAA Security Rule was published in January 2025 and is not final; the exercises treat it as pending.

The domain assumes these plans, checked in November 2026. Rules change, so check the current text.

- Hospitals must exercise the emergency plan at least twice a year: an annual full-scale community-based exercise (or a facility-based functional exercise when that is not possible) and a second exercise that may be a facilitator-led tabletop (42 CFR 482.15(d)(2)). The plan must include a system of medical documentation that preserves patient information (42 CFR 482.15(b)).
- The HIPAA Security Rule contingency plan (45 CFR 164.308(a)(7)) requires a data backup plan, a disaster recovery plan and an emergency mode operation plan; testing and revision is an addressable specification, which does not mean optional.
- The Joint Commission's exercise standard asks for two exercises a year as well; its text is copyrighted and is named, not carried.

## Reference library

The clinical systems toolkit draws on the **Healthcare reference library** pack: the HHS 405(d) Health Industry Cybersecurity Practices with both technical volumes, CMS Appendix Z, the HHS fact sheet on ransomware and HIPAA, the CISA tabletop package for the healthcare and public health sector, ASPR TRACIE healthcare cybersecurity readiness and lessons learned, the Hospital Incident Command System Guidebook and the SAFER Guide on contingency planning (2025 edition). The SAFER Guides on patient identification and on test results reporting, the regulation text on eCFR and the Joint Commission standards are linked.

The pack's README lists dated seeds from past incidents (a health system's weeks-long downtime in 2024, a clearinghouse outage in 2024, an endpoint update failure in July 2024, and a 2021 study of emergency departments next to a hospital under ransomware). They are history, cited with their dates and sources, and the exercising organization never takes a real organization's name.

## Tips

- Start the exercise before the declaration. The gap between the first help desk ticket and the downtime declaration is often where the lessons are.
- Script the paper. A downtime census printed at 02:00 that a unit is still using at 09:00, a label sheet that runs out, or a phoned critical result with no read-back makes the paper period concrete.
- Give recovery its own phase. Reconciliation is where duplicates, wrong-patient results and orders sent twice surface; deliver them as injects while part of the back-entry is still open so players can act on them.
- The SAFER Guide on contingency planning recommends paper forms on each unit for at least 8 hours of care, a communication method that does not depend on the EHR, and unannounced downtime drills at least once a year. These make good objectives.
- Ask a CMIO or CNIO to set the restore priority and read the scenario before you run it.

## Limits

- Nothing connects to a real EHR, interface engine, master patient index or device. All messages and records are synthetic.
- HL7 v2 is a licensed standard. The app writes realistic messages and checks their shape; it does not carry the standard's text.
- The app does not decide whether an exercise satisfies a CMS, HIPAA or accreditation requirement.
