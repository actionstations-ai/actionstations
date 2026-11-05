# Epidemiology and outbreak investigation

The epidemiology toolkit gives an exercise the work of the people who detect and investigate outbreaks: case definitions, line lists, epidemic curves, attack rates, contact follow-up, laboratory turnaround, dispensing sites and the notices that go out. It suits health department epidemiology programs, hospital infection prevention teams, public health laboratories, epidemiology classes, and any organization that has to handle an outbreak in its own setting: a school district, an airport, a cruise port, a food processor.

Turn it on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes it when the brief mentions an outbreak, an exposure notice, a line list or a disease such as measles or norovirus, and for the health, school, airport and food kinds of organization. The **Epidemiology and outbreak investigation** kind of organization describes the investigators themselves, and extends the public health department kind.

The toolkit stays at public health response decisions. It carries no detail on handling, growing or changing any pathogen, and every person and place it produces is fictional.

## What it adds

- **Documents** the team issues: case report form, outbreak questionnaire, public exposure notice, clinician health alert, school or employer letter, isolation and quarantine guidance, and hotline call notes. The laboratory result report, situation report and press release already in the app are used too.
- **Charts** drawn from data, never as pictures from an image model: the epidemic curve, line list, attack-rate table, spot map, contact tracing network, laboratory surge board, dispensing throughput chart and wastewater series.
- **Decisions** it defines for players to record: adopt a case definition, declare an outbreak, request CDC Epi-Aid, classify a contact, issue an exposure notice, recommend an exclusion or closure, set laboratory priority, open or close a dispensing site, release data.
- **Writing guidance** so drafts use the field's terms in the right order: confirmed, probable and suspect tiers; onset date rather than report date; exposure windows computed from onset and the infectious period; the ten investigation steps; and response facts for seven pathogens with their sources.

## Choosing a model

The app can generate outbreak data to draw from. Every set is labeled **simulated** and can be repeated exactly by using the same seed.

| You want                                                | Use                          | What you set                                                                                         |
| ------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| A rising epidemic with a peak and a decline             | Outbreak model (SIR or SEIR) | Population, reproduction number, latent and infectious days, starting cases, immunity, control start |
| A small outbreak where chance matters                   | The same, with a random seed | The same, plus the seed                                                                              |
| A meal or event, a food vehicle and a line list to work | Common-source outbreak       | Attendees, foods and how many ate each, which food is the vehicle, the illness pathogen              |
| Who was exposed, who must be reached                    | Contact network              | Settings (household, school, flight, clinic), people in each, close contact rule, unreachable share  |
| A signal that comes before cases                        | Wastewater signal            | A case curve, the lag, the noise and your own level scale                                            |
| A dispensing site whose queue grows                     | Dispensing site              | Hours, stations, service time, arrivals                                                              |

**SIR or SEIR.** Use SEIR when people are infected for a while before they are ill (most respiratory and many other infections). Use SIR for a simple outbreak where onset follows infection at once. The reproduction number is the average number of people one case infects in a fully susceptible group; at about 1 the outbreak barely grows, and above 2 it grows fast. Immunity above about one minus one over the reproduction number stops an outbreak from taking off. A control measure lowers the transmission rate from the day it starts by the share you set.

**The common-source outbreak** is built so the real vehicle can be found: the food that made people ill has the highest odds ratio, while companion dishes (the cake served with the salad) are plausible distractors.

These are teaching models. They are not fitted to any disease and must not be used to predict a real outbreak.

## Reading the figures

Every figure has a text summary and a data table. Status never rests on color alone.

- **Epidemic curve.** Cases by onset time, never by report date. Bars are stacked by status: confirmed (solid), probable (hatched), suspect (dotted). Numbered markers show exposure and control times, keyed under the chart. A one-peak curve within one incubation period suggests a point source; a plateau suggests an ongoing source; peaks one incubation period apart suggest spread from person to person.
- **Line list.** One row per case with a code, onset, status and setting. Identifiers can be codes, fictional names, or hidden behind row numbers. It always says it is simulated.
- **Attack rates.** Ill over total, among people who ate each item and those who did not, with relative risk and odds ratio. The highest odds ratio is flagged; it points to a hypothesis, not to proof.
- **Spot map.** A schematic of where cases are, with no street map, so nothing is mistaken for a real place.
- **Contact network.** The index case, then contacts in columns by generation. A shape and a word mark each status: reached, pending, unreachable, cleared or a case.
- **Laboratory board.** Specimens received split into positive, negative and pending, with turnaround against its target in words and a shape.
- **Dispensing chart.** Arrivals, people served and the queue over time against the planned rate.
- **Wastewater series.** Levels over time. When the data are real, the levels use the scale as CDC publishes it for that dataset; simulated series use your own scale and say so.

## Building a line list scenario

1. Turn on the epidemiology toolkit for the scenario.
2. Generate a **simulated common-source outbreak** as the scenario's case data (see [Case data](case-data.md); the epidemiology generators are listed there by name). Choose the event, how many attended, the foods and which one is the vehicle. The app makes a line list, the counts by food and the times.
3. Put the epidemic curve, the line list or the attack-rate table in an inject with the figure inject, built from that data so each figure agrees with the line list it came from.
4. Write the notices from the same numbers, and check each one before you use it: the case count must match the line list at the time stated, each exposure window must fall inside the case's infectious period, and a curve must be drawn by onset date.
5. Choose the decisions players will make, and the measures to score. Players record decisions in live play or the facilitator records them in Facilitate (three forms exist for scoring: record the outcome of reaching a contact, record people served at a site, and submit the curve a team drew), and the Evaluation tab scores them against the simulated events. The toolkit names: time from first report to case definition, declaration, first control measure and public notice; contacts reached within the target you set; dispensing throughput; message consistency across the health department, hospital and school; and curve accuracy.

## Replaying real data

Two public CDC data sets can set a scenario in real history: **wastewater viral activity levels** by state and sampling site, and **weekly notifiable disease counts** by state. Fetching follows the case data rules: you choose the place and period, the app shows what it would fetch and how large it is, and only after you agree does it contact CDC's open data site. No account or key is needed and nothing about your plans is sent.

Real line lists are not public, so none is fetched or implied. When a replayed scenario needs individual cases, the app draws simulated cases so that each week holds exactly the real count, and marks them simulated. The levels use the definition CDC publishes with the data, shown beside it. Notifiable disease counts are provisional and revised by CDC later; each week is shown as published, and a week CDC marks unavailable or not reportable is left out rather than counted as zero.

## Tagging the exercise with a PHEP exercise

Public health agencies funded under the CDC PHEP cooperative agreement follow its 2024-2028 Exercise Framework. In **Exercise details**, under **Program exercise**, tick the exercise your tabletop is: for example Biological Incident 100, or Capstone 100. The screen shows the framework's suggested objectives and participants and the date by which improvement plan data is due (90 days after the exercise).

The After-Action Report then adds a table under the improvement plan that names the program exercise and the date of the framework text on every row. You enter that information in CDC's own system; this app submits nothing to CDC. The framework text is dated April 2024, and the cooperative agreement runs to June 30, 2029, so check CDC's current guidance before you rely on a requirement. The framework does not publish the exact improvement plan data elements, so the table uses the standard improvement plan columns and does not claim to match CDC's template.

## Limits of simulated data

- The models are not calibrated to any disease or place. Their numbers show how a method behaves, not what an outbreak will do.
- Pathogen values (incubation and infectious periods) are public health teaching values with sources. A state or local epidemiologist and an infection preventionist should review them before use in training for real response.
- Simulated people are fictional. Do not enter real patient data, and mark every roster and export as exercise material.
- A replayed series is history. A simulated series is never presented as history, and the two are labeled wherever they appear.
- Contact reach and dispensing throughput are scored against targets you set. No national target is assumed.
