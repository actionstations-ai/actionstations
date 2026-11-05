# ADR-0155: Hospitality is one domain, two toolkits, and the VSP standards are the source of the report points

Date: 2026-11-05 · Status: Accepted · Issues: #825, #829, #835 · Spec: [0470](../specs/0470-hospitality.md)

## Context

Hospitality covers three kinds of organization (a cruise line, a hotel or resort, a tourism board) and two bodies of expertise that other fields reuse: outbreak response in a congregate setting, and guest emergencies. The dossier recorded the 2 and 3 percent report levels from a search summary and the case definition as unverified.

## Decision

- **One domain, `hospitality`,** with the three variants as role teams. The hotel variant adds only rooms-division roles and points to `commercial_facilities` for the general manager, security and technology roles; it copies none of them.
- **Two toolkits:** `outbreak_at_sea` (reports, checklist, letters, port notice, boarding memo) and `guest_emergency` (muster, overboard, crime report, floor status, hurricane departure, notification checklist, hotline script). Port, airport, campus, school, health and venue domains suggest them.
- **One bundled pack** `ai.actionstations.hospitality` holds the domain, both toolkits, their templates and the regulation.
- **Facts come from the 2025 CDC Vessel Sanitation Program Environmental Public Health Standards, read in full on 2026-11-05:** reportable case definition (section 4.1.1), 24-hour report 24 to 36 hours before arrival and 4-hour update (4.2.1), special reports at 2 and 3 percent within 15 days of a US port with a telephone call at 2 percent (4.2.3), specimens from 2 percent (4.3.2), isolation periods (4.4), and the outbreak definition of 3 percent or an unusual pattern. 42 CFR 71.21(a) and (c) were read on the regulation text. The CDC outbreak response page names only the 3 percent investigation level; the 2 percent level is a reporting trigger in the standards.
- **Lint rules** are pure functions in `src/main/toolkits/hospitality/lint.ts`, registered under `hosp_` ids and listed in the toolkit.

## Consequences

- The 2 and 3 percent levels are reporting triggers and the outbreak definition is 3 percent; templates and knowledge keep the two apart.
- Numbers need a re-check against the current standards at each release.
- Ships, lines, hotels and people are fictional; real ports are used.
