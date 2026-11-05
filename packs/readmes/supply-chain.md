# Supply chain and logistics

Included with Action Stations. This pack adds the `supply_chain` domain profile: a fictional manufacturer, distributor, third-party logistics provider or recall team that must keep goods flowing or pull them back. Three variants share one profile: a manufacturer or brand owner (supplier risk, allocation, sourcing), a distributor or logistics provider (lanes, dock, inventory, carriers) and a food recall team (lot tracing, consignee notices, regulator contact).

Facts below were checked on 2026-11-04.

## Threat families

Supplier failure or supply shock, port, rail or lane disruption, product safety with cold chain and recall, logistics provider or warehouse system cyber attack, and critical product shortage. The recall arc follows the order the FDA recall regulations imply: signal, hold and investigate, trace, decide and notify, retrieve and verify, root cause and restart.

## Scope

The profile stays at coordination level: lots, quantities, dates, ship-to lists, classes and letters. It carries no pathogen handling or sampling detail. Every company, supplier, carrier and customer in a scenario is fictional. It reuses the recall vocabulary of the `food_agriculture` profile and adds the planning, buying and moving layer above it.

## Regulations the profile assumes

- FDA recall regulations (21 CFR part 7): classes, strategy depth, effectiveness checks, notification of direct accounts and status reports.
- FSMA Section 204 food traceability (21 CFR part 1, subpart S): the compliance date is subject to enforcement discretion until at least 2028-07-20; the toolkit says so rather than treating a date as settled.

## Reference links (not bundled)

- FDA recalls background: https://www.fda.gov/safety/industry-guidance-recalls
- FSMA Final Rule on Requirements for Additional Traceability Records for Certain Foods: https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods
