# ADR-0135: Lab exercises are guarded at the content level

Date: 2026-11-05 · Status: Accepted · Issues: #868, #870 · Spec: [0466](../specs/0466-research-labs.md) · Related: ADR-0074 (toolkits)

## Context

The research labs field exercises incident management, notification, continuity and compliance. A language model asked for a realistic laboratory incident can drift into how an agent is grown, made, changed or spread, or into quantities, strains and procedures. The product must never produce that, whether the model was asked for it or not, and a pack author must not be able to ship it by accident. The rule has to be readable by a biosafety officer, testable, and impossible to switch off per project (spec 0466 FR-4).

## Decision

- **One rule set, in code, with documented categories.** `src/main/toolkits/lab_safety/guardrails.ts` holds a deny list of eight categories (growth or production, modification, dissemination, quantity, strain, inactivation parameters, protocol detail, agent not reviewed). The patterns are plain regular expressions over text, tuned so ordinary incident language passes ("growing concern", "the vendor produced a report", "centrifuge rotor failed"). Each issue carries a category and a fixed message; the matched text is never repeated or logged.
- **Agents by name only from a reviewed list.** `REVIEWED_AGENTS` lists organisms and viruses a designer may name (exposure scenarios with public health response guidance). `WATCHED_AGENTS` lists names that must be written as a generic class instead ("a select agent", "a Risk Group 3 bacterium"), and only in laboratory context so an unrelated public health scenario is not touched. A designer may extend the allowed list per scenario.
- **Applied after generation.** The rule is the field lint rule `lab.guardrails`, registered for the lab products and the text types a lab exercise uses. Field lint issues join the content issues of the inject text stage, so a failing inject goes back to the model once with the category named and, if it still fails, shows as a warning on the inject.
- **Applied when a toolkit loads.** `toolkits/registry.ts` scans the lab safety toolkit, and any toolkit that lists `lab.guardrails`, before it is accepted. A toolkit with a denied category in any string is not loaded; the log names categories only. The bundled domain profile is held to the same scan by a test.
- **Configuration lives with the code.** The spec places the deny and allow lists in the toolkit pack. A pack cannot carry executable rules (ADR-0018), and a pack that could edit its own deny list would defeat the check, so the lists are constants in the module, exported for tests and for the reviewing biosafety officer. The toolkit pack carries the plain-language version of the rule in its realism rules, which tells the model what the check will reject.
- **Conservative start.** The rule set is loosened only with a biosafety officer's approval, and tightened freely.

## Consequences

- The check is text-pattern based: it will pass some paraphrases and flag a few harmless sentences. The repair round and the warning make the false positives cheap; the reviewed list and the tests make the categories explicit. It is one layer. The prompts, the realism rules and the reviewer are the others.
- The lint rule runs for the listed inject types in every scenario, not only lab scenarios, so the patterns stay specific. Adding an inject type to the list widens the scope.
- Every new lab product needs to be added to `inject-types.ts`, and the test that walks the toolkit's inject types fails when one is missing.
- A designer cannot turn the guardrail off. A change to the lists is a code change with a review.
