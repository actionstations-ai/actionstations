# Domain dossier: `supply_chain` (supply chain and logistics)

Research for the supply chain epic (#695, spec 0462) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** teams that buy, make, move, store and sell goods and must keep supply flowing or pull it back: supply chain and procurement leaders, logistics and transportation managers, distribution center and cold storage operators, third-party logistics providers, food safety and quality assurance (recall) teams, and supply chain programs at universities.

**Exercise types this domain needs:**

- **Supplier failure:** a single-source supplier stops shipping (fire, bankruptcy, cyber attack, sanctions).
- **Transport disruption:** a port, rail or highway closes; a canal or channel is blocked.
- **Cold chain breach:** a refrigeration failure or temperature excursion in storage or transit.
- **Product recall with lot tracing:** find every shipment of an affected lot fast, notify customers, retrieve product.
- **Logistics provider cyber attack:** a carrier or warehouse system is down.
- **Critical shortage:** a medical or food product runs short and allocation decisions follow.

**Aliases:** supply chain, logistics, procurement, sourcing, distribution, warehouse, 3PL, freight, cold chain, traceability, recall, inventory, S&OP, demand planning, fulfillment.

**Boundary with existing domains:** `food_agriculture` covers farms and processors including the recall workflow and `recall_notice`; `port_maritime`, `freight_rail`, `airport` and `transit` cover the infrastructure operators; `commercial_facilities` covers retail. `supply_chain` is the planning, buying and moving layer that spans them. Extend, do not duplicate: the recall templates in `food_agriculture` are reused by reference.

## 2. Organization and roles

| Title                                  | Abbrev. | Team       | What they decide                                                                           |
| -------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------ |
| Chief Supply Chain Officer / VP Supply | CSCO    | Executive  | Allocation among customers, expedite spend, alternate sources, when to escalate to the CEO |
| Procurement / Sourcing Director        | PROC    | Sourcing   | Switch to a second source, qualify a substitute, contract and price terms                  |
| Supplier Risk Manager                  | SRM     | Sourcing   | Supplier status, tier-2 and tier-3 visibility, risk scores                                 |
| Logistics / Transportation Manager     | LOG     | Logistics  | Reroute, mode change (ocean to air), carrier selection, detention and demurrage            |
| Distribution Center Manager            | DC      | Operations | Inbound and outbound priorities, labor, storage, quarantine areas                          |
| Inventory / Demand Planner             | PLAN    | Planning   | Days of supply by item and site, rebalance inventory, forecast reset                       |
| Food Safety and Quality Assurance lead | FSQA    | Quality    | Product hold, health hazard evaluation input, recall recommendation                        |
| Recall Coordinator                     | RECALL  | Quality    | Recall strategy depth, lot trace, consignee list, effectiveness checks                     |
| Customer Service / Key Account Manager | CS      | Commercial | Customer notices, allocation messages, service credits                                     |
| General Counsel / Regulatory Affairs   | GC      | Legal      | Regulator contact, contract force majeure, public statements                               |
| Communications lead                    | COMMS   | Comms      | Recall notice, customer letters, media                                                     |
| IT / logistics systems lead            | IT      | IT         | Restore transportation management and warehouse systems, EDI connections                   |

Outside parties: suppliers (tier 1 to 3), carriers and 3PLs, customs brokers, ports and terminals, customers (retail and food service), the FDA or USDA, state and local health departments, insurers, trade press, consumers.

## 3. Systems

- **Enterprise resource planning (ERP)**, demand and supply planning, warehouse management (WMS), transportation management (TMS), supplier portals, EDI and API links to partners, shipment visibility (AIS vessel tracking, rail and truck tracking, telematics), lot and batch traceability in the manufacturing execution system (MES), temperature monitoring and data loggers, label and barcode systems (GS1 identifiers), customs and trade compliance, supplier risk monitoring.
- **Dependencies:** ports, rail and highway networks, power for cold storage, telecom, cloud providers.

## 4. Products (what injects look like)

| Product                                                                                                              | Render                                       |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Shipment tracker (lane, carrier, vessel/trailer, ETA, status, exceptions)                                            | table figure                                 |
| Inventory and days-of-supply dashboard (by item, site; reorder point; projected stock-out date)                      | figure from case data                        |
| Supplier status board (tier, site, status, last contact, alternate source, lead time)                                | template                                     |
| Traceability lookup: lot code to ship-to list (shipping and receiving records with the data elements the rule names) | table figure + export (sortable spreadsheet) |
| Temperature excursion chart and data logger alert                                                                    | time series figure                           |
| Port or lane congestion board (vessels waiting, dwell days)                                                          | figure                                       |
| Purchase order change, allocation notice, force majeure letter, expedite request                                     | templates                                    |
| Recall notice, direct-account recall letter marked urgent, recall status report                                      | templates (reuse `food_agriculture` and add) |
| FDA request for records letter (24-hour clock), Reportable Food Registry report summary                              | templates                                    |
| Customer complaint and adverse event log                                                                             | template                                     |

Text-bearing media rule applies: every notice, board and chart is a template or figure, never AI pixels. AI images are for scenes (a flooded yard, a stopped ship).

## 5. Regulations, doctrine and documents

**FSMA Section 204 Food Traceability Rule (21 CFR part 1, subpart S)** **[V: FDA rule page and eCFR text]**

- Covers foods on the Food Traceability List: soft cheeses, shell eggs, nut butter, cucumbers, herbs, leafy greens, melons, peppers, sprouts, tomatoes, tropical tree fruits, fresh-cut fruits and vegetables, finfish, crustaceans, mollusks and ready-to-eat deli salads **[V]**.
- Covered firms keep records of Key Data Elements (KDEs) at Critical Tracking Events (CTEs): harvesting, cooling, initial packing, first land-based receiving, shipping, receiving and transformation **[V]**. Shipping KDEs include traceability lot code, quantity and unit, product description, location description, ship date and reference document **[V]**.
- Records must be available to FDA "within 24 hours (or within some reasonable time to which FDA has agreed)" after a request, and for certain requests as an electronic sortable spreadsheet **[V: 21 CFR 1.1455(c)]**. Records are kept for 2 years **[V: 1.1455(d)]**. A traceability plan is required (1.1315) **[V]**.
- **Compliance date.** The original date was 2026-01-20. FDA's page states that Congress directed FDA not to enforce the rule before 2028-07-20 and that FDA intends to comply, and FDA proposed a 30-month extension to that date **[V]**. A final extension rule in the Federal Register was not found this session **[U]**. The pack must state both dates and the status, and re-check at each release (same rule as spec 0426: a test fails when `verifiedOn` is older than 12 months).

**FDA recalls** **[V: FDA recall page and 21 CFR part 7]**

- Classes: Class I (reasonable probability of serious adverse health consequences or death), Class II (temporary or medically reversible consequences, or remote chance of serious), Class III (not likely to cause adverse consequences); market withdrawal for minor violations.
- 21 CFR 7.42 recall strategy: depth of recall (consumer, retail or wholesale level), public warning when urgent, effectiveness checks (level A is 100 percent of consignees, C is 10 percent, D is 2 percent, E none). 7.46: a firm may start a recall on its own and need not wait for FDA. 7.49: notify each affected direct account promptly; for Class I and II mark the communication "urgent"; identify product and lot numbers, reason, hazard and instructions. 7.53: periodic status reports, usually every 2 to 4 weeks.
- **Reportable Food Registry:** registered facilities report when there is a reasonable probability of serious adverse health consequences or death **[V: FDA page]**; the 24-hour timing is in the statute **[U: not stated on the page read]**.

**Other candidates** **[U]**: USDA FSIS recall directives; the Defense Production Act and national stockpile material for medical supply shortages; CISA National Risk Management Center supply chain resilience material and the ICT Supply Chain Risk Management Task Force; DHS and DOT port and rail disruption guidance; FEMA Community Lifelines (Food, Water, Shelter and Transportation). Verify license and URL when building the library pack.

## 6. Real events and lessons

- **Suez Canal, March 2021:** the Ever Given blocked the canal for about six days (6 days 7 hours, 23 to 29 March) with a backlog of more than 400 ships, and an insurer estimated delays cost global business $6 billion to $10 billion **[U: secondary press; no primary report read]**. Use for a transport disruption arc.
- **Infant formula shortage, 2022:** an FDA recall and plant shutdown combined with an already strained market; a National Academies report in 2024 found FDA's risk management and supply recovery fell short **[U: secondary press summaries]**. Use for a critical shortage arc. Primary sources to read at pack build time: FDA's internal review and the National Academies report.
- Lessons that recur: unknown tier-2 and tier-3 dependencies, inventory in the wrong place, slow lot tracing from paper or mismatched identifiers, customers notified in different orders by different people.

## 7. Data sources (free, public)

| Data                                                  | Source                                            | Notes                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Food recalls and enforcement reports                  | openFDA food enforcement API                      | Free; the page read did not list fields, limits or license **[U]**; read the terms before building the connector |
| Recall and safety alerts feeds                        | FDA and USDA FSIS recall pages                    | Public **[U: feed formats]**                                                                                     |
| Freight flows by mode and region                      | BTS Freight Analysis Framework                    | Public federal data **[U: page blocked this session]**                                                           |
| Port and vessel activity                              | USACE navigation data, port authority releases    | **[U]**                                                                                                          |
| Weather, flooding and earthquake data for disruptions | The weather, flooding and earth sciences toolkits | Reused by reference (specs 0449, 0450)                                                                           |

Most supply chain exercise data (inventory, orders, shipments, lots) is simulated from parameters: a network of fictional suppliers, sites and lanes with lead times, demand and stock.

## 8. Evaluation

- **Time to trace:** minutes from the recall decision to a complete ship-to list for the affected lots, against the 24-hour records request **[V]**.
- **Days of supply protected:** the projected stock-out date moved by the decisions made; critical items kept above a floor.
- **Customer notification on time:** share of consignees notified within a target after the decision; effectiveness check level reached.
- **Decision quality:** alternate source qualified, allocation rule stated and applied, communication consistency.
- **HSEEP core capabilities:** Supply Chain Integrity and Security, Logistics and Supply Chain Management, Operational Coordination, Public Information and Warning, Economic Recovery.

## 9. Threat families and scenario arcs

- **Supplier and demand shocks:** single-source failure, labor action, sanctions, price spike.
- **Transport disruption:** port closure, rail derailment, canal or bridge blockage, severe weather.
- **Product safety:** contamination, cold chain breach, recall with lot tracing.
- **Cyber:** logistics provider or warehouse system attack.
- Arc for a recall: signal (complaint or test) → hold and investigate → health hazard evaluation and decision → lot trace → notices to consignees and public → retrieval and effectiveness checks → root cause and restart.

## 10. Reuse by other domains

The logistics toolkit (tracker, inventory dashboard, supplier board, traceability lookup) suits hospitals (medical supplies), pharmacies (#696), utilities (spare parts, fuel), retailers, humanitarian response (#702), schools (food service) and manufacturers. It reuses the maritime, freight rail and agriculture material and governance's BIA and recovery tracker (spec 0459).

## Expert review (2026-11-11)

This is a model-led expert review, written from the standpoint of a supply chain and logistics resilience director and a food safety recall lead. It is not a review by a licensed or employed practitioner.

**Checked.** The domain profile and its five threat families, the logistics toolkit (glossary, product conventions, realism rules, decision forms, metrics, critical tasks), the FSMA 204 records-request and FDA recall regulation entries, the supply chain guide, the recall letter, recall status report, public recall notice, records request, temperature excursion and allocation notice previews, and the simulated network's days-of-supply arithmetic.

**Sources.** 21 CFR part 7 subpart C (7.41, 7.42, 7.46, 7.49, 7.53) and 21 CFR part 1 subpart S (1.1340, 1.1455), both read from the eCFR versioner API on 2026-11-11; the FDA food traceability rule page and the Federal Register notice of 2025-08-07 proposing the 30-month extension to 2028-07-20; FDA recall background and definitions.

**Confirmed.** Recall classes; depth levels (consumer, retail, wholesale); effectiveness check levels A to E, with Level B "greater than 10 and less than 100 percent"; the "urgent" marking for Class I and II (and Class III when appropriate); status reports generally every 2 to 4 weeks at an interval FDA sets; firm-initiated recall without waiting for FDA; records available within 24 hours with the electronic sortable spreadsheet; 2-year record retention; and the compliance date status (proposed extension plus the congressional direction not to enforce before 2028-07-20; no final extension rule found on 2026-11-11). Demurrage and detention, tiering, force majeure and the allocation rules read as a practitioner would expect.

**Changed and why.**

- The simulated days-of-supply series counted confirmed inbound stock, while the guide and the design record promise stock on hand only. In a lane disruption a delayed shipment kept the series above the floor while shelves emptied, so the supply protection measure could miss the crossing. The series now counts stock on hand only, and a test pins it. The inventory board figure keeps its separate Inbound column and still adds it, a common and labelled planner convention.
- The glossary's days-of-supply line now says stock on hand by default and that a table adding inbound shows it.
- The recall class entry now says FDA assigns the class after its health hazard evaluation (21 CFR 7.41), and a firm's own notice may say the class is not yet assigned, as the public notice preview does.
- A realism rule gives the FDA recall number format: food recalls start with F and carry the federal fiscal year. The recall status report's schema example used Z, the device prefix; it is now F-0000-2027.

**Defaults set.** The simulated days-of-supply series is stock on hand divided by daily demand. The recall regulation keeps its 24-hour consignee notice and 14-day first status report as labelled exercise planning targets; the regulation sets neither.

**Caveats left for the owner.**

- The recall status report preview still shows `Z-0000-2027`. Change it to `F-0000-2027` and regenerate that template's golden; the app could not be rendered in this review's environment.
- The status report template has no field for the estimated time to complete the recall, which 21 CFR 7.53(b) lists.
- The allocation notice preview says it allocates on historical share and marks a row "Allocated pro rata"; a planner would use one term.
- Re-check the FSMA 204 compliance date at each release.
