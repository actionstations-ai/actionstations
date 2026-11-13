# Controller / Evaluator (C/E) Handbook
## Six Days Out — MES Ransomware, Materiality & Disclosure

Exercise Date: [Date] · Location: Ironcrest Machinery Corporation headquarters, Rockford, Illinois · Duration: 4 Hours


<!-- section:overview -->
### 1. Exercise Overview & Objectives

This is a discussion-based Tabletop Exercise for the Ironcrest Machinery Corporation (fictional) Crisis Management Team, the Disclosure Committee and the Audit Committee Chair. It runs for four hours of real time. Nobody touches a live system, sends a real notice, files on EDGAR or calls a real agency. Players say what they would decide, who would decide it and how they would record it. You, as SimCell, answer as every outside party they reach. Every product in the deck carries the line "Exercise aid, not legal advice. Check the current rule and your counsel."

The injects simulate a ransomware attack with data theft. It starts on Thursday, March 25, 2027, six days before quarter end. The MES and file servers at the Rockford data center are encrypted, there is an 18-million-dollar demand from an actor that partly matches a sanctioned affiliate, lot tracking is down at all three plants and Joliet has stopped shipping. The story covers 19 hours of narrative time in four hours of play. **Phase 1, First Hour Fog (0:00–1:00, 15:00–16:00 CT)** tests whether the team builds a fact base and starts the insurer and board clocks. **Phase 2, The Determination (1:00–2:00, jumps to about 18:30–19:30 CT)** puts the materiality determination, the Form 8-K choice and the trading-window closure in front of the Disclosure Committee while the press, customers, the bank and the auditor call. **Phase 3, Pay or Refuse (2:00–3:00, jumps to about 20:40–22:30 CT)** forces the ransom decision under the IBODAI 3 delegation of authority after the story is public and the leak site starts posting. **Phase 4, Restore and Verify (3:00–4:00, jumps to Friday 06:30–10:00 CT)** tests recovery claims against the IBIARO 3 RTOs and the 07:00 board meeting.

Evaluators should watch for these things:
- **Insurer notice:** whether Blue Heron Mutual gets notice before the broker's 17:00 intake closes, and consent for Blackwater Cyber and Harrow Fenn LLP is requested (IBODAI 5).
- **Materiality:** whether the determination is made and recorded on Thursday night, not pushed to the board meeting or to Blackwater's final report.
- **Ransom decision record:** whether it names who decided, when, what was known and the basis (sanctions screen, insurer position, FBI notice, Audit Committee Chair consulted).
- **Recovery claims:** whether "system up" gets confused with minimum acceptable service level, and whether the CISO's return signature is checked (IBIARO 4).
- **One fact sheet:** whether the board, the 8-K draft, the supply notice, the employee note and the press statement all say the same thing. Note every contradiction the players catch, and every one they miss.

**Objectives:**
- **Decision Making:** Demonstrate the ability to reach and record a timely materiality determination at the 19:00 Disclosure Committee (material, not material or not yet determined), with the Form 8-K choice between Item 1.05, Item 8.01 or no filing yet and the trading-window closure, each stating who decided, when, what was known and the basis.
- **Use of Doctrine:** Demonstrate the ability to handle the 18-million-dollar ransom demand under the IBODAI 3 delegation of authority, completing sanctions screening of the partly matching affiliate, Blue Heron Mutual consent, FBI notice, Audit Committee Chair consultation and the board approval needed above 5 million dollars, while company policy is not to pay.
- **Recovery Management:** Demonstrate the ability to judge MES, Joliet warehouse and ERP recovery against the IBIARO 3 RTOs and the 4, 8, 12, 24, 48 and 72-hour checkpoints, using the 31-hour-old backup and forensic clearance, and to set a recovery order that protects payroll funding and largest-customer supply before the 5-day finished-goods buffer runs out.
- **Communication:** Demonstrate the ability to keep a single fact sheet consistent across the 07:00 Friday board briefing, the 8-K draft, the Fieldmark and Granite Peak supply notices, the employee message after the 3,100-record leak and the Rock River Gazette response.

**Plan sections exercised:**
- IBIARO › 3. Critical functions
- IBIARO › 4. Recovery order
- IBODAI › 3. Delegation of authority (extract)
- IBODAI › 2. How the board learns of an incident
- IDCCI › 1. Purpose
- IBODAI › 5. Insurance
<!-- /section:overview -->

<!-- section:room -->
### 2. Room Setup & Logistics

- **Layout:** three islands in a loose U facing the main screen, each simulating one room.
 - **Crisis Management Team room (centre island):** Team A CEO (chair, at the head), Team B CFO, Team D CISO and Team E Business Continuity Manager. The BCM sits nearest the whiteboard to keep the recovery tracker.
 - **Disclosure Committee (left island):** Team C General Counsel, with the Harrow Fenn materiality worksheet (I-10) and the 8-K choice card. The CFO walks over for the 19:00 meeting.
 - **Board portal / Audit Committee (right island):** Team F Audit Committee Chair. This table gets board-level traffic only: the I-03b text, the I-11 portal failure and the I-18 board video. It should feel remote from management, so information has to be carried there on purpose.
- **Public-information desk (rear table, behind the U):** seat the Chief Communications Officer role here, played by a second controller or by you. The press line, the social listening desk and the shareholder services desk all work from this table. **Why:** in a real incident, communications learns late unless someone briefs it. Players must get up and walk over to give the CCO facts or approve the holding statement. That makes the 20:00 Rock River Gazette deadline (I-07) and the "declined to comment" wire bulletin (I-12b) a result of their own choices, not of the script.
- **SimCell / controller table:** at the side, with a clear line of sight to every island, holding the inject deck and these scripts. Evaluators stand or sit behind the islands, not at them.

**Equipment needs**
- Projector and screen for main-screen injects: time-jump cards, the SIEM alerts, the wire bulletins, the leak-site post and the social listening report.
- Whiteboard (or flip chart) laid out as an ICS-201-style incident briefing for this corporate team: situation, actions taken, decision log (who, when, what was known, basis), open clocks (insurer 24 h, broker 17:00, 8-K four business days, attackers' 72 h, payroll 10:00 Friday) and the BCM RTO tracker at 4, 8, 12, 24, 48 and 72 h.
- Printed inject deck: one card per inject, in MSEL order, marked with the target team. Have extra copies of I-10 and I-14.
- Optional: two desk phones or walkie-talkies to simulate the bridge at (815) 555-0121 and the press line (815) 555-0124, plus a timer that everyone can see.

**Materials for players:** the CMT contact sheet, the IBODAI delegation extract, the IBIARO critical-functions table, the blank materiality worksheet, a decision-log template, and pens and sticky notes.
<!-- /section:room -->

<!-- section:rules -->
### 3. Rules of Play (Instructor Guide)

**The SimCell role**
You play everyone else in the world. If a student says "I call the sheriff", you answer as the deputy. Here that means the FBI Chicago cyber squad, Blue Heron Mutual, the broker, Blackwater Cyber, Harrow Fenn LLP, the warehouse software vendor, Northbridge Payroll, Fieldmark Equipment, Granite Peak Machinery, Midstate Commercial Bank, the audit partner, the Rock River Gazette, Midland Press Wire, analysts, the COO, the CIO, the CHRO office and any director not at the table. Answer in character, briefly, and only what that party would know. Never coach. If a team calls someone who would not pick up at that hour, give them voicemail.

**Do not make it easy**
Every outside party has its own interest and its own conditions. Make players earn each answer. Example from this scenario: at 06:31 Friday the CIO announces "MES is back up" (I-17). If the CEO says "Good, tell the board we've recovered", agree warmly in character as the CIO. Then let the board (I-18) and the 06:52 wire update catch it. Do not point out on the CIO's behalf that the restore is not yet at minimum acceptable service (MASL), that 31 hours of lots plus overnight manual production are not reconciled, or that the CISO has not signed the return under IBIARO 4. The BCM tracker note is on the card; it is the players' job to read it. Likewise, Blue Heron Mutual will not consent to a ransom while the sanctions match is open, however hard the CEO pushes.

**Managing time**
The narrative clock runs from 15:00 Thursday to 10:00 Friday in four hours of play, so you will jump time three times (I-06, I-12, I-16). Stand, raise your voice, and read the jump card in full:
> "PAUSE EXERCISE. We are jumping forward three and a half hours. It is now 18:30 Central Time on Thursday, March 25. [Read the card.] Any decision you said you would make has been made; anything you did not decide is still open. RESUME."

Use the same wording for the other jumps, for example "We are jumping forward 30 minutes" if a discussion stalls inside a phase. Before each jump, ask each island for one sentence on what it has decided, and write it in the decision log on the whiteboard.

**Handling artificialities**
When a student says "I wouldn't use that system" or "We don't do it that way", answer:
> "Noted. Write it down for the hot wash. For today, assume it works as described, and tell me what you would decide next."

Do not argue about the plan. Record the gap. If a student claims a capability the documents do not show, ask: "Who does that, and where is it written?"

**Delivering injects**
Do not explain. Say "This just came in." or "This is on the main screen." Hand the card to the named team, or put it on the projector, and step back. If asked what an inject means, answer in character or say "What does your plan say?" Deliver noise injects (I-02, I-08b, I-13b, I-17b) as seriously as core ones. Their purpose is to see whether players triage.

**Conventions**
- Start any real call, email or message linked to the exercise with "This is an exercise." Every printed card already carries the exercise-aid line.
- If a real emergency or real-world event happens (a real security alert, a medical issue, a fire alarm), anyone may call **"REAL WORLD, REAL WORLD."** All play stops at once. Deal with the real event, and resume only when the lead controller announces "RESUME EXERCISE."

**SimCell Scripts (play these when the trigger happens — do not make it easy):**

- **Special agent, cyber squad, FBI Chicago field office** — _Trigger: The General Counsel (or the CEO on the GC's instruction under IBODAI 3) calls to report the ransomware and extortion demand, or says they will give the FBI notice before any ransom decision (I-14)._
  - Ask: ""Thanks for calling. What's your case contact, and is outside counsel on the line? Do you have the ransom note, both wallet addresses and the negotiator's chat log preserved? Send me the indicators, not a summary.""
  - Ask: ""Are the gateway logs from ICM-RA-01 and the file-server images under a legal hold, or is your team still rebuilding over them? If they're gone, I can't help you attribute anything.""
  - Ask: ""Those drawings say CUI and export-controlled. Has your defense customer been told, and have you checked whether your contract requires you to report to the Department of Defense? That clock isn't mine, but somebody will ask.""
  - Ask: ""If you're thinking of asking DOJ to delay your disclosure, understand that it's a formal request and it isn't my call. Do you have a reason that is actually national security or public safety, or do you just want more time?""
  - Concede only when: Once wallet addresses, indicators and preserved logs are sent: confirms the FBI recommends against payment, gives the CEO a line the decision record can cite ("FBI notified at [time]; FBI recommends against payment; decision is the company's"), and says whether the wallets are known to it.
  - Concede only when: Once the company gives a written timeline and a single point of contact: agrees to share any decryptor or indicators it has from other victims of this actor, through counsel.
  - Concede only when: Will not clear the sanctions question and will not tell the company to pay or not pay.
- **Support desk lead, Joliet warehouse software vendor** — _Trigger: The CISO or BCM calls to restart the Joliet warehouse system, asks about the svc_wmsvendor account (I-13, I-19), or tells the vendor its account was used in the intrusion._
  - Ask: ""Happy to help. What's your P1 ticket number? It'll start WSV-. No ticket, no engineer. That's in our support agreement.""
  - Ask: ""I need a signed Remote Access Request on your letterhead from an officer, naming the engineer and the change window. Who's signing it?""
  - Ask: ""You're saying our support account was the way in? Our records show no technician worked on March 22. Before you put that in writing anywhere, it needs to go to our legal team. Who on your side is your counsel?""
  - Ask: ""The earliest window for our engineer is 13:00 Central, and it's a 4-hour change. Do you want the account set up with MFA on your side? Legacy protocol access was your configuration, not ours.""
  - Concede only when: With a P1 ticket raised and a signed Remote Access Request from an officer: creates a new named-user account (no shared service account) with MFA enforced, and offers to move the engineer up to 11:00 CT.
  - Concede only when: With a written request through counsel: exports its own access logs for the svc_wmsvendor account for March 20 to 26 and preserves them for the forensic firm.
  - Concede only when: Will not accept liability on the phone or agree that its account was the root cause.
- **Claims counsel, Blue Heron Mutual (with the broker's after-hours desk)** — _Trigger: The CFO or the Deputy General Counsel calls the claims line or the broker to give notice (I-05), asks for consent for Blackwater Cyber and Harrow Fenn LLP, or asks for consent to pay the ransom (I-14)._
  - Ask: ""When did the incident start, by the clock: discovery or encryption? Your notice is due within 24 hours of that. And the broker stops intake at 17:00, so are we taking this as notice now?""
  - Ask: ""Blackwater Cyber started at 15:00 and Harrow Fenn sent an engagement letter at 15:41. Who approved those, and why didn't you ask us first? The policy requires our prior consent.""
  - Ask: ""Before anyone talks about a payment: has your sanctions screen cleared? An 82 percent match to a designated affiliate is not cleared. Has the FBI been notified? We cannot consent while the match is open.""
  - Ask: ""What is your business-interruption estimate per day, and when did the 8-hour waiting period start? I need a number with a date on it, not 'not yet determined'.""
  - Concede only when: Once notice is given with the incident start time and the engagement letters are sent: opens claim BHM-27-0912 and consents to Blackwater Cyber and Harrow Fenn LLP retroactively from 15:00.
  - Concede only when: Once a dated BI estimate and a recovery plan are provided: confirms that BI cover runs after the 8-hour waiting period, subject to the 2-million-dollar retention.
  - Concede only when: Will reconsider consent to a payment only after a written sanctions clearance from counsel and confirmation of law-enforcement notice. Never before.
- **Business reporter, Rock River Gazette** — _Trigger: The 18:32 phone slip (I-07) or the 22:20 phone slip (I-15b), or the Chief Communications Officer calls the reporter back with or without an approved statement._
  - Ask: ""My source says all three plants are shut down and customer data was stolen. Is that wrong? Then tell me what's right, on the record. My deadline is 20:00 for the web edition.""
  - Ask: ""Is it ransomware? Yes or no. 'Cybersecurity incident' tells my readers nothing.""
  - Ask: ""The hackers just posted what look like employee Social Security records and defense drawings. Did you pay, or are you going to? Is this material for your shareholders? I have until 22:45.""
  - Ask: ""If I don't hear back, the story says Ironcrest declined to comment. Who's your spokesperson, and can I quote them by name?""
  - Concede only when: If an approved holding statement arrives before the deadline: quotes it and includes "the plants continue to operate in manual mode" alongside the source's claim.
  - Concede only when: If the company gives specific facts on the record that contradict the source (no customer data confirmed so far): runs a write-through with the correction and the attribution.
  - Concede only when: Will hold for 15 more minutes, once only, if the CCO gives a time-certain promise of a statement.
- **VP Supply Chain, Fieldmark Equipment** — _Trigger: Players return Fieldmark's calls (I-03, I-08), send or draft the supply notice, or respond to the Friday request for a written lot-traceability guarantee (I-17)._
  - Ask: ""Our planners see nothing from your portal and nobody at Joliet answers. The contract needs written notice of any supply disruption within 72 hours. When do I get it, and does it give dates or just 'temporary IT disruption'?""
  - Ask: ""Are you invoking force majeure? Because if you are, I want it in writing tonight, and my lawyers will read it next to whatever you file with the SEC.""
  - Ask: ""I need a signed guarantee before 12:00 that every drive you've shipped to us since March 24 is traceable to its heats and test records. Your MES was down. How can you sign that?""
  - Ask: ""Your newspaper says your data is out. Were any of our drawings or orders in it?""
  - Concede only when: Once there is a written supply status with dates that match the company's other statements: accepts it as the 72-hour notice and agrees to talk again in 24 hours.
  - Concede only when: Instead of a blanket guarantee, will accept a written lot-reconciliation plan with manual-mode production records for the affected period, and will hold off quarantining stock while it is checked.
  - Concede only when: Will not waive the 5-day penalty clause, but will agree in writing on when the clock started.
<!-- /section:rules -->

<!-- section:rubric -->
### 4. Evaluation & Grading Rubric

| Metric | Assessment | Linked injects |
|---|---|---|
| **Metric 1: Disclosure Decision Coordination (30 Points)** | ☐ **Fail:** GC lets the Disclosure Committee slip past 19:00 or adjourns it to the board meeting at I-10, and the record is missing the determination, who decided, when, the facts known or the basis. CFO has no dated impact range despite the I-05 request, the trading window stays open, or the I-11 Beloit correction is used to reopen and delay the determination. ☐ **Pass:** GC as chair fills in every worksheet field at I-10 with CEO and CFO concurrence and chooses Item 1.05, Item 8.01 or no filing yet. GC states the deadline in Central and Eastern time (Wed March 31, 4:30 p.m. CT / 5:30 p.m. ET if material) and the Corporate Secretary closes the trading window and tells the 10b5-1 administrator; CFO's range is ready for 19:00 and the I-08 bank and auditor calls are booked after the committee. ☐ **Excellence:** GC sets the 19:00 committee at I-04, and the CFO has a dated range with stated assumptions against the 60-million-dollar threshold before the I-06 time jump forces it. GC records the I-11 correction as a trigger to reconvene and reconvenes on her own after I-13 and I-15 to confirm or revise the determination, without waiting for the ENDEX reconciliation. | I-05, I-08, I-10, I-11, I-13 |
| **Metric 2: Recovery & Forensic Judgement (30 Points)** | ☐ **Fail:** CISO restores a backup before Blackwater clears it (I-04), or the BCM accepts the CIO's 'recovered' claim at I-17 and lets it reach the board. At I-19 svc_wmsvendor stays enabled with Domain Admins rights, or the payroll file misses the 10:00 cut-off at I-20. ☐ **Pass:** BCM reports elapsed time against each IBIARO 3 RTO and MTPD at the 4-, 8-, 12- and 24-hour checkpoints (I-06, I-16) and keeps the MES RED until lots are reconciled. CISO withholds the return signature at I-17, disables svc_wmsvendor again and blocks the legacy MFA bypass at I-19, and the CFO sends the March 19 file plus verified adjustments by 10:00 at I-20 and freezes direct-deposit changes. ☐ **Excellence:** BCM sets a recovery order at I-06 that puts payroll funding and largest-customer supply first, with a burn-down of the 5-day buffer, before I-17 and I-20 force the question. CISO has Blackwater check restored configurations for reintroduced identities before the I-19 alert fires, and Joliet's 60-percent minimum service (about 2,460 orders a day) is flagged as at risk ahead of time. | I-04, I-06, I-17, I-19, I-20 |
| **Metric 3: Fact Sheet & Stakeholder Communication (20 Points)** | ☐ **Fail:** CEO does not approve the I-07 holding statement by 20:00, so the I-12b wire reports that the company declined to comment. The CHRO note saying 'no employee data affected' goes out at I-15b, or inconsistent drafts and the 'restored' line reach the board unchallenged at I-18. ☐ **Pass:** CEO approves a fact-sheet holding statement at I-07 that corrects the claim that all plants are shut down without guessing about data. GC stops and corrects the CHRO note at I-15b, IR gives analysts only filing-consistent text at I-12b, and the CEO and GC brief the board at I-18 only from the fact sheet and withdraw any mismatched supply or employee drafts. ☐ **Excellence:** PIO/CCO updates the single fact sheet right after each scope change (I-11 Beloit, I-13 exfiltration) and sends an employee note on payroll and layoffs before the I-12b rumours peak. GC runs the consistency check across the 8-K draft, the Fieldmark and Granite Peak notices and the employee note before Dr. Samuel Obuya has to raise it at I-18. | I-07, I-12b, I-15b, I-18 |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ **Fail:** CEO decides the ransom at I-14 without citing IBODAI 3, or treats the COO as able to authorize payment, which ICMP 8 rules out. Students skip sanctions screening, Blue Heron Mutual consent, FBI notice or Audit Chair consultation, or give the insurer no notice until I-14. ☐ **Pass:** CEO logs a refuse or pay decision at I-14 with the time, the facts known and the basis. The log cites IBODAI 3 (board approval above 5 million dollars, sanctions clearance, insurer consent, Audit Chair consultation) and ICMP 8 (delegated authority does not cover ransom). CFO files notice with Blue Heron Mutual at I-05 under IBIARO 6 and IBODAI 5, and the board is told within the IBODAI 2 window at I-03b. ☐ **Excellence:** Students cite IBODAI 3, IBODAI 5, ICMP 8, IBIARO 3 and IDCCI 5 by number, and they start sanctions screening, the insurer claim and the FBI channel before the I-14 paper arrives. The CEO ties the refusal to the IBIARO 3 recovery dates and the materiality duty, and the BCM commits at I-16 to the ICMP 9 after-action report within 10 working days. | I-03b, I-05, I-14, I-16 |

Total: 100 points.
<!-- /section:rubric -->

<!-- section:hotwash -->
### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask the room for three things that went well and three that broke or failed, so you get strengths and gaps before memories fade. Go around the room team by team (CMT, IT/Security, Legal/Disclosure, Communications, Operations), write every item on the whiteboard in two columns, and don't debate an item until each team has had its turn.

**Key Discussion Questions for Six Days Out:**
- **The Call:** At the 19:00 Disclosure Committee you had I-09 from five minutes earlier: exfiltration confirmed, contents unknown. At 21:00, I-13 confirmed about 1.2 TB taken, including a Finance close share, six days before quarter end. What did you record at 19:00: material, not material or not yet determined? Did you choose Item 1.05, Item 8.01 or no filing yet, and did you close the trading window? Who decided, and on what basis? When I-13 changed the facts, did anyone reopen that determination, or did the 19:00 decision stand by default? _(Objective: Decision Making)_
- **The Ransom:** When the I-14 Ransom Decision Paper landed at 21:30, the sanctions screen was unresolved (an 82% match to MOLTEN SYNDICATE, and a wallet one hop from a designated cluster). Blue Heron Mutual said it could not consent, and the FBI recommended against paying. Did you work through the IBODAI 3 delegation of authority step by step: sanctions, insurer, FBI notice, the Audit Committee Chair and the board approval needed above 5 million dollars? Or did the 15% discount and the 24-hour clock pull you into a debate about paying? When did you first contact the FBI and the insurer, and what would have let you close this decision faster? _(Objective: Use of Doctrine)_
- **Trust:** I-13 showed that the attacker came in through svc_wmsvendor, the Joliet warehouse vendor's own support account, with an MFA bypass on 22 March. Up to then, when did you stop trusting vendor remote access, the Dubuque replica and the 31-hour-old backup? When did you call the vendor, and did you disable all vendor accounts and reset krbtgt twice before you planned any rebuild? Or did the recovery plan assume the environment was clean? _(Objective: Recovery Management)_
- **The Gap:** The BCM tracker in I-14 put a refuse-and-rebuild MES at minimum service around day 4 to 5, plus manual re-entry of 31 hours of lots. Against the 5-day finished-goods buffer and Fieldmark's penalty clause, did you judge MES, Joliet and ERP against the IBIARO 3 RTOs at the 4, 8, 12 and 24-hour checkpoints, or against hope? What recovery order did you set to protect payroll funding and the largest customers? Did operations understand what the technical team meant by 'rebuilt, not cleaned' and 'forensic clearance', and did the technical team understand what operations meant? _(Objective: Recovery Management)_
- **One Set of Facts:** At 18:32 the Rock River Gazette (I-07) claimed that all three plants were shut down and customer data was stolen, with a 20:00 deadline. What did you tell the reporter before you knew the facts, and did you approve the words 'cybersecurity incident' or 'ransomware'? After I-09 and I-13 confirmed HR data was stolen, did that holding statement still match the employee message, the Fieldmark and Granite Peak supply notices, the 8-K draft and the 07:00 Friday board briefing? Who owned the single fact sheet, and where did the versions drift apart? _(Objective: Communication)_
<!-- /section:hotwash -->



*End of Handbook*

<!-- section:toolkits -->
### Toolkits used

This exercise draws on field expertise from these toolkits. Their terms, product formats and realism rules shaped the injects.

- **Governance decisions**: The corporate decision layer for any exercise: board briefings, a materiality worksheet, Form 8-K disclosure drafts, a business impact analysis, a ransom decision paper, legal hold and privilege notices, regulator inquiries, insurer and auditor notices, investor questions, a decision log and succession documents. Stays at the level of governance decisions and their records; it is an exercise aid, not legal advice, and every company, person and adviser in it is fictional.
  - Data sources: sec-edgar-8k
  - Reference documents: SEC Release 33-11216: Cybersecurity Risk Management, Strategy, Governance, and Incident Disclosure; SEC fact sheet: Public Company Cybersecurity Disclosures; CISA Tabletop Exercise Package: Ransomware; CISA Tabletop Exercise Package: Insider Threat; NIST SP 800-61 Rev. 3: Incident Response Recommendations; NIST SP 800-34 Rev. 1: Contingency Planning Guide; NIST Cybersecurity Framework 2.0; FFIEC IT Handbook: Business Continuity Management; OFAC advisory on sanctions risks of ransomware payments; FEMA Continuity Guidance Circular; Ready Business: Business Impact Analysis worksheet; Ready Business: Business Continuity Plan template
- **Media environment**: The news cycle and social feeds around an incident: wire alerts, articles and broadcast segments, social posts whose reach and sentiment change over time, reporter calls and press conference questions, and verification tasks with provenance clues. Simulated spread and sentiment are teaching models, not predictions. All outlets, handles and people are fictional.
  - Data sources: gdelt
  - Reference documents: FCC report on the Hawaii false alert (2018): a correction case study
<!-- /section:toolkits -->
