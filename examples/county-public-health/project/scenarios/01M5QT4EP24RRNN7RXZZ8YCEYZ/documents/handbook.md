# Controller / Evaluator (C/E) Handbook
## Vaccine Vault Breach — Data Integrity & Public Trust

Exercise Date: [Date] · Location: Marston County Health Department, Ellery, Marston County, Kansas · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise simulating a cyber incident involving a ransomware compromise of Marston County Health Department's critical systems, including the ClinicTrack EHR, Epi fax server, and IIS export interface. The scenario centers on a data integrity breach where fake MMR vaccine doses were inserted into the state IIS export, leading to public misinformation, operational paralysis, and a crisis of trust. The exercise unfolds over four phases: (1) The Glitch (0:00–1:00), testing initial recognition of anomalies; (2) The Crisis (1:00–2:00), forcing a formal cyber incident declaration under pressure; (3) Manual Mode (2:00–3:00), evaluating paper-mode operations and system isolation decisions; and (4) Recovery & Verification (3:00–4:00), validating data integrity and restoring systems in sequence. Evaluators should watch for delays in declaring a cyber incident, failure to isolate compromised systems, missteps in paper record use, and gaps in coordination between IT, Epi, and PIO roles — especially around evidence preservation, public messaging, and legal compliance under K.S.A. 65-1902 (confidentiality of disease reports).

**Objectives:**
- **Data Integrity Verification:** Demonstrate the ability to verify the integrity of immunization data and identify falsified entries in the IIS export before releasing any public statement or restarting the system.
- **Communication Consistency:** Demonstrate the ability to synchronize public messaging across social media, press, and hotline staff to prevent misinformation, using approved HAN language and a unified narrative.
- **Paper Mode Continuity:** Demonstrate the ability to sustain critical functions—case investigation, contact tracing, and vaccine administration—in paper mode with complete documentation and double-checks, ensuring no loss of accountability.
- **System Restoration Coordination:** Demonstrate the ability to coordinate the stepwise restoration of systems under County IT's guidance, including data-integrity checks and verification of the IIS catch-up file before resuming automated data flows.

**Plan sections exercised:**
- Marston County Health Department… › Section 10
- Marston County Health Department… › Section 6
- Marston County Health Department… › Section 4
- Marston County Health Department… › Section 8
- Marston County Health Department… › Section 3
- Marston County Health Department… › Section 6
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- U-shape or island layout with four tables: Team A (Command), Team B (Surveillance and Investigation), Team C (Environmental Health), Team E (IT and Informatics), Team F (Communications), and a separate rear table for the Public Information Officer (PIO) to simulate isolation.
- Assign: Team A (Command) at front center, Team B (Epi) to the right, Team C (EH) to the left, Team E (IT) to the rear right, Team F (PIO) to the rear left.
- Isolate the PIO at the rear table to force physical movement for information access, simulating real-world communication delays and reinforcing the need for structured inter-team coordination.
- Equipment needs: Projector for injects, whiteboard for ICS-201, printed inject deck, optional simulated radios/phones for realism.
- Materials for players: Printed EOP, system inventory, contact list (Annex A), paper forms (MCHD-F-10, F-40), and the inject deck.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

You play the SimCell: all external parties, agencies, vendors, and stakeholders outside the MCHD team. If a player says 'I call the sheriff,' you respond as the county sheriff’s office. Do not make it easy — for example, if a player says 'We’ll call CISA,' respond with a delayed, non-urgent tone: 'We’ve received your request, but CISA’s intake queue is full. Please send a ticket to report.cisa.gov and reference your EOP ID.'

Managing Time: Use scripted time jumps. At 1:00, say: 'PAUSE EXERCISE. We are jumping forward 30 minutes. The problem has spread to the Epi team’s line list, the IIS export, and the fax server. The North District Clinic and POD 2 are operating in paper mode. The Epi team cannot validate case data. The public is receiving conflicting messages via social media and local news. The EOP is now at Level 2. The team must decide whether to activate paper mode and declare a cyber incident.' Then resume.

Handling artificialities: If a player says 'I wouldn’t use that system,' respond in character: 'That’s not a valid operational decision. The system is in use. We’re not changing the process now.'

Delivering injects: Say only: 'This just came in.' or 'This is on the main screen.' Never explain the context.

This is an exercise: If a player says 'I need to go to the real office,' say: 'REAL WORLD, REAL WORLD. This is an exercise. You are in the DOC. Stay engaged.'

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Cyber Task Force / FBI Kansas City Field Office (Cyber Division)** — _Trigger: Player calls FBI Kansas City Field Office (Cyber)_
  - Ask: "Do you have a copy of the SIEM alert (Bluestem SOC, Incident ID: CYB-DR-1) that shows the base64-encoded script 'auto_cleaner.py' was executed from a temporary path on MCHD-INT01? No? Then you cannot initiate a forensic handoff. Call me back when you have it."
  - Concede only when: Will accept a signed ticket from County IT, a copy of the Bluestem alert, and a formal request for joint investigation under 42 U.S.C. § 5195c.
- **Corvane Health (System Vendor)** — _Trigger: Player calls Corvane Health Support_
  - Ask: "Do you have the signed access request and ticket number from County IT for the jump host (MC-JUMP01) used to access MCHD-INT01? No? Then we cannot assist. Call me back when you have it."
  - Concede only when: Will provide a full log of all access to the MCHD-INT01 interface if the access request is signed and verified by County IT.
- **KDHE Emergency Operations Center (Epi-Aid)** — _Trigger: Player contacts KDHE Epi-Aid_
  - Ask: "Do you have the original IIS export file for 10-21, preserved in the immutable cloud backup and not altered? No? Then you cannot submit a catch-up file. Call me back when you have the original."
  - Concede only when: Will accept a signed verification form from MCHD and a copy of the forensic report from County IT before reactivating the state system.
- **Channel 7 News (Media Inquiry)** — _Trigger: Player contacts Channel 7 News_
  - Ask: "Do you have a CERC-approved statement to confirm or deny the IIS export alteration? No? Then you are not authorized to speak. Do not release anything until the Health Officer has signed off."
  - Concede only when: Will run a follow-up story only if the Health Officer issues a public statement and provides a signed verification form.
- **Brandt School District (Education Partner)** — _Trigger: Player contacts Brandt School District_
  - Ask: "Do you have a confirmed case from the Epi team, with lab result and contact tracing verification, to justify closing schools? No? Then you cannot justify a closure. Wait for Epi to confirm."
  - Concede only when: Will accept a signed verification from the Epi team and a copy of the forensic report before halting operations.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ **Fail:** Ops team delayed the stop-service decision until I-09 forced it, and failed to verify the IIS export file against paper records before approving system restoration. The Epi team continued using an unverified line list after I-11b, and the IC did not confirm isolation with County IT until I-16. ☐ **Pass:** Ops team declared a Cyber 1 incident after I-08, authorized network isolation via I-16, and confirmed forensic handover with County IT. The IC updated the DOC status board and coordinated all teams under unified command per EOP Section 3. ☐ **Excellence:** Ops team proactively declared a Cyber 1 incident after I-05b and I-08, isolated MCHD-INT01 and the IIS export interface before I-12, and confirmed forensic handover with County IT prior to any system restoration. The IC maintained real-time coordination via ICS 201 and the DOC status board. | I-05, I-08, I-08b, I-11, I-12, I-16, I-18 |
| **Metric 2: Technical Competence (30 Points)** | ☐ **Fail:** IT reset the controller after I-08b, destroying evidence and violating C3. The team failed to verify the IIS export file against paper records before approving restoration, and did not confirm the catch-up file was built before re-running the export job. ☐ **Pass:** IT verified the IIS export file against paper records using MCHD-F-62 and confirmed the catch-up file was built before re-running the export job. The team preserved forensic evidence by not resetting systems and followed C1 for restoration order. ☐ **Excellence:** IT proactively isolated MCHD-INT01 and the IIS export interface after I-05, preserved all logs and evidence, and verified the IIS export file against paper records using MCHD-F-62 before any restoration. The team confirmed the catch-up file was built and signed off on data integrity per C1 and C11. | I-05, I-08, I-08b, I-11, I-16, I-18, I-18b |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** PIO used unapproved language in the 'What's True' statement, failed to activate the call center script after I-05b, and released a statement to Channel 7 without Legal approval. The team did not synchronize messaging across social media and hotline staff. ☐ **Pass:** PIO activated the 'What's True' panel and call center script within 30 minutes of I-05b, used CERC-approved language from MCHD-F-10, and synchronized messaging across all channels. The team confirmed all public statements were approved by Legal and IC. ☐ **Excellence:** PIO proactively activated the 'What's True' panel and call center script before I-05b, used CERC-approved language from MCHD-F-10, and synchronized messaging across all channels before any public inquiry. The team prevented misinformation by issuing a unified statement before Channel 7's live report. | I-05b, I-07, I-07b, I-14, I-20b |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students did not cite Section 6 of the EOP when verifying data integrity, failed to reference C1 for system restoration order, and did not cite C5 for reporting obligations to KDHE and law enforcement. The team ignored C3 and C4 for roles and responsibilities. ☐ **Pass:** Students cited Section 6 of the EOP for data-integrity checks, referenced C1 for system restoration order, and cited C5 for reporting to KDHE and law enforcement. The team followed C3 and C4 for roles and responsibilities. ☐ **Excellence:** Students cited Section 6 of the EOP for data-integrity checks, referenced C1 for system restoration order, and cited C5 for reporting to KDHE and law enforcement. The team cited C3 for not resetting passwords and C4 for role assignments, and referenced C11 for verification authority. | — |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, write responses on the whiteboard to capture the group’s feedback in real time.

**Key Discussion Questions for Vaccine Vault Breach:**
- **Trust:** When did you first stop trusting the data from the IIS export or the Epi SharePoint site, and what specific clue triggered that loss of trust? How did your team decide to treat that data as compromised rather than as a temporary glitch? _(Objective: Data Integrity Verification)_
- **The Gap:** At I-12, you were forced to choose between isolating the Epi fax server and IIS export to stop corruption, or keeping them online to receive case reports. What made you decide to isolate them, and what would have made you keep them online despite the risk? How did you assess the trade-off between data integrity and operational continuity? _(Objective: System Restoration Coordination)_
- **The Call:** At I-13, the Epi team had to decide whether to vaccinate a child with no documented second dose. What information did you rely on to make that call, and how did you balance the need to act quickly with the risk of administering a dose based on incomplete or falsified records? What would have made you wait for verification instead of acting? _(Objective: Paper Mode Continuity)_
- **The Evidence:** The 'auto_cleaner.py' script was not signed, not in the approved software list, and executed before detection. When did you first treat that script as evidence of compromise, and how did that evidence shape your decisions to isolate systems or activate forensic review? _(Objective: Data Integrity Verification)_
- **The Narrative:** After the phishing attack on Jenna Fowler’s account led to the viral social media post, how did your team decide what to say publicly, and when? What would have let you release a coordinated message sooner, and how did you ensure that hotline, press, and social media teams used the same language? _(Objective: Communication Consistency)_
<!-- /section:hotwash -->



*End of Handbook*

