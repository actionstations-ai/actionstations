# ADR-0035: The AAR/IP is drafted from an exercise record, with evidence refs and no names

Date: 2026-10-28 · Status: Accepted · Issue: #419 · Spec: [0419](../specs/0419-aar-ip-draft.md) · Related: [ADR-0025](0025-core-capabilities-and-eegs.md), [ADR-0026](0026-surveys-anonymous-by-construction.md), [spec 0417](../specs/0417-controller-dashboard-session-log.md)

## Context

After the exercise, HSEEP asks for an After-Action Report / Improvement Plan: strengths and areas for improvement per Core Capability, a rating per capability, and corrective actions with an owner and a due date. What the exercise produced is scattered over the scenario folder: the facilitator's notes, hot wash items and decision log (`facilitator.json`), evaluator observations (`evaluation.json`), the live-play session log (`live/<sessionId>/log.jsonl`, spec 0417) and survey results (#422). A model can draft the report, but a draft that invents findings, grades people or decides ratings on its own is worse than no draft.

## Decision

- **One exercise record.** `src/main/aar/record.ts` assembles an `ExerciseRecord` (zod, `src/shared/schemas/aar.ts`) from whichever sources exist, through one adapter per source in `src/main/aar/sources/`. Any subset works: notes and a hot wash alone produce a record whose `sources` say so, and the document states what was and was not recorded. The live-log adapter is the only module that knows the log's shape; a missing or unreadable log is a warning, never a failed draft.
- **Evidence refs.** Every record item carries a stable ref (`note:I-09`, `note:general`, `obs:<id>`, `hw:<id>`, `dec:<id>`, `vote:<id>`, `msg:<id>`, `survey:<surveyId>[:<questionId>]`). The prompt shows the refs in brackets; every finding must list the refs it rests on; the mapper drops refs the record does not have and drops a finding left with none (`AAR_UNSUPPORTED_FINDING` in the job log). The record, not the model, decides what counts.
- **Plan citations.** A finding may cite retrieved sections (`C#`) or sections the scenario already cites (`S#`: overview, MSEL rows, EEG tasks); other keys are dropped (`CITATION_DROPPED`), as for every other stage.
- **Model drafts, a person decides.** `CapabilityAnalysis` keeps `proposedRating` (the model's) apart from `rating` (a person's). The document and the exports print only confirmed ratings; an unconfirmed capability prints "Rating pending" and the report stays marked a draft. Corrective actions carry a proposed role, never an organization, contact or date: `ownerOrganization`, `poc`, `startDate` and `dueDate` are typed by a planner. A re-draft keeps confirmed ratings, locked findings and actions, and the typed owner fields, matched by capability and normalized text.
- **Non-attribution.** Identities are removed in the live-log adapter before anything else sees the record: seats become role labels or "a player", `displayName` is never read, an evaluator reaches the record only as the label they signed with. The schema has no person field except the owner and point of contact a planner types into the Improvement Plan. The prompt is told to write about procedures, never people.
- **Storage.** `scenarios/<id>/aar.json` (with its own history) plus `documents/aar.md`, a Markdown document in the HSEEP 2020 layout with section markers. The structured editor owns the tables (ratings, plan rows, organizations, acronyms) and re-renders them into the document on save; the prose sections a person edited in the document editor stay. `aar` is a scenario document kind, so the editor, history and restore come for free.
- **Cost.** One model call (`maxTokens` 6000, retrieval `k: 8`); a reply with no JSON is retried once with the condensed record (notes cut to 150 characters, pinned messages only, counts for the surveys), then fails with a message that says the context is too small.

## Consequences

- An exercise run on paper gets the same draft as one run with live play, with the gaps shown as gaps.
- Findings can be traced: the editor's evidence drawer resolves each ref to the note, observation, vote or survey line behind it.
- The AAR/IP PDF, DOCX and the Improvement Plan tracker sheet are facilitator material in the distribution ZIP; distributing the approved report is the organization's step.
- One AAR per scenario in 0.6.0; a second delivery starts from "Duplicate scenario". Multi-year tracking of corrective actions is #424.
- When spec 0417's `readSlice` lands, `sources/live-log.ts` should read through it instead of parsing the file.
