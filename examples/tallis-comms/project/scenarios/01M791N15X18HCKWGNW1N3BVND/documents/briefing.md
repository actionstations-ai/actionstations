# Player Briefing Packet
## Sample Rows — Web Store Export, Correction & Disclosure

Location: Tallis Home Products, Inc., Communications Cell, Conference Room 3B, Dayton, Ohio · Exercise Duration: 4 Hours
Current Time: 07:30 AM (Exercise Time) · Weather: Dayton, Ohio: overcast, 38°F, with light drizzle forecast for the morning commute.

### 1. Situation Brief

It is Tuesday, March 9, 2027, at the Tallis campus in Dayton. Tallis Home Products, Inc. (fictional) is a company with 6,800 employees and $2.4 billion in net sales. It sells small kitchen appliances, floor and surface cleaning products and a replacement filter and pod subscription. Most sales go through retail partners such as Brightwater Markets, and the web store at tallishome.example brings in 14 percent. Today is an ordinary weekday. The web store expects about 11,000 orders, and status.tallishome.example shows all systems operational after last night's scheduled 02:00–04:00 ET maintenance. The 120-agent customer care center opened at 07:00 with 14 calls waiting, which is normal for this hour. Nothing about any incident is posted on the newsroom page or the company accounts. Social listening is running its usual 24-hour keyword set. The market opens at 09:30 ET. Chief Communications Officer Marcus Delaney has just called the communications team, General Counsel Gerald Okafor and the CISO to a morning check-in in Conference Room 3B on the fourth floor. The bridge line (937) 555-0149 (code 4100) is live, workstations TLC-COM-01, TLC-COM-02 and TLC-COM-03 are logged in, and the fact sheet and statement log are open but empty. Spokesperson Dana Whitcombe is on campus. The approval route in TCCP 3 and the speed targets in TCCP 4 apply as usual.

- Web store (tallishome.example, hosted by CartBridge Commerce): GREEN: Normal weekday load, about 11,000 orders expected; status page shows all systems operational
- Newsroom page and company social accounts: GREEN: No incident statements posted; social tool on two-person approval; banner changes available in 10 minutes
- Social listening: GREEN: Running 24 hours on the standard brand keyword set; next automated report at 07:30 ET
- Customer care center (Dayton, 120 agents): GREEN: Open since 07:00 ET; 14 calls in queue, normal for the hour
- Customer email service: GREEN: Order and newsletter sends normal; 400,000-per-hour send limit
- Security operations center (Dayton, 24 hours): GREEN: Staffed; on-call analyst and CISO reachable; Cardinal Forensics on retainer

**The Anomaly:** **07:35 ET, shift-log note forwarded by the Dayton SOC on-call analyst, Financial, to the CISO, with General Counsel and the CCO copied:**

> "FYI for the morning check-in: at 06:40 ET our monitoring flagged an unusually large customer export through the CartBridge integration account (cartbridge-integration-prod). As a precaution, the CISO suspended that integration key at 07:05 ET and the export stopped. The web store itself is up. We haven't contacted CartBridge Commerce in writing yet. I'll send the full alert details to the CISO shortly."

No one outside Security has asked about this yet.

**YOUR MISSION:** Keep Tallis Home Products' communications steady and credible with customers, employees, reporters, retail partners and investors while you find out what happened with the web store export and handle it. You must balance speed against verification. The 60-minute holding statement target and reporters' deadlines will push you to publish, but every number and claim must come from the fact sheet, go through the approval route in TCCP 3, and be the same across the newsroom page, the company accounts, the customer email and any filing.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Communications Command (CCO)**— Chief Communications Officer (COMMS) | You own the communications strategy, final approval of every external statement, the choice of who speaks, and any decision on a press conference. You set the cell's pace and make sure every message goes through the approval route. | **Approve: Nothing goes out without your approval and an approval time on the statement log; the speed targets never replace the TCCP 3 route.** **Correct: If a published statement turns out to be wrong, correct it quickly and plainly, saying what was wrong and what is right, instead of letting it stand.** **Align: Release no number until it matches the fact sheet and what the Disclosure Committee would file; put the designated spokesperson forward, and never the CEO first.** |
| **Team B: Writing and Fact Sheet (VP Corporate Communications)**— VP Corporate Communications (Writer) | You own the time-stamped fact sheet and every draft that comes from it: holding statements, corrections, message maps, Q&A and the customer email. If it isn't on the fact sheet, it isn't in the text. | **Fact Sheet: Write only from the fact sheet, and give every line a time stamp and a named source.** **Unknown: If the fact sheet doesn't settle a claim, write 'we are investigating', never a reassurance you can't yet back up.** **Holding: If the CCO is absent, you may approve holding statements only, and nothing more.** |
| **Team C: Media Relations**— Media Relations Manager (MEDIA) | You own every reporter call and email, the reporter log and its deadlines, and, together with the CCO, the choice of on the record, on background or decline. No reporter's deadline should pass without a reply. | **Log: Record each reporter, question and deadline as it arrives, and reply before the deadline, even if the reply is a decline or 'we will update at a set time'.** **Terms: State whether you are on the record or on background before you answer, and give no number that isn't on the fact sheet.** **Escalate: Send live-interview requests and fact-checker questions to the CCO; don't commit the spokesperson yourself.** |
| **Team D: Social Media and Listening**— Social Media Manager (SOCIAL) | You own the company social accounts, social listening, the listening report every 30 minutes while the cell is open, and takedown requests for impersonation and phishing. You are the cell's early warning for public narratives. | **Record: Log each spreading claim word for word, with the time and the account; don't reply until the CCO approves.** **Takedown: Report look-alike or impersonation content to the platforms with the URL and a screenshot, and pass it to Security for the IC3 report.** **Same Words: Post only approved text, with the same numbers as the newsroom page and the customer email.** |
| **Team E: Legal and Disclosure (General Counsel)**— General Counsel (Disclosure Committee Chair) | You own clearance of any statement on cause, scope, number of people affected, legal duty or fault, and you chair the Disclosure Committee on materiality and any Form 8-K. The filing, press statements, customer email and board update must tell one consistent story. | **Clear: Clear holding statements within 20 minutes and full statements within 90 minutes, and hold a statement only for a stated legal reason.** **Decide: Make the materiality decision without unreasonable delay; if the facts aren't enough, record 'not yet determined' with a fixed time to reconvene.** **Privilege: Direct the forensic work through counsel, and keep conclusions about fault or vendor blame out of chat and email.** |
| **Team F: Security and Technical Facts (CISO)**— CISO | You own the verified technical facts about the CartBridge integration and web store, the work with Cardinal Forensics, and contact with law enforcement and CISA. You confirm the facts on every technical line before it goes out. | **Verify: Confirm technical facts by replying on the draft; any count not yet confirmed is 'not yet known', never an estimate.** **Containment: Keep the CartBridge integration key suspended and the logs preserved, even if the vendor or the business pushes to restore service.** **Silent: Give facts to the cell only, never to the press; coordinate CartBridge Commerce's statements and do not blame the vendor in public.** |

### 3. Rules of Engagement

- Start and end every phone call, bridge-line message, email and chat post with 'This is an exercise', so that no reporter, retail partner, customer care agent or investor who overhears or receives it mistakes it for a real Tallis incident.
- If a real emergency happens, anyone may say 'REAL WORLD, REAL WORLD'; the exercise stops at once and everyone in Conference Room 3B turns to the real event.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead. When that happens, update your logs, deadlines and fact sheet to the new clock and carry on.
- Treat every printed inject (social posts, SOC alerts, reporter emails, wire alerts, listening reports, photos and screenshots) as real intelligence, and verify, log and act on it as you would on a working day, because the exercise only works if the material is taken seriously.

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
| Fact sheet and statement log (Conference Room 3B) | | |
| CartBridge web store and vendor API credentials | | |
| Newsroom page and company social accounts | | |
| Customer email service (400,000 per hour send limit) | | |
| Customer care queue and call scripts | | |
| Disclosure Committee decision record and 8-K filing route (Harbor Filing Services) | | |
| Public and investor sentiment (stock price, viral claims) | | |

*End of Briefing Packet*
