# ADR-0130: The justice field stays at the coordination level, enforced in the prompt and in lint

Date: 2026-11-05 · Status: Accepted · Issues: #698, #716, #728 · Spec: [0465](../specs/0465-justice.md) FR-7 · Related: ADR-0074 (toolkits)

## Context

The justice field exercises police and sheriff's offices, jails and courts. Its hardest scenarios (an active assailant, a barricaded subject, a jail disturbance) invite tactical content that exercise designers do not need and that the app must not become a source of: entry methods, weapon handling, positioning, force options, ways to defeat detention or security measures, attack planning, real floor plans, and content that makes a perpetrator notorious. Spec 0465 sets the level of detail: command, communication, public information and continuity.

## Decision

- **One rule, stated three times.** The rule is a realism rule in the toolkit's knowledge, a sentence in the prompt guidance of every justice threat family, and a set of field lint rules. The model is told what level to write at, and text that slips is caught afterward. Neither alone is enough: a prompt can be ignored, and lint cannot say what to write instead.
- **Lint is a blocklist of phrases, in categories** (`src/main/toolkits/justice/guardrails.ts`): entry methods, weapons handling, tactical positioning, force options, defeating security, attack planning, facility detail and the position of a person inside a building. Two scoped categories apply to fewer types: no notoriety on public messages, and no technique or dialogue in a negotiation log. Each hit is a warning that quotes the phrase and says what to write instead, and it goes into the repair round of inject text.
- **Justice text only.** The rules are registered for the justice templates and for the shared types a justice scenario also uses (CAD, radio, press release, email and the like). A shared-type inject is read only when its text is about law enforcement, corrections or courts, so another domain's emails and press releases are never flagged.
- **Strict first, widened by a reviewer.** A blocklist can catch ordinary after-action words. The list starts strict; `GUARDRAIL_ALLOWED` is where a reviewer clears a phrase, and the warning names the phrase so what was blocked is visible.
- **Tests with adversarial text.** A set of tactical and planning passages that a model could produce when pushed must be flagged in the right category, a set of ordinary coordination passages must not be, and every justice template preview must pass.

## Consequences

- A designer who wants tactical content cannot get it from this pack; the pack offers the coordination decision instead and says so in its README.
- The phrase lists need upkeep and a practitioner review (spec NFR-4) before release.
- Checks cover text fields; drawn figures carry data, not prose, and are read by their own tests.
