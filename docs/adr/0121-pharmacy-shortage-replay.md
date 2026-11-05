# ADR-0121: Shortage replay is a dated snapshot of the openFDA records

Date: 2026-11-05 · Status: Accepted · Issues: #696, #902, #903 · Spec: [0463](../specs/0463-pharmacy.md) · Related: ADR-0076 (case data connectors), ADR-0120

## Context

The FDA publishes drug shortage records through openFDA with status, availability, related information (including an estimated recovery) and a contact. The endpoint needs no key and carries the statement not to rely on it for medical decisions. It holds the current state of each record; no history by date was verified.

## Decision

- **One connector, `openfda-shortages`** (`src/main/toolkits/connectors/openfda-shortages.ts`), fixed host `api.fda.gov`, queried for one drug name (generic name) or one therapeutic class, as a quoted phrase checked against a fixed shape. It reads at most 500 records (five pages of 100), treats the endpoint's 404 for no match as an empty result, and writes two text datasets: the records as published (dated by initial posting) and one line per presentation for a board.
- **A fetch is a snapshot.** The citation carries the retrieval date, the endpoint's `last_updated` and the disclaimer; the estimate shown before consent says the records are the current state. Past shortages are told through the dated narrative seeds (`src/main/toolkits/pharmacy/seeds.ts`), which carry only attributed facts and list what was not established. A seed block tells the generator it is history.
- **A board is the record plus fictional stock.** `shortageBoardFields` quotes drug, presentation, NDC, status and recovery from the record and takes on-hand and usage from the exercise, so days on hand stay on hand over usage; the source note states what is quoted and when.
- **Manufacturer names appear only as quotes** of a dated record; the exercising organization is fictional.
- **The library pack** (`ai.actionstations.pharmacy-library`) bundles only documents checked as US government works and pinned by hash (the two CFR sections; CMS Appendix Z and the FEMA guidance are shared with the healthcare library). The CDC toolkit is a link because cdc.gov refuses scripted downloads.

## Consequences

- The recall (enforcement) endpoint is not promised: its fields and terms were not verified, so recall replay stays a later step.
- The connector is registered by `registerPharmacyToolkit()` from `src/main/index.ts`, idempotently; its tests replay a recorded real response and an opt-in `LIVE=1` test checks the live shape.
