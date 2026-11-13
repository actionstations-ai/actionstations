# Behavioral health and human services

The human services pack gives an exercise the work of the people who help others on the worst days: crisis line centers (such as 988 centers), shelter teams, family reunification teams, and child welfare and social service agencies. It has a domain for those organizations and four toolkits that any domain can use.

Turn the toolkits on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes them when the brief mentions a crisis line, a shelter, reunification, children in care or a content topic such as suicide. The domain suggests all four.

| Toolkit                         | Use it for                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Behavioral health safeguards    | Anything that touches suicide, self-harm, abuse or the loss of a child. Turn it on with the other three. |
| Crisis line operations          | A surge of contacts at a crisis center, with backup, staffing and a state coordinator briefing.          |
| Mass care and shelter           | Opening and running a general population shelter, with functional needs support.                         |
| Reunification and child welfare | A school or venue reunification, children in care displaced by a disaster, a crisis counseling request.  |

This is an exercise aid. It is not clinical guidance, it records no real caller, resident or child, and it has not been reviewed by a clinician; have a crisis line director and a mass care lead read your exercise before you run it.

## Safeguards for sensitive material

- **Safe messaging.** Generated injects are checked for method or means detail next to a suicide reference, for suicide presented as a solution, and for language safe messaging avoids. A flagged inject goes back to the model with the problem named. The checks catch common failures; they do not replace a person reading the material.
- **Exercise banner.** A public message or handout that shows a real helpline number must carry the word EXERCISE. Exercise materials never tell a player to call a real line; they use a fictional 555 number.
- **Content notice.** When the exercise touches these topics, the player briefing opens with a content notice, the Exercise Plan repeats it, and the controller handbook gives facilitators a wellbeing check and a "stop and step out" rule: anyone may leave at any time without giving a reason, and the facilitator pauses when asked or when two or more people leave.
- **Psychological first aid.** The eight core actions are in the writing guidance and in a handout, written in plain language as an original summary.

## What it adds

- **Documents** for each part of the field: for a crisis line, the daily contact report, network surge and backup notices, queue board, staffing summary, supervisor escalation, de-identified contact summary and state coordinator briefing; for a shelter, the status report, open shelters list, functional needs support request, registration form, daily count, incident report, health referral, closing report and EOC request; for reunification and child welfare, the plan and site layout, roster, release log, parent text, call script, unreleased student tracker, displaced children list, state plan activation and crisis counseling request.
- **Charts** drawn from data: contact volume and answer rate by contact type with target lines, queue board, staffing against demand, shelter dashboard, shelter map with an optional overlay of electricity-dependent residents, reunification flow and displaced children tracker. Each has a text summary and a data table.
- **Decisions** for players to record: activate the surge plan, request backup, issue a public statement, open or close a shelter, report doors open, assign functional needs support, activate a reunification site, release a student, locate a displaced child, request crisis counseling.
- **Measures**: service level (answer rate, abandonment, wait), time to completion (doors open, every student released, every child located) and needs coverage. See [Evaluation metrics](evaluation-metrics.md).
- **Shelter referrals.** People with access and functional needs are supported in place in the general population shelter. Someone who needs medical care beyond that support is referred by the shelter health lead to a hospital or to a medical needs shelter where the state runs one (some states, Florida among them, call it a special needs shelter), so the scenario check does not flag that term on its own.
- **Crisis counseling timing.** The state applies for immediate services within 14 days of the declaration (they run up to 60 days after it) and for regular services within 60 days of the declaration (they run up to nine months from the award).
- **Writing guidance** with dates and sources. For example, 988 rerouting follows the values in a federal report as of March 2026 (calls about two minutes, texts and chats about five, Spanish-language contacts cannot be rerouted), so check the current rules before you rely on a number.

## Simulated surges, shelters and reunifications

The app can generate data to draw from. Every set is labeled **simulated** and repeats exactly with the same seed.

| You want                                          | Use                | What you set                                                                                    |
| ------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| A crisis line surge with a queue that builds      | Contact surge      | Baseline contacts, surge size and decay, counselors, call-outs, rerouting timers, patience      |
| A shelter that fills and needs support            | Shelter population | Shelters and capacities, evacuees, peak hour, hazard arrival, share of residents with each need |
| Guardians who arrive faster than staff can verify | Reunification flow | Students, arrival timing, check-in leads, verification time, share unverifiable, no guardian    |
| Children in care to locate after a flood          | Displaced children | Children, placement mix, how fast each placement type can be located, share never located       |

These are teaching models, not calibrated to any center, shelter or district. Set the numbers to your own plans.

## Real data

- **Open shelters.** A snapshot of the shelters open now from the federal shelter service. The service keeps no history, so a replay of a past event needs a snapshot you took at the time. Street addresses are left out.
- **Electricity-dependent residents.** De-identified counts of Medicare beneficiaries who use electricity-dependent equipment, by county, from the public emPOWER service.
- **Social vulnerability by neighborhood.** The CDC/ATSDR Social Vulnerability Index (2022 release) for every census tract in the area you draw: the overall rank and the four theme ranks (from 0, least vulnerable, to 1, most), with counts of people 65 and over, people with a disability, people with limited English and households without a vehicle. Each tract is a point at its center, so it can sit on the shelter map. Draw a box up to 2 degrees on a side.
- **988 Lifeline monthly performance.** Routed calls, texts and chats, answer rates and average time to answer by month for one state or territory, or every state added up (enter US), from the state-by-state data file the Government Accountability Office published with its 2026 report. It covers July 2022 to September 2025 and counts contacts answered in state through the national network; the Spanish-language and veterans lines are not broken out. All months are kept whatever the scenario period, as a baseline for a surge. The file is about 170 KB.

All four are fetched once, after you agree and see the size, and then used offline. Nothing about your plans is sent, and none needs a key.

The 988 network administrator's monthly state reports are PDF files, and the federal 988 performance page is an interactive dashboard, so neither can be fetched as data. The GAO file holds the same monthly measures up to its cut-off date.

## Reference documents

The pack's library holds the federal crisis counseling program application instructions, the Shelter Field Guide (FEMA P-785), the FEMA guidance on functional needs support services in general population shelters, the Psychological First Aid Field Operations Guide and the Standard Reunification Method. The field guide, the psychological first aid guide and the reunification method carry their publishers' terms, which each entry states. The school reunification publication, the child welfare disaster planning pages and the Mass Care annex are linked because no file could be downloaded, and Red Cross shelter training is handed out in courses, so it is linked.

## What it does not do

It makes no real-time connection to a crisis platform, a shelter database or a student information system. Its exercise records are fictional and de-identified, and no caller, resident or child detail should be entered into it.

## Example project

The Behavioral health and human services pack includes an example project, **Great Plains Crisis Network 988 Center**, with one exercise, _Two Intervals Behind_: on a Thursday afternoon in March a fictional school bus and truck crash near the small town of Ellery Ridge, Nebraska, kills several students; over the next hours calls, texts and chats to GPCN more than double, the queues pass the plan's thresholds, and the center must surge, request backup, communicate safely and protect its counselors.

Turn the pack on under **Packs**, then open a copy from **Projects → Examples**. The organization, its people and its businesses are fictional; the exercise comes with its injects, media, Situation Manual, evaluation guides and controller handbook, ready to read or run.
