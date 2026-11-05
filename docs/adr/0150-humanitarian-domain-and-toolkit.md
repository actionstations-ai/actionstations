# ADR-0150: Humanitarian response is a domain and a toolkit, with coordination models kept apart

Date: 2026-11-05 · Status: Accepted · Issues: #805, #813 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0014 (domain profiles), ADR-0074 (toolkits), ADR-0085 (variants as role sets)

## Context

Humanitarian exercises involve organizations of very different kinds in one story: an NGO country office, the coordination bodies it reports to, a camp, and a headquarters team that handles staff incidents. The products they use (situation reports, 3W tables, gap lists, pipeline dashboards) are also useful to domestic voluntary organizations. Two points are easy to get wrong in generated text: the coordination model differs between disasters (clusters) and refugee settings, and staff security content can drift into tactics.

## Decision

- **`humanitarian` is a domain profile** (`packs/domains/humanitarian.json`) and **`humanitarian` is a toolkit** (`packs/toolkits/humanitarian.json`), shipped in one bundled pack. The four variants of the spec are role sets told apart by the team name, because they share facts, systems and threat families.
- **Eight added threat families** carry the arcs of the dossier. Ids are prefixed `humanitarian_` (including the shared service degradation family) so they cannot collide with other packs.
- **Two coordination models.** The sudden-onset family names cluster activation (requested by the Humanitarian Coordinator, decided by the Emergency Relief Coordinator with the IASC Principals' endorsement). The refugee influx family states that clusters are not activated and the refugee coordination model applies. Each knowledge line carries its source and the date it was checked, so a reviewer can confirm the current structure.
- **Guardrails are prompt guidance and knowledge, then lint.** The staff security family and the toolkit's realism rules limit content to decisions and communications and forbid negotiation tactics, ransom mechanics and detention-resistance technique. Later releases add a field lint rule that flags such content in generated text.
- **Fictional names only.** Countries, crises, organizations and people are fictional; real geography is allowed as a backdrop under the project naming rule.

## Consequences

- Other domains (public health, municipal, port and maritime, food and agriculture, emergency communications) are suggested the toolkit and can use the products without the humanitarian domain.
- The toolkit's knowledge shares the 3,000 character cap, so rules are short and cite their source rather than quoting it.
- The cluster system may change; the dated lines make a review a small edit.
