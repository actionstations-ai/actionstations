# Player Briefing Packet
## Escrow Echo — Deepfaked Executives, Wires & Public Trust

Location: Tamarack Precision Components, Inc., Greenville, South Carolina · Exercise Duration: 4 Hours
Current Time: 09:30 AM (Exercise Time) · Weather: Greenville, SC: partly cloudy and 78°F, with light winds and no weather delays reported.

### 1. Situation Brief

It is Tuesday, September 14, 2027, at Tamarack Precision Components headquarters on the Greenville campus. It is a normal mid-September business day (08:00–17:00 Eastern), and nothing unusual is expected. Treasury is working a routine payment day. The Treasury Workstation queue holds 23 vendor payments, none above $250,000. They will move over the secure link to First Meridian Commercial Bank before the 15:00 Eastern international wire cutoff, and accounts payable is starting to stage Thursday's weekly steel and tooling run of about $3.2 million. Staffing is thinner than usual at the top. The CFO boarded a flight from Greenville to Querétaro at 09:10. He lands at 12:50 Eastern, the flight has no Wi-Fi, and plant meetings follow. The Treasury Manager is on a plant visit at Spartanburg and can be reached by mobile only between walk-throughs. The CEO, the Controller, the General Counsel, the CISO and the Director of Corporate Communications are all in the building. On the systems side, the email security gateway and endpoint protection are running normally. The security operations center (the managed service plus two in-house analysts) reports a normal posture. The supplier-quality vision model on the Poznań and Spartanburg lines, the procurement assistant and the HR policy chatbot are all in normal use. The Monterrey and Querétaro plants are just starting their day, two hours behind Eastern time.

- Treasury Workstation payment queue and audit log: GREEN: 23 routine vendor payments queued, none above $250,000. Multi-factor tokens and audit log normal. International cutoff 15:00 ET.
- First Meridian Commercial Bank link and fraud desk: GREEN: secure link up. Wire volume within the usual 25–40 a day. Fraud line staffed 24 hours.
- Email gateway, video meeting service and endpoint protection: GREEN: all services available. No open priority alerts.
- Security operations center (managed service + 2 in-house analysts): GREEN: normal posture reported at 09:30 ET.
- Executive reachability: GREEN: CEO in building. CFO in flight to Querétaro (lands 12:50 ET, no Wi-Fi). Treasury Manager at Spartanburg, reachable by mobile between walk-throughs. Controller in office.
- Communications and social listening: GREEN: no open media queries. Employee and public sentiment quiet.

**The Anomaly:** **09:40 ET, SOC digest, Greenville corporate office**

One of the CISO's two in-house security analysts is working through the morning email gateway digest at his desk in the IT and security area. Among the usual items is one message that the gateway **delivered** rather than quarantined. It came from an external sender to the Treasury Analyst at 09:40:12 EDT. The subject line refers to a confidential finance matter, and the message carries a calendar attachment (invite.ics) for a meeting today from 10:05 to 10:35 EDT. The digest shows SPF and DKIM passing for the sending domain. The meeting platform shows its standard banner noting that the organizer is outside the Tamarack tenant. The gateway let the message through because the sender has no reputation hits.

The analyst flags the entry for routine review and copies Treasury in case anyone expects the meeting. No one has reported a problem.

**YOUR MISSION:** Maintain Tamarack's normal payment operations, meet today's 15:00 Eastern wire cutoff and prepare Thursday's vendor run, while investigating and resolving any irregularity that arises in payments, communications or executive instructions. You must balance speed against verification: a missed cutoff costs money and goodwill, but a payment released on an unconfirmed instruction may never come back. Every decision and every figure you use must be one you can defend later.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Treasury (Fraud and Treasury Lead)**— Treasury Manager (Fraud and Treasury Lead) | You own first approval of payments in the Treasury Workstation, holds on pending wires, recall of released wires through the bank, and callback discipline across Treasury. You also keep the payment records that feed the reconciliation. | **Callback First: no payment to a new beneficiary, outside the calendar or outside the normal workflow moves until the approver has called back on the vendor master or company directory number. A callback that does not reach the person counts as not done, and the payment stays on HOLD.** **Hold Beats Speed: if a release and a doubt arrive together, put the wire on HOLD and miss the 15:00 cutoff rather than release it and hope.** **Bank Desk Now: if a released wire is in doubt, phone the First Meridian fraud desk first, ask for a recall and freeze as TPC-FIN-04 Section 5 requires, and follow up in writing on the bank portal within 30 minutes.** |
| **Team B: Controller (Payment Control and Reconciliation)**— Controller | You own the second approval on payments of $250,000 and above, and executive-level approvals together with the CEO's delegate while the CFO is unavailable. You also own the signed reconciliation, which is the only source for any loss or payment figure. | **One Number: the only amounts anyone may use are the ones in your signed reconciliation. Re-sign it whenever a hold, freeze or recall changes a figure.** **Channel Check: treat any approval request that arrives by chat, email or meeting link as unconfirmed until a callback on a directory number confirms it.** **Delegate, Don't Assume: while the CFO is in the air, executive-level decisions go to you and the CEO's delegate as TPC-FIN-04 requires, never to someone who only claims to speak for an executive.** |
| **Team C: Chief Financial Officer (Finance Executive)**— Chief Financial Officer (Finance Executive) | You own executive approval of payments of $1,000,000 and above, approval of loss figures and bank steps, and escalation to the CEO and the Audit Committee chair. Note that you are unreachable while airborne until the facilitator says otherwise. | **Token Or Nothing: state clearly, in writing, that no payment instruction in your name counts unless you entered it in the Treasury Workstation with your own token.** **Escalate Upward: brief the CEO and, through the corporate secretary, the Audit Committee chair within any required window. Do not wait for recovery results.** **Truth Over Reassurance: approve only figures the Controller has signed, even if a smaller number would calm the board or the press.** |
| **Team D: Chief Information Security Officer (Incident Commander)**— Chief Information Security Officer (Incident Commander) | You own the decision to declare an incident and the technical response, including evidence preservation, use of SynthCheck and Content Credentials checks, and liaison with the FBI field office and outside vendors. If you declare, you open the war room under TPC-SEC-02. | **Declare Early: if any report suggests a payment was released on an unverified instruction, declare under TPC-SEC-02 and open the war room bridge without waiting for certainty.** **Preserve Before Acting: under TPC-SEC-02 Section 4, lock down recordings, invitations, chat logs, email headers and the Workstation audit log in the incident vault before anyone deletes, forwards or 'cleans up' anything.** **Score With Caveats: report any detector result with its score, its false positive and false negative rates and its uncertainty. Remember that missing Content Credentials prove nothing, and that a detector is one input, never proof.** |
| **Team E: General Counsel (Legal)**— General Counsel | You own legal hold, privilege, law enforcement reports, insurer and broker notice, and approval of any statement that mentions a loss, fraud, an investigation or an AI system. | **Verify Your Own Name: confirm internally which meetings and messages you actually took part in today, and treat any instruction attributed to you that you did not give as suspect.** **Clock Board: if an incident is declared, track every notification clock in TPC-FIN-04 Section 5 by the hour (law enforcement, insurer and broker, board), and do not let recovery work push them back.** **Approve, Don't Delay: review statements fast, keep language about law enforcement to what has actually been filed, and never confirm or deny confidential business transactions.** |
| **Team F: Director of Corporate Communications**— Director of Corporate Communications | You own media response, holding statements, employee and plant messages (including Spartanburg), scripted outreach to suppliers and partners, social listening, and any takedown requests to platforms. | **Verify Before Voice: confirm facts with the named executive through a directory callback before you characterize any media item, and never call content fake only because a detector said so.** **Employees First: staff at affected sites hear from the company no later than the public does.** **Be First, Be Right: keep a General Counsel–approved holding statement under 150 words ready ahead of any reporter deadline, using only the Controller's signed figures, and have account owners warn outside partners by script, not by mass email.** |

### 3. Rules of Engagement

- Start and end every phone call, bridge call, chat or email you make during play with "This is an exercise". The Treasury Workstation, the First Meridian fraud line and the reporter's inbox are real, and that phrase keeps a colleague, the bank or the press from acting on a simulated event.
- If a real emergency occurs, such as a medical issue, a real security alert or a real payment problem, say "REAL WORLD, REAL WORLD". The exercise stops immediately so everyone can deal with it.
- The facilitator may announce "Time Jump: it is now [time]" to skip ahead. Accept the new clock at once, because wire cutoffs, the reporter's deadline and notification windows will have moved with it.
- Treat every printed inject (emails, gateway digests, SOC alerts, meeting logs, chat screenshots, bank confirmations, social posts and news items) as real intelligence, and act on it as you would in your actual role, because that is the only way you will learn what is happening today.

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
| Treasury Workstation payment queue and audit log | | |
| Bank fraud desk recall and freeze of the wires | | |
| Video meeting service logs, recording and external invitation | | |
| Executive reachability (CFO in flight, Treasury Manager at plant) | | |
| Controller's signed reconciliation | | |
| Holding statement and platform takedown of the 'CEO' clip | | |
| Spartanburg employee and public sentiment (social listening) | | |

*End of Briefing Packet*
