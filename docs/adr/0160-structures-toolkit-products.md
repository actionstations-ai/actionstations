# ADR-0160: Structures toolkit products and rules

Date: 2026-11-05 · Status: Accepted · Issue: #828 (epic #704, spec 0471)

## Context

The construction field needs inspection forms, orders and placards. The earthquake toolkit already ships a `building_placard` template. The public evaluation methods (ATC-20 and ATC-45) state no reproduction terms, so their forms and placards cannot be bundled. Some rules the scenarios lean on (the OSHA clocks, excavation protection, who may declare a building unsafe) are easy for a model to get wrong, and one (a depth at which a trench system must be engineered) is not confirmed against the primary text.

## Decision

- The `structures` toolkit lists `building_placard` in its `injectTypes` but does not ship or copy it; the earthquake toolkit's pack owns the template. The structures pack ships twelve new templates in `templates/injects/`, all paper, with a `taxonomy` block and an exercise statement.
- Evaluation forms and the fixed equipment checklist are new exercise templates in the structure of the public methods, written in our own words. They are not the official forms and say so in the pack README.
- Format rules are registered field lint rules with the `structures.` prefix (`structures.placard_words`, `structures.osha_clock`, `structures.excavation_rules`, `structures.authority`, `structures.crane_wind`). The pure checks are in `src/main/toolkits/structures/lint.ts`; `register-lint.ts` wraps them and `lint-rules.ts` imports it. The toolkit lists each id.
- The OSHA reporting clocks are a bundled regulation, `packs/regulations/osha_1904_39.json`, shipped in the Construction domain pack and set as the domain's default regulation. The text is a summary, flagged as not legal advice.
- No template, rule or knowledge line states a depth threshold for engineered trench systems; a rule flags prose that does.

## Consequences

The placard stays one template with one golden. Products and rules can be updated apart from the domain. A user who disables the earthquake pack loses the placard template the structures toolkit offers; the toolkit still loads. Rules are summaries, so they must be rechecked against the standards when those change, and the practitioner review the spec asks for stays an owner task.
