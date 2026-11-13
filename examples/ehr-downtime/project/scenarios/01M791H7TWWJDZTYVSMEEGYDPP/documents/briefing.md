# Player Briefing Packet
## Cold Storage — EHR Storage Failure & Downtime Continuity

Location: Lakemont Community Hospital, Duluth, St. Louis County, Minnesota · Exercise Duration: 4 Hours
Current Time: 02:40 AM (Exercise Time) · Weather: Duluth, Tuesday, February 9, 2027: clear sky, -21°F, wind chill near -40°F, deep overnight cold snap.

### 1. Situation Brief

**EXERCISE: all patients and record numbers are fictional.** It is 02:40 on a bitterly cold Tuesday night at Lakemont Community Hospital in Duluth. The hospital is full for a winter weeknight. There are 98 inpatients across the ICU, medical-surgical and L&D units. The ED is holding 22 patients, many of them brought in by the cold snap with cold exposure, falls on ice and breathing complaints. On L&D, one woman is in active labor. The night shift is staffed to target: medical-surgical 1:6 and ICU 1:2. One House Supervisor covers the building, and a single night pharmacy technologist and a small Core Lab crew run the support departments. Ananya Desai (ext. 5503) is the on-call systems analyst covering Information Services from home. Lakechart, the interface engine and the clinical devices all showed normal on the 02:00 check. The 00:00 and 02:00 medication passes are done, and the units are settling into the quiet part of the night.

- Lakechart EHR and read-only downtime viewer: GREEN – OK (02:00 check); downtime viewer refreshing normally
- Interface engine (ADT, orders, results, medication administration, charges, outbound feeds): GREEN – OK (02:00 check); queues normal, error queue empty
- Core Lab analyzers, LIS and Critical Result Call Log: GREEN – OK; chemistry and hematology running, results crossing to Lakechart
- Pharmacy system and automated dispensing cabinets (controlled-substance counts): GREEN – OK; profiled dispensing, last shift count reconciled
- ICU infusion pump and bedside monitor network: GREEN – OK; central stations reporting all beds
- Night staffing and command readiness (House Supervisor, on-call analyst, Boardroom command center ext. 5520): GREEN – OK; staffed to ratio targets, command center not activated

**The Anomaly:** **02:14, IS Help Desk call log (ext. 5500)**

**Caller:** ICU charge nurse
**Location:** ICU nurses' station

> "Lakechart is just spinning. We can't open a chart or scan a med. Can someone take a look?"

The help desk technician logs the ticket as *slow response, ICU*. Over the next several minutes, similar calls come in from the medical-surgical and ED charge nurses. The ticket is routed to the on-call systems analyst, Ananya Desai (ext. 5503).

**YOUR MISSION:** Maintain safe, uninterrupted care for every inpatient, every ED patient and the laboring mother while you investigate and resolve the clinical-systems problem being reported tonight. Balance the pressure to get systems back fast against the need to verify that every order, result and patient identity is correct. Keep staff, patients and families informed with statements that say only what is actually known.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Administrator on Call / Incident Commander (Command)**— Downtime Incident Commander (Administrator on Call) | You own the decision on whether to declare a downtime and at what level, opening the Boardroom command center (second floor, ext. 5520), the diversion decision made with the ED Medical Director, and the declaration of return to normal. | **Declare Early: declare a downtime level on the facts you have now, then change it as facts change; an undeclared downtime is the worst level.** **Clinicians Wait: do not open Lakechart to clinicians until registrations and results have caught up and been validated, however senior the person asking.** **One Voice: every public, patient and staff statement is cleared by you before release.** |
| **Team B: Clinical Systems Lead (Technical Recovery)**— Director of Clinical Informatics (Clinical Systems Lead) | You own the technical recovery with the EHR and interface engine vendors. You propose the restore order to command and the replay, hold or discard decision for each class of queued message. | **Log It: post every vendor case number, promised callback time and message-handling decision (class, count, who decided) on the command board.** **ADT First: restore registration messages before orders and results so that no result lands on the wrong patient or on no patient.** **Escalate the Clock: escalate as soon as a vendor misses a promised callback, and track the time left before held messages reach their limit.** |
| **Team C: Night House Supervisor / Chief Nursing Officer (Units and Paper Workflow)**— Nursing House Supervisor / Chief Nursing Officer | You own unit readiness and the nursing paper workflow overnight. You call each charge nurse, chase units that have not reported, and keep a running count of lost, delayed or duplicated orders and results. | **Chase Silence: call any unit that has not reported a time on downtime procedures within 15 minutes of declaration.** **Trust the Armband: when a report or the downtime viewer disagrees with the patient in front of you, believe the patient and the armband, and check every report's as-of time.** **Double Check: every high-alert medication given on paper gets an independent second-nurse check, whatever the staffing.** |
| **Team D: Laboratory and Pharmacy Managers (Diagnostics and Medications)**— Laboratory Manager and Pharmacy Operations Manager | You own the LIS, the Critical Result Call Log, the pharmacy system, dispensing cabinet override and the Downtime Medication Log. Report the manual state of each to command within 30 minutes. | **Phone Criticals: phone every critical result with read-back and log it within 60 minutes; a printout or an email is never enough.** **Count Controls: report any controlled-substance count mismatch to command immediately; do not reconcile it quietly.** **Validate Before Release: do not let lab results feed Lakechart until a sample matches the analyzer and the patient, even if the ED is pushing.** |
| **Team E: Privacy and Security Officer (Cause and Compliance)**— Privacy and Security Officer | You own the decision on whether a security cause can be ruled in or out, which systems may reconnect, and the breach risk assessment with its decision log and notification clocks. | **Rule In or Out: decide within 60 minutes of being told whether a security cause can be excluded, and state plainly what you know and what you do not.** **Clock Starts at Discovery: record when the event was known or reasonably should have been known; do not wait for the investigation to finish.** **Write the Reasoning: record every determination in the decision log with times and reasons; a verbal assurance is not a record.** |
| **Team F: Public Information Officer (Communications)**— Public Information Officer (Director of Communications) | You own the standard statement for patients and families, staff intranet updates, and media and social posts about any outage, all cleared with the Incident Commander. | **Truth Over Reassurance: say what is known, what is not known and when the next update comes; never state a cause before command has confirmed it.** **Clear First: get Incident Commander approval on every statement, then make sure unit managers use the same wording at the bedside.** **Answer the Rumor: respond to questions from staff, reporters and social media with facts and a time for the next update, not with silence.** |

### 3. Rules of Engagement

- Begin and end every simulated overhead page, hotline message, phone call and radio call with "This is an exercise" so that no real unit, patient or family mistakes it for a real downtime.
- If a real emergency or a real system problem happens during play, say "REAL WORLD, REAL WORLD" and the exercise stops immediately so everyone can attend to real patients and systems.
- The facilitator may announce "Time Jump: it is now [time]" to move the clock forward; accept the new time and the situation described so the room can reach the later decisions about recovery and reconciliation.
- Printed injects such as help desk logs, dashboard snapshots, emails, voicemails, downtime reports, social media posts and news items are your intelligence; treat them as real and act on what they say, because that is how the situation will reach you.

### 4. Incident Briefing Form (ICS-201)

Use this form to log the situation as it evolves. This is your "Board of Record."

**1. Incident Name:** ________________ · **2. Incident Number:** ______ · **3. Date/Time Initiated:** ________

**4. MAP SKETCH** — (Sketch the facility layout. Mark affected areas, command post, staging.)

**5. CURRENT SITUATION SUMMARY AND HEALTH AND SAFETY BRIEFING** — (What do we know? What is broken? What is the hazard to people?)

**7. CURRENT AND PLANNED OBJECTIVES**
1. _____
2. _____
3. _____

**8. CURRENT AND PLANNED ACTIONS** — | Time | Action |

**10. CRITICAL RESOURCE STATUS**

| Resource | Status (Green/Yellow/Red) | Notes |
|---|---|---|
| Lakechart EHR and downtime viewer (data age) | | |
| Interface engine and queued messages (8-hour hold limit) | | |
| Laboratory analyzers, LIS and Critical Result Call Log | | |
| Automated dispensing cabinets and controlled-substance count | | |
| ICU infusion pump and monitor network | | |
| Patient identity (ZZ-Trauma registrations, Carlson overlay) | | |
| Public and staff trust (hacking rumor) | | |

*End of Briefing Packet*
