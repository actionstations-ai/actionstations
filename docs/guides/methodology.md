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
