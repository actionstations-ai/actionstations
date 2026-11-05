# ADR-0166: EMS, fire and hazmat reference library and reuse

Date: 2026-11-05 · Status: Accepted · Issues: #820 · Spec: [0456](../specs/0456-ems-fire.md) · Related: ADR-0020 (reference documents), ADR-0165

## Context

Spec 0456 FR-13 asks for a library of public documents and FR-15 asks that other domains be offered the hazmat, mass casualty and dispatch toolkits. The ems_fire documents largely exist already in other libraries.

## Decision

- `ai.actionstations.ems-fire-library` is catalog-only. It reuses six already pinned files through `alsoIn` (the EPA RMP exercise fact sheet and Chapter 8 guidance, the CISA hazardous materials and emergency services tabletop packages, the NTSB East Palestine report and the CSB Arkema Crosby report), so no hash is added twice. NIMS and the ICS forms stay in the core pack.
- The USFA EMS mass incident templates are linked: they carry no copyright notice, but a contractor wrote them for USFA and that does not make them a US government work. OSHA 3114 is linked because osha.gov refuses scripted downloads and no hash could be pinned. The ERG stays unbundled (spec FR-6); the Boston after action report is a state work with unstated terms.
- Each of `hazmat`, `mci_triage` and `dispatch` is suggested on every domain in its own `appliesTo.domains` (fourteen domains in all across the three), derived from the toolkit files; a test keeps the two in step. `hazmat` and `dispatch` list library documents.
- Examples (FR-14) stay deferred because they need local generation.

## Consequences

A source that publishes a new edition changes a pin in its home library; the other libraries pick it up through `alsoIn` on the next build.
