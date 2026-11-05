# ADR-0123: Pharmacy decisions are toolkit data and metrics rerun the models with them

Date: 2026-11-05 · Status: Accepted · Issues: #696, #906, #907, #908 · Spec: [0463](../specs/0463-pharmacy.md) · Related: ADR-0120, ADR-0122, ADR-0074 (toolkits)

## Context

Players decide (an allocation percentage, a viability call, a staffing change) and the exercise must show what each decision changed in a way a facilitator can explain, without a second copy of the model's parameters and without the model deciding anything.

## Decision

- **Twelve decision forms** are toolkit data (`packs/toolkits/pharmacy.json`) and reach live play and Facilitate through the shared provider. Form ids are prefixed `pharmacy_` and are the decision kinds the metrics read. A choice field records an option id (a slug of its label), so the metrics compare slugs.
- **Six metrics** register through `registerMetric` from `registerPharmacyToolkit()` (`src/main/evaluation/metrics/pharmacy.ts`): shortage impact, safe substitutions, cold chain response, diversion clocks, recall response and queue response. Message consistency uses the generic metric.
- **Consequences are computed at scoring time.** The shortage and queue metrics read the `*_model` event of the generator (its parameters), add the allocation or staffing decisions at the exercise day or minute they were recorded, rerun the model and show both runs. Nothing a decision changes is stored; the facilitator sees the inputs, both results and the rule (the model) that produced them. Cold chain scoring compares viability decisions with the fictional product table's verdict.
- **Diversion clocks follow 21 CFR 1301.76(b):** the written notice to the DEA Field Division is due the end of the next business day after discovery, Form 106 the end of the 45th day, both in UTC with weekends skipped and no federal holidays; the result says so. State rules are not scored.
- **EEGs and the exercise record.** The toolkit carries critical tasks for six Core Capabilities and a hospital annual exercise tag whose priorities are the six critical areas for emergency management. The area names were not checked against the Joint Commission's current text and the tag says it is an aid, not a compliance claim.
- A **recall generator** (`pharmacy-recall`) supplies the notice event and lot balances, so recall response can be scored.

## Consequences

- A decision with a missing or out-of-range field is ignored by the model rerun and listed in the inputs, never guessed at.
- Example projects that need generation with a local model are deferred; the toolkit is complete without them.
