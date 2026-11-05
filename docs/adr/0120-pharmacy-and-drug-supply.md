# ADR-0120: Pharmacy is a domain, the pharmacy toolkit holds the products and checks

Date: 2026-11-05 · Status: Accepted · Issues: #696, #899, #900 · Spec: [0463](../specs/0463-pharmacy.md) · Related: ADR-0085 (nursing and clinical care), ADR-0014 (domain profiles), ADR-0074 (toolkits)

## Context

Drug shortages and pharmacy system outages reach patients, and pharmacy is part of every hospital exercise. Pharmacy is also its own kind of organization (a community pharmacy has no hospital around it) and its products (shortage boards, temperature logs, loss notices, recall logs) are used by clinics, public health and long-term care.

## Decision

- **`pharmacy` is a domain profile** (`packs/domains/pharmacy.json`) with four variants as role sets (hospital pharmacy, community pharmacy, compounding, vaccine program), told apart by the team prefix. As with nursing (ADR-0085), the profile format has no `extends`, so the hospital outside parties, media and regulation list are repeated and a test keeps them in step.
- **Six scenario families** are added by the domain: drug shortage (the default), compounding error, controlled substance diversion, cold chain failure, recall, and pharmacy systems outage (the pharmacy form of the shared service degradation family; built-in `infrastructure_failure` is not changed). Dispensing in a disaster uses the built-in hazard families.
- **The pharmacy toolkit is pack data** (`packs/toolkits/pharmacy.json`) with thirteen product templates in the same bundled pack, `ai.actionstations.pharmacy`. Clinical care and clinical systems are reused by suggestion, not copied; the dose check is the clinical one (`src/shared/clinical/dose.ts`) wrapped as `pharmacy_dose_plausibility`.
- **Format rules are field lint rules** (`src/main/toolkits/pharmacy/`): NDC shape, Celsius and Fahrenheit pairs, days on hand, excursion statistics, queue status, concentration units, lot balance, and notice timing. The controlled substance clocks follow 21 CFR 1301.76(b): written notice to the DEA Field Division within one business day of discovery, electronic Form 106 within 45 days; the business-day check counts weekends only and says to check federal holidays.
- **Fictional by default.** Every template carries an exercise marking; organizations, NDCs, lots and registration numbers are fictional unless a dated FDA record is quoted.

## Consequences

- The toolkit's figure kinds, connector, decision forms and metrics are added by later changes under the same toolkit id; the wiring test asserts that nothing the toolkit names lacks code.
- Clinical content is exercise content. Knowledge and prompt guidance tell the generator never to invent doses or interactions.
