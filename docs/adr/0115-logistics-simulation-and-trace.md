# ADR-0115: Logistics simulation is a seeded baseline, and the trace follows recorded links only

Date: 2026-11-05 · Status: Accepted · Issues: #804, #808, #810, #814 · Spec: [0462](../specs/0462-supply-chain.md) · Related: ADR-0075 (figures), ADR-0076 (case data)

## Context

The logistics toolkit needs a supply network that goes wrong in a believable way, records a recall team can trace, and a way to score decisions against both. The data must agree with itself (what shipped equals what arrived plus what is in transit), be repeatable in tests, and never pass as real.

## Decision

- **A seeded baseline, not a forecast.** `simulate/network.ts` builds single-source items, lead times, a daily demand at each distribution center and a reorder rule from one mulberry32 source. A supplier failure removes the shipments it would have made; a lane disruption delays arrivals to one center. Stock never goes negative: unmet demand is counted as shortfall. The days-of-supply series is the baseline with the disruption and no protective action, and it counts stock on hand only (stock that has not arrived protects nothing). A team's decisions do not change it, so `logistics_supply_protection` scores the timing of the first protective decision against it and says so in its caveats, rather than reporting a recomputed stock-out date.
- **A trace follows recorded links only.** `trace.ts` follows a lot forward through shipping records and through transformation records that name it as an input. A shipment from a holder of the lot under a code that no transformation record links is not silently included: it is listed as a suspect with the reason, and counts as a gap. A shipping record with no reference document is a gap. The simulator plants both kinds and returns the planted gaps, so tests and the `trace_answer` ground-truth event know the right answer.
- **Export.** The lookup exports as CSV (quoted) and XLSX (ExcelJS, one sheet with a filter row), with the FSMA 204 shipping data elements as columns.
- **Recall data connector.** `openfda-food-enforcement` reads one page from `api.fda.gov`, makes one request, sends no key and leaves out recalling firm names and addresses, so exercise organizations stay fictional. openFDA content is public domain (CC0) and rate limited per IP (240 a minute, 1,000 a day without a key, read from the openFDA authentication page on 2026-11-05). A freight flow connector is deferred until a stable public dataset is confirmed.
- **Metrics reuse the generic ones where they fit.** Decision timing scores the recall decision, the hold and the first protective decision against ground-truth events. Three field metrics (`logistics_trace_completeness`, `logistics_notification_timeliness`, `logistics_supply_protection`) show their inputs, the designer's target and caveats; none assumes a regulator target other than the 24-hour records request clock, which is a setting.

## Consequences

- The network is a teaching model. It is not calibrated to any company and gives no reorder advice.
- A designer who wants the decisions to change the series needs a model that responds to them; that is a separate decision.
- Names in trace matching are compared as typed, so a misspelled account is a different account; the notification metric says so.
