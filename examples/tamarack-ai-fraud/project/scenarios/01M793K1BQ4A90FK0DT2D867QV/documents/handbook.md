# Controller / Evaluator (C/E) Handbook
## Escrow Echo — Deepfaked Executives, Wires & Public Trust

Exercise Date: [Date] · Location: Tamarack Precision Components, Inc., Greenville, South Carolina · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) for Tamarack Precision Components, Inc. It runs for 4 hours of room time. The scenario clock covers Tuesday, September 14, 2027, from 09:30 to 17:15 Eastern and moves forward with time-jump cards. Nobody touches live systems. Players talk through decisions, assign owners and draft the products they would produce for real: a hold, a written recall, a notice, a holding statement and a signed reconciliation. Six teams take part: Treasury Manager, Controller, CFO, CISO, General Counsel and Communications. You run the room and play every outside party as the SimCell.

The injects simulate a **cyber incident**: executive-impersonation wire fraud using synthetic media. An external calendar invitation leads to a video meeting where a deepfaked "CFO" and "General Counsel" instruct the Treasury Analyst. A lookalike chat account then pressures the Controller. Four international wires totaling $2,640,000 follow, and three of them are released. Later, a second synthetic clip of the "CEO" announcing Spartanburg layoffs spreads on Clipwave just before a 17:00 media deadline.

The exercise runs in four phases:
- **Phase 1, The Escrow Meeting (0:00–1:00, scenario 09:30–10:30):** tests whether the off-pattern instruction is verified under TEIVES 2 and TPC-FIN-04 2.
- **Phase 2, Four Wires Deep (1:00–2:00, scenario jumps to 13:50):** tests whether players recognise the evidence and get the incident declared under TPC-SEC-02.
- **Phase 3, Recall and Freeze (2:00–3:00, scenario from 14:18):** covers the First Meridian recall, evidence preservation and the decision on suspending the payment queue.
- **Phase 4, Second Deepfake, Signed Figures (3:00–4:00, scenario from 16:15):** covers the public clip, the media deadline and agreeing on one signed set of figures.

Evaluators should watch for these behaviours:
- **Callbacks:** players call back on the Tamarack directory number, never the number in the request.
- **Approvals and token:** nobody accepts "approved on video" as an approval, and players notice that the release-desk token WS-TKN-2291 was used for the executive approval.
- **Evidence and recall:** players preserve the recording before the organizer deletes it at 14:24, and they make the written recall within the bank's 30-minute window.
- **Detector score:** players treat the SynthCheck 0.71 as one input, with its error rates, and not as proof.
- **AI system decision:** players keep the Poznań vision-model decision (TPC-SEC-02 6) separate from the fraud.
- **Communications:** they message employees before or alongside the public statement, and every external figure matches the Controller's signed reconciliation.

**Objectives:**
- **Payment Control Decision Making:** Demonstrate the ability to apply the TPC-FIN-04 Section 3 callback rule under executive pressure by holding the fourth pending international wire in the Treasury Workstation, refusing to treat the video 'CFO' or a lookalike chat message as verification, and calling the absent CFO and Treasury Manager only on directory numbers.
- **Fraud Recovery:** Demonstrate the ability to get a complete written recall-and-freeze request (originating bank, amount, date, beneficiary account, reason) to the bank fraud desk within 30 minutes of the 14:20 call, and to track the FBI IC3, insurer and Audit Committee chair clocks against the Controller's signed reconciliation.
- **Use of Doctrine and Evidence:** Demonstrate the ability to declare and run a combined fraud and AI incident under TPC-SEC-02 Sections 2 and 3, preserving the meeting recording, external calendar invitation, chat and Workstation audit log, and presenting the SynthCheck 0.71 score with its 6 percent false positive and 11 percent false negative rates and the absent Content Credentials as one piece of evidence, not proof.
- **Public Communication:** Demonstrate the ability to issue a General Counsel-approved holding statement on the synthetic 'CEO' acquisition-and-layoffs clip before the Greenville reporter's 17:00 deadline, send a platform takedown request, and message Spartanburg employees no later than the public statement, using only figures signed by the Controller.

**Plan sections exercised:**
- TPC-FIN-04: Payment Authorizatio… › 2. Who may initiate, approve and release
- TEIVES › 3. Executives' own safeguards
- TPC-FIN-04: Payment Authorizatio… › 5. If a payment is suspected to be fraudulent
- TPC-SEC-02: AI and Synthetic Med… › 2. Definition of an AI incident
- TPC-SEC-02: AI and Synthetic Med… › 6. AI system incidents
- TEIVES › 6. Media
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- Set the room as **islands** that simulate the incident response room. Put the six team tables in a loose horseshoe facing the main screen.
- **Front left, Team A (Treasury Manager)** and **Team B (Controller)** sit side by side. They share the Workstation queue and the approval chain, and they should feel the pressure on separation of duties.
- **Front right, Team C (CFO)** sits slightly apart from Finance. The CFO is "in the air" until scenario 13:55, so they get no injects and no contact until I-10.
- **Centre, Team D (CISO, Incident Commander)** sits beside **Team E (General Counsel)**. Evidence, legal hold, IC3 and the insurer notice pass between them all the time.
- **Rear table, Team F (Director of Corporate Communications)** sits alone near the door. They must walk to the other tables to get facts, approvals and figures. This copies real life: the public-information role is always a step behind the technical teams. It also tests whether Treasury and Legal push the signed figures to Comms or let Comms guess before the 17:00 deadline.
- **SimCell / Controller table** sits at the side wall with a view of every table, the phone props and the inject deck. Evaluators sit behind or beside the teams they are assigned to, not at the tables.
- Put a wall clock or slide showing the **scenario time** next to the room time.

**Equipment needs**
- A projector and screen for main-screen injects: time-jump cards, the Workstation queue, the Clipwave post, and the view counts as they update.
- A whiteboard or flip chart for the ICS-201-style incident briefing: situation, objectives, actions, organization and resources. A second board holds the running wire table (requested / released / stopped / frozen).
- A printed inject deck in MSEL order, with one copy per addressed team and the synthetic-media items carrying their "EXERCISE MATERIAL – SYNTHETIC MEDIA DESCRIBED, NOT PLAYED" banner and transcript.
- Optional simulated phones or radios, so players must "call" the SimCell and wait on hold.
- Sticky notes or a timer for the bank's 30-minute recall window and the 17:00 media deadline.

**Materials for players:** TEIVES 2 and 6 extracts, TPC-SEC-02 sections 1, 3 and 6, the TPC-FIN-04 2 approval table, the TCSP 6 and 7 extracts, the Tamarack directory sheet, a blank recall form, a blank holding-statement template, and name tents.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**Your role as SimCell**
You play everyone else in the world. If a student says "I call the sheriff," you answer as the deputy. In this exercise that means you play:
- the Treasury Analyst, the SOC analysts and the security duty officer
- the real CFO once he lands
- the First Meridian fraud desk
- the FBI Charleston field office duty agent
- LedgerGate support and the meeting-platform vendor
- Clipwave trust and safety
- the insurance broker
- reporters, the Spartanburg shift lead and the Querétaro counterparty

Answer only what was asked, in that character's voice and interest. If nobody calls a party, that party does not act.

**Do not make it easy**
Every outside party has its own process and its own interest. Make players earn each result. For example, when Treasury phones First Meridian (I-13), do not say "OK, we'll pull the money back." The fraud analyst logs a *verbal* request only and demands:
- a written recall on the portal by 14:50, with each wire listed separately
- notice that wire 2 went to a different account through an intermediary, so it needs its own recall
- the IC3 number and a signed indemnity form

If the team cannot give the confirmation numbers, say: "I can't send anything to the correspondent without them. Call me back." Likewise, if the Controller wants to call "the CFO" back on the Mexican number in I-10, let them. Note it for the evaluators: that is not the directory number.

**Managing time**
Read time-jump cards (I-07, I-12, I-18) aloud from the main screen. Script:
> "PAUSE EXERCISE. Pens down. We are jumping forward. The room clock reads 10:30; the scenario clock is now 13:50 Eastern. Here is what happened while you were away… [read card]. Take two minutes to read it at your tables. RESUME."

Use the same form for each jump. If a team is mid-decision, give them one sentence to finish, then jump. Unfinished actions did not happen unless the card says so. If discussion stalls, say: "The clock is moving. The international cutoff is in 42 minutes. What is your decision?"

**Handling artificialities**
When a student says "I wouldn't use that system" or "We'd never let a shared token approve that," reply:
> "Understood, and note that for the hot wash. For today, the system and the configuration are as written. Work the problem with what you have."

Record the point on the evaluator log. It is often a real finding, for example on the shared token WS-TKN-2291.

**Delivering injects**
Hand over or project the inject and do not explain it. Say "This just came in." or "This is on the main screen." Do not hint that something is a red herring (I-03, I-08, I-21) or a clue (I-09, I-14). If players ask "Is this real?", answer as the character would. A detector score is only a score. Never tell players the video is fake because SynthCheck or a hobbyist tool said so.

**Exercise conventions**
- Every call, email and document a player creates starts and ends with **"This is an exercise."** Synthetic-media items are described in text and transcripts only. Nothing is played, and no real person is imitated.
- If a real-world emergency or real incident happens, anyone calls **"REAL WORLD, REAL WORLD"**. Play stops at once. It resumes only when the Lead Controller says "RESUME EXERCISE."

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **FBI Charleston field office duty agent (also handling the IC3 referral and the Financial Fraud Kill Chain request)** — _Trigger: General Counsel or the CISO calls the FBI field office or says they are filing the IC3 complaint (expected after I-13 or I-17; the field office calls back at 16:02 per I-18)._
  - Ask: "Do you have an IC3 complaint number? No? File it first and call me back with the number. I can't put a wire into the Kill Chain without it."
  - Ask: "Give me each wire separately: originating bank, amount, value date, beneficiary bank, SWIFT, account number and your bank's confirmation number. Which of these left your account in the last few hours? The older ones are probably gone."
  - Ask: "Have you preserved the meeting recording, the invite and the chat, with hashes? The organizer deleted the original at 14:24. Do you have your own copy, or is it gone?"
  - Ask: "The money went to Mexico and on to a third country. Who at your bank is my contact, and is a fraud case already open there?"
  - Concede only when: With the IC3 number and complete wire 2 details, will submit the onward transfer to the Fraud Kill Chain for review. No promise of recovery.
  - Concede only when: Will give a case contact and agent name the beneficiary bank can use for its law-enforcement contact by tomorrow morning.
  - Concede only when: Will accept the preserved, hashed evidence and a written timeline. The company may say only "we have reported the matter to the FBI" (TEIVES 6). The Bureau will not confirm or comment publicly.
- **LedgerGate Treasury Systems support (EXERCISE VENDOR), Treasury Workstation provider** — _Trigger: The CISO or Treasury contacts LedgerGate for the server-side audit log, token details or help disabling WS-TKN-2291 (after I-15 or I-20)._
  - Ask: "What's your ticket number? This has to be opened by a registered administrator on your account. A phone call from the CISO isn't a ticket."
  - Ask: "Has an authorized officer of Tamarack signed our Data Access Request form? Without it I can't release token serials or source IPs, whatever the reason."
  - Ask: "To be clear, WS-TKN-2291 is a shared token your team set up. Our platform authenticated what it was given. Are you saying the product failed, or that your configuration allowed it?"
  - Ask: "Who is authorized to tell us to revoke a token mid-day? I need that request in writing from a registered admin."
  - Concede only when: Once a registered admin opens a ticket, will put a preservation hold on the server-side logs immediately.
  - Concede only when: Once the signed Data Access Request arrives, will deliver the full export (approvals, token IDs, source IPs for September 14 and the prior 30 days) within 24 hours.
  - Concede only when: On a written admin request, will disable WS-TKN-2291 and walk the admin through checking per-user token binding.
- **First Meridian Commercial Bank, Treasury Services fraud desk (case FM-FRD-270914-0031)** — _Trigger: Treasury or the Controller calls the First Meridian fraud line to recall or freeze the released wires (I-13), or asks to restart outgoing payments (I-20)._
  - Ask: "I've logged a verbal request. Where's the written recall on the portal? You have until 14:50. One entry per wire, with confirmation numbers."
  - Ask: "Wire 2 went to a different account through an intermediary. Did you file that one separately? If not, it isn't moving."
  - Ask: "Are you an authorized signer on this account? I'm calling you back on the number we have on file before I act on this."
  - Ask: "Before we lift enhanced review on your outgoing payments, can you confirm in writing that your Workstation credentials are secure? Is that shared token still live?"
  - Concede only when: Once the written recall for each wire is on the portal, will send it through the correspondent chain the same day. It is a request the beneficiary bank decides on, not a reversal.
  - Concede only when: Once the IC3 number and the signed indemnity form arrive, will pass them to the beneficiary bank to support the freeze on the $620,000.
  - Concede only when: Will keep enhanced review on outgoing payments and release individual urgent payments, such as the MXN supplier runs, after a callback to a registered Tamarack signer.
- **Business desk reporter, Greenville Commerce Journal (fictional outlet)** — _Trigger: Communications or anyone at Tamarack replies to the 16:24 email or calls the reporter (I-19b), or the reporter calls Comms at about 16:40 when there is no reply._
  - Ask: "I file at 17:00 for the evening business update. Is the CEO video authentic, yes or no? On the record."
  - Ask: "A hobbyist detector says 94 percent authentic. Why should my readers believe you over that?"
  - Ask: "Are Spartanburg jobs being cut, and is there a Querétaro deal? Your employees are posting that they're walking off the line."
  - Ask: "My source says $2.6 million was lost and the FBI is taking over. Is that the number? If you won't give me one, I'll go with what I have."
  - Concede only when: If given an on-the-record statement before 17:00, will run Tamarack's denial and attribute it, and will hold the evening update ten minutes for it.
  - Concede only when: If the spokesperson states the terms first, will accept background guidance on the loss figure and use only a figure Tamarack confirms on the record.
  - Concede only when: Will include "the company said it has reported the matter to the FBI" in place of the source's "taking over" wording if Tamarack says so on the record.
- **Clipwave trust and safety team (EXERCISE PLATFORM)** — _Trigger: Communications or the CISO submits a takedown or impersonation report for clipwave.example/v/8Hq2tTmrk (I-19, I-21)._
  - Ask: "Your ticket CW-TS-5520187 is flagged as possible parody. Are you the depicted person or an authorized representative? We need a statement from one of them."
  - Ask: "Do you have the original or authentic source, or evidence the CEO was somewhere else at 16:20? A detector score on its own doesn't meet our impersonation standard."
  - Ask: "Is this also a law-enforcement matter? We release uploader data only under legal process, not because a company emails us."
  - Ask: "Is there a specific false claim of fact here that's causing harm, such as people leaving work? Show me what you see on your side."
  - Concede only when: With a signed statement from the CEO or authorized counsel and the alibi details, will move the ticket to priority impersonation review rather than the typical 24 to 72 hours.
  - Concede only when: Will add an interim context label ("disputed – under review") while the review runs.
  - Concede only when: Will preserve uploader account data for law enforcement when it receives a preservation request from the FBI or counsel.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Payment Control & Incident Coordination (30 Points)** | ☐ **Fail:** TREAS and CTRL treat the video 'CFO' (I-04) or the lookalike chat (I-05) as approval and let WIRE-0914-001 run on its 'callback waived' memo at I-06. WIRE-0914-004 stays live until the I-10 call forces a HOLD, CTRL trusts the Mexican mobile number without a directory callback, and at I-15 releases continue while WS-TKN-2291 stays active. ☐ **Pass:** TREAS and CTRL refuse the video and chat as verification at I-04/I-05, hold WIRE-0914-004 by I-10 at the latest and call the CFO back on 864-555-0102 before relying on the call. At I-15 the CISO, CTRL and the CFO make a recorded, time-stamped decision to suspend Workstation releases and require approvals with each person's own token. ☐ **Excellence:** At START the team names the Controller plus the CEO's delegate as the executive approvers while the CFO is airborne (TCSP 6). TREAS sets WIRE-0914-001 to HOLD before the 10:55 release at I-06 and tells the CISO then rather than when the CFO lands. At I-15 the team retires WS-TKN-2291 and moves to manual directory-callback payments without being prompted. | I-04, I-05, I-06, I-10, I-15 |
| **Metric 2: Fraud Recovery & Evidence Handling (30 Points)** | ☐ **Fail:** TREAS misses the 14:50 written recall at I-13 or lumps wire 2 in with wires 1 and 3, and the organizer-held recording is lost before the 14:24 deletion (I-14). CTRL countersigns the I-22 broker form claiming a $2,640,000 loss with $620,000 'recovered', or messages go out with unsigned figures. ☐ **Pass:** TREAS files the written recall on the First Meridian portal before 14:50 at I-13. It includes a separate request for wire 2, CTRL checks every amount against the audit log, and Legal starts the IC3 complaint. At I-17/I-22 CTRL signs the reconciliation (released $2,250,000, stopped $390,000, frozen $620,000, recovered $0), returns the broker form uncorrected, and Legal tracks the IC3, insurer and Audit Committee clocks. ☐ **Excellence:** TREAS calls the bank fraud desk as soon as I-07 shows three wires released, without waiting for I-12, and the CISO orders the admin-log and recording preservation export at I-09, before the I-11 deletion risk surfaces. Legal has an IC3 number ready when the bank asks at I-13, and CTRL signs the reconciliation at I-17 before the broker and Audit Committee chair ask at I-22. | I-09, I-13, I-14, I-17, I-22 |
| **Metric 3: Public Communication (20 Points)** | ☐ **Fail:** COMMS confirms the acquisition talks to the reporter at I-02 or to the counterparty at I-15b, or calls the Clipwave clip fake before the CEO confirms. COMMS also quotes '$2.6 million lost' or a detector score at I-19b/I-21, misses the 17:00 deadline, or Spartanburg staff hear after the public does. ☐ **Pass:** COMMS verifies the CEO directly at I-19, preserves the clip, and issues a General Counsel-approved holding statement before 17:00 at I-19b that uses only Controller-signed figures and does not repeat the layoff claim. COMMS files the Clipwave takedown request and gives Spartanburg supervisors a script and message no later than the public statement. ☐ **Excellence:** At I-02 COMMS flags the 'deposit this week' detail to the CISO and Legal as a possible leak of the secret talks. At I-11b COMMS starts drafting the employee note and holding line before any clip appears. At I-21 COMMS completes the Clipwave impersonation form with the CEO's statement and preserved evidence without engaging the hobbyist post. | I-02, I-11b, I-19, I-19b, I-21 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** The CISO declares nothing until the I-11 duty-officer prompt and names no plan section. The CISO or Legal folds the Poznań vision-model problem at I-08 into the fraud as a regulatory AI incident, presents SynthCheck 0.71 as proof at I-14, or accepts 'clean' and attests at I-20. ☐ **Pass:** The CISO declares a combined fraud and synthetic-media incident at I-11 under TPC-SEC-02 and cites the TPC-FIN-04 Section 5 recall, CISO and IC3 steps. Legal runs the separate 24-hour provider/deployer assessment under TPC-SEC-02 Section 6 at I-08, and briefings report SynthCheck with its 6% false positive and 11% false negative rates and absent Content Credentials as one input (TPC-SEC-02 Section 4). ☐ **Excellence:** The CISO declares as soon as I-07 shows money has moved, working through the TPC-SEC-02 Section 4 hold–verify–preserve–declare sequence by number. At I-15 and I-20 the team cites the TPC-FIN-04 Section 2 own-token rule to retire WS-TKN-2291 and refuses any attestation until the vendor audit export, which Legal signs for at once, is reviewed. | I-08, I-11, I-14, I-15, I-20 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask the room for three things that went well and three things that broke or failed. Go around the room by team (Treasury, Controller, SOC/CISO, Legal, Communications) so every function speaks, and write each item on the whiteboard in two columns before you discuss any of them.

**Key Discussion Questions for Escrow Echo:**
- **Trust:** At 10:05 a 'CFO' on video told you to skip the callback, and a lookalike chat account pushed the Controller for the second approval. The 09:40 invite (I-01) already had an external-sender banner and an 'Organizer is outside the Tamarack tenant' warning. When did each of you stop trusting what you saw and heard? Why did a face and a voice count as verification when the CFO's directory number did not? What exactly would have made you hang up and call the Treasury Manager or the CFO's office on directory numbers before the first wire went out? _(Objective: Payment Control Decision Making)_
- **The Call:** At 14:35 (I-15) you had 19 approved payments in the queue, a 15:00 peso cutoff for Querétaro suppliers, and a shared release-desk token, WS-TKN-2291, with two approvals outside its role that nobody had explained. The AP Supervisor wanted a yes or no in ten minutes. What did you decide about the fourth wire and the rest of the queue, and who made the call? Did you reach the CFO on his directory mobile even though his token was in his bag? Under the TPC-FIN-04 Section 2 approval chain, which information or pre-agreed rule would have let you decide in two minutes instead of ten? _(Objective: Payment Control Decision Making)_
- **The Clock:** Three wires were released. Did a complete written recall-and-freeze request (originating bank, amount, date, beneficiary account, reason) reach the bank fraud desk within 30 minutes of the 14:20 call, or did it sit with someone waiting for the figures? TPC-SEC-02 Section 7 sets several deadlines: the 24-hour clock for the insurer, the FBI IC3 filing, the call to the local FBI field office because the loss tops $1 million, and the Audit Committee chair. When did you first bring in the FBI or another law-enforcement contact? Were you working from the Controller's signed reconciliation or from numbers people remembered? _(Objective: Fraud Recovery)_
- **Evidence or Ticket:** The SOC exported the meeting recording at 14:16, and the external organizer deleted the original at 14:24. You came within eight minutes of losing the main evidence. When did you declare a combined fraud and AI incident under TPC-SEC-02, and when did you ask the meeting platform vendor to preserve the evidence, given that the vendor would not release server-side logs without a support ticket and a preservation request signed by Legal? When you briefed leadership on the I-14 verification note, did you present the SynthCheck score of 0.71, with its 6% false-positive and 11% false-negative rates, as proof or as one piece of evidence next to the guest-join records, the misused token and the CFO's own denial? How did you treat the absent Content Credentials? _(Objective: Use of Doctrine and Evidence)_
- **Before You Knew:** At 14:15 (I-11b) the Spartanburg second-shift lead called Communications, needing something to tell workers before the 15:30 shift change. At 16:20 a synthetic 'CEO' clip announcing the acquisition and layoffs went public, and the Greenville reporter's deadline was 17:00. What did you tell the employees, the reporter and the platform before you could confirm anything, and did the General Counsel approve it? Did Spartanburg staff hear from you no later than the public did? What would have let you have a holding statement ready before the clip appeared, without confirming the secret Querétaro deal? _(Objective: Public Communication)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **AI incidents and synthetic media**: Verification clues for synthetic media, model incident reports, AI system inventory entries, disclosure drafts and payment recall requests, with decisions scored on time to detect, payments stopped and disclosures on time. For any organization that faces a deepfaked executive, a fake spokesperson video, a harmful AI output, data poisoning or an AI vendor breach. Detector scores in the exercise are simulated. Every person, bank, vendor and company is fictional.
  - Reference documents: Artificial Intelligence Risk Management Framework (AI RMF 1.0); AI RMF: Generative Artificial Intelligence Profile; FinCEN alert on fraud schemes involving deepfake media; FCC declaratory ruling on AI-generated voices in robocalls; C2PA Technical Specification (Content Credentials), version 2.3
- **Media environment**: The news cycle and social feeds around an incident: wire alerts, articles and broadcast segments, social posts whose reach and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. Simulated spread and sentiment are teaching models, not predictions. All outlets, handles and people are fictional.
  - Data sources: gdelt
  - Reference documents: FCC report on the Hawaii false alert (2018): a correction case study
<!-- /section:toolkits -->
