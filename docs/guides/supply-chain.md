# Supply chain and logistics

The logistics toolkit gives an exercise the work of the people who buy, make, move, store and recall goods: single-source supplier failures, port and lane disruptions, cold chain breaches, product recalls with lot tracing, a logistics provider cyber attack and critical shortages. It suits supply chain and procurement teams, logistics and distribution center managers, food safety and quality teams, supply chain classes, and any organization that depends on deliveries: a hospital's materials office, a utility's spare parts store, a retailer or a school's food service.

Turn it on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes it when the brief mentions a supplier, a shipment, a recall, a shortage or a distribution center, and for food, port, rail, health, school and utility kinds of organization. The **Supply chain and logistics** kind of organization describes the planners, buyers and recall team themselves.

The toolkit stays at coordination level: lots, quantities, dates, ship-to lists, classes and letters. It carries no detail on handling, culturing or sampling any pathogen. Every company, supplier, carrier and customer it produces is fictional.

## What it adds

- **Documents and boards** the team sees: supplier status board, supply disruption notice (allocation notice, force majeure letter, purchase order change, expedite request or lane congestion notice), temperature excursion alert, customer complaint and adverse event log, public product recall notice, direct-account recall letter, recall status report, and a regulator's request for traceability records.
- **Figures** drawn from data, never as pictures from an image model: shipment tracker, inventory and days of supply, supplier network by tier, port and lane congestion board, temperature record against its allowed range, and the traceability lookup. Each has a text summary and a data table, and status is always a word as well as a shape.
- **Decisions** players record: allocate supply, switch source, reroute or change mode, hold or quarantine product, recall decision (class, depth, public warning, effectiveness checks), notify customers, escalate to the executive team, and submit a trace result.
- **Writing guidance** so drafts use the field's terms correctly: days of supply, tiers, force majeure, demurrage and detention, traceability lot codes, recall classes and depth, and the effectiveness check levels.
- **Checks** on generated text: lot codes keep one format within a notice, a recall letter names the lots, reason, hazard, instructions and a way to reply, a Class I or Class II letter is marked urgent, and recall counts add up.

## Simulated supply networks

The app can generate a supply network to draw from. Every set is labeled **simulated** and can be repeated exactly by using the same seed.

| You want                                | You set                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A single-source supplier that goes down | Number of items and distribution centers, the day the failure starts, how long it lasts, and how severe |
| A lane or port that delays one center   | The same, with a lane disruption instead of a supplier failure                                          |
| Records to trace a recalled lot         | The lot code, the product, how many distribution centers and customers, and which gaps to plant         |

The network gives each item one tier-1 source, a lead time and a daily demand at each center, and a reorder rule. Stock never goes negative: demand that cannot be met is counted as a shortfall. The days-of-supply series counts stock on hand only, because stock still on a truck protects nothing.

The series is the baseline with the disruption and no protective action. Your players' decisions do not change it, so the app scores how early they acted, not a recomputed stock-out date.

## Tracing a lot

The trace records are simulated shipping, receiving and transformation records. A trace follows a lot forward to every ship-to, through any transformation that names it as an input, and lists the quantity still held at each distribution center.

The records carry planted gaps so the exercise tests data quality, not only speed:

- A shipment with no reference document is marked **missing reference document**.
- A distribution center that repacked the product under a new lot code, with no record linking the two, shows up as a **suspect**: the trace does not silently include it, and it counts as a gap.

The lookup can be saved as a CSV or an Excel spreadsheet with the columns the traceability rule names for shipping records, which is the electronic sortable spreadsheet a records request asks for.

## Scoring

Players record decisions in live play, or the facilitator records them in Facilitate, and the Evaluation tab scores them against the simulated events:

- **Time from the recall signal** to the recall decision and to a hold.
- **Time to trace and share found**: minutes from the signal (or from the recall decision, as you choose) to the submitted ship-to list, how much of the real list the team found, and whether it said the records had gaps. The default clock is 24 hours, which is the traceability rule's window for a records request; you can change it.
- **Customers notified on time**: how many accounts were named in a notice within the target you set after the recall decision. No regulator target is assumed.
- **Protective timing**: how early the first allocate, switch-source or reroute decision came against the first item falling below the floor you set.
- **Message consistency** across supply chain, customer service and regulatory affairs.

## Past recalls as a starting point

The app can fetch past FDA food recall records (class, reason, product, quantity and distribution) through the open FDA service to make a recall scenario realistic. You choose the period and class, the app shows what it would fetch and how large it is, and only after you agree does it contact the service. No account or key is needed, and nothing about your plans is sent. Firm names and addresses are left out so your exercise organizations stay fictional.

## Regulations

Two regulation entries give the recall scenarios real clocks in Settings, under Compliance:

- **Records request under the food traceability rule**: records available to the FDA within 24 hours, or a reasonable time the FDA agrees, with an electronic sortable spreadsheet when needed during an outbreak or recall. The compliance date has changed: it was January 20, 2026, and the FDA says Congress directed it not to enforce the rule before July 20, 2028. The entry states both and its status, and is re-checked with each release.
- **Recall notices and status reports**: notify each direct account, mark Class I and II communications urgent, and send status reports at intervals the FDA sets, generally 2 to 4 weeks. These recall regulations are guidance, and a firm can recall on its own.

## Reference library

An optional library pack holds the final rule on traceability records and the recall regulations, each public domain and pinned by hash. The FDA's Food Traceability List and recall background pages, and FEMA's Community Lifelines, are linked rather than bundled.

## Limits

- The network is a teaching model, not calibrated to any company. It gives no reorder advice.
- Account names in a notice are matched as typed, so a misspelled account counts as a different account.
- A supply chain director and a food safety manager should review the content before it is used to train for real response.
- Real company and brand names must not be used for exercise organizations.
