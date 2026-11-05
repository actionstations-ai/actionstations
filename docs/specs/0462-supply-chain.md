# Spec 0462: Supply chain and logistics — the supply chain domain and logistics toolkit

Issue: #695 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Research: [docs/research/domains/supply_chain.md](../research/domains/supply_chain.md)

## Summary

Action Stations can exercise the people who buy, make, move, store and recall goods: supply chain and procurement leaders, logistics and distribution center managers, food safety and quality teams, and supply chain students. They work a single-source supplier failure, a port, rail or canal disruption, a cold chain breach, a product recall with lot tracing, a logistics provider cyber attack or a critical shortage. They see the shipment tracker, the days-of-supply dashboard, the supplier status board and the traceability lookup that they use every day, make allocation and recall decisions under time pressure, and are scored on time to trace affected lots, days of supply protected and customers notified on time. Everything ships as the **logistics toolkit**, so any other domain (hospitals, utilities, retail, schools, humanitarian response) can add real supply problems to its exercises. The FSMA 204 food traceability rule gives the recall scenarios a real clock and real record formats.

## Requirements

### User stories

- As a food manufacturer's recall coordinator, I want to trace a contaminated lot through shipping records to every consignee, against a 24-hour request from FDA, and send recall letters.
- As a supply chain director, I want a scenario where a single-source supplier burns down, and I decide on allocation, an alternate source and expedited freight with days of supply on screen.
- As a logistics manager, I want a canal blockage that pushes my container ETAs out by a week, so my team reroutes, changes mode or accepts stock-outs.
- As a distribution center manager, I want a refrigeration failure with a temperature chart and decide what to quarantine.
- As a hospital materials manager, I want a critical medical supply shortage using the same dashboard.
- As a supply chain instructor, I want a two-hour lab with a simulated network of suppliers, plants, centers and customers.

### Functional requirements

**Domain**

- **FR-1 Supply chain domain.** A `supply_chain` domain profile with the roles, systems, outside parties and phrasing in the dossier (sections 2–3), with variants for a manufacturer or brand owner, a distributor or third-party logistics provider, and a food recall team; aliases as listed. The food recall variant reuses the recall roles and templates of `food_agriculture` by reference.
- **FR-2 Threat families and arcs.** Supplier and demand shocks, transport disruption, product safety (contamination, cold chain, recall) and logistics cyber attack, with phase arcs as in the dossier (section 9), using extensible families (spec 0448 FR-15).

**Logistics toolkit: products and figures**

- **FR-3 Products as templates.** Exact, legible templates for: supplier status board; purchase order change, allocation notice, force majeure letter, expedite request; port or lane congestion notice; temperature excursion alert; recall notice and direct-account recall letter (marked urgent for Class I and II); recall status report; FDA request for records letter; customer complaint and adverse event log. Existing recall templates in `food_agriculture` are reused, not copied.
- **FR-4 Format rules.** Lint checks: lot codes and units consistent across a scenario's shipping and receiving records; each simulated traceability record carries the data elements the rule names for its event (shipping: traceability lot code, quantity and unit, product description, location description, ship date, reference document); a recall letter contains product and lot identifiers, reason, hazard, instructions and a way to reply; dates and quantities reconcile (shipped equals received plus in transit). Generator knowledge states recall classes and the strategy elements (depth, public warning, effectiveness checks) in the dossier (section 5).
- **FR-5 Figures.** Figure kinds (spec 0448 FR-4): shipment tracker (table with exceptions and an optional lane map using the map overlays of spec 0448 FR-11); inventory and days-of-supply dashboard (by item and site, reorder points, projected stock-out dates); supplier network graph (tiers, status); congestion board; temperature excursion chart (time series with limits); traceability lookup result table. Each produces the text summary and data table of spec 0448 FR-5. Charts and boards come from case data only; never AI pixels (project rule 5).

**Traceability and recall**

- **FR-6 Traceability lookup.** From the scenario's simulated records (harvest or receiving, transformation, shipping, receiving), a lookup returns for a lot code every downstream ship-to, quantities, dates and remaining on-hand, as a table figure and an exportable electronic sortable spreadsheet (CSV and XLSX), so players can answer a records request within the 24-hour clock. Includes realistic gaps (a missing reference document, a mismatched lot code at a transformation step) to test data quality.
- **FR-7 Recall workflow.** A structured recall path as decisions and injects: hold and investigate, health hazard input, recall classification and depth, public warning yes/no, consignee notices, effectiveness check level, status reports. The scenario can start from a signal (test result, complaint, regulator call) at any step.

**Data and simulation**

- **FR-8 Simulated supply network.** From parameters (number of tiers, sites, lanes, lead times, demand, stock, disruption type and timing), generate a consistent network and case data: inventory trajectories with days of supply, shipment ETAs that slip with disruptions, supplier statuses, temperature logs, and a traceability record set for chosen foods. All labeled simulated.
- **FR-9 Connectors (optional, with consent).** Replay or seed from public data: recent food recalls and enforcement reports (openFDA food enforcement API) to make recall notices realistic; public freight flow data (BTS Freight Analysis Framework) for lane volumes; weather, flooding and earthquake data from existing toolkits for disruption triggers. Exercise organizations and brands stay fictional.

**Exercise play and evaluation**

- **FR-10 Structured decisions.** Forms: "Allocate supply" (item, customers, rule, quantities), "Switch source" (supplier, qualification status, lead time), "Reroute or change mode" (lane, mode, cost, ETA), "Hold or quarantine" (lot, location, reason), "Recall" (class, depth, warning, effectiveness level), "Notify customers" (which, order, message), "Escalate to executive team".
- **FR-11 Metrics and core capabilities.** From the built-in set (spec 0448 FR-12): time to trace (decision to complete ship-to list), share of consignees notified within target, effectiveness check level reached, days of supply protected (projected stock-out date moved) and stock-outs avoided, decision timing, message consistency. EEGs for Supply Chain Integrity and Security, Logistics and Supply Chain Management, Operational Coordination, Public Information and Warning and Economic Recovery, with supply chain critical tasks.

**Regulations and knowledge**

- **FR-12 Regulation pack.** Pack data (spec 0426): `fsma_204_records` (trigger: FDA request received; clock: records available in 24 hours, or a reasonable time FDA agrees; recipient FDA; output: electronic sortable spreadsheet; status `in_force` with a status note that enforcement is directed not before 2028-07-20 and the date of the last check), and `fda_recall_reporting` (recall status reports, usually every 2 to 4 weeks, as guidance). The Reportable Food Registry timing is added only after the statute text is checked (dossier section 5).
- **FR-13 Document library.** A public-domain library pack: FSMA 204 final rule, FDA guidance, Food Traceability List and KDE/CTE tables; 21 CFR part 7 recall procedures; FDA recall classification page; FDA industry recall guidance; FSIS recall directives; FEMA community lifelines; CISA supply chain resilience material (verify each license and URL when building the pack).
- **FR-14 Examples.** (1) A fictional leafy greens processor: lab positive, lot trace across three distribution centers, recall letters and the 24-hour records request. (2) A fictional appliance maker: sole-source component supplier loses its plant; allocation and alternate source. (3) A fictional regional hospital system: canal blockage plus a cyber attack on its distributor; critical medical supply shortage.
- **FR-15 Reuse.** Suggested toolkits added to the food and agriculture, commercial facilities, port and maritime, freight rail, healthcare, public health, K–12 (food service), energy utility, governance (spec 0459) and humanitarian profiles; weather and flooding toolkits suggested for transport disruption.

### Non-functional requirements

- **NFR-1 Cost:** only free public sources; no accounts or keys.
- **NFR-2 Privacy:** public APIs are contacted only when the user fetches data for a scenario; nothing about the user's plans is sent. Simulated supplier and customer names are fictional; no real brand appears in generated documents.
- **NFR-3 Accessibility:** every figure has a text summary and a data table; status uses words and icons, not color alone; exports are plain CSV and XLSX.
- **NFR-4 Accuracy:** regulation data carries `verifiedOn` and is re-checked each release (spec 0426 FR-16); the FSMA 204 compliance date is shown with its status; a review by a supply chain director and a food safety manager before release (owner to arrange).

### Out of scope

- A real inventory, transportation or traceability system; products are exercise products.
- Live tracking data (AIS, rail, truck) during a session.
- Real regulatory submissions (FDA portals).
- Tariff, customs and trade law decision support.

## Design

- **Domain:** `packs/domains/supply_chain.json` (bundled) with variants as role sets.
- **Toolkit:** `packs/toolkits/logistics/` (toolkit JSON, templates, knowledge fragments, lint configuration, decision forms).
- **Regulations:** `packs/regulations/fsma_204_records.json`, `packs/regulations/fda_recall_reporting.json`.
- **Figures:** `src/main/render/figures/logistics/`; shared table, time series and network figures from spec 0448.
- **Simulation:** `src/main/toolkits/logistics/simulate.ts` (network generator, inventory dynamics, ETA slippage, temperature logs, traceability record sets).
- **Traceability lookup and export:** `src/main/toolkits/logistics/trace.ts`.
- **Connectors:** `src/main/toolkits/connectors/{openfda_food,bts_faf}.ts` with estimate, fetch and recorded-response tests.

## Security and privacy

As spec 0448: fixed hosts per connector, size limits, files only in the scenario folder, consent before fetching. openFDA terms of service are read and recorded in the connector's docs before release.

## Testing

Golden images for each figure; simulation tests (stock never negative, shipped equals received plus in transit, lot trace complete except the planted gaps); trace lookup tests on a worked example with a known ship-to list; lint tests for each rule in FR-4; clock tests for the 24-hour records request; connector contract tests with recorded responses and opt-in live tests; example projects generated end to end with the local model before release.

## Tasks

1. **#795** Domain profile, roles, variants, threat families and arcs (FR-1, FR-2).
2. **#797** Logistics toolkit templates and knowledge (FR-3, FR-4).
3. **#801** Shipment, inventory, supplier and cold chain figures (FR-5).
4. **#804** Traceability lookup and recall workflow (FR-6, FR-7).
5. **#808** Simulated supply network and disruptions (FR-8).
6. **#810** Recall and disruption connectors (FR-9).
7. **#814** Decisions, metrics and EEGs (FR-10, FR-11).
8. **#819** FSMA 204 and recall regulation pack, document library (FR-12, FR-13).
9. **#823** Examples, reuse in other domains, user guide (FR-14, FR-15).

## Open questions

- **Compliance date status.** FDA's rule page showed both the original date and the congressional direction not to enforce before 2028-07-20; a final extension rule was not found. Recommendation: pack text states both and the pack is re-checked at each release.
- **Practitioner review.** Recommendation: a supply chain director and a food safety (SQF or HACCP) manager review the templates and examples before release.
- **openFDA terms.** Fields, rate limits and license were not documented on the page read. Recommendation: read the terms during the connector task; fall back to bundled sample recalls if limits are unsuitable.
- **Pharmacy overlap.** The pharmacy field (#696) reuses this toolkit for cold chain and shortages; recommendation: keep drug-specific rules there.
