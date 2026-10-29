# ADR-0046: Derived fields for templates; exports for other platforms

Date: 2026-10-29 · Status: Accepted · Issue: #432

## Context

Real-world alert formats contain strings that must be exact and are computed, not written: the SAME header, VTEC and UGC lines, CAP times and XML, the ICAO Q line. Templates have a fixed helper list and packs may not add code, so a template cannot compute them, and a model must not be asked to. Separately, exercise teams want the MSEL in the tools they already own (Conducttr, WebEOC / SimulationDeck).

## Decision

- `src/main/render/derived/` holds one module per format, registered by inject type in `index.ts`. `composeDocument` passes the result to the template as `derived.*` beside `fields`; it never replaces a field. Results are deterministic and covered by goldens. A pack template of the same type gets the same data. Derivation failure yields `{}`, never a failed render.
- CAP and EAS output is always an exercise: the schema has no `Actual` status, builders force `Exercise` or `Test`, the headline is prefixed, `<note>` says it is not a real alert, and the export refuses a file without that marking (`assertExerciseCap`).
- Other-platform exports are written under `platforms/` of the export folder, so the ZIP puts them in `facilitator/platforms/` and never in `players/`. They reuse the media files. The WebEOC / SimulationDeck package is labelled unverified; the Conducttr CSV is checked against Conducttr's documentation only.
- CAP XML is validated in tests by a structural check of the CAP 1.2 element order, enums and the namespace, not against the XSD: no XML schema validator is a dependency (no new dependencies for this feature).

## Consequences

- Adding a format means adding a deriver and a template; packs can ship templates for the type but not the derivation.
- Rendered strings can be tested with plain unit tests against published examples.
- A real XSD check can be added later if a validator dependency is accepted.
