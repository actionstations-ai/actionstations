# ADR-0080: Verification tasks, media metrics and format rules are app code over scenario data

Date: 2026-11-05 · Status: Accepted · Issues: #750, #751, #752 · Spec: [0458](../specs/0458-crisis-comms.md) · Related: ADR-0077 (field metrics), ADR-0078 (structured decisions)

## Context

The media environment toolkit scores communications work (holding statement time, accuracy, corrections, reporter handling) and newsroom verification. Packs are data only (ADR-0018), the metrics framework reads plain events and decisions, and live play already carries toolkit decision forms.

## Decision

- **Verification task schema** (`src/shared/toolkits/verification.ts`): a hidden ground truth (authentic, misattributed, manipulated, synthetic, satire, unverifiable), up to one clue per check kind with an optional cost in exercise minutes (defaults per kind), and a credential status. Requesting a check is a decision (`request_clue`); recording a verdict and confidence is part of `hold_or_publish`. A check with no authored clue returns "no result" and still costs its time. The credential check always uses fixed wording: absence proves nothing, and a valid credential says who signed, not that the content is true.
- **Metrics read ground-truth events** of kinds `first_public_signal`, `error_found`, `reporter_query` (with a `deadline` attribute) and `verification_item` (with a `truth` attribute), and decisions of the toolkit's form ids. Five metrics: `holding_statement_time` (configurable window; a window of 0 reports the time without a verdict), `statement_accuracy` (evaluator-scored claims against the fact sheet; unconfirmed suggestions are not counted), `corrections`, `reporter_handling`, `verification`. A decision names the item, error or query it answers by id in a text field. Each result lists its inputs and caveats and is labeled a discussion aid.
- **Toolkit metric config holds only strings, numbers and booleans,** so metrics that need lists take them from the scenario data, not from the toolkit.
- **Format rules** (`src/main/toolkits/media/lint.ts`) are pure checks over one inject's type and fields: attribution, clock agreement, correction content, holding statement parts, and fictional names (a built-in list of national outlets, wire services and a few public figures, extended per project).

## Consequences

- Entering ground-truth events and fact checks is an evaluator task; the scenario file formats for them are the case-data events and the evaluator's check list.
- Format rules are heuristics: they flag, never block.
