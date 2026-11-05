# ADR-0074: Toolkits are pack data that scenarios compose

Date: 2026-11-04 · Status: Accepted · Issue: #649 · Spec: [0448](../specs/0448-toolkits.md) · Related: ADR-0014 (domain profiles), ADR-0016 (forward-compatible files), ADR-0018 (packs)

## Context

A domain profile describes the organization being exercised. Field expertise (meteorology, flooding, wildfire) is not tied to one kind of organization: an airport, a farm cooperative and a forecast office all need weather. Folding that expertise into each domain profile would copy it and tie each new field to every domain that wants it.

## Decision

- **A toolkit is pack content,** `toolkits/<id>.json` validated by `ToolkitSchema` (`src/shared/toolkits`). It carries data (outside parties, inject type ids, advisor roles, decision forms, knowledge fragments, matching keywords) and names code-backed parts by string id (figure kinds, connectors, metrics, lint rules). Packs stay data only (ADR-0018).
- **Pack format 3.** `toolkits` is a new content kind, so a manifest that lists it needs `formatVersion: 3`; older apps refuse it with the usual "update the app" message, and packs without toolkits keep their older number.
- **Composition is a list of ids.** `project.toolkits` seeds new scenarios; `scenario.toolkits` is the list that applies. Both are optional on disk and default to empty, and the files stay loose (ADR-0016). Domain profiles gain optional `suggestedToolkits`.
- **The registry reads enabled packs** (installed first, then bundled), the first pack to provide an id wins, and a missing toolkit is skipped. There is no project copy yet: a toolkit changes generator guidance, not a deadline or a saved row.
- **Generation.** The scenario's toolkits ride on the generator's `DomainContext`, so every stage that passes the domain gets them. `baseVars` adds a `toolkits` variable (names, data sources, knowledge capped at 3,000 characters per toolkit and 6,000 in total, cut on whole lines, wrapped in a data block the pack text cannot close), merges outside parties into `domain.outsideParties` and inject types into the taxonomy, and the controller handbook gets a "Toolkits used" section.
- **Suggestions are a pure function** (`suggestToolkits`): whole-word keyword matches in the brief first, then the domain's suggested toolkits, each with a one-line reason. The user confirms; nothing turns on by itself.

## Consequences

- A new field is mostly content: a JSON file and, for new inject types, templates in the same pack.
- Knowledge is guidance, not law: the documents still win, and the prompts say so.
- Figures, connectors, metrics and lint rules named by a toolkit only take effect once the app ships the matching code (later issues in the same epic); until then they are inert ids.
- Because composition lives on the scenario, sharing a scenario without the pack drops the guidance quietly. If that proves wrong, project copies (as for regulations) can be added without changing the file format.
