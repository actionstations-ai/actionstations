# How a good tabletop exercise is built

This page explains the exercise design the generator follows, so you can judge its output and steer it. It condenses [docs/04-TABLETOP-METHODOLOGY.md](../04-TABLETOP-METHODOLOGY.md), which was derived from the hand-built CSAAP airport-cybersecurity exercises in [`reference/scenario-3/`](../../reference/scenario-3/). The method follows HSEEP (the DHS Homeland Security Exercise and Evaluation Program) conventions for discussion-based exercises.

## Start from your own plans

A tabletop exercise is worth running when it makes people open their own plans and use them. The generator therefore starts from a **project**: one organization's documents (emergency plans, incident response plans, security programs, maps, ICS forms, course material). Scenarios are written against that material.

Good plans for this contain concrete hooks: a named system with a documented failure procedure, a checklist, an authority to shut something down, a rule that is easy to break under pressure ("no vendor VPN outside business hours"). The generator looks for those hooks when it proposes ideas, and every stage cites the sections it used. It may only cite sections that exist in your documents.

What this means for you: import the real plans, give each document a clear title and short name (the short name, such as "TIRP", is how citations read in the MSEL), and check the **Search index** page to confirm that a search for your key systems finds the right sections.

## The exercise package

Each scenario produces the same set of documents a professional exercise team would hand over:

| Document                               | Audience    | What it contains                                                                                                                         |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **MSEL** (Master Scenario Events List) | Facilitator | Overview (theme, threat, impact, plan sections tested), roles, and per phase a table: time, inject id, from, to, event, expected action. |
| **Inject deck**                        | Facilitator | One page per inject: who receives it, when, its purpose, format, full content, optional facilitator note.                                |
| **Controller handbook**                | Facilitator | Objectives, room setup, rules of play (SimCell, time jumps), grading rubric, hot wash guide.                                             |
| **Player briefing**                    | Players     | Situation at STARTEX, mission, team assignments and standing orders, rules of engagement, blank ICS-201.                                 |
| **Inject media**                       | Players     | Posts, tickets, emails, logs, display boards, photos and audio that are handed over or shown on screen.                                  |

## The shape of a scenario

The reference design is about **4 exercise hours in 4 phases**, with real time compressed by **time jumps**: roughly 15 core injects plus about 10 side injects (numbered with a `b` suffix, such as `I-07b`), about one every 10 minutes of exercise time. The generator aims for that pace (20 to 28 rows over 4 hours, scaled by duration) and notes a phase that runs denser with the `DENSITY_DENSE` lint.

The four phases follow an arc:

1. **The glitch.** Something small and ambiguous arrives through a mundane channel (a gate agent's phone call). It tests whether people recognize and declare an incident. One unrelated _noise_ item makes the technical team practise triage.
2. **The crisis.** A time jump multiplies the impact. A _red herring_ splits resources, a visual confirmation goes on the main screen, _misinformation_ reaches the public information officer, a _clue_ points to the cause, and a stakeholder forces a formal incident declaration.
3. **Manual mode.** Players move from digital systems to manual procedures. Forensics produces the decisive evidence, and the single **decision point** arrives (shut it down, go dark, stop screening), with physical-safety consequences and a media deadline.
4. **Recovery and verification.** Systems come back, but can the data be trusted? Tenants demand guarantees, a technical hurdle delays recovery, reconciliation is tedious, and ENDEX closes the exercise.

You can change the number of phases and the duration in the brief; the arc stretches or compresses.

## Every inject has a purpose

Each MSEL row carries a **purpose tag**. The tags make the design visible and are checked automatically:

| Tag                  | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| STARTEX / ENDEX      | Start and end of the exercise.                        |
| TIME_JUMP            | Facilitator card that advances the clock.             |
| CORE_NARRATIVE       | Advances the main storyline.                          |
| NOISE                | Unrelated distraction that tests triage.              |
| RED_HERRING          | Plausible but false lead that drains resources.       |
| PRESSURE             | A stakeholder demands a response now.                 |
| MISINFORMATION       | A rumour the public information officer must counter. |
| DISTRACTION          | Public-sentiment noise aimed at the PIO.              |
| CLUE                 | Forensic or attribution breadcrumb.                   |
| TECH_HURDLE          | Recovery complication.                                |
| DECISION_POINT       | Forces a high-consequence call.                       |
| OPERATIONAL_FRICTION | Conflict with a tenant or partner.                    |
| CONFUSION            | Physical-security side effect.                        |
| END_GAME             | Resolution leading to ENDEX.                          |

**Minimum mix per phase:** at least one core narrative item, one pressure or misinformation item for the PIO, one noise or red herring, and one clue or technical hurdle for the technical lead. The whole exercise has exactly one decision point; the generator places it in the middle phase (phase 3 of 4).

**Every role in every phase.** Define 4 to 5 player roles (for an airport: operations director as incident commander, IT director, PIO, security coordinator, airline liaison) and make sure each one receives something to act on in every phase. The public-information track (social posts, rumours, reporter deadlines) is a storyline of its own, not decoration.

## Realism

Injects feel real when they are specific: ticket numbers, hostnames and IP addresses that fit the plans' naming scheme, actual flight and gate numbers, a script name, a command line, local references (the city's TV station, a community Facebook group). The players' own data must stay plausible; an attacker's fake data can be absurd on purpose ("Flight 666 to Purgatory") as long as the expected action notes it.

Text-bearing injects (posts, tickets, emails, logs, FIDS boards) are rendered from HTML templates so the text is exact and legible. AI image and video models are used only for photographs and short clips.

## Facilitating

- **SimCell.** The facilitator plays the outside world (the vendor, the FBI, the airline station manager, the reporter). The handbook includes 3 to 5 short SimCell scripts and the instruction not to make it easy: the FBI asks for evidence before it helps.
- **Rules of play.** "This is an exercise"; the "REAL WORLD" stop phrase; time jumps are announced and the clock moves; artifacts handed to players are intelligence to act on.
- **Rubric.** Four metrics (for example operational coordination, technical competence, public communication, use of doctrine), each with concrete Fail / Pass / Excellence behaviours tied to specific injects.
- **Hot wash.** Immediately after ENDEX: "3-Up, 3-Down" (three things that went well, three to improve) plus three questions about this scenario's lessons, such as when the team stopped trusting the system.

## Reporting deadlines and compliance coverage

A cyber incident starts legal clocks, and an exercise that ignores them misses one of the hardest calls players make: when the incident becomes reportable, and to whom. Action Stations ships the reporting rules most US and EU organizations face, as data in the core pack, each with its sources and the date its values were last checked:

| Regulation                                 | Clock                                                                                                                            | Starts when                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| SEC Form 8-K Item 1.05                     | 4 business days (US federal holidays skipped)                                                                                    | the company determines the incident is material                                |
| CIRCIA (**proposed rule**)                 | 72 hours; ransom payment 24 hours                                                                                                | the entity reasonably believes a covered incident occurred; the ransom is paid |
| TSA aviation, rail and pipeline directives | 24 hours to CISA                                                                                                                 | the cybersecurity incident is identified                                       |
| HIPAA Breach Notification Rule             | 60 calendar days (individuals, HHS for 500 or more people, media)                                                                | the breach is discovered                                                       |
| GDPR Article 33                            | 72 hours, where feasible                                                                                                         | the controller becomes aware                                                   |
| NIS2 Article 23                            | early warning 24 hours, notification 72 hours, final report one month after the notification                                     | the entity becomes aware of a significant incident                             |
| DORA Article 19                            | initial 4 hours after classification as major and no later than 24 hours after awareness; intermediate 72 hours; final one month | aware; classified as major                                                     |

CIRCIA's final rule had not been published when these values were checked (2026-10-28); its deadlines come from the April 2024 proposed rule and the app labels it "proposed" wherever it shows them. The TSA values come from published summaries of directives that are partly sensitive security information. Every regulation card and export carries the line "Exercise aid, not legal advice. Check the current rule and your counsel."

How to use them:

- **Switch them on per project.** The domain profile suggests the regulations that usually apply (an airport gets the TSA aviation directive and CIRCIA, a hospital HIPAA and CIRCIA, a bank the SEC rule and CIRCIA). Whether a rule applies to your organization is your call: change it under **Project settings → Compliance**.
- **Tie a clock to an inject.** In the MSEL editor, a row's **Row actions → Starts reporting clocks…** picks the triggers that delivering the row fires ("Ransomware confirmed" fires CIRCIA's covered-incident trigger). Put the materiality decision of an SEC exercise on a decision point and fire it by hand when players make the call, so the exercise tests the call itself.
- **Use scenario time.** Clocks count in the scenario's calendar: the brief's start date and start time plus the exercise clock, so a time jump moves them too. Without a start date the app reads one from the STARTEX card, else assumes the next Monday and says so. Business days skip weekends and US federal holidays.
- **Record the filing.** When players would have filed, mark the clock **Filed** at that scenario time. A filing after the deadline counts as missed. Put a clock **on screen** to keep the pressure visible in the room.

The **compliance coverage** export lists, for NIST CSF 2.0, the NIS2 Article 21 measures or the DORA chapters, which controls the MSEL exercised and the evidence: **planned** (a row maps to the control), **delivered** (that row was delivered in Facilitate) and **observed** (a facilitator note, an evaluator rating or a met reporting clock refers to it). Mapping rules in each framework suggest the controls of each row from its purpose tag, threat family, triggers and keywords; the export marks those as suggested. A missed clock shows as a gap on the controls its regulation lists. The "Clocks" sheet lists every clock with its start, deadline, filing and result.

## Participant feedback and confidence

HSEEP asks for participant feedback after every exercise. The **HSEEP Participant Feedback Form** follows FEMA's template: Part I rates the exercise on a 1 to 5 agreement scale (structure, realism of the scenario, the facilitator, the materials, whether participation fit your role), Part II asks what to change and what the organization's plans, policies and procedures do well or need, and Part III lists issues and the corrective actions that should follow. Hand it out right after the hot wash, while the discussion is fresh.

Two before-and-after measures show what the session taught:

- **Knowledge check.** A few multiple-choice questions about what the plans say, asked before and after. Each question has one correct answer and, ideally, the plan section that answers it, so the results point at the sections most often missed.
- **Confidence self-assessment.** One first-person statement per objective ("I could lead the switch to manual boarding announcements"), rated from 1 (not at all confident) to 5 (very confident) before and after. The change in the group's mean is the readiness signal leadership tends to ask for.

Both are compared only as a group: the app never matches one person's before and after answers. Responses carry no name or device, times are kept to the minute, free text is listed in no particular order, and with fewer than three responses (the default threshold) only counts are shown, so a two-person room cannot tell who said what. The **facilitator debrief** and the **controller/evaluator debrief** are for the exercise staff and feed the After-Action Report alongside the participants' feedback.

## After the exercise

HSEEP closes an exercise with an After-Action Report / Improvement Plan (AAR/IP): what each Core Capability showed, rated Performed without Challenges (P), with Some Challenges (S), with Major Challenges (M) or Unable to be Performed (U); the strengths and areas for improvement behind the rating, each tied to the plan sections involved; and an Improvement Plan of corrective actions, each with a capability element (planning, organization, equipment, training or exercises), a responsible organization, a point of contact and a completion date.

The app drafts it from the **exercise record**: the facilitator's inject notes, the 3-Up / 3-Down items and the decision log captured on the Facilitate screen, the met / partial / not met / not observed ratings against the evaluation guides, the live-play session log when the exercise ran on devices (names are removed before anything reads it) and the survey results. The draft works from a hot wash alone; the report says which sources were available instead of filling the gaps. Every strength and area for improvement lists the evidence it rests on, and a finding the record cannot support is dropped.

The model drafts and a person decides. The AAR/IP page shows the proposed rating next to the observation counts; the exercise director confirms or changes it, and the document prints "Rating pending" until then. Owners, points of contact and dates are never proposed: a planner types them into the Improvement Plan table, locks the rows that must survive a re-draft, and exports the report as PDF or Word with a tracker workbook of the corrective actions. The report is non-attributional: it describes how plans and procedures worked, never how a person performed.

## How the generator follows the method

| Exercise designer's step                                             | What the app does                                                                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read the plans and pick a system with a documented failure procedure | **Give me ideas** retrieves failure procedures and hazard sections and proposes concepts that cite them.                                                                    |
| Choose the theme and the plan sections to test                       | The **overview** stage writes theme, threat, impact and the core sections tested.                                                                                           |
| Define roles from the organization's structure                       | The **objectives & roles** stage reads staffing and command structures from your documents.                                                                                 |
| Draft the phases                                                     | The **phase plan** stage writes each phase's title, goal and time window.                                                                                                   |
| Write the MSEL phase by phase                                        | The **MSEL** stage runs once per phase, with the purpose-tag mix and role coverage required.                                                                                |
| Write the handbook, rubric, briefing and hot wash                    | Dedicated stages read the finished MSEL, so rubric behaviours reference real inject ids.                                                                                    |
| Proofread for consistency                                            | Deterministic lints (tag mix, roles without injects, unknown rubric links) plus a **critique** stage; the MSEL phases are then revised from the critique.                   |
| Expand MSEL rows into full injects and make the media                | The inject stages (**Write all injects**, **Render all media** on the Injects tab) write each inject's content into its template and produce photos, clips and voice lines. |

The app also improves on the hand-built reference: every MSEL row gets an inject page by default (you turn off the ones you do not need), media is cheap enough to make for every social, visual and audio inject, and facilitator mode (exercise clock, timeline, delivery to a second display, hot wash notes) replaces the paper timeline.

See [Prompts](prompts.md) to change how any of these stages writes, and [Getting started](getting-started.md) to run them.
