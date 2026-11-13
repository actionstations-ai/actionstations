# Controller / Evaluator (C/E) Handbook
## Sample Rows — Web Store Export, Correction & Disclosure

Exercise Date: [Date] · Location: Tallis Home Products, Inc., Communications Cell, Conference Room 3B, Dayton, Ohio · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise (TTX) for the Tallis Home Products Communications Cell. It runs for four hours of exercise time, from 07:30 to 11:30 Eastern on Tuesday, March 9, 2027, in Conference Room 3B in Dayton. Players talk through decisions and draft real products: the fact sheet, the holding statement, the correction, Q&A, the customer email and a Disclosure Committee decision record. Nothing is actually published, filed or sent. Tallis and every outside party are fictional. Every governance product carries the line "Exercise aid, not legal advice. Check the current rule and your counsel."

The injects simulate a **cyber incident**. Someone used the API key of the web store vendor, CartBridge Commerce, to bulk-export customer records. A breach-forum post then claims "1.9M accounts with passwords and cards." The truth arrives slowly: the passwords are bcrypt hashes, the "cards" are Lakeview Payments tokens, and the count is 412,000. The exercise has four phases. **Phase 1, The Sample Rows (0:00–1:00):** open the cell, get the CISO's facts and issue a holding statement within 60 minutes. **Phase 2, The Wrong Line (1:00–2:00):** the 08:20 "no payment information" line turns out to be wrong while rumors, phishing and the wire bulletin pile up. **Phase 3, Numbers in Motion (2:00–3:00):** the count changes, the TechSignal deadline arrives, and the retailer, vendor, insurer and law enforcement all want something. **Phase 4, One Set of Numbers (3:00–4:00):** the 11:00 Disclosure Committee decides materiality and the filing path, and every document must match.

What evaluators should watch for:
- Does the holding statement separate what is known, what is not known and what is being done, without adjectives about the attacker and without promising that no data was taken (TMPCDI 3)?
- Does the cell find its own error and correct it without repeating the false claim?
- Is one time-stamped fact sheet the only source for numbers?
- Do the legal and outside-party clocks get met? The General Counsel is called within one hour and the Disclosure Committee meets within four hours (TCIDC 2). Retailers are told within 30 minutes of the first statement (TSCDMD 5). The insurer claims line is called within 24 hours, CartBridge gets written notice and Tallis does not blame CartBridge in public (TCIDC 8).
- Is the materiality decision recorded with who decided, when, what was known and the basis, and does it avoid being put off simply by waiting for more facts?

**Objectives:**
- **Communication:** Demonstrate the ability to issue a holding statement within 60 minutes that separates what is known, not known and being done, then publish a correction by about 11:40 that names the wrong 'no payment information' line and states that Lakeview Payments tokens were exported.
- **Use of Doctrine:** Demonstrate the ability to move every external statement through the TCCP 3 approval route (Writer drafts, CISO confirms facts, General Counsel clears, CCO approves, CEO sees, IR told) and record the approver and time on the statement log, even under the TechSignal Daily 10:30 deadline.
- **Decision Making:** Demonstrate the ability to reach and record a materiality decision ('material' or 'not yet determined') at the 11:00 Disclosure Committee meeting, using the factors in TCIDC 4, and to choose Item 1.05, Item 8.01 or no filing before the 5:30 p.m. EDGAR cut-off.
- **Information Consistency:** Demonstrate the ability to keep one time-stamped fact sheet, so that the newsroom page, company accounts, customer email and any 8-K all use the 412,000-account figure after the 10:15 forensic update, and to answer the plain-text-password claim and the 'refund' phishing under the TMPCDI 5 rumor protocol.

**Plan sections exercised:**
- TMPCDI › 3. Holding statement template
- TMPCDI › 4. Hard questions and the answers
- TMPCDI › 5. Rumor and false claim protocol
- TCIDC › 4. Materiality determination
- TSCDMD › 2. Customer data systems
- TCIDC › 8. Insurance, law enforcement and vendors
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Layout:** Arrange islands that simulate the Communications Cell in Conference Room 3B. Put a head table at the front with the main screen behind it.
- **Team A, COMMS (Chief Communications Officer):** head table, center, facing the screen. All approvals go through here.
- **Team B, WRITER (VP Corporate Communications):** the island next to COMMS, beside the whiteboard. It owns the time-stamped fact sheet.
- **Team E, LEGAL (General Counsel / Disclosure Committee chair):** the island on the other side of COMMS. In Phase 4 it becomes the Disclosure Committee table.
- **Team F, CISO:** a side island near the screen, where technical updates (TLC-COM-02 and TLC-COM-03) are shown.
- **Team D, SOCIAL (Social Media Manager):** a side island with a laptop or printout of the social listening reports.
- **Team C, MEDIA (Media Relations Manager):** **rear table, isolated near the door.** Media Relations must physically walk to WRITER and COMMS to get verified facts and approvals. This shows the real gap between the media line and the people who hold the facts. It also stops MEDIA from overhearing half-confirmed numbers and repeating them to reporters, which is the failure this exercise is built around.
- **SimCell / Controller:** a corner table with a clear view of all islands, the printed inject deck, the phone or "radio" props and a timer.
- **Evaluators:** seats along the walls, one per two teams, with an evaluation guide and a clock.

**Equipment needs**
- Projector and main screen for main-screen injects: SIEM alerts, the newsroom page, wire alerts and the email send preview.
- Whiteboard laid out as an ICS-201-style status board: situation, the current fact sheet numbers with time and source, actions, open deadlines and the statement log.
- Printed inject deck in MSEL order, one copy for the controller, with spare copies of handouts for the target teams.
- Optional simulated phones or radios for the bridge line and reporter calls.
- A wall clock showing exercise time, plus a printed list of deadlines: 10:30 TechSignal, 10:45 Brightwater, 11:00 CartBridge statement and Disclosure Committee, 12:00 noon show, 17:30 EDGAR cut-off.

**Materials for players:** role cards, blank fact sheet template, holding statement template (TMPCDI 3), contact sheet (TSCDMD 5 and 6), TCIDC excerpts, reporter log, statement approval log, decision record form, pens and sticky notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**Your role as SimCell**
You play everyone else in the world. If a student says "I call the sheriff", you answer as the deputy. In this exercise, if a player says "I call CartBridge," you are the CartBridge account director. If they say "I call the FBI," you are the duty agent at the FBI Cincinnati Field Office. You also play the CEO, the IR Director, the Head of Customer Care, reporters, the wire desk, Brightwater Markets and the Midland Risk Partners broker. Answer only what was asked, in the character's voice and in the character's own interest. Write down every call: the time, who called, what they asked and what they were told.

**Do not make it easy**
Real outside parties want something before they help. Make players earn it. For example, when the CISO asks CartBridge for the March 2–8 logs (I-04b), do not hand them over. Ask: "What's your P1 ticket number, and who is the named account owner signing the Data Access Authorization form? Turnaround is 4–6 hours after we have both." Similarly, Brightwater's Fiona Ledesma does not accept a verbal "customers are safe." She wants it in writing with a number, and if a player offers one, push back on whether Tallis can actually guarantee it. Do not supply the answer the players should have found on their own fact sheet.

**Managing time**
Read time jumps word for word and firmly:
> "PAUSE EXERCISE. We are jumping forward 30 minutes. It is now [time] Eastern. [Read the status from the inject.] Any action you started continues in the background; tell me if you want to check on it. RESUME."

When an inject asks for it, read back the exact wording the cell published (I-06, I-11, I-17, ENDEX). Players live with their own words. If a team stalls on a decision, give them a one-minute warning, then let the clock run on and play the consequence. For example, at I-16 TechSignal publishes "Tallis did not respond to repeated requests."

**Handling artificialities**
When a student says "I wouldn't use that system" or "we'd never have that setup," answer:
> "Understood. Note it for the hot wash. For today, assume the system works as described and tell me what you do next."

Capture the point on the parking-lot sheet and move on. Do not argue the scenario.

**Delivering injects**
Do not explain. Say "This just came in." or "This is on the main screen." Hand the paper to the named recipient or put it on the screen, then step back. Do not hint at which details matter. Planted traps should look like any other inject: the fake rows "Toastina Crumbsworth" and "Sir Blendalot," the red-herring charges at I-07b and the duplicate billing at I-14.

**Exercise conventions**
- Every message, call or email you play, and every product players draft for outside use, starts or ends with **"This is an exercise."**
- If a real emergency or real-world event comes up (a medical issue, a real security incident, a real reporter calling), anyone says **"REAL WORLD, REAL WORLD"** and play stops at once. Resume only when the controller says so.

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **FBI Cincinnati Field Office cyber squad duty agent (with CISA coordinating on the same call)** — _Trigger: The CISO, or someone acting for them, calls the FBI Cincinnati Field Office or CISA to report INC-27-0309-01, or asks who files the IC3 report on the look-alike domain tallis-refund-center.example (I-07)._
  - Ask: "Do you have the proxy logs from 06:40 to 07:05 preserved, with hashes and a chain of custody? No? Call me back when you have evidence."
  - Ask: "Give me a timeline in Eastern Time: first export, key suspension, forum post. Do you know how that key was used from outside your allow-listed IPs, or is that still a guess?"
  - Ask: "Has anyone at Tallis contacted the seller on the forum, bought the sample or talked about paying? Don't."
  - Ask: "That refund domain was registered at 05:58, before your alert. Has anyone filed IC3 with the full headers, or did you only screenshot the post?"
  - Concede only when: Will open a case and give an FBI reference number, and CISA will give its own, once the CISO provides preserved logs and a written timeline.
  - Concede only when: Will take the phishing domains and full email headers through IC3 and share indicators back, but will not promise a takedown time.
  - Concede only when: Agrees Tallis may say publicly that it has 'informed law enforcement' but will not confirm an investigation by name. It will not ask Tallis to delay any SEC disclosure for a case like this.
- **CartBridge Commerce account director (web store vendor, Case CB-558217)** — _Trigger: The CISO calls about the logs, the replacement key or re-enabling cartbridge-integration-prod. Or LEGAL or COMMS responds to CartBridge's 11:00 statement draft (I-13). Or the cell sends the written incident notice required by TCIDC 8._
  - Ask: "What's your P1 ticket number in our portal, and who is your named account owner? I can't release cold-storage logs to someone who just called the support line."
  - Ask: "Where is the signed Data Access Authorization form? Without it the 4–6 hour clock hasn't started."
  - Ask: "Our statement says the key was issued to and managed by Tallis. Can you show me that key was rotated on schedule and restricted to your IPs? If not, why should we change our wording?"
  - Ask: "Do you want cartbridge-integration-prod-r2 or not? Your 13:00 carrier cut-off is coming and I have other clients."
  - Concede only when: Will expedite the March 2–8 logs to Cardinal Forensics once the P1 ticket and signed authorization are in.
  - Concede only when: Will issue cartbridge-integration-prod-r2, scoped to order sync only with no /customers/export, within 20 minutes of a written request from the account owner.
  - Concede only when: Will hold its 11:00 statement or change it to neutral, fact-only wording if Tallis sends written comments by 10:30 and confirms that Tallis will not blame CartBridge publicly.
- **Fiona Ledesma, category manager, Brightwater Markets** — _Trigger: COMMS or MEDIA returns the 09:30 call (I-12) or reaches out to retailers. Or the cell misses the TSCDMD 5 rule that retailers are told within 30 minutes after the first public statement._
  - Ask: "Why did I hear about this from the wire and not from your account team? Your statement went up at 08:20."
  - Ask: "How many accounts, and are any of them Brightwater shoppers? I need a number I can put in front of my VP."
  - Ask: "Is product or payment at our stores affected, yes or no? And do you still stand by 'no payment information was involved'? That line is in our 11:00 draft."
  - Ask: "Will you put in writing that our shared customers are safe? If not by 10:45, your products come off the homepage feature."
  - Concede only when: Will remove 'Tallis has confirmed no payment information was involved' from Brightwater's 11:00 statement once Tallis sends the written fact sheet or correction text.
  - Concede only when: Will hold the homepage decision if she gets a named Tallis contact and a written update time.
  - Concede only when: Accepts a fact-based written answer saying payment at stores is not affected, in place of a 'guarantee'.
- **Midland Risk Partners account executive (broker for cyber insurer Redwater Mutual)** — _Trigger: LEGAL or the CFO returns the 09:52 voicemail (I-13b), or the CFO calls the claims line as required by TCIDC 8._
  - Ask: "When exactly did you discover this? I have 06:40. Has the CFO called the Redwater Mutual claims line yet? The 24-hour clock is running."
  - Ask: "Is Cardinal Forensics working at the direction of counsel? Who signed the engagement?"
  - Ask: "What are the FBI and CISA reference numbers? The underwriter will ask."
  - Ask: "Has anyone said in public that this was your fault or the vendor's, or promised credit monitoring or refunds? The $35 'refund' email isn't yours, right?"
  - Concede only when: Will log the notice and give a claim number once the CFO formally notifies the claims line.
  - Concede only when: Will confirm Cardinal Forensics as an approved panel vendor once it is shown to be retained through counsel.
  - Concede only when: Will take a request for pre-approval of notification and call-center costs once the cell sends a written timeline and confirms no public promises have been made.
- **Ines Okonkwo, reporter, TechSignal Daily** — _Trigger: MEDIA replies to the 07:52 email (I-03) or takes the 10:25 call (I-16), or anyone in the cell contacts TechSignal._
  - Ask: "Confirm or deny: 1.9 million accounts, passwords and cards. I publish at 10:30 with or without you."
  - Ask: "My source says it's around 400,000. Is that right? If you have a number, give it to me on the record."
  - Ask: "The wire still quotes your 'no payment information' line and the seller says cards. Are you correcting the 08:20 statement or not?"
  - Ask: "Have you told law enforcement, and was this your vendor's fault?"
  - Concede only when: Will run an on-the-record line verbatim if it is given before 10:30, including 'Tallis said the count is preliminary.'
  - Concede only when: Will drop 'did not respond to repeated requests' and update the story if Tallis sends its correction, with its time stamp.
  - Concede only when: Will accept 'on background' guidance on hashed passwords versus plain text only if the terms are stated before the answer.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Cell Coordination & Disclosure Decision Making (30 Points)** | ☐ **Fail:** LEGAL lets the 11:00 Disclosure Committee at I-20 end without a recorded 'material' or 'not yet determined' decision, or puts it off after the I-09 IR pressure. CISO re-enables cartbridge-integration-prod or leaves the I-13 restore choice unrecorded, and nobody tells CartBridge in writing or the CFO about the insurer until I-13b. ☐ **Pass:** LEGAL chairs the I-20 committee and records the decision, decider, facts known at 11:00 and a fixed reconvene time, and chooses Item 1.05, Item 8.01 or no filing before 17:30. CISO records the I-13 key decision with time and rationale, and LEGAL tells the CFO to call Midland Risk Partners after I-13b. ☐ **Excellence:** CISO sends CartBridge the written preservation notice and calls the General Counsel at I-01, before the I-04b vendor reply. LEGAL schedules the committee and prompts the CFO's 24-hour insurer notice and the FBI Cincinnati and CISA reports well before the I-13b voicemail, so the I-20 worksheet already carries reference numbers and a draft basis under TCIDC 4. | I-01, I-09, I-13, I-13b, I-20 |
| **Metric 2: Fact Verification & Information Consistency (30 Points)** | ☐ **Fail:** WRITER keeps no time-stamped fact sheet, so after I-15 the care macro, email draft, IR points and 8-K still carry 1.9 million or 'no card data' when I-21 arrives. CISO lets the 'no payment information' wording stand after the I-04 tokens finding and the I-08 schema. ☐ **Pass:** WRITER logs the I-04 and I-08 facts (bcrypt hashes, Lakeview Payments tokens, last 4, no full card numbers) with time and source, and adds '10:15 – 412,000, preliminary' after I-15. At I-21 WRITER reconciles all six products to that single figure and payment line, and checks the I-19 email has only the tallishome.example link. ☐ **Excellence:** WRITER flags every live product carrying old facts as soon as I-15 lands and fixes the care macro and email wording before the I-21 IR email forces it. CISO holds the ~62-minute I-19 send until the text is confirmed and starts a leak check through counsel without being asked. | I-04, I-08, I-15, I-19, I-21 |
| **Metric 3: Public Statements, Correction & Rumor Response (20 Points)** | ☐ **Fail:** COMMS adds the CEO's 'No payment information was involved' line at I-05, or posts no holding statement by 08:30. The correction is not out by about 11:40, or MEDIA gives TechSignal nothing by I-16, so the story runs 'did not respond'. SOCIAL replies to or repeats the I-07 plain-text claim. ☐ **Pass:** COMMS posts a TMPCDI 3 holding statement (known, not known, being done, next update) before 08:30. A correction that names the wrong payment line and states that tokens were exported runs in the same places by about 11:40. SOCIAL logs the I-07 claims word for word and requests takedowns, and MEDIA gives cleared on-the-record answers at I-10 and I-16. ☐ **Excellence:** COMMS and WRITER refuse the I-05 line before posting, using the accurate TSCDMD 2 wording, so no correction is needed. Otherwise, COMMS has the correction cleared before the I-10 09:45 write-through. MEDIA gives the I-18 fact-check desk the bcrypt fact on the record without repeating the false claim as the headline. | I-05, I-07, I-10, I-16, I-18 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** Students publish statements and replies at I-03, I-05 or I-16 without the TCCP 3 approval route. They leave approver and time fields blank, as I-21 reveals, and cite no plan sections when they decide on CartBridge or materiality. ☐ **Pass:** Students route each external statement through TCCP 3 (Writer drafts, CISO confirms, GC clears, CCO approves, CEO sees, IR told) and record the approver and time on the statement log. They cite TMPCDI 5 for the rumor and phishing steps, TCIDC 8 for the CartBridge reply at I-13, and TCIDC 4 for the I-20 factors. ☐ **Excellence:** Students name the controlling section aloud before each decision: TMPCDI 3 rules for the holding draft, TSCDMD 2 for what Tallis stores, TMPCDI 8 for the care script, and TCIDC 8 to strike CartBridge's credential-handling line. The statement log is complete before I-21 asks who signed each document. | I-03, I-05, I-13, I-20, I-21 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** 3-Up, 3-Down asks the room for three things that went well and three that broke or failed during the exercise. Go around the room one team at a time (Communications, Legal/IR, Security, Customer Care, Operations), write every answer on the whiteboard in two columns, and don't debate anything until all teams have spoken.

**Key Discussion Questions for Sample Rows:**
- **Trust:** At 1:25 (I-08), the export schema showing a populated Lakeview Payments token column went up on the cell screen. Next to it, your live newsroom page still said 'No payment information was involved.' Cardinal Forensics had already told you at 0:40 (I-04) that the 'card' column held tokens. At what moment did you stop trusting your own 08:20 statement? Who said so out loud? What kept the correction from going out sooner? And what in the 08:20 statement claimed something you didn't yet know, against the holding-statement rules? _(Objective: Communication)_
- **The Script:** At 1:42 (I-09b), Customer Care reported 240 callers waiting. Agents were reading the wrong 'no payment information' line word for word, and two had told callers the forum post was 'fake'. Chat macro CC-INC-02 went live at 10:20 with no CCO approval recorded. With the TechSignal Daily 10:30 deadline coming, which external words went through the TCCP 3 route (Writer, CISO, General Counsel, CCO, CEO sees, IR told), which skipped it, and why? What would a faster route for care scripts look like, one that still has an approver and a time on the log? _(Objective: Use of Doctrine)_
- **The Call:** At 2:45 (I-15), Cardinal gave you a preliminary count of 412,000 accounts across 83 sessions from March 2 to 8, with high confidence but still being checked. Fifteen minutes later the Disclosure Committee met at 11:00. Did you record 'material' or 'not yet determined', and which TCIDC 4 factors drove that? How did you choose between Item 1.05, Item 8.01 or no filing before the 5:30 p.m. EDGAR cut-off? When did you bring in the law-enforcement or cyber task force contact, and what single piece of information would have let you decide faster? _(Objective: Decision Making)_
- **Evidence vs. Ticket:** At 2:15 (I-13), CartBridge offered a replacement key (cartbridge-integration-prod-r2) in 20 minutes, while admitting it still didn't know how the original key was used from outside your allow-listed IPs. It also planned an 11:00 statement putting the blame on Tallis's credential handling. Did operations and the security team understand each other's stakes: 3,400 unsynced orders and the 13:00 carrier cut-off against an attack path no one had explained? Did you treat the vendor key as evidence or as a ticket to close? And how did you answer the vendor's statement so it didn't contradict yours? _(Objective: Information Consistency)_
- **One Number:** At 3:45 (I-21), the IR Director found five documents with five numbers: the correction draft and customer email said 412,000, the chat macro and the 8-K shell said up to 1.9 million, the talking points said roughly 400,000, and the 08:20 post was still pinned. Several approver fields were blank. Where was your single time-stamped fact sheet after the 10:15 forensic update, and who owned it? Why didn't every channel pull from it? And how did you handle the plain-text-password claim and the 'refund' phishing email under the TMPCDI 5 rumor protocol? _(Objective: Information Consistency)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Media environment**: The news cycle and social feeds around an incident: wire alerts, articles and broadcast segments, social posts whose reach and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. Simulated spread and sentiment are teaching models, not predictions. All outlets, handles and people are fictional.
  - Data sources: gdelt
  - Reference documents: FCC report on the Hawaii false alert (2018): a correction case study
- **Governance decisions**: The corporate decision layer for any exercise: board briefings, a materiality worksheet, Form 8-K disclosure drafts, a business impact analysis, a ransom decision paper, legal hold and privilege notices, regulator inquiries, insurer and auditor notices, investor questions, a decision log and succession documents. Stays at the level of governance decisions and their records; it is an exercise aid, not legal advice, and every company, person and adviser in it is fictional.
  - Data sources: sec-edgar-8k
  - Reference documents: SEC Release 33-11216: Cybersecurity Risk Management, Strategy, Governance, and Incident Disclosure; SEC fact sheet: Public Company Cybersecurity Disclosures; CISA Tabletop Exercise Package: Ransomware; CISA Tabletop Exercise Package: Insider Threat; NIST SP 800-61 Rev. 3: Incident Response Recommendations; NIST SP 800-34 Rev. 1: Contingency Planning Guide; NIST Cybersecurity Framework 2.0; FFIEC IT Handbook: Business Continuity Management; OFAC advisory on sanctions risks of ransomware payments; FEMA Continuity Guidance Circular; Ready Business: Business Impact Analysis worksheet; Ready Business: Business Continuity Plan template
<!-- /section:toolkits -->
