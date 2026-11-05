# ADR-0141: AI incident clocks are regulation data, scoped by role, with their dates kept as data

Date: 2026-11-05 · Status: Accepted · Issues: #777, #781 · Spec: [0467](../specs/0467-ai-incidents.md), [0426](../specs/0426-regulatory-clocks.md) · Related: ADR-0040 (regulation packs)

## Context

The EU AI Act's serious incident duty (Article 73) binds providers of high-risk AI systems, not every organization in an AI incident. A company defrauded by a deepfake has a fraud and cyber incident. The Act's application dates also moved in 2026 and secondary sources disagree on details. A clock that starts for the wrong organization, or an old date shown as current, teaches the wrong thing.

## Decision

- **One regulation file, `packs/regulations/eu_ai_act_art73.json`,** in the existing format (ADR-0040): three triggers and three clocks (15 days for a serious incident, 2 days for a widespread infringement or critical infrastructure incident, 10 days for a death), each counted in calendar days from awareness. Each clock has its own trigger, so a scenario starts only the clock that applies. The text of Article 73 was read on 2026-11-05 and each rule line paraphrases it, including that an incomplete initial report is allowed.
- **Role decides which clocks exist.** The status note and applicability say the duty is a provider's; the scenario generator (`ai-model-incident`) writes a regulator clock only for the role `provider`, and none for `deployer` or `victim`. The disclosures metric reports "no clock applies" as correct for a victim of fraud. The app does not give legal advice and says which plans to check.
- **Dates are data.** The regulation schema gains `dates` (label, date, note). The Annex III and Annex I application dates are stored there with a note that they come from secondary summaries and must be checked against the Official Journal text; the amending act's number is not asserted because it was not confirmed.
- **Freshness.** The existing 12 month check on bundled regulations stays, and Settings now says when a rule was last checked more than twelve months ago.
- **Other clocks are reused,** not copied: SEC Form 8-K Item 1.05 and the privacy clocks already in the bundle.

## Consequences

- A compliance specialist's review is still required before release; the file is as accurate as the sources read, and says so.
- When the Commission's final guidance or the amended dates change, the update is a data edit and a new `verifiedOn`.
