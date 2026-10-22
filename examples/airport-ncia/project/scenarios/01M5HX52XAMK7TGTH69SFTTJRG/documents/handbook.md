# Controller / Evaluator (C/E) Handbook
## Scenario 3: "Flight to Nowhere"

### 1. Exercise Overview

Exercise Date: [Date] · Location: North Coast International Airport (NCIA) · Duration: 4 Hours

**Scope:** This is a discussion-based Tabletop Exercise (TTX). Players will react to verbal and written "injects" simulating a cyber-physical attack on the Flight Information Display System (FIDS).

**Objectives:**
- **Communication:** Demonstrate the ability to coordinate public messaging across IT, Ops, and PIO functions during a reputational crisis.
- **Decision Making:** Demonstrate the ability to make high-consequence operational decisions (e.g., "Go Dark") based on incomplete or conflicting technical data.
- **Technical Analysis:** Correctly identify the root cause (SQL Injection / Compromised Credential) using provided logs.

### 2. Room Setup & Logistics

**Physical Layout:** Arrange tables in a "U" shape or separate islands to simulate the Emergency Operations Center (EOC).
- Head Table: Incident Commander (Ops Director) & Scribe.
- Right Table: IT & Cybersecurity Team.
- Left Table: Security & Law Enforcement.
- Rear/Separate Table: Public Information Officer (PIO). *(Note: Isolating the PIO forces them to walk over to get info, simulating real-world friction.)*

**Equipment Needs:** Projector (for FIDS screen injects). Whiteboard (for the ICS-201 tracking). "Burner" phones or simulated radios (optional, for inter-table comms).

### 3. Rules of Play (Instructor Guide)

**The "SimCell" Role:** You (the Instructor) are the "Simulation Cell." You play everyone else in the world.
- If a student says, "I call the FBI," you answer the phone as the FBI agent.
- If they say, "I call United Airlines," you become the angry Station Manager.
- **Crucial:** Do not make it easy. If they call the FBI, ask hard questions: "Agent Smith here. Do you have a PCAP capture of the traffic? No? Then call me back when you have evidence."

**Managing Time:** The exercise spans 4 hours of simulated time, but you may not have 4 hours of real time. Use "Time Jumps" to skip boring parts.
- Announcement: "PAUSE EXERCISE. We are jumping forward 30 minutes. The screens have been blank for half an hour. Crowds are growing. RESUME."

**Handling "Artificialities":** Students often fight the scenario ("I wouldn't use Windows Server 2019!").
- Response: "Noted. But for today, this is the system you have. Solve the problem in front of you."

### 4. Evaluation & Grading Rubric

| Metric | Assessment |
|---|---|
| **Metric 1: Operational Coordination (30 Points)** | ☐ Fail: Ops ignored IT and kept bad data on screens, causing chaos. ☐ Pass: Ops consulted IT but delayed the "Go Dark" decision until injects forced it. ☐ Excellence: Ops proactively established a "Manual Operations Plan" (whiteboards) before shutting down the screens. |
| **Metric 2: Technical Competence (30 Points)** | ☐ Fail: IT rebooted the compromised server immediately (destroying evidence). ☐ Pass: IT identified the "UPDATE" command in the logs but didn't find the source IP. ☐ Excellence: IT identified the SQL Injection, isolated the specific workstation (192.168.1.55), and preserved logs for the FBI. |
| **Metric 3: Public Communication (20 Points)** | ☐ Fail: PIO stayed silent or confirmed "Terrorism" without evidence. ☐ Pass: PIO issued holding statements ("Technical Glitch"). ☐ Excellence: PIO actively countered misinformation (the "ISIS" rumor) with calm, factual updates across multiple channels. |
| **Metric 4: Use of Doctrine (20 Points)** | ☐ Fail: Students "winged it" and never opened the AEP/TIRP/ASP. ☐ Pass: Students referenced the plans but struggled to find sections. ☐ Excellence: Students cited specific sections (e.g., "Per TIRP Section 13.6, we are activating manual backups"). |

### 5. Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Ask the room to identify three things that went well and three things that broke/failed.

**Key Discussion Questions for Scenario 3:**
- **Trust:** "At what point did you stop trusting the screens? Why did it take so long?"
- **The Gap:** "Ops, did you understand what IT was saying? IT, did you understand what Ops needed?"
- **The Insider:** "How did you handle the revelation that the attack came from an intern's computer? Did you treat it as a crime scene or a tech support ticket?"

*End of Handbook*
