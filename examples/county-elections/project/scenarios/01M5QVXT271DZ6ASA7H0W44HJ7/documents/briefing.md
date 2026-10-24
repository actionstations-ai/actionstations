# Player Briefing Packet
## Ghost Poll Pads — VoterTrack Compromise & Public Trust

Location: Lisle County Board of Elections, Carrow, Lisle County, Ohio · Exercise Duration: 4 Hours
Current Time: 08:00 AM (Exercise Time) · Weather: Clear, 58°F

### 1. Situation Brief

It is a busy Tuesday morning in Lisle County, with the Early Vote Center at 18 South Market Street operating at full capacity. The Board office is staffed with election personnel managing voter check-ins, mail ballot processing, and coordination with rovers and the hotline. Twelve polling locations across the county are open and functioning, including Polling Location 6 at Carrow Community Church, where 12 poll workers are on shift. The warehouse and central count facility at 640 Industrial Parkway is secured and preparing for post-election processing. Drop Box 1, located outside the Board office, is under surveillance and receiving ballots. The results-reporting site is live and updating, and all operational systems—including precinct-count optical scanners, central-count high-speed scanners, ballot-marking devices, the air-gapped election management system server (LCBOE-EMS01), removable media, and the results upload workstation—are online and reporting normal status. The tabulation-room video surveillance, tamper-evident seals and seal logs, and access control systems for the warehouse and central count are all active and compliant. All teams are on duty and operating under standard procedures.

- Early Vote Center (18 South Market Street): Normal
- Warehouse and Central Count (640 Industrial Parkway): Normal
- Drop Box 1 (Carrow Community Church): Normal
- Precinct-count optical scanners (DS200): Normal
- Central-count high-speed scanners (DS850): Normal
- Ballot-marking devices (BMD 1, BMD 30): Normal
- Air-gapped election management system server (LCBOE-EMS01): Normal
- Removable media and results upload workstation: Normal
- Tamper-evident seals and seal logs: Normal
- Tabulation-room video surveillance: Normal
- Warehouse and central-count access control: Normal
- Drop boxes with cameras: Normal
- IT and network services: Normal
- Security and facility access: Normal
- Staffing levels: Normal

**The Anomaly:** 08:12 — A call comes in via the election hotline (555-0140) from Janet Cho, a poll worker at the Early Vote Center (18 South Market Street). She reports that 23 voters who are present in person are showing as 'Mail Ballot Received' in the system, but their names do not appear on the paper backup list. She states, 'This is not right — these people are here to vote in person. Can someone please help?'

**YOUR MISSION:** Maintain continuous, accurate voting operations across all 12 polling locations and the Early Vote Center while investigating and resolving a systemic discrepancy in the voter status data, balancing the need for immediate verification against the risk of cascading errors or public confusion.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)** | You own the activation of contingency plans, coordination of rovers and relocations, and oversight of the status board and incident log. You are responsible for ensuring that all teams adhere to standing orders and that the Board remains informed of operational status and system anomalies. | **Act First: if the Board's public statements and legal advice conflict, follow the Director's directive as Incident Commander.** **Verify All: never accept a system status as final without cross-checking with the physical log or a second source.** **Delegate Authority: if the Board is delayed, use COOP-DR-2 to move the Early Vote Center to the alternate site without waiting for full approval.** |
| **Team B: IT and Security** | You own the network, email, identity, voter registration system access, results website, and isolation decisions. You are responsible for identifying and containing any cyber compromise, preserving forensic evidence, and ensuring that no unauthorized access persists. | **Isolate Fast: if a user account is compromised, isolate the system and disable access within 5 minutes.** **Preserve Logs: never delete or alter logs before forensic review; preserve all access and authentication records.** **Report Out: immediately contact the managed SOC and CISA if external data exfiltration is detected.** |
| **Team C: Voting Systems** | You own logic and accuracy testing, tabulator chain of custody, seals, and vendor escalation. You are responsible for ensuring that all tabulation equipment remains secure and that no unauthorized access or tampering occurs during the incident. | **Chain of Custody: if any tabulator or media is moved or accessed during a cyber incident, document the event and notify the Director immediately.** **Test All: never proceed with a tabulation without a verified, air-gapped logic and accuracy test.** **Escalate Fast: if a vendor (e.g., ES&S) fails to respond within 30 minutes, contact the U.S. Election Assistance Commission directly.** |
| **Team E: Security** | You own warehouse access, ballot transport escorts, threats to staff, and protest response. You are responsible for securing all facilities, ensuring two-person access to sensitive areas, and responding to any credible threat or breach. | **Secure All: if any facility shows signs of unauthorized access, secure the perimeter and contact the Sheriff's Office immediately.** **Escort All: if a ballot transport is delayed or rerouted, ensure a two-person escort is in place at all times.** **Report Threats: if a staff member reports a credible threat, immediately notify the Director and the Sheriff's Office.** |
| **Team F: Communications** | You own voter information, rumor control, media messages, and the Board’s public narrative. You are responsible for crafting and disseminating all public statements, ensuring consistency with legal and technical guidance, and preventing misinformation. | **Speak Only: the PIO is the only authorized voice to the media; all messages must be cleared with the Director and counsel.** **Fact First: every public message must state what is known, what voters should do, and where to get help; never speculate on responsibility.** **Rumor Log: maintain LCBOE-F-25 and update it every 10 minutes during a Level 2 or Level 1 incident.** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with the phrase 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs (e.g., fire, active threat, medical crisis), immediately say 'REAL WORLD, REAL WORLD' and the exercise will stop.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead in the narrative and simulate elapsed time.
- Printed injects (posts, logs, photos, reports) are to be treated as real intelligence and used to inform decisions.

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
| VoterTrack database (LCBOE-SQL01) | | |
| Pollbook build workstation (LCBOE-PB01) | | |
| Results website (results.lislevotes.example) | | |
| Board website (lislevotes.example) | | |
| Early Vote Center (18 South Market Street) | | |
| Warehouse and central count (640 Industrial Parkway) | | |
| Drop Box 1 (Carrow Community Church) | | |
| Air-gapped election management system server (LCBOE-EMS01) | | |
| Tamper-evident seals and seal logs | | |
| Tabulation-room video surveillance | | |
| Polling Location 6 (Carrow Community Church) | | |
| IT service desk (555-0150) | | |
| Managed SOC (Buckeye Ridge) | | |
| CISA (report@cisa.dhs.gov) | | |
| FBI Election Crimes Coordinator (Cincinnati Field Office) | | |

*End of Briefing Packet*
