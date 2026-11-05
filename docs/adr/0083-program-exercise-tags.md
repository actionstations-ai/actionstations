# ADR-0080: Program exercise tags and capability mappings are toolkit data

Date: 2026-11-05 · Status: Accepted · Issue: #842 · Spec: [0457](../specs/0457-epidemiology.md) FR-13, FR-14 · Related: ADR-0074 (toolkits), ADR-0077 (field metrics)

## Context

Public health agencies that run exercises under the CDC PHEP cooperative agreement follow its Exercise Framework (April 2024 text) and must enter improvement plan data in CDC's system within 90 days of an exercise. The spec also asks for evaluation guides for "Epidemiological Surveillance and Investigation", which is a PHEP capability (13, Public Health Surveillance and Epidemiological Investigation), not one of the 32 FEMA Core Capabilities the app's guides are built on.

The framework document states the exercises, their objectives, participants and frequency, and says the improvement plan data elements are provided in CDC's portal. It does not list the data elements, so the app cannot reproduce them.

## Decision

- **Capability representation.** Evaluation stays on the Core Capabilities the app knows. A toolkit's `capabilities` list attaches critical tasks and framework mappings to a Core Capability (`coreCapability`, `criticalTasks`, `mappings`). The epidemiology toolkit puts the investigation tasks under Public Health, Healthcare and Medical Services, Situational Assessment, Public Information and Warning and Operational Coordination, and maps them to PHEP capabilities 3, 4, 6, 8, 9, 11, 12 and 13. The domain profile lists only Core Capability ids.
- **Exercise tags.** A toolkit's `exerciseTags` describe program exercises with `version` (the date of the text) and `source`. A scenario carries the tag ids in `conduct.exerciseTags`. The exercise details show a tag's suggested objectives and participants and its due date; the AAR adds one table per tag under the improvement plan.
- **What the table holds.** The standard HSEEP improvement plan columns with the program exercise and the text date named on every row, and a statement of the program's window. The app does not claim to match CDC's data element template, because the template is not published in the framework text; the person enters or uploads the data in the program's system. Nothing is submitted.
- **Versioned text.** Each tag carries the date of its source; a release checks the program's current guidance and updates the data.

## Consequences

- Another program (an accreditation body, a grant) is a toolkit with tags, not new code.
- If CDC publishes the data element list, the table columns can follow it without a format change.
- Applying a tag's suggested objectives to the scenario is a separate action not built here; the suggestions are shown for the designer to adopt.
