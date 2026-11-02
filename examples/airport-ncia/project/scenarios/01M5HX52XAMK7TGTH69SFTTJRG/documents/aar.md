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
| **Point of Contact** | Exercise Director, Office of Emergency Management, North Coast Regional Airport Authority, exercises@ncraa.example |

Evidence: facilitator notes, hot wash items and decision log; evaluator observations. Not recorded: the live-play session log; participant feedback surveys.
<!-- /section:overview -->

<!-- section:summary -->
## Executive Summary

The exercise tested the airport's response to a cyber incident that compromised the Flight Information Display System (FIDS), Baggage Handling System (BHS), and Public Address (PA) system, leading to misinformation, passenger confusion, and safety risks. The plans demonstrated strengths in technical root cause identification, the use of a single-screen test before full system restoration, and a factual holding statement to media. However, the response was delayed in key areas: Unified Command was not activated until under pressure from airlines, the PA was not silenced promptly, and the Incident Action Log was not maintained in real time. The failure to verify gate data against the official list led to a wasted police deployment to a non-existent gate. These issues point to systemic gaps in command structure, communication protocols, and backup system awareness. The most critical changes involve establishing command early, enforcing real-time documentation, and validating all data inputs against official sources.
<!-- /section:summary -->

<!-- section:ratings -->
## Analysis of Core Capabilities

Aligning exercise objectives and core capabilities provides a consistent taxonomy for evaluation that transcends individual exercises to support preparedness reporting and trend analysis. The table below lists each objective and the core capability it exercised, with the rating the exercising organization confirmed.

| Objective | Core Capability | P | S | M | U | Status |
|---|---|---|---|---|---|---|
| Communication | Public Information and Warning |  |  | X |  | Performed with Major Challenges (M) |
| Communication | Operational Coordination |  |  | X |  | Performed with Major Challenges (M) |
| Decision Making | Operational Coordination |  |  | X |  | Performed with Major Challenges (M) |
| Decision Making | Situational Assessment |  | X |  |  | Performed with Some Challenges (S) |
| Technical Analysis | Cybersecurity |  | X |  |  | Performed with Some Challenges (S) |
| Technical Analysis | Access Control and Identity Verification |  | X |  |  | Performed with Some Challenges (S) |
| — | Operational Communications |  | X |  |  | Performed with Some Challenges (S) |

Ratings Definitions:

- **Performed without Challenges (P):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws.
- **Performed with Some Challenges (S):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s) and did not negatively impact the performance of other activities. Performance of this activity did not contribute to additional health and/or safety risks for the public or for emergency workers, and it was conducted in accordance with applicable plans, policies, procedures, regulations, and laws. However, opportunities to enhance effectiveness and/or efficiency were identified.
- **Performed with Major Challenges (M):** The targets and critical tasks associated with the core capability were completed in a manner that achieved the objective(s), but some or all of the following were observed: demonstrated performance had a negative impact on the performance of other activities; contributed to additional health and/or safety risks for the public or for emergency workers; and/or was not conducted in accordance with applicable plans, policies, procedures, regulations, and laws.
- **Unable to be Performed (U):** The targets and critical tasks associated with the core capability were not performed in a manner that achieved the objective(s).
<!-- /section:ratings -->

<!-- section:findings -->
### Public Information and Warning

Objectives: Communication

Rating: **Performed with Major Challenges (M)**

The capability was performed with some challenges. The PIO issued a holding statement within 10 minutes of the media call, which was timely and factual, but failed to issue a correction within 15 minutes of the PA announcement about Flight 666 to Purgatory. The first social media post on the cyberattack rumor was delayed by 30 minutes and did not address the misinformation. Coordination with IT was not established before the first post, and the PIO waited for IT to initiate contact.

**Strengths**

#### Strength 1: Media Holding Statement

The PIO issued a holding statement to Channel 5 News within 10 minutes of the call, confirming a disruption and an ongoing investigation without speculating on the cause. The statement was reviewed by the Ops Director and IT Director, ensuring factual accuracy and consistency with the airport's public messaging policy. This prevented premature speculation and maintained credibility.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Delayed Public Correction After PA Announcement

The PA announcement of Flight 666 to Purgatory created a false sense of threat. No public statement was issued within 15 minutes of the announcement to clarify that the flight was not real and that there was no physical threat. The first public post was issued at 1:50, 35 minutes after the announcement, and only acknowledged display problems without addressing the false flight. This delay allowed misinformation to spread and undermined public trust.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

**Recommendation:** The PIO must issue a public statement within 15 minutes of any PA or FIDS announcement that contains potentially misleading or false information, regardless of IT confirmation.

_Evidence: 2 observations; 1 log entry_

#### Area for Improvement 2: Uncoordinated Public Messaging with IT

The PIO did not coordinate with the IT Director before issuing the first social media post. The PIO assumed IT would notify them, but IT did not initiate contact. This gap in communication led to a delayed and incomplete public statement. The PIO should not wait for IT to confirm the nature of the failure before issuing a public statement, especially when misinformation is spreading.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

**Recommendation:** The PIO must initiate public messaging within 10 minutes of any public misinformation event, even if IT has not confirmed the cause.

_Evidence: 1 observation; 1 log entry_

### Operational Coordination

Objectives: Communication; Decision Making

Rating: **Performed with Major Challenges (M)**

The capability was performed with some challenges. Unified Command was not activated until 1:45, 45 minutes after the first FIDS report, and only after airline pressure. The Incident Action Log was not opened until 2:00, and decisions made before that were recorded from memory. A daily coordination briefing was not established until 2:20, and the ASC was not invited to the first meeting.

**Strengths**

#### Strength 1: Flights verified by hand before the restart

Ops and the Airline Liaison split the flights by airline and verified each one by hand before it was published again. The list was kept on a whiteboard rather than in the Incident Action Log, but the split kept the restart from putting bad data back on the screens.

**Reference:** AEP 4.2; TIRP 13.2; AEP 4.1

_Evidence: note on I-15; 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Delayed Unified Command Activation

The Unified Command was not activated until 1:45, 45 minutes after the first FIDS report, and only after the airline threatened to ground flights. The Ops Director did not declare an incident or name the IT Director as technical lead until under pressure. This delay prevented a unified response and allowed confusion to spread.

**Reference:** AEP 4.2; TIRP 13.2; AEP 4.1

**Recommendation:** The Ops Director must activate Unified Command within 15 minutes of the first report of a system-wide failure, even if the cause is not confirmed.

_Evidence: 1 observation; 1 log entry_

#### Area for Improvement 2: Failure to Maintain Incident Action Log in Real Time

The Incident Action Log was not opened until 2:00, and decisions made before that were recorded from memory. The flight verification list was kept on a whiteboard, not in the log. This violated the TIRP 13.7 Checklist requirement to log all decisions in real time. The lack of a real-time log made it difficult to track accountability and decision rationale.

**Reference:** AEP 4.2; TIRP 13.2; AEP 4.1

**Recommendation:** All decisions must be logged in the Incident Action Log as they are made, not after the fact.

_Evidence: 1 observation_

### Situational Assessment

Objectives: Decision Making

Rating: **Performed with Some Challenges (S)**

The capability was performed with some challenges. The Go Dark decision was made at 2:05, 50 minutes after the first conflicting reports, and the PA was silenced only after 15 minutes of debate. The gate C4 report was not verified against the official gate list, leading to a wasted police deployment. The impact assessment was delayed and incomplete.

**Strengths**

#### Strength 1: Life Safety Prioritization

The Ops Director explicitly stated that passenger safety outranked flight schedules when ordering the FIDS and PA shutdown. This confirmed that the decision to 'Go Dark' was based on a risk assessment that prioritized life safety over operational continuity, as required by AEP 4.1.

**Reference:** AEP 4.2; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Delayed 'Go Dark' Decision

The decision to shut down FIDS and PA systems was made at 2:05, 50 minutes after the first conflicting data from TSA and the airline. The PA was not silenced until 1:30, after 15 minutes of debate, and no one owned the decision. This delay allowed misinformation to spread and increased the risk of crowd incidents.

**Reference:** AEP 4.2; AEP 4.1

**Recommendation:** The Ops Director must make the 'Go Dark' decision within 20 minutes of the first conflicting report, with no debate allowed.

_Evidence: 1 observation; 1 log entry_

#### Area for Improvement 2: Failure to Verify Gate Data

The ASC reported a crowd at Gate C4, but no one checked whether C4 existed. The gate was not on the official list, and the report was not verified before police were dispatched. This resulted in a wasted deployment and 8 minutes of lost time. The impact assessment was incomplete because the false gate was not caught.

**Reference:** AEP 4.2; AEP 4.1

**Recommendation:** All reports involving physical locations must be cross-checked against the official gate list before action is taken.

_Evidence: 1 observation; 1 hot wash item_

### Cybersecurity

Objectives: Technical Analysis

Rating: **Performed with Some Challenges (S)**

The capability was performed with some challenges. The IT Director identified the unauthorized admin access and the script in the AODB logs within minutes, but the server isolation was delayed by 10 minutes due to a change approval debate. The backup tape library was not known to be unmounted, and a second copy was found only after 10 minutes of searching.

**Strengths**

#### Strength 1: Rapid Root Cause Identification

The IT Director identified the unauthorized admin access and the random_gate_generator.ps1 script in the AODB SQL logs within three minutes of the first technical report. This demonstrated strong technical analysis and adherence to the TIRP 13.7 Checklist.

**Reference:** AEP 4.2; ASP 3.2; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Delayed Server Isolation

The compromised server (NCIA-SEC-DB01) was identified at 2:00 but not isolated until 2:10, due to a debate on change approval. This delay allowed the attack to continue for 10 minutes and increased the risk of further compromise.

**Reference:** AEP 4.2; ASP 3.2; AEP 4.1

**Recommendation:** The IT Director must have the authority to isolate a compromised server immediately, without waiting for change approval.

_Evidence: 1 observation; 1 log entry_

#### Area for Improvement 2: Unreliable Backup Source Awareness

The backup tape library was not mounted, and no one knew there was a second copy on disk. The IT team spent 10 minutes searching for a source that was not in the primary location. This delayed the AODB restoration and violated the TIRP 13.7 Checklist requirement to use an alternate source.

**Reference:** AEP 4.2; ASP 3.2; AEP 4.1

**Recommendation:** All backup sources must be known and tested regularly to ensure they are accessible during an incident.

_Evidence: 1 observation; 1 hot wash item; 1 log entry_

### Access Control and Identity Verification

Objectives: Technical Analysis

Rating: **Performed with Some Challenges (S)**

The capability was performed with some challenges. The IT Director traced the initial access to a phishing link on workstation OPS_INTERN_03 and confirmed the credential was used to access the AODB. However, the database encryption and TLS protections were not verified, and the 5% badge loss threshold was not checked.

**Strengths**

#### Strength 1: Phishing Link Tracing

The IT Director traced the initial access point to a phishing email on workstation OPS_INTERN_03 within minutes of the report. This confirmed the attack vector and supported the access control and identity verification process as required by ASP Section 3.2.

**Reference:** AEP 4.2; ASP 3.2; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Unverified Encryption and TLS Protections

The IT Director did not verify whether the database encryption (AES-256) or TLS 1.2 protections were bypassed during the attack. This is a critical part of the access control and identity verification process, as required by ASP D.3 Software Specifications. The lack of verification means the root cause was not fully confirmed.

**Reference:** AEP 4.2; ASP D.3 Software Specifications; AEP 4.1

**Recommendation:** The IT Director must verify that encryption and TLS protections were not bypassed during a cyber incident.

_Evidence: 1 observation; 1 log entry_

### Operational Communications

Rating: **Performed with Some Challenges (S)**

The capability was performed with some challenges. The PA was silenced only after 15 minutes of debate, and the use of bullhorns and whiteboards was not coordinated. The Crash Phone and mass notification system were not used, and police and TSA used the right channel but did not verify gate data.

**Strengths**

#### Strength 1: Manual Communication Deployment

After the PA was silenced, gate agents and officers used bullhorns and signs to direct passengers. This demonstrated effective use of manual communications as a fallback, as required by the TIRP 13.7 Checklist.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

_Evidence: 1 observation_

**Areas for Improvement**

#### Area for Improvement 1: Delayed PA Silencing and Lack of Ownership

The PA announcement of Flight 666 to Purgatory was not silenced until 1:30, 15 minutes after the announcement. No one owned the decision, and the debate lasted 15 minutes. This allowed misinformation to spread and increased the risk of panic.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

**Recommendation:** The Ops Director must own the decision to silence the PA immediately upon receiving a false announcement.

_Evidence: 1 observation; 1 hot wash item; 1 log entry_

#### Area for Improvement 2: Failure to Use Emergency Communication Protocols

The Crash Phone and mass notification system were not used during the incident. Reports came by personal phones and runners, which is not compliant with the AEP Section 4.1 emergency communication protocol. This created a risk of miscommunication and delayed information flow.

**Reference:** AEP 4.2; TIRP 1.4.5; AEP 4.1

**Recommendation:** All response personnel must use the airport's emergency communication protocol (e.g., 'Crash Phone' or mass notification system) during incidents.

_Evidence: 1 observation; 1 log entry_
<!-- /section:findings -->

<!-- section:ip -->
## Appendix A: Improvement Plan

This Improvement Plan has been developed specifically for the exercising organization as a result of this exercise. A responsible organization in square brackets is the role the draft proposed; replace it with the organization and point of contact that own the action.

| Core Capability | Issue/Area for Improvement | Corrective Action | Capability Element | Primary Responsible Organization | Organization POC | Start Date | Completion Date |
|---|---|---|---|---|---|---|---|
| Public Information and Warning | Delayed Public Correction After PA Announcement | Add a mandatory 15-minute public statement trigger to the TIRP 13.7 Checklist for any PA or FIDS announcement involving passenger movement or flight status. | Planning | [PIO] |  |  |  |
| Public Information and Warning | Delayed Public Correction After PA Announcement | Train the PIO and IT Director on joint decision-making for public statements during cyber incidents, using a pre-approved script framework for false announcement scenarios. | Training | [PIO] |  |  |  |
| Public Information and Warning | Uncoordinated Public Messaging with IT | Include a 'Public Statement Initiation' step in the TIRP 13.7 Checklist that triggers the PIO to draft and release a holding statement within 10 minutes of a false announcement. | Planning | [PIO] |  |  |  |
| Public Information and Warning | Uncoordinated Public Messaging with IT | Conduct a biannual tabletop exercise focused on public messaging during cyber incidents, with the PIO and IT Director as co-owners of the communication process. | Exercises | [PIO] |  |  |  |
| Operational Coordination | Delayed Unified Command Activation | Amend the TIRP 13.2 Command Structure to include a mandatory 15-minute activation window for Unified Command after the first report of a system-wide failure. | Planning | [IC] |  |  |  |
| Operational Coordination | Delayed Unified Command Activation | Train the Ops Director on early command activation using a decision tree that triggers Unified Command at the first sign of a cascading failure. | Training | [IC] |  |  |  |
| Operational Coordination | Failure to Maintain Incident Action Log in Real Time | Add a real-time log entry requirement to the TIRP 13.7 Checklist, with a mandatory 5-minute window for log entry after any decision. | Planning | [IC] |  |  |  |
| Operational Coordination | Failure to Maintain Incident Action Log in Real Time | Assign a dedicated logkeeper role during incidents, with training on the TIRP 13.7 Checklist and log maintenance. | Organization | [IC] |  |  |  |
| Situational Assessment | Delayed 'Go Dark' Decision | Establish a 20-minute decision window for 'Go Dark' in the TIRP 13.6 Scenario C: FIDS / BHS System Failure. | Planning | [IC] |  |  |  |
| Situational Assessment | Delayed 'Go Dark' Decision | Train the Ops Director on rapid decision-making under uncertainty using a pre-defined decision matrix for system failures. | Training | [IC] |  |  |  |
| Situational Assessment | Failure to Verify Gate Data | Add a gate verification step to the TIRP 13.7 Checklist: 'Before any action, verify the location against the official gate list.' | Planning | [ASC] |  |  |  |
| Situational Assessment | Failure to Verify Gate Data | Train the ASC and LEO on using the official gate list during incidents, with a daily practice drill. | Training | [ASC] |  |  |  |
| Cybersecurity | Delayed Server Isolation | Amend the ASP Section 3.2 System Architecture to grant the IT Director emergency authority to isolate any server without change approval. | Planning | [IT] |  |  |  |
| Cybersecurity | Delayed Server Isolation | Train the IT Director on emergency isolation procedures and the legal authority under 49 CFR Part 1542. | Training | [IT] |  |  |  |
| Cybersecurity | Unreliable Backup Source Awareness | Create a backup source map and conduct a quarterly drill to verify all backup sources, including offsite and alternate media. | Exercises | [IT] |  |  |  |
| Cybersecurity | Unreliable Backup Source Awareness | Add a backup source verification step to the TIRP 13.7 Checklist before any restoration attempt. | Planning | [IT] |  |  |  |
| Access Control and Identity Verification | Unverified Encryption and TLS Protections | Add a verification step to the TIRP 13.7 Checklist: 'Confirm that AES-256 and TLS 1.2 protections were not bypassed during the attack.' | Planning | [IT] |  |  |  |
| Access Control and Identity Verification | Unverified Encryption and TLS Protections | Train the IT Director on digital forensics to identify signs of encryption bypass, using the CSIRP as a reference. | Training | [IT] |  |  |  |
| Operational Communications | Delayed PA Silencing and Lack of Ownership | Add a mandatory 5-minute window for PA silencing in the TIRP 13.7 Checklist, with a clear owner. | Planning | [IC] |  |  |  |
| Operational Communications | Delayed PA Silencing and Lack of Ownership | Train the Ops Director on immediate PA silencing under false announcement scenarios. | Training | [IC] |  |  |  |
| Operational Communications | Failure to Use Emergency Communication Protocols | Add a mandatory use of the Crash Phone or mass notification system to the TIRP 13.7 Checklist. | Planning | [IC] |  |  |  |
| Operational Communications | Failure to Use Emergency Communication Protocols | Conduct a biannual drill to test the Crash Phone and mass notification system, with a focus on rapid deployment. | Exercises | [IC] |  |  |  |
<!-- /section:ip -->

<!-- section:participants -->
## Appendix B: Exercise Participants

- North Coast Regional Airport Authority: Airport Operations
- North Coast Regional Airport Authority: IT and Cybersecurity
- North Coast Regional Airport Authority: Public Information
- North Coast Regional Airport Authority: Public Safety (Airport Security Coordinator)
- Airline tenants of North Coast International Airport (Airline Liaison)
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

