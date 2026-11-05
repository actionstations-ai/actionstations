# Construction, engineering and building safety

The structures toolkit gives an exercise the work of the people who build and inspect buildings: the competent person who inspects a trench, the superintendent who stops a lift, the engineer of record who decides whether a building can be occupied, the building official who declares it unsafe, and the volunteer evaluators who walk hundreds of buildings after an earthquake. It suits contractors and their safety managers, owners and design teams, building departments and post-disaster evaluation programs, and engineering and construction management classes. Any organization with a building under construction, a trench, a crane or a damaged building can turn it on: a utility, a hospital expansion, a campus, a transit agency.

Turn it on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes it when the brief mentions a crane collapse, a trench, a stop-work order, a building inspection or a placard. The **Construction and the built environment** kind of organization describes the project team, the owner and design team, and the building department itself.

Everything it produces is an exercise product and says so. Nothing in it is a safety evaluation of a real structure, and nothing directs a real structural decision. Contractors, engineers, workers and buildings are fictional.

## Who can do what

The toolkit keeps authority specific, because exercises often go wrong here.

- The competent person, the superintendent and the safety director can stop work.
- The engineer of record decides whether a structure is adequate and how to repair or shore it.
- Only the building official declares a building unsafe. An evaluator recommends a placard.
- Rescue is run by the fire department and its technical rescue or urban search and rescue team. The contractor supplies drawings, equipment, access and a structural opinion.

## What it adds

- **Records and orders**, drawn from templates so every word is exact: the daily excavation inspection, the crane inspection with lift plan and wind log, an incident or near-miss report, a stop-work order, the OSHA report record, an RFI or change request (the schedule pressure inject), an unsafe building order, and a utility strike report.
- **Evaluation forms**: rapid and detailed building evaluation forms, a fixed equipment checklist and an inspection assignment log. They follow the structure of the public evaluation methods and are the program's own exercise forms, not the official ones.
- **Placards** in three categories, always written as words and never by color alone: INSPECTED (green), RESTRICTED USE (yellow) and UNSAFE (red). A placard describes the building at the time it was evaluated. The placard template comes with the earthquake toolkit and this toolkit offers it.
- **Figures** drawn from data: a monitoring series with alarm and action levels, a site logistics plan to scale (crane swing radius, exclusion zone, routes, gates and the muster point), an inspection status board and an inspection assignment map. Each has a text summary and a data table.
- **Decisions** for players to record: stop work, evacuate the site or a neighbor, call 911 and request rescue, set the exclusion zone, shore or stabilize, shut off a utility, notify OSHA or the owner or the insurer or the building official, post a placard, issue an unsafe building order, assign an evaluation team and release a public statement.
- **Writing guidance** so drafts carry the field's rules correctly (see below).

## Rules the toolkit checks

When the app generates a product, it checks these and sends a draft back when one is wrong. They are summaries; check the current text of each standard before you rely on one.

- A work-related fatality is reported to OSHA within 8 hours. An in-patient hospitalization, an amputation or the loss of an eye is reported within 24 hours.
- An excavation needs a protective system unless it is in stable rock or under 5 feet deep with no sign of a cave-in. A competent person inspects it daily and after rain or another event that raises the hazard. A trench 4 feet deep or more needs a way out within 25 feet of lateral travel. Workers leave the hazard until precautions are taken.
- The toolkit never states a depth at which a trench system must be engineered. Designs outside the listed options are approved by a registered professional engineer.
- UNSAFE is red, RESTRICTED USE is yellow and INSPECTED is green, and the word is always given.
- A crane pick stops at the wind limit in the lift plan.

## Simulated data

The app can generate data to draw and score against. Every set is labeled **simulated**, and the same seed repeats it exactly.

| You want                                              | Use                      | What you set                                                                                                              |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| A sensor that drifts, then fails                      | Structural monitoring    | Sensor type and unit, baseline and drift, noise, when the failure begins and its shape, alarm and action levels, dropouts |
| A collapse with a clock                               | Site emergency timeline  | When the collapse happens, a first sign, the reportable event, when responders arrive, secondary hazards                  |
| Hundreds of buildings to evaluate after an earthquake | Building list and damage | How many buildings, the strongest shaking and how it falls with distance, or an earthquake or ShakeMap grid               |
| A full inspection program                             | Inspection program       | The building list plus an evaluator roster with qualifications, owner and public requests and traps                       |

The damage states come from a simple relation of shaking intensity and construction type: unreinforced masonry and tilt-up buildings fail at lower intensity than steel frames. The numbers are invented for exercises. They make the share of yellow and red placards rise with the shaking; they do not predict what an earthquake will do to a real city. The monitoring generator is not a structural model either.

**Using shaking from the earthquake toolkit.** Give the building list a simulated earthquake's magnitude, or a ShakeMap intensity grid fetched with the earth science toolkit, and the shaking at each building follows from it.

## Running the inspection program

The program gives each team what a real one would hold: the building list with priority classes (hospitals, shelters and schools first), a record of what an evaluator would see in each building, a limited roster of evaluators with their qualifications, and requests that arrive during the shift from owners, neighbors and the emergency operations center.

1. The team leader assigns teams to areas and priority buildings.
2. Evaluators read each building's record and post a placard with the form.
3. The building official reports the counts to the emergency operations center and issues unsafe building orders.
4. The facilitator can switch on traps: the same condition placarded two ways by two teams, an unsafe building next to the one being walked, and an owner who refuses to leave. None is on by default.

On the map, the buildings can be drawn as a layer whose time slider shows the placards going up.

## What is scored

Each measure shows the inputs it used and prints `n/a` when it cannot compute a number.

- **First sign to action.** Minutes from the first alarm or action level (or a reported sign) to stop work and to evacuation, and whether work stopped before the failure began. A negative number means the team acted before the first sign.
- **Reporting.** The OSHA report against its clock, and when the owner, insurer and building official were told. Owner and insurer targets are yours to set; none is assumed.
- **Rescue timeline.** Minutes from the collapse to the 911 call, the exclusion zone and the shoring request, and how many secondary hazards were controlled within the time you set. Rescue tactics are not scored.
- **Placards.** How many buildings were evaluated, how many placards agree with the correct one, which were over- or under-restricted, a table by category, whether priority buildings came first, and buildings per team per shift.
- **Consistency.** Whether the contractor, owner, building official and rescue agencies state the same status for the structure and the same exclusion zone.

The ethics case (an engineer finds a deficiency and the owner wants to keep working) has no right answer. Score it with a rubric: what information was gathered, who was told in what order, and what was written down.

## Reference library

The toolkit names a catalog of reference documents: the OSHA reporting rule, the excavation and crane standards (29 CFR 1926, Subparts P and CC), the OSHA trenching and scaffold guides, FEMA P-2055 on post-disaster building safety evaluation, and the NSPE and ASCE codes of ethics, which carry the societies' own terms. The evaluation forms and placards of the Applied Technology Council and the evaluator field guide of the International Code Council are sold, so they are linked.

## Limits

- Review the toolkit and any example before using it for real training. A structural engineer who has served as a building safety evaluator and a construction safety director should read the placard and rescue material.
- A rapid evaluation is not a structural analysis, and two qualified evaluators can differ on a borderline building. The placard table shows both over- and under-restriction so the team can discuss why.
- Regulatory statements are summaries and can change.
