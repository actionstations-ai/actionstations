# After-Action Report / Improvement Plan
## Flight to Nowhere — Scenario 3: Data Integrity & FIDS

Exercise date: [Date] · North Coast Regional Airport Authority · Status: Draft (ratings pending)

This exercise is non-attributional: the report describes how plans and procedures worked, never how a person performed.

<!-- section:overview -->
## Exercise Overview

| | |
|---|---|
| **Exercise Name** | Flight to Nowhere — Scenario 3: Data Integrity & FIDS |
| **Exercise Date** | [Date] |
| **Scope** | Discussion-based tabletop exercise, 4 hours, at North Coast International Airport (NCIA). |
| **Core Capabilities** | Public Information and Warning; Operational Coordination; Infrastructure Systems; Cybersecurity |
| **Objectives** | Communication: Demonstrate the ability to coordinate public messaging across IT, Ops, and PIO functions during a reputational crisis. · Decision Making: Demonstrate the ability to make high-consequence operational decisions (e.g., "Go Dark") based on incomplete or conflicting technical data. · Technical Analysis: Correctly identify the root cause (SQL Injection / Compromised Credential) using provided logs. |
| **Threat or Hazard** | A malicious actor has gained access to the airport's "Airport Operational Database" (AODB), which feeds data to the Flight Information Display Systems (FIDS), Baggage Handling System (BHS), and the automated Public Address (PA) system. |
| **Scenario** | Data Integrity, Public Trust, and Crowd Management. |
| **Sponsor** | North Coast Regional Airport Authority |
| **Participating Organizations** | See Appendix B |
| **Point of Contact** | [Name, title, organization, phone, email] |

Evidence: facilitator notes, hot wash items and decision log. Not recorded: evaluator observations; the live-play session log; participant feedback surveys.
<!-- /section:overview -->

<!-- section:summary -->
## Executive Summary

This tabletop exercise tested North Coast International Airport's response to manipulated flight information: a compromised credential altered the AODB so the FIDS, baggage sortation and PA misled passengers for most of a morning. The plans held where they were specific. The TIRP 13.6 checklist carried the move to manual boarding announcements, the PIO's standing orders kept a rumour from becoming a confirmed attack, and IT preserved evidence before restoring. Two gaps matter most: the Go Dark decision has no joint decision step, so Operations and IT decided it in two rooms twelve minutes apart, and the plan names no owner for the gate whiteboards that carry flight information once the screens are dark. External notification to the FBI Cyber Task Force and CISA happened only when prompted.
<!-- /section:summary -->

<!-- section:ratings -->
## Analysis of Core Capabilities

Aligning exercise objectives and core capabilities provides a consistent taxonomy for evaluation that transcends individual exercises to support preparedness reporting and trend analysis. The table below lists each objective and the core capability it exercised, with the rating the exercising organization confirmed.

| Objective | Core Capability | P | S | M | U | Status |
|---|---|---|---|---|---|---|
| Communication | Public Information and Warning |  |  |  |  | Rating pending |
| Decision Making | Operational Coordination |  |  |  |  | Rating pending |
| Decision Making | Infrastructure Systems |  |  |  |  | Rating pending |
| Technical Analysis | Cybersecurity |  |  |  |  | Rating pending |

Ratings Definitions:

- **Performed without Challenges (P):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws.
- **Performed with Some Challenges (S):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws. However, opportunities to enhance effectiveness and/or efficiency were identified.
- **Performed with Major Challenges (M):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s), but some or all of the following were observed: demonstrated performance had a negative impact on the performance of other activities; contributed to additional health and/or safety risks for the public or for emergency workers; and/or was not conducted in accordance with applicable plans, policies, procedures, regulations, and laws.
- **Unable to be Performed (U):** The targets and critical tasks associated with the core capability were not performed in a manner that achieved the objective(s).
<!-- /section:ratings -->

<!-- section:findings -->
### Public Information and Warning

Objectives: Communication

Rating: _Rating pending_

The holding statement, the manual gate announcements and the rumour control all followed the plan; the statement left passengers without a source of gate information.

**Strengths**

#### Strength 1: Holding statement used as the plan intends

The PIO had the TIRP holding statement ready before the Channel 5 call and declined to confirm a cyber attack until IT confirmed one, as the role's standing order requires. The viral rumour was answered with a factual update rather than silence.

**Reference:** TIRP 1.4.5

_Evidence: note on I-12; 1 hot wash item_

#### Strength 2: One voice to the airlines

Every Operations decision reached the airline station managers through the Airline Liaison within minutes, so the gates heard one version of the manual procedure.

**Reference:** TIRP 13.6

_Evidence: general notes; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: Public statement gave no source of gate information

The holding statement said what the airport knew and did not know, but not where passengers should get gate assignments while the screens were dark. TIRP 1.4.5 expects the PA and website to carry that direction.

**Reference:** TIRP 1.4.5

**Recommendation:** Add a standing line to the holding statement that names the manual sources of flight information (gate staff, whiteboards, the airline's app).

_Evidence: note on I-12_

### Operational Coordination

Objectives: Decision Making

Rating: _Rating pending_

Incident command was established and the TIRP 13.6 checklist followed, but the Go Dark decision and the restoration order were each taken in one room and reached the other late.

**Strengths**

#### Strength 1: TIRP 13.6 checklist used from the first system fault

The FIDS / BHS failure checklist was open from 1:15 and the team worked it step by step for the manual boarding announcements and the baggage sort.

**Reference:** TIRP 13.6

_Evidence: general notes; 1 decision_

**Areas for Improvement**

#### Area for Improvement 1: Go Dark decided in two rooms

Operations silenced the PA within four minutes, but the FIDS stayed on for twelve more while IT debated whether the feed was clean. The Go Dark call was made by Operations alone at 1:27 and reached IT afterwards. TIRP 13.6 lists the manual procedures but not who decides to take the displays dark, or when.

**Reference:** TIRP 13.6

**Recommendation:** Make the Go Dark decision an explicit joint step in TIRP 13.6: Operational Incident Command decides with Technical Incident Command present, within a stated time of the first confirmed false display.

_Evidence: note on I-06; 1 hot wash item; 1 decision_

#### Area for Improvement 2: Nobody owns the gate whiteboards

Once the screens went dark, flight information at the gates depended on whiteboards that no role is assigned to keep current. Operations improvised with the Airline Liaison an hour later.

**Reference:** TIRP 13.6

**Recommendation:** Name the role that owns gate whiteboards during a FIDS outage and the source they copy from.

_Evidence: general notes; 1 hot wash item_

### Infrastructure Systems

Objectives: Decision Making

Rating: _Rating pending_

Manual baggage and announcement procedures were activated; the delay was in deciding to activate them.

**Strengths**

#### Strength 1: Manual procedures activated with the airlines

The manual baggage sort and gate announcements were activated through the Airline Liaison once the Go Dark decision was made, as TIRP 13.6 requires.

**Reference:** TIRP 13.6

_Evidence: 1 hot wash item; 1 decision_

**Areas for Improvement**

_No areas for improvement recorded for this capability._

### Cybersecurity

Objectives: Technical Analysis

Rating: _Rating pending_

Evidence was preserved and the workstation isolated, but external notification to the FBI Cyber Task Force and CISA happened only when the facilitator prompted it.

**Strengths**

#### Strength 1: Evidence preserved before restoration

IT preserved the AODB logs before touching the compromised server and waited for a clean backup rather than rebuilding the compromised host.

**Reference:** TIRP 13.7

_Evidence: 1 hot wash item; 1 decision_

**Areas for Improvement**

#### Area for Improvement 1: External notification waited for a prompt

TIRP 13.7 requires notifying the FBI Cyber Task Force and CISA once a cybersecurity incident is confirmed. The compromised credential was confirmed at 2:00; the notification was made at 2:20 after the facilitator asked.

**Reference:** TIRP 13.7

**Recommendation:** Put the external notification on the Technical Incident Command checklist as a timed step with the contact numbers on the card.

_Evidence: note on I-09; 1 hot wash item_
<!-- /section:findings -->

<!-- section:ip -->
## Appendix A: Improvement Plan

This Improvement Plan has been developed specifically for the exercising organization as a result of this exercise. A responsible organization in square brackets is the role the draft proposed; replace it with the organization and point of contact that own the action.

| Core Capability | Issue/Area for Improvement | Corrective Action | Capability Element | Primary Responsible Organization | Organization POC | Start Date | Completion Date |
|---|---|---|---|---|---|---|---|
| Public Information and Warning | Public statement gave no source of gate information | Add the manual flight-information sources to the TIRP holding statement templates | Planning | [PIO] |  |  |  |
| Operational Coordination | Go Dark decided in two rooms | Add a Go Dark decision step with a decision owner and a time limit to TIRP 13.6 | Planning | [IC] |  |  |  |
| Operational Coordination | Go Dark decided in two rooms | Run a thirty-minute drill of the Go Dark decision and manual announcements each quarter | Exercises | [IC] |  |  |  |
| Operational Coordination | Nobody owns the gate whiteboards | Assign gate whiteboard ownership in TIRP 13.6 and stock each gate podium with a board and markers | Organization | [AL] |  |  |  |
| Cybersecurity | External notification waited for a prompt | Add a timed FBI and CISA notification step with contacts to the TIRP 13.7 checklist card | Planning | [IT] |  |  |  |
| Cybersecurity | External notification waited for a prompt | Brief the IT on-call roster on the notification step at the next shift briefing | Training | [IT] |  |  |  |
<!-- /section:ip -->

<!-- section:participants -->
## Appendix B: Exercise Participants

_List the participating organizations (organizations only, never people)._
<!-- /section:participants -->

<!-- section:acronyms -->
## Appendix D: Acronyms

| Acronym | Meaning |
|---|---|
| AAR/IP | After-Action Report / Improvement Plan |
| EEG | Exercise Evaluation Guide |
| ENDEX | End of Exercise |
| HSEEP | Homeland Security Exercise and Evaluation Program |
| MSEL | Master Scenario Events List |
| POETE | Planning, Organization, Equipment, Training, Exercises |
| SimCell | Simulation Cell (the facilitators playing the outside world) |
| STARTEX | Start of Exercise |
| TTX | Tabletop Exercise |
<!-- /section:acronyms -->



*End of After-Action Report / Improvement Plan*

