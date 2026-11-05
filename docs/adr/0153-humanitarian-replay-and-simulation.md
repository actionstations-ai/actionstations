# ADR-0153: Humanitarian replay uses the HDX HAPI and ReliefWeb with the user's own application name; simulations feed the metrics

Date: 2026-11-05 · Status: Accepted · Issues: #911, #913 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0076 (case data), ADR-0082 (seeded simulation)

## Context

A humanitarian scenario is more believable with a real country's partner and sector structure and a past event's report timeline. The services that hold them ask callers to identify an application, and some data carries licences that forbid redistribution. The exercise also needs events that metrics can score decisions against (gaps that open, a pipeline break, a registration backlog).

## Decision

- **Operational presence (3W) comes from HDX HAPI** (`hapi.humdata.org`), which serves the country 3W datasets as JSON, rather than from scraping dataset files that redirect to other hosts. The source dataset's licence is read from `data.humdata.org` at fetch time and written into the citation; a licence that is not recognised as open marks the data "used in this scenario only; not exported in packs".
- **HAPI and ReliefWeb are off until the user enters an application name** (and, for HAPI, a contact address) in Settings. They identify an application and are not secrets, are sent only to the service that asks for them and are never put in an error message or a log. Without them the connector refuses with a plain message and the bundled sample data is used.
- **ReliefWeb keeps titles, dates, source names and links only.** Report bodies are the publishers' content.
- **Not built yet:** OCHA Key Figures and the Aid Worker Security Database. Their endpoints and terms could not be verified, so they stay open on the issue rather than guessed.
- **Six simulations** (arrivals and registration, sudden-onset impact, 3W reporting, camp outbreak, pipeline, threat level) are seeded, labeled simulated by the framework and write ground-truth events and modeled series. The outbreak reuses the epidemiology compartment model; the pipeline uses the shared arithmetic module.

## Consequences

- Examples work offline with sample data; replay needs the user's own registration.
- Recorded fixtures for HAPI and the HDX licence call are real responses; the ReliefWeb fixture is built from the documented shape until an approved name is available for a live check (`LIVE=1`).
