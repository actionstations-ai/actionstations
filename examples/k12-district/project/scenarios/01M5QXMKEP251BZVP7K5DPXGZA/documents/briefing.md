# Player Briefing Packet
## Digital Lockdown — Cyber Incident & School Continuity

Location: Halverson Unified School District, Halverson, Brandt County, Oregon · Exercise Duration: 4 Hours
Current Time: 06:30 AM (Exercise Time) · Weather: Clear skies, mild morning with a temperature of 62°F

### 1. Situation Brief

It is a typical weekday morning at Halverson Unified School District, with all 14 schools operating on their standard schedule. Halverson High School, the district’s largest campus and primary testing site for grade 11, is in full session, hosting state assessments in the library, Commons, and testing rooms. The Transportation Center is managing 36 active bus routes with 120 buses en route to pick up students across the district. The District Service Center is running its normal administrative and technology functions, and the Central Office is preparing for the day’s leadership meetings. All schools are staffed at expected levels, and the stadium is scheduled to host a high school football game this afternoon. The district’s systems are operating normally, and there are no reported incidents across the network or facilities.

- District-wide status: Normal
- Building automation / HVAC controls: Green
- PACS card access and door-lock status: Green
- CCTV / VMS surveillance: Green
- Intercom / PA and bell system: Green
- Silent panic-alarm app (Alyssa’s Law): Green
- Weapons detection at entrances: Green
- Fire alarm and emergency generator: Green
- Vape and sound sensors: Green
- Bus GPS / AVL: Green
- Stadium and field lighting: Green
- IT systems (PowerSchool, Google Workspace, SIS): Green
- District EOC (Room 210): Standby
- Security staffing (on-site and remote): Normal

**The Anomaly:** At 06:38, a helpdesk ticket is logged from the front office at Halverson High School: 'Nurse at Halverson High School (Room 104) reports: The student roster in PowerSchool shows 11th-grade student Chloe Mendez as absent today, but she’s in the library for testing—her attendance was just updated to "present" at 06:38. Please verify if this is a sync error.'

**YOUR MISSION:** Maintain full operational continuity across all schools, buses, and central systems while investigating and resolving the unexpected attendance sync anomaly, ensuring student safety, system integrity, and uninterrupted learning during the state assessment window.

### 2. Team Assignments & Standing Orders

| Team | Role | Standing Orders |
|---|---|---|
| **Team A: Operations (Command)**— Director of School Safety / District Emergency Manager (Incident Commander) | You own the activation and management of the District EOC, direction of all response actions across the district, and authority to initiate lockdown, evacuate, or shelter based on real-time field information. | **Safety First: if the screen and the field disagree, trust the field.** **Command Authority: the Incident Commander has final authority over all district actions, including school closures and response modes.** **No De-escalation: a declared lockdown or evacuate must not be reversed without full EOC review and law enforcement confirmation.** |
| **Team B: Policy Group**— Superintendent (Policy Group chair) | You own final decisions on school closures, early release, and public statements; you chair the Policy Group and are responsible for briefing the Board of Education on all major actions. | **No Ransom: the district does not pay ransoms unless the Policy Group, counsel, insurer, and law enforcement concur.** **Legal First: any decision involving data release, extortion, or public statement must be cleared by Legal Counsel.** **Public Trust: communications must not minimize risk or delay truth-telling, even if it causes short-term panic.** |
| **Team C: School Site**— Building Principal (Site Incident Commander) | You own the first actions at Halverson High School: lockdown, evacuation, student accountability, and staff assignments until responders take over. | **Field Authority: if the SIS and PA systems fail, use the 05:00 offline roster and physical headcount to manage accountability.** **Evacuate if Unsafe: if a threat is confirmed or the building becomes unsecure, initiate evacuation via pre-planned routes and buses.** **No Delay: begin lockdown and roll call immediately upon receiving the alert, even if systems are unresponsive.** |
| **Team D: Law Enforcement**— School Resource Officer / School Police Chief (Law Enforcement Liaison) | You own the initial law-enforcement response, threat investigation, and liaison to city police or the sheriff. | **Confirm the Threat: any report of a shooter must be verified with HPD and 911 before declaring a full active shooter response.** **No Solo Action: do not attempt to enter a secured area without backup or EOC approval.** **Evidence Preservation: if a threat is confirmed, secure the scene and notify the DFIR team immediately.** |
| **Team E: Technology**— Chief Technology Officer (Technical Lead) | You own the SIS, LMS, phones, Wi-Fi and 1:1 devices, containment, vendor coordination, and liaison to MS-ISAC / K12 SIX / CISA. | **Contain First: isolate compromised systems before attempting recovery, even if it delays full service.** **Vendor Lock: do not engage Tallgrass MDR or DFIR without Legal Counsel approval and a signed engagement letter.** **Data Priority: restore the 05:00 offline roster and SIS export before any other system.** |
| **Team F: Communications**— Chief Communications Officer (Public Information Officer) | You own parent notification through the mass-notification system, social media, media staging, and rumor control. | **Truth in Messaging: all messages must reflect the verified state of systems and safety, not reassurance.** **No Delay: send ParentSquare alerts within 10 minutes of any new incident phase.** **Media Control: all media inquiries must be routed through the media staging location and pre-approved templates.** |

### 3. Rules of Engagement

- All radio and phone communications must begin and end with the phrase 'This is an exercise' to prevent real-world panic.
- If a real emergency occurs during the exercise, say 'REAL WORLD, REAL WORLD' immediately and the exercise will stop.
- The facilitator may announce 'Time Jump: it is now [time]' to skip ahead in the narrative timeline.
- Printed injects (posts, logs, photos, reports) are intelligence—treat them as real and act accordingly.

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
| PowerSchool SIS (HUSD-SIS cloud tenant) | | |
| HUSD-FS02 file server (with IEPs, health logs, threat assessments) | | |
| 05:00 offline student roster (USB key) | | |
| ParentSquare mass-notification system | | |
| 911 emergency call line (district) | | |
| Halverson High School C Wing (locked down) | | |
| Bus GPS / AVL (Transfinder) | | |
| Stadium and field lighting (for reunification site) | | |
| District EOC (Room 210) | | |
| CCTV / VMS (surveillance feeds) | | |
| Intercom / PA and bell system | | |
| Silent panic-alarm app (Alyssa’s Law) | | |
| Building automation / HVAC controls | | |
| Fire alarm and emergency generator | | |
| Public mood (social media sentiment, halversonparents.facebook.com) | | |

*End of Briefing Packet*
