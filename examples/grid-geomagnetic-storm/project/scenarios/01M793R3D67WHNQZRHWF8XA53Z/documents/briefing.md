# Player Briefing Packet
## Aurora Over Texas — GIC, Conservative Operations & Timing Holdover

Location: Northern Lakes Transmission Operations primary control room, Duluth, Minnesota (backup control room at Virginia) · Exercise Duration: 4 Hours
Current Time: 02:00 AM (Exercise Time) · Weather: Duluth: clear and calm, minus 9 C, light wind off Lake Superior, dry roads. A normal mid-March night.

### 1. Situation Brief

It is 02:00 CDT on Tuesday, 16 March 2027, in the Northern Lakes Transmission Operations (NLTO) primary control room in Duluth. The building is quiet. One Control Room Shift Supervisor is on the night desk. Reliability engineer Dr. Imani Okeke is on call from home, and day shift supervisor Walter Nakamura takes over at 06:00. System load is 2,240 MW, the usual overnight low for March, and should rise to a daily peak of about 2,900 MW. Taconite Ridge, Lake Superior Hydro and Baraga Wind are on line. Arrowhead imports are 610 MW against a 1,000 MW limit and North Shore imports are 340 MW against 600 MW. All 345 kV lines and the 345/230 kV transformers are in service, including the Iron Range T2 autotransformer, and the single spare transformer is stored at Hartley. The Cloquet static var compensator and the Iron Range and Hartley shunt capacitor banks are off line and available. The substation clocks and phasor measurement units take their time from GPS satellites. All 14 GPS-disciplined substation clocks are locked, and the holdover clocks and the backup network time source over fiber at the control center are on standby (NGDOP 7). Today will be busy: six planned 345 kV outages are on the board, including the 14-hour Hartley AT-1 replacement with its crew and crane. The planning desk wants go/no-go answers early in the morning. The Duluth Harbor Terminal hotline is quiet, and the Upper Midwest Reliability Coordinator (UMRC) bridge has nothing scheduled.

- Duluth control room: EMS, SCADA, state estimator and PMU wide-area screen (backup control center at Virginia): GREEN: all systems normal, no open alarms; night shift staffed per roster, reliability engineer on call
- 345 kV system and 345/230 kV transformers (incl. Iron Range T2; Hartley spare in storage): GREEN: all lines and transformers in service; six planned 345 kV outages booked for today
- GIC neutral-current monitors on 345/230 kV transformers (EMS alarms at 75/150/250 A): GREEN: all monitors reporting, all neutral currents below 1 A
- Reactive resources: Cloquet SVC, Iron Range and Hartley capacitor banks: GREEN: off line and available; voltages within the normal range
- Arrowhead and North Shore interface transfers, operating reserve: GREEN: Arrowhead 610/1,000 MW, North Shore 340/600 MW; reserve at normal requirement
- Substation GPS clocks, holdover clocks and Duluth backup network time source: GREEN: 14 of 14 clocks locked, no GPS time error alarms; network time source on standby

**The Anomaly:** **02:00 CDT, Duluth control room: supervisor's log at shift review**

The previous evening's log has a one-line entry:

> *22:30 CDT Mon (03:30 UTC Tue): EXERCISE SWPC Geomagnetic Storm Watch, message code WATA50, received for Tue 16 Mar, G3 (Strong). Logged.*

The log shows nothing else. The NGDOP checklist on the desk is blank, including the box for "Confirm GIC monitors report." The UMRC has not called and the hotline is quiet. The outage board still shows all six 345 kV jobs for today as GO.

**YOUR MISSION:** Maintain reliable 345 kV service, today's planned work and on-time notice to NLTO's 14 entities while investigating and resolving whatever develops from tonight's log entry and the alarms that follow. You must weigh continuity against protecting equipment that cannot be replaced, and speed against checking your data: act early enough to matter, but only on information you have confirmed.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Control Room Shift Supervisor (Command)**— Control Room Shift Supervisor | You own the NGDOP operating procedure in the Duluth control room. You declare each condition, take its actions, keep the log, start each 60-minute notification clock and propose when to end the procedure. | **Act Early: when an SWPC product gives you lead time, take the next condition's actions before it is observed, and log the product, the time and your reason.** **Verify the Picture: if the one-line, the neutral-current alarms and the PMU screen disagree, treat the data as suspect until you have checked them, and say so on any RC call.** **Count the Clock: every condition change starts a 60-minute clock to notify all 14 entities. Give someone the binder list before you work the next alarm.** |
| **Team B: Reliability Engineer**— Reliability Engineer | You own the transformer risk picture: neutral-current trends, thermal and gas indications, contingency analysis and any post-event relay review. You turn data into evidence the Manager can act on. | **Advise, Don't Guess: give the Manager the evidence (neutral current, hot-spot, gas, trend) and how uncertain it is, not a reassuring number.** **Respect the Spare: there is one spare and it is at Hartley. In every transformer recommendation, weigh the cost of losing the unit against the cost of using up the spare.** **Stay in Lane: vendors and the RC can advise, but NLTO decides about its own equipment, and nobody changes protection settings on the fly.** |
| **Team C: Transmission Operations Manager**— Transmission Operations Manager | You own the high-consequence decisions: go/no-go on planned outages including the Hartley replacement, approving transfer cuts and extra reserve, taking major equipment out of service, and escalating to the Director of System Operations and the executive on call. | **Equipment Survives: a damaged autotransformer takes months to replace, but a transfer cut or a deferred outage can be undone in hours or days.** **Decide on the Record: make major equipment decisions with the reliability engineer present, state the trigger you used and log it. Do not wait for certainty that will not come.** **Coordinate, Don't Freelance: agree any further transfer cuts with the UMRC, and ask the state duty officer for a call early, well before load-shed plan NLTO-OP-12 could be needed.** |
| **Team D: Communications Manager**— Communications Manager | You own NLTO's public voice: the condition-based statements in the Communications Plan, media briefings with the Director of System Operations, and answers to rumors and social posts. | **Impacts, Not Physics: say what NLTO is doing and what customers should expect, quote any SWPC product by its time and level, and link to SWPC.** **Never Beat the Source: do not give an end time earlier than SWPC's, and do not speak for NOAA or for the RC's wide-area operations.** **Truth Over Reassurance: correct false claims quickly, but only with facts the control room has confirmed, and use the same severity and duration as the UMRC and the state duty officer.** |
| **Team E: Reliability Coordinator Shift Manager (UMRC)**— UMRC Shift Manager (Reliability Coordinator Shift Manager) | You own the wide-area picture under UGFNWC. You issue the RC notices at each level, run the conference bridge, and direct interface transfer reductions, redispatch, changes to outage schedules and the sharing of reactive reserves. | **Fifteen Minutes: send each RC notice to the TOP, generator owner and neighbor lists within 15 minutes of the SWPC product, with the serial number, UTC and Central times and the next call time.** **Escalate on Evidence: raise to Emergency when two TOPs report neutral currents above their thresholds or voltage problems, and tell the state emergency management agencies when you do.** **Not Their Relays: direct transfers, redispatch and outage schedules, but never a TOP's protection settings.** |
| **Team F: Substation and Timing Engineer (NLTO Fiber and Telecommunications Timing Team)**— Substation and Timing Engineer (NLTO Fiber and Telecommunications Timing Team) | You own the GPS-disciplined substation clocks, the 24-hour holdover clocks, the backup network time source over the fiber ring at Duluth, and the timing alarms that feed protection and the PMUs. | **Flag Before You Fix: tell the supervisor at once which substations have lost lock and which PMU feeds are now suspect, before you start any failover.** **Know the Holdover Clock: record when each site enters holdover, track it against the 24-hour limit, and do not declare GPS restored until lock is stable. Question any planned clock work that needs restarts today.** **One Change at a Time: switch time sources one site at a time with the control room's agreement, and never during a switching operation or a relay event review.** |

### 3. Rules of Engagement

- Start and end every phone call, radio call, bridge call and email with "This is an exercise". The real UMRC, the state duty officer, Mesabi Taconite Works or a reporter could overhear, and nobody outside this room should think the grid is in trouble.
- If a real emergency happens, such as a real alarm in the Duluth control room, a real grid event or a medical problem, anyone may say "REAL WORLD, REAL WORLD". The exercise stops immediately and everyone turns to the real situation.
- The facilitator may announce "Time Jump: it is now [time]" to skip ahead. When that happens, treat everything up to that time as having happened as briefed, and carry your open clocks, logs and decisions forward.
- Treat printed injects (SWPC products, EMS alarm lists, emails, log extracts, social posts, photos and reports) as real intelligence. Act on them as if they had come through your normal channels, and check them the way you normally would.

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
| GIC neutral-current monitors on 345/230 kV transformers (EMS alarms at 75/150/250 A) | | |
| Iron Range T2 autotransformer and the Hartley spare | | |
| Reactive resources: Cloquet SVC and the Iron Range and Hartley capacitor banks | | |
| Arrowhead and North Shore interface transfers and operating reserve | | |
| Substation GPS clocks, holdover clocks and the Duluth backup network time source | | |
| PMU wide-area monitoring and EMS/SCADA at Duluth (backup Virginia) | | |
| Notification of the 14 entities and public mood (blackout and attack rumors) | | |

*End of Briefing Packet*
