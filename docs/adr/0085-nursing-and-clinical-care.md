# ADR-0085: Nursing is a domain, the clinical care toolkit is the reusable part

Date: 2026-11-04 · Status: Accepted · Issues: #685, #886 · Spec: [0452](../specs/0452-nursing.md) · Related: ADR-0014 (domain profiles), ADR-0074 (toolkits)

## Context

Nurses play in every hospital exercise, and nursing programs teach with unfolding case studies and simulation. The unit-level view of a hospital (charge nurse, rapid response, long-term care wing, simulation lab) is a kind of organization, but the products it uses (vital signs, lab results, SBAR, triage tags, staffing grids) are shared with pharmacy, EMS, public health, school nursing and venues.

## Decision

- **`nursing` is a domain profile** (`packs/domains/nursing.json`). The profile format has no `extends` field, so the profile repeats what a hospital exercise inherits from `healthcare` (outside parties, systems, regulation list) and a test keeps the two from drifting. Adding an `extends` mechanism would change how every profile resolves and is not needed for one case.
- **Variants are role sets.** Hospital unit, long-term care and simulation lab roles live in one profile and are told apart by the team prefix (`Hospital unit: …`), because the variants share facts, systems and families.
- **Scenario families are added by the domain** (`addedThreatFamilies`): unit surge, unit evacuation, unit outbreak, medication error, staffing crisis, active threat on a unit, downtime care, heat and power loss in long-term care, and a clinical event family for case studies. They use the arcs of the dossier and the purpose mixes of FR-2.
- **The clinical care toolkit is pack data** (`packs/toolkits/clinical_care.json`): glossary, product conventions, realism rules, outside parties, advisor roles and the nine structured decisions. Other domains list it in `suggestedToolkits`.
- **Both ship in one bundled pack,** `ai.actionstations.nursing`.

## Consequences

- The bundled domains now add threat families, so tests that assume a registry of built-ins alone clear the `bundled-domains` source first.
- Clinical content is exercise content. The toolkit's rules tell the generator to keep patients synthetic, doses plausible and never to reproduce licensed exam items.

## Amendment (#887): templates and field lint

- The eleven clinical products are templates in the nursing pack (`clinical_lab_panel`, `medication_administration_record`, `sbar_handoff`, `triage_tag`, `staffing_grid`, `rapid_response_record`, `patient_event_report` with report and disclosure variants, `isolation_cohort_board`, `evacuation_priority_list`, `debrief_guide`, `learner_feedback_form`). Their types come from `taxonomy` blocks in `meta.json`; the built-in taxonomy is unchanged.
- `lintRules` names **field lint rules**, a registry in `src/main/toolkits/field-lint.ts` whose issues join the content issues of the inject text stage (one repair round, then a warning). Rules read one inject type's fields; the clinical rules live in `src/main/toolkits/clinical/lint.ts` and the pure arithmetic in `src/shared/clinical/`. A field adds its module to `lint-rules.ts`.
- Arithmetic a template cannot do (on-duty counts and shortfall in the staffing grid) is a derived value (ADR-0046).
- The dose check lists a few common drugs with a generous single-dose ceiling and their routes; it is a guard against invented doses, not a drug reference. START is the rule for triage tags; SALT is checked for contradictions only.
