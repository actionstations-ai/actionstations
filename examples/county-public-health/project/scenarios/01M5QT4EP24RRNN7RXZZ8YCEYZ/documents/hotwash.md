# Hot Wash Guide
## Vaccine Vault Breach

### Hot Wash Guide (Debrief)

**The "3-Up, 3-Down" Method:** Use the '3-Up, 3-Down' method by asking each team to share three things that went well and three that broke or failed during the exercise. Go around the room by team, write responses on the whiteboard to capture the group’s feedback in real time.

**Key Discussion Questions for Vaccine Vault Breach:**
- **Trust:** When did you first stop trusting the data from the IIS export or the Epi SharePoint site, and what specific clue triggered that loss of trust? How did your team decide to treat that data as compromised rather than as a temporary glitch? _(Objective: Data Integrity Verification)_
- **The Gap:** At I-12, you were forced to choose between isolating the Epi fax server and IIS export to stop corruption, or keeping them online to receive case reports. What made you decide to isolate them, and what would have made you keep them online despite the risk? How did you assess the trade-off between data integrity and operational continuity? _(Objective: System Restoration Coordination)_
- **The Call:** At I-13, the Epi team had to decide whether to vaccinate a child with no documented second dose. What information did you rely on to make that call, and how did you balance the need to act quickly with the risk of administering a dose based on incomplete or falsified records? What would have made you wait for verification instead of acting? _(Objective: Paper Mode Continuity)_
- **The Evidence:** The 'auto_cleaner.py' script was not signed, not in the approved software list, and executed before detection. When did you first treat that script as evidence of compromise, and how did that evidence shape your decisions to isolate systems or activate forensic review? _(Objective: Data Integrity Verification)_
- **The Narrative:** After the phishing attack on Jenna Fowler’s account led to the viral social media post, how did your team decide what to say publicly, and when? What would have let you release a coordinated message sooner, and how did you ensure that hotline, press, and social media teams used the same language? _(Objective: Communication Consistency)_
