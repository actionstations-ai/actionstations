# Player Briefing Packet
## Six Days Out — MES Ransomware, Materiality & Disclosure

Location: Ironcrest Machinery Corporation headquarters, Rockford, Illinois · Exercise Duration: 4 Hours
Current Time: 01:45 PM (Exercise Time) · Weather: Rockford, Illinois: overcast, 44°F, light wind. No weather problems at Rockford, Beloit, Dubuque or Joliet.

### 1. Situation Brief

It is Thursday, March 25, 2027 (Central Time), six days before quarter end, and Ironcrest Machinery Corporation (fictional) is busy with its quarter-end push. Plant 1 in Rockford (3,200 employees, 38 percent of transmissions), Plant 2 in Beloit (2,100 employees, hydraulic drives) and Plant 3 in Dubuque (1,900 employees, transmissions and final assembly) are all running normal three-shift production. Work orders and lot control at every plant run through the manufacturing execution system (MES). The MES is hosted in the Rockford data center and replicated to Dubuque. The Parts Distribution Center in Joliet is on track for its usual 4,100 parts orders, with carrier pickups at 16:00 and 17:30. Headquarters in Rockford is fully staffed with 1,100 people. Finance is preparing the quarter close in the cloud ERP, and treasury is lining up payroll funding for the Friday file to Northbridge Payroll. Customer service is answering routine order-status calls from Fieldmark Equipment and Granite Peak Machinery, which together account for 41 percent of sales and are counting on on-time quarter-end deliveries. Each plant holds its normal 5 days of finished goods and 9 days of key purchased parts. Nothing unusual has been escalated to executives today.

- Plants 1–3 (Rockford, Beloit, Dubuque): production and plant control networks: GREEN: three-shift quarter-end production on plan; safety, fire and gas systems normal
- MES and lot tracking (Rockford data center, Dubuque replica): GREEN: work orders and lot tracking available at all three plants; replication current
- Joliet warehouse management system and dealer/OEM portal: GREEN: on track for about 4,100 parts orders; carrier pickups scheduled 16:00 and 17:30
- ERP, treasury and payroll funding: GREEN: ERP (cloud region Central US) normal; Friday payroll file to Northbridge Payroll on schedule
- Board portal and Disclosure Committee record: GREEN: available; no open matters
- Customer supply buffer (Fieldmark, Granite Peak): GREEN: 5 days of finished goods at each plant; customers report normal inventory

**The Anomaly:** **IT service desk ticket, 13:40 CT, Plant 3, Dubuque, Iowa**

The second-shift production supervisor on the Plant 3 final assembly floor logs a routine ticket: *"MES screens at the assembly stations are hung. Work orders won't load and lot scans just spin. Operators have restarted two terminals and it didn't help. The line is still moving for now. Can someone take a look? Priority normal."*

The ticket is in the standard service desk queue. No other site has reported anything.

**YOUR MISSION:** Keep the three plants, Joliet shipping, payroll and the quarter close running for Ironcrest's customers and employees while you investigate and resolve whatever is behind today's systems problem. You will have to balance keeping operations going against containing the problem, and acting fast against checking your facts. Every decision, recovery claim and statement to the board, customers, lenders or the public must match what has actually been confirmed and the recovery targets in IBIARO 3.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: CEO (Command)**— Chief Executive Officer (Chair, Crisis Management Team) | You own command of the company's response: chairing the Crisis Management Team, declaring a crisis level, approving public statements and regulator contact, and keeping the Chair of the Board informed. | **Decide on the Record: log every decision with the time, what was known and the basis, and never push a meeting back to buy time.** **Truth Over Reassurance: tell the board, customers and employees what is known and what is not, even when the news is bad.** **Recovery Order: set recovery priorities on the Business Continuity Manager's recommendation, not on a vendor's or a plant's promise, and stay within company policy on any outside demand.** |
| **Team B: CFO (Finance)**— Chief Financial Officer | You own the financial impact estimate, liquidity, contact with the agent bank (Prairie Lakes Bank) and the insurer, and certification of related filings. | **Numbers First: give a dated impact range with stated assumptions, for example sales lost per day of production, before any disclosure discussion.** **Qualitative Counts: weigh data exposure, customer supply and contract notices alongside the dollars.** **Protect Cash: keep treasury payments and payroll funding on schedule for the Friday payroll file, and tell the bank, auditor and analysts only facts that match the agreed fact sheet.** |
| **Team C: General Counsel (Legal and Disclosure)**— General Counsel and Corporate Secretary (Disclosure Committee Chair) | You own privilege, outside counsel and forensic engagement, the Disclosure Committee and any filing, the legal hold, and all contact with law enforcement and regulators. Under IDCCI 2, you convene the Disclosure Committee within four hours of a qualifying escalation. | **Clock Running: reach a materiality determination without unreasonable delay after discovery; the investigation does not need to be finished first.** **Privilege: direct investigative work through counsel, and keep conclusions about fault out of chat and email.** **Sole Channel: only you contact the FBI, the SEC or regulators, and you tell the CEO first where time allows. Inform the Audit Committee Chair by portal note plus a phone call, or by courier and phone if the portal is unavailable.** |
| **Team D: CISO (Technical Response)**— Chief Information Security Officer | You own the technical facts on scope and impact, containment, coordination with the SOC and outside responders, and restoration of systems. | **Facts, Not Hopes: report every finding as confirmed, suspected or unknown, and correct earlier statements promptly.** **Containment Before Continuity: restore nothing until backups are independently verified clean, however hard the plants push.** **Escalate Fast: tell the General Counsel within one hour of any finding listed in IDCCI 2, and share indicators only through the General Counsel's channels, never acting alone.** |
| **Team E: Business Continuity Manager (Recovery)**— Business Continuity Manager | You own the BIA and the recovery tracker. You record elapsed time against each RTO and MTPD in IBIARO 3 at the 4, 8, 12, 24, 48 and 72-hour checkpoints and recommend the recovery order. | **Measure, Don't Hope: report elapsed time against each RTO and MTPD, and mark a function red when it is red.** **Minimum Service: aim first at each function's minimum acceptable level: manual or local line mode, 60 percent of Joliet parts orders, payroll on its regular cycle.** **Clock the Buffer: track the plants' 5 days of finished goods against the largest customers' inventory of under 10 days, and recommend an order that weighs supply, payroll and the quarter close, leaving the decision to the CEO.** |
| **Team F: Audit Committee Chair (Board Oversight)**— Audit Committee Chair | You own board oversight of the disclosure process and the external auditor relationship. You test whether management's reporting is complete, accurate and timely. | **Independent Eye: test management's reasoning and the evidence behind it, and do not just accept the conclusion.** **Ask the Gaps: make sure every briefing states what is known, what is not known and what the board is being asked to decide.** **Minutes Matter: provide oversight, not management, and make sure the minutes record what was reported, what directors asked and what was decided.** |

### 3. Rules of Engagement

- Start and end every phone call, bridge call (including the CMT bridge at (815) 555-0121) and message with "This is an exercise", so that no employee, customer, bank, regulator or reporter mistakes exercise traffic for a real event at Ironcrest.
- If a real emergency happens at any site or in this room, anyone may say "REAL WORLD, REAL WORLD". The exercise stops immediately so the real event gets everyone's full attention.
- The facilitator may announce "Time Jump: it is now [time]" to skip ahead. When that happens, update your trackers, clocks and checkpoints to the new time, because the exercise compresses an afternoon and night into four hours.
- Treat every printed inject (sitreps, alerts, logs, emails, posts, photos and reports) as real information and act on it. Decisions in this exercise are only as good as how you handle the facts you receive.

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
| MES and lot tracking (Rockford and the Dubuque replica) | | |
| Clean backups and forensic clearance | | |
| Joliet warehouse system and dealer portal | | |
| ERP integration and treasury/payroll funding | | |
| Board portal and the Disclosure Committee record | | |
| Customer supply buffer (Fieldmark, Granite Peak) | | |
| Employee and media sentiment | | |

*End of Briefing Packet*
