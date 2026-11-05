# ADR-0151: Humanitarian products are paper templates; coordination rules and security guardrails are field lint

Date: 2026-11-05 · Status: Accepted · Issues: #813, #817 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0150, ADR-0085 (field lint), ADR-0074 (toolkits)

## Context

Coordination and field security products (flash updates, gap lists, incident reports, movement approvals) carry text that players read and numbers that must agree. Generated drafts also tend to misstate who activates clusters, who is responsible for an NGO's security, and to drift into negotiation or evasion detail in kidnapping scenarios.

## Decision

- **Thirteen templates** ship in the humanitarian pack, all rendered from HTML (project rule 5), with status shown by a symbol and a word. Ids are prefixed `humanitarian_`. The 3W map and charts are figures added later; the 3W template is the table. Partner coordination messages, staff statements and media holding statements reuse `email`, `official_letter`, `press_release` and `holding_statement`.
- **Six field lint rules** (`src/main/toolkits/humanitarian/`): cluster activation statements (requested by the HC, decided by the ERC, none in refugee settings), the Saving Lives Together responsibility line, a security guardrail (ransom amounts or payment, negotiation tactics, evasion or detention-resistance technique), gap list counts and partners, funding arithmetic, and movement decision completeness. Each is a pure function with its own tests; the toolkit lists the ids.
- **The guardrail is a deny-list on top of prompt guidance**, not a classifier: it catches the content the spec forbids by pattern and sends the draft back for repair. It is not a substitute for facilitator review of staff-harm scenarios.

## Consequences

- Rules read structured fields where they exist (gap lines, funding totals) and prose elsewhere; a rule reports nothing when its input is absent.
- Preview data of every template is tested to lint clean, so a rule change that breaks a sample fails the build.
