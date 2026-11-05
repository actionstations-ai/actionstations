# ADR-0153: Humanitarian replay uses the HDX HAPI and ReliefWeb with the user's own application name; simulations feed the metrics

Date: 2026-11-05 · Status: Accepted · Issues: #911, #913 · Spec: [0469](../specs/0469-humanitarian.md) · Related: ADR-0076 (case data), ADR-0082 (seeded simulation)

## Context

A humanitarian scenario is more believable with a real country's partner and sector structure and a past event's report timeline. The services that hold them ask callers to identify an application, and some data carries licences that forbid redistribution. The exercise also needs events that metrics can score decisions against (gaps that open, a pipeline break, a registration backlog).

## Decision

- **Operational presence (3W) comes from HDX HAPI** (`hapi.humdata.org`), which serves the country 3W datasets as JSON, rather than from scraping dataset files that redirect to other hosts. The source dataset's licence is read from `data.humdata.org` at fetch time and written into the citation; a licence that is not recognised as open marks the data "used in this scenario only; not exported in packs".
- **HAPI and ReliefWeb identify the caller with an application name** (and, for HAPI, a contact address). HAPI does not approve names, so the app sends `ActionStations` and help@actionstations.ai unless the user enters their own (#1099). ReliefWeb refuses any name it has not approved and stays off until one is entered in Settings. The names identify an application and are not secrets, are sent only to the service that asks for them and are never put in an error message or a log. Without an approved name the ReliefWeb connector refuses with a plain message and the bundled sample data is used.
- **ReliefWeb keeps titles, dates, source names and links only.** Report bodies are the publishers' content.
- **Key figures come from HAPI, not the OCHA Key Figures service.** OCHA's key figures service needs a registered application name (spec 0469 FR-9); HAPI serves the same sources (response plan needs, UNHCR refugee figures, IOM displacement, FTS funding) without approval, with the identity above. `hdx-key-figures` makes four national queries (needs and refugees limited to the ten years up to the scenario year) and reads the licences of the datasets behind the first resource of each, as the 3W connector does (`readLicences` is shared).
- **Aid worker security counts come from the Aid Worker Security Database's CSV export.** The site's JSON export needs a personal key; its CSV export (`/incidents/search?format=csv`, with an optional `country` filter) does not, and answered the app's User-Agent on 2026-11-05 while the site's HTML pages were behind a browser check. `awsd-incident-counts` keeps only counts by year, outcome, staff type, means and context of attack (spec 0469 NFR-2); details, places, coordinates and actor names are dropped before anything is stored. The site states no licence; the terms text says so.
- **Six simulations** (arrivals and registration, sudden-onset impact, 3W reporting, camp outbreak, pipeline, threat level) are seeded, labeled simulated by the framework and write ground-truth events and modeled series. The outbreak reuses the epidemiology compartment model; the pipeline uses the shared arithmetic module.

## Consequences

- Examples work offline with sample data. ReliefWeb replay needs an approved application name; the HAPI connectors and the aid worker security counts work without setup.
- Recorded fixtures for HAPI and the HDX licence call are real responses; the ReliefWeb fixture is built from the documented shape until an approved name is available for a live check (`LIVE=1`).
