# ADR-0028: Deterministic grounding first, model verification only with validated quotes

Date: 2026-10-28 · Status: Accepted · Issue: #423 · Spec: [0423](../specs/0423-grounding-and-plan-conflicts.md) · Related: [ADR-0005](0005-embeddings.md)

## Context

Generated expected actions, controller notes, overview sections and ideas cite plan passages, but nothing checked that the passages say what the item claims. A reviewer needs to see quickly which items the plans support and why. Asking a model to grade its own output costs money with a cloud provider, does not work offline, and can be steered by text inside an ingested plan. The same problem applies to finding places where two of the organization's plans disagree.

## Decision

**The label comes from a deterministic check.** `src/main/grounding` splits each claim field into sentences and checks every sentence against the full text of the chunks it cites (looked up in the index, never the 200-character citation quote): the anchor terms it names (roles, agencies, tag-shaped identifiers, numbers with units, durations, section numbers, a fixed list of action verbs) must be in a cited chunk or in `facility-facts.md`; the share of its content words found in the cited chunks gives the support; a duration or quantity that differs from the plan's in the same statement, or a different role in the same slot, is a conflict. Embedding similarity counts only with a real embedder (never the hash embedder). Labels: Grounded, Needs review, Unsupported, or none for items that make no plan claim. Thresholds live in `constants.ts` and are tuned against a hand-labelled calibration set of 60 example rows (`label.calibration.test.ts`: at least 85% agreement, never "unsupported" called grounded).

**Results are cached by fingerprint.** A result is reused while the claim text, the citations, the resolved chunks' text and the checker version are unchanged, so a stale label is never shown as current, and a user's override sticks until the item changes. Results live at scenario level (`Scenario.grounding`), never on `MselRow` or `Inject`, so an older build keeps them.

**A model can only add evidence it can quote.** "Verify with model" and plan-conflict confirmation go through the routed `critique` provider, with passages in the escaped `<documents>` block. Every verdict must carry a quote that is a substring of the cited passage (whitespace collapsed, the prompt's escaping undone); a verdict without one is discarded and logged. The model can lower Grounded to Needs review, or raise a label to Grounded only when every claim is supported with a validated quote. The checker's label stays visible beside the model's and the user's.

**Plan conflicts are found the same way.** Table-driven slot extractors find typed statements (release approver, approver, notification and reporting deadlines, phone numbers, activation levels, lead agency); two statements from different documents with the same slot and subject and different values are a candidate. At most 80 candidates per run go to the model, authority and deadlines first. Findings and the user's decisions are kept in `plan-conflicts.json`, keyed by a hash of the slot and both spans.

## Consequences

- Labels are free, instant and work offline; they also work with the mock provider in tests.
- The check reads wording, not meaning: a plan that says the same thing in other words gets Needs review, and a row that copies plan words without following the plan can get Grounded. The guide says so, and the label is always one click from its reason.
- Slot extractors only see statements written in the patterns they know; new phrasings need a new table row and a test case.
- An instruction hidden in a plan cannot fabricate support: the most it can do is make the model's verdict disagree, which only lowers a label or is discarded.
