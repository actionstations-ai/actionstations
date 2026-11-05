# Law enforcement, corrections and courts

The justice toolkit gives an exercise the work of police and sheriff's offices, jails and courts at the level where their hardest decisions are made: who takes command and who joins unified command, what families, the public and the bar are told and when, whether an AMBER Alert is justified, how a jail reconciles its count, and which court functions keep running when a system fails.

Turn it on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes it when the brief mentions unified command, an active threat, a missing child, a jail or a court outage, and for the municipal, school, campus, venue, transit, airport, healthcare, elections, port, emergency communications and data center domains.

## Coordination level only

The toolkit does not teach tactics. Generated text covers command, communication, public information and continuity. It never describes entry or breaching methods, weapon handling, tactical positioning, force options, ways to defeat security or detention measures, attack planning, building layouts or security weaknesses. Radio traffic and logs use unit names, building-level locations and statuses. Public messages do not name or describe the person responsible. A negotiation log records contact times, decision requests and welfare at the level of "agreed to speak", with no technique and no dialogue. Every person, department and case number is fictional.

The same rule runs when you check the scenario: a phrase that slips into tactical or security detail appears as a warning on the inject, with the phrase quoted. A few ordinary after-action words can be caught by mistake; if one is, reword it or ask your administrator to clear it. Scenarios that involve violence against children or a school open with a content notice, and facilitators should plan a wellbeing check at the end. Action Stations is not a records or evidence system, and the exercise products are marked as exercise material.

## What it adds

- **Documents** the team issues: unified command briefing, mutual aid request and staging and reunification site plan; family assistance and reunification notice; negotiation log and update to the incident commander; AMBER Alert worksheet, alert text and tip log; jail count sheet, movement log, incident report, lockdown notice and notification list; court closure and emergency docket orders; court notices to the public, jurors and the bar; evidence chain-of-custody log and audit memo. Dispatch records, radio traffic and the command post forms come from the dispatch toolkit and the incident command forms already included.
- **Boards and charts** drawn from data, never as pictures from an image model: unit status, incident timeline, jail population and count status, court continuity board against recovery time objectives, court recovery timeline and filings backlog. Each has a text summary and a data table.
- **Decisions** for players to record: establish the command post and unified command, request mutual aid, activate the negotiation team, open a family center, issue a public statement, decide the AMBER criteria and issue the alert, lock down or evacuate, declare a count clear, close the courthouse or a function, move to paper filing, restore a system and notify the bar and public.
- **Timing measures** shown with the events and decisions they used: time to unified command, time to a family center, time to an accurate count, time to restore each court function against its own objective, AMBER Alert timing, message consistency across agencies, and dispatch service level in a call surge. Targets are yours to set.

## Simulated events

The app can generate events to score against. Every set is labeled **simulated**, and the same settings repeat the same data.

| You want                                          | Use               | What you set                                                         |
| ------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| A burst of calls with units arriving              | Call surge        | Calls, units, median response, window                                |
| Agencies arriving, command named, a first message | Incident timeline | Arrival, command and statement times, agencies and when they join    |
| A count that does not match the expected number   | Jail count        | Housing areas, moves between them, whether each move was logged      |
| Court systems down and returning in order         | Court outage      | Restoration order and times; an order that breaks a dependency fails |
| An audit that finds missing or unlogged evidence  | Evidence audit    | Items, missing and unlogged counts                                   |

## Real data

Three public sources can give a scenario real baselines. Each uses the one-time fetch described in [Case data](case-data.md): you see the size and the service first, nothing is fetched until you agree, and the data then works offline. Only counts and summary times are kept; no record of a single call, person or case is fetched into the scenario.

- **Police calls for service by hour** from a city's open data portal. Pick the city (Seattle or San Francisco for now) and a period of up to seven days. The app asks only for call numbers, priority and times, never addresses, locations or call descriptions, and keeps calls per hour by priority, officer-initiated calls, and the median time to dispatch and to arrive (with the 90th percentile arrival). Use it to size a call surge for the city your scenario is set in, or as a model for a city like it.
- **Jail population by year** for a state or a county, from the Vera Institute of Justice Incarceration Trends files (built on the federal jail census and survey with state and local sources): population, rate per 100,000, pretrial count, admissions, discharges and rated capacity. Give a state's two-letter code, or a county's five-digit FIPS code. The county file is about 62 MB and is downloaded whole, though only that county's years are kept; the state file is under 2 MB. Some years are estimates.
- **Reported crime by month** for a state or a single agency, from the FBI Crime Data Explorer: violent and property offenses, clearances, the rate per 100,000 and the national rate, for up to ten years. Give a state code, or the agency's nine-character ORI. This one needs a free api.data.gov key: save it under **Settings, Case data**. It is kept in your computer's keychain and sent only to api.usa.gov when you agree to a fetch. Without a key the source is off.

Real agencies and places appear in this data as geography and context. The departments, people and incidents in your scenario stay fictional.

The FBI's active shooter incident reports and the AMBER Alert program's annual reports are published as PDF reports only, with no data file, so they cannot be fetched as data.

## Working with the AMBER checklist

The worksheet lists the five criteria the Justice Department recommends: a reasonable belief that an abduction occurred, imminent danger of serious bodily injury or death, enough descriptive information, a child 17 or younger, and the child's entry in the national crime database with the Child Abduction flag. Each is marked met, not met or unclear with the commander's reasoning. The database entry comes before the alert. States set their own criteria, so check yours.

## Before you run it

A practitioner should review the scenario before it is used for training: a law enforcement trainer who has run multi-agency exercises, a court administrator, and for jail scenarios a corrections practitioner.
