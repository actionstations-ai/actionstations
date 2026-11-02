# After-Action Report / Improvement Plan
## Flight to Nowhere — Scenario 3: Data Integrity & FIDS

Exercise date: 2026-03-12 · North Coast Regional Airport Authority · Status: Reviewed

This exercise is non-attributional: the report describes how plans and procedures worked, never how a person performed.

<!-- section:overview -->
## Exercise Overview

| | |
|---|---|
| **Exercise Name** | Flight to Nowhere — Scenario 3: Data Integrity & FIDS |
| **Exercise Date** | 2026-03-12 |
| **Scope** | Discussion-based tabletop exercise, 4 hours, at North Coast International Airport (NCIA). |
| **Core Capabilities** | Public Information and Warning; Operational Coordination; Situational Assessment; Cybersecurity; Access Control and Identity Verification; Operational Communications |
| **Objectives** | Communication: Demonstrate the ability to coordinate public messaging across IT, Ops, and PIO functions during a reputational crisis. · Decision Making: Demonstrate the ability to make high-consequence operational decisions (e.g., "Go Dark") based on incomplete or conflicting technical data. · Technical Analysis: Correctly identify the root cause (SQL Injection / Compromised Credential) using provided logs. |
| **Threat or Hazard** | A malicious actor has gained access to the airport's "Airport Operational Database" (AODB), which feeds data to the Flight Information Display Systems (FIDS), Baggage Handling System (BHS), and the automated Public Address (PA) system. |
| **Scenario** | Data Integrity, Public Trust, and Crowd Management. |
| **Sponsor** | North Coast Regional Airport Authority |
| **Participating Organizations** | See Appendix B |
| **Point of Contact** | [Name, title, organization, phone, email] |

Evidence: facilitator notes, hot wash items and decision log; evaluator observations. Not recorded: the live-play session log; participant feedback surveys.
<!-- /section:overview -->

<!-- section:summary -->
## Executive Summary

The exercise tested the airport's response to a cyber incident affecting the Flight Information Display System (FIDS), Baggage Handling System (BHS), and Public Address (PA) system, leading to misinformation, passenger confusion, and operational disruption. The plans demonstrated strong technical response capabilities, particularly in identifying the root cause and restoring systems, but faced significant challenges in command structure, public messaging, and communication protocols. The most critical changes needed are to establish Unified Command and the Incident Action Log immediately upon incident declaration, and to implement a formal, pre-authorized process for public statements that includes direct coordination between the PIO and IT. These changes will ensure timely, accurate information and prevent delays in crisis response.
<!-- /section:summary -->

<!-- section:ratings -->
## Analysis of Core Capabilities

Aligning exercise objectives and core capabilities provides a consistent taxonomy for evaluation that transcends individual exercises to support preparedness reporting and trend analysis. The table below lists each objective and the core capability it exercised, with the rating the exercising organization confirmed.

| Objective | Core Capability | P | S | M | U | Status |
|---|---|---|---|---|---|---|
| Communication | Public Information and Warning |  | X |  |  |  |
| Communication | Operational Coordination |  |  | X |  |  |
| Decision Making | Operational Coordination |  |  | X |  |  |
| Decision Making | Situational Assessment |  | X |  |  |  |
| Technical Analysis | Cybersecurity |  | X |  |  |  |
| Technical Analysis | Access Control and Identity Verification |  | X |  |  |  |
| — | Operational Communications |  | X |  |  |  |

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

The PIO issued a holding statement within 10 minutes of the media call, but failed to correct a viral rumor about a cyber terror attack for 30 minutes. The first public statement was delayed because the PIO assumed IT would initiate contact, and no formal coordination process was followed.

**Strengths**

#### Strength 1: Holding statement issued quickly

The PIO issued a holding statement within 10 minutes of the media call, confirming a disruption and an ongoing investigation without speculating on the cause. This maintained factual accuracy and prevented premature escalation, as confirmed by the decision log and hot wash.

**Reference:** TIRP 1.4.5; TIRP 13.7; AEP 4.1

_Evidence: 1 decision; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: Delayed public correction of misinformation

The PIO did not issue a corrective statement on the viral rumor about a cyber terror attack until 30 minutes after it emerged. The delay occurred because the PIO assumed IT would confirm the nature of the failure before issuing any public statement, but no formal coordination protocol existed between the PIO and IT. This created a gap in messaging that allowed misinformation to spread, undermining public trust.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Establish a formal, pre-authorized process for public statements during cyber incidents, requiring the PIO and IT Director to confirm messaging alignment before any social media or press release is issued.

_Evidence: note on I-06b; 1 observation; 1 hot wash item_

#### Area for Improvement 2: No immediate public statement coordination

The PIO did not engage IT prior to issuing the first social media post, and IT did not initiate contact. This lack of a formal coordination mechanism caused a 30-minute delay in issuing a corrective statement. The absence of a defined communication pathway between the PIO and IT led to a failure in timely, accurate public information.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Define a mandatory, time-bound coordination process between the PIO and IT Director before any public statement is released during a cyber incident.

_Evidence: note on I-06b; 1 observation; 1 hot wash item_

### Operational Coordination

Objectives: Communication; Decision Making

Rating: _Rating pending_

Unified Command was not activated until 45 minutes after the first FIDS report, and only under pressure from the airline. The Incident Action Log was not opened until after the decision to 'Go Dark' was made, and the first coordination briefing excluded the ASC. These delays and omissions undermined command structure and accountability.

**Strengths**

#### Strength 1: Unified Command activated under pressure

The Ops Director eventually declared an incident and named the IT Director as technical lead, but only after the airline threatened to ground flights. This shows that the command structure was understood but not activated proactively, and the process relied on external pressure.

**Reference:** TIRP 13.2; AEP 4.1

_Evidence: note on I-08; 1 decision; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: Delayed activation of Unified Command

Unified Command was not established until 1:45, 45 minutes after the first FIDS report, and only after the airline threatened to ground flights. The TIRP 13.2 Command Structure requires activation upon incident declaration, but no one took the initiative to name the IC and technical lead until external pressure was applied.

**Reference:** TIRP 13.2; AEP 4.1

**Recommendation:** Ensure Unified Command is activated immediately upon incident declaration, without waiting for external pressure.

_Evidence: note on I-08; 1 observation; 1 hot wash item_

#### Area for Improvement 2: No Incident Action Log maintained in real time

The Incident Action Log was not opened until 2:00, after the first major decisions were made. Decisions made between 1:30 and 2:00 were recorded from memory, and the flight verification list was kept on a whiteboard, not in the log. This violates the TIRP 13.7 Checklist requirement to log all decisions in real time.

**Reference:** TIRP 13.7; AEP 4.1

**Recommendation:** Implement a real-time, digital Incident Action Log that is updated immediately after every decision.

_Evidence: note on I-08; 1 observation; 1 hot wash item_

### Situational Assessment

Objectives: Decision Making

Rating: _Rating pending_

The decision to 'Go Dark' was made 50 minutes after the first conflicting reports, and the PA was silenced only after 15 minutes of debate. The report of a nonexistent gate C4 was not caught for 8 minutes, and the impact assessment was delayed by unverified radio reports.

**Strengths**

#### Strength 1: Impact assessment used real-time feedback

The Airline Liaison provided real hold room information that corrected the bad data at Gate C4, and the ASC redirected police to the actual crowd location. This demonstrated effective use of real-time feedback from frontline responders to assess impact.

**Reference:** AEP 4.1; TIRP 1.4.5

_Evidence: note on I-11; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: Delayed 'Go Dark' decision and PA shutdown

The decision to shut down FIDS and PA was made 50 minutes after the first conflicting reports and 15 minutes after the PA announcement of a non-existent flight. The TIRP 13.7 Checklist requires immediate action upon receiving conflicting data, but no one owned the decision until the Ops Director made it at 1:30. This delay increased passenger confusion and safety risks.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Ensure the 'Go Dark' decision is made immediately upon receiving conflicting data, with a clear decision authority defined in the TIRP.

_Evidence: note on I-06; 1 observation; 1 hot wash item_

#### Area for Improvement 2: Unverified radio report led to wasted resources

The ASC sent police to Gate C4, which does not exist, because the radio report was not cross-checked against the gate list. The crowd was actually at B10, and the error was not caught for 8 minutes. This demonstrates a failure in situational awareness and verification, despite the availability of the gate list.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Implement a mandatory verification step for all radio reports involving physical locations.

_Evidence: note on I-11; 1 observation; 1 hot wash item_

### Cybersecurity

Objectives: Technical Analysis

Rating: _Rating pending_

The IT Director identified the root cause and isolated the server quickly, but the backup restore was delayed by 10 minutes because the tape library was not known to be unmounted. The alternate source was found only after a search, indicating poor familiarity with recovery procedures.

**Strengths**

#### Strength 1: Root cause identified and server isolated quickly

The IT Director identified the unauthorized admin access and the random_gate_generator.ps1 script in the AODB SQL logs within three minutes. The server was isolated within 10 minutes of being named, showing strong technical response capability.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

_Evidence: 2 observations; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: Delayed backup restore due to unknown fallback

The backup tape library was not mounted, and the alternate 04:00 copy was found only after 10 minutes of searching. The IT team did not know the alternate source existed, and no fallback procedure was practiced. This delayed system restoration and increased operational downtime.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Ensure all backup recovery procedures are tested and documented, with known alternate sources clearly marked.

_Evidence: note on I-14b; 1 observation; 1 hot wash item_

#### Area for Improvement 2: No verification of encryption and TLS protections

The TIRP 13.7 Checklist requires verification that AES-256 and TLS 1.2 protections were not bypassed during the attack, but this step was not performed. The absence of a verification process means the integrity of the restored system was not confirmed, leaving a potential gap in post-incident security.

**Reference:** TIRP 13.7; ASP D.3 Software Specifications; AEP 4.1

**Recommendation:** Include a mandatory verification of encryption and TLS protections in the post-incident recovery process.

_Evidence: 1 observation_

### Access Control and Identity Verification

Objectives: Technical Analysis

Rating: _Rating pending_

The IT Director traced the initial access to a phishing link and confirmed the compromised credential was used in the AODB, but the verification of encryption and TLS protections was not performed. The attack vector was identified, but the full scope of the compromise was not confirmed.

**Strengths**

#### Strength 1: Phishing attack vector traced to workstation

The IT Director traced the initial access to a phishing email on workstation OPS_INTERN_03, confirming the attack vector. This demonstrates effective use of logs and access control verification to identify the root cause.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

_Evidence: 2 observations; 1 hot wash item_

**Areas for Improvement**

#### Area for Improvement 1: No verification of encryption and TLS protections

The TIRP 13.7 Checklist requires verification that AES-256 and TLS 1.2 protections were not bypassed during the attack, but this step was not performed. The absence of a verification process means the integrity of the restored system was not confirmed, leaving a potential gap in post-incident security.

**Reference:** TIRP 13.7; ASP D.3 Software Specifications; AEP 4.1

**Recommendation:** Include a mandatory verification of encryption and TLS protections in the post-incident recovery process.

_Evidence: 1 observation_

### Operational Communications

Rating: _Rating pending_

The PA was silenced only after 15 minutes of debate, and the Crash Phone was never used. The LEO and TSA used the right channel, but unverified reports were sent, and no formal protocol was followed for emergency communications.

**Strengths**

#### Strength 1: Manual communications deployed after PA failure

After the PA was silenced, gate agents and officers used bullhorns and signs to direct passengers. This demonstrated effective adaptation to manual communication methods, as required by the TIRP 13.7 Checklist.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: PA shutdown delayed due to lack of decision authority

The PA was not silenced until 1:30, 15 minutes after the announcement of a non-existent flight. No one owned the decision to shut it down, and the debate lasted 15 minutes. This delayed the mitigation of misinformation and increased passenger confusion.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Define a clear, time-bound decision authority for PA shutdown and FIDS 'Go Dark' actions.

_Evidence: note on I-06; 1 observation; 1 hot wash item_

#### Area for Improvement 2: No use of emergency communication protocols

The Crash Phone and mass notification system were not used; reports came by personal phones and runners. The TIRP 13.7 Checklist requires use of the airport's emergency communication protocol, but no one mentioned it. This created a gap in reliable, traceable communication.

**Reference:** TIRP 13.7; ASP 3.2; AEP 4.1

**Recommendation:** Ensure all emergency communications use the airport's designated emergency protocols.

_Evidence: note on I-08; 1 observation; 1 hot wash item_
<!-- /section:findings -->

<!-- section:ip -->
## Appendix A: Improvement Plan

This Improvement Plan has been developed specifically for the exercising organization as a result of this exercise. A responsible organization in square brackets is the role the draft proposed; replace it with the organization and point of contact that own the action.

| Core Capability | Issue/Area for Improvement | Corrective Action | Capability Element | Primary Responsible Organization | Organization POC | Start Date | Completion Date |
|---|---|---|---|---|---|---|---|
| Public Information and Warning | Delayed public correction of misinformation | Add a mandatory pre-approval step for all public statements to the TIRP Section 13.7 Checklist. | Planning | [PIO] |  |  |  |
| Public Information and Warning | Delayed public correction of misinformation | Train the PIO and IT Director on a joint messaging protocol using the TIRP 13.7 Checklist. | Training | [PIO] |  |  |  |
| Public Information and Warning | No immediate public statement coordination | Include a 'PIO-IT Coordination Check' in the TIRP 13.7 Checklist before any public statement is issued. | Planning | [PIO] |  |  |  |
| Public Information and Warning | No immediate public statement coordination | Conduct a bi-annual tabletop exercise focused solely on public messaging coordination between PIO and IT. | Exercises | [PIO] |  |  |  |
| Operational Coordination | Delayed activation of Unified Command | Add a mandatory command activation step to the TIRP 13.7 Checklist, requiring the IC to name the IT Director and ASC within 15 minutes of declaring an incident. | Planning | [IC] |  |  |  |
| Operational Coordination | Delayed activation of Unified Command | Train the Ops Director and ASC on command activation procedures using the TIRP 13.2 Command Structure. | Training | [IC] |  |  |  |
| Operational Coordination | No Incident Action Log maintained in real time | Integrate the Incident Action Log into the EOC’s digital operations dashboard and require updates within 5 minutes of any decision. | Equipment | [IC] |  |  |  |
| Operational Coordination | No Incident Action Log maintained in real time | Assign a dedicated logkeeper role during incidents, trained on the TIRP 13.7 Checklist. | Organization | [IC] |  |  |  |
| Situational Assessment | Delayed 'Go Dark' decision and PA shutdown | Define a clear, time-bound decision rule for 'Go Dark' in TIRP 13.7, requiring the IC to decide within 10 minutes of receiving conflicting data. | Planning | [IC] |  |  |  |
| Situational Assessment | Delayed 'Go Dark' decision and PA shutdown | Include a 'Go Dark' decision timer in the EOC dashboard to trigger alerts if not acted on. | Equipment | [IC] |  |  |  |
| Situational Assessment | Unverified radio report led to wasted resources | Add a gate list verification step to the TIRP 13.7 Checklist for all location-based reports. | Planning | [ASC] |  |  |  |
| Situational Assessment | Unverified radio report led to wasted resources | Train the ASC and LEO on using the gate list to validate all location reports before action. | Training | [ASC] |  |  |  |
| Cybersecurity | Delayed backup restore due to unknown fallback | Add a backup recovery procedure checklist to the TIRP 13.7 Checklist, including alternate sources and known fallbacks. | Planning | [IT] |  |  |  |
| Cybersecurity | Delayed backup restore due to unknown fallback | Conduct a bi-annual drill on backup recovery using both tape and disk sources. | Exercises | [IT] |  |  |  |
| Cybersecurity | No verification of encryption and TLS protections | Add a 'Security Integrity Check' to the TIRP 13.7 Checklist, requiring verification of AES-256 and TLS 1.2 protections after system restoration. | Planning | [IT] |  |  |  |
| Cybersecurity | No verification of encryption and TLS protections | Train IT on forensic verification of encryption and TLS during cyber incident response. | Training | [IT] |  |  |  |
| Access Control and Identity Verification | No verification of encryption and TLS protections | Add a 'Security Integrity Check' to the TIRP 13.7 Checklist, requiring verification of AES-256 and TLS 1.2 protections after system restoration. | Planning | [IT] |  |  |  |
| Access Control and Identity Verification | No verification of encryption and TLS protections | Train IT on forensic verification of encryption and TLS during cyber incident response. | Training | [IT] |  |  |  |
| Operational Communications | PA shutdown delayed due to lack of decision authority | Add a 'PA Shutdown Authority' rule to the TIRP 13.7 Checklist, requiring the IC to decide within 5 minutes of a false PA announcement. | Planning | [IC] |  |  |  |
| Operational Communications | PA shutdown delayed due to lack of decision authority | Train the IC on making rapid, high-consequence decisions under pressure. | Training | [IC] |  |  |  |
| Operational Communications | No use of emergency communication protocols | Add a mandatory emergency protocol check to the TIRP 13.7 Checklist, requiring use of the Crash Phone or mass notification system. | Planning | [IC] |  |  |  |
| Operational Communications | No use of emergency communication protocols | Train all response personnel on the emergency communication protocol, including the Crash Phone. | Training | [IC] |  |  |  |
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

