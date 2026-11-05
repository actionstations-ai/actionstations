# ADR-0105: Animal health as a domain plus a reusable animal disease toolkit

Date: 2026-11-05 · Status: Accepted · Issue: #849, #852

## Context

Animal disease response (avian influenza, foot-and-mouth disease, African swine fever) is worked by state animal health offices, producers, laboratories, extension and fairs, and by emergency managers and health departments that support them. The products and rules (premises designations, zones, permits, sampling intervals, the 24 hour stamping-out goal) are the same whoever uses them. The response plans carry editions (HPAI Red Book May 2017, FMD Red Book October 2020) and a newer edition changes numbers.

## Decision

Two parts, as epidemiology does. The `animal_health` domain profile (roles in teams for each setting, nine threat families with phase arcs) and the `animal_disease` toolkit (ten templates, knowledge, six field lint rules, later figures, a simulator, metrics and decisions). Other domains list the toolkit in `suggestedToolkits`; disease dynamics, curves and tracing stay in the epidemiology toolkit, which the toolkit builds on rather than copies.

Plan numbers live once, in `src/shared/animal-disease/plan-rules.ts`, each tagged with its plan and edition. Lint rules, the zone calculator and the metrics read that table, so a new edition is a data edit. Template, figure, metric and rule ids carry the `animal_` prefix. Premises are codes with fictional farm names; the replay path never carries farm names or addresses.

## Consequences

A plan change touches one file and its tests. Products state the plan and edition, and tell users their state plan governs. The toolkit must be reviewed by a state veterinarian's office and an extension specialist before release; that review is not done in code.
