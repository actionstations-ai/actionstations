# ADR-0040: Regulations and control frameworks as pack data (pack format 2)

Date: 2026-10-29 · Status: Accepted · Issue: #426 · Spec: [0426](../specs/0426-regulatory-clocks.md)

## Context

Cyber exercises are judged against reporting deadlines (SEC Form 8-K Item 1.05, CIRCIA, TSA
directives, HIPAA, GDPR, NIS2, DORA) and control frameworks (NIST CSF 2.0, NIS2 Article 21, DORA).
The deadlines change: CIRCIA is still a proposed rule, TSA directives are reissued, member states
transpose NIS2 with shorter deadlines. Putting them in code would tie every change to an app
release. Packs (ADR-0018) already carry data from untrusted authors, so they are the place for
this data, but a pack's `contents` keys are a strict set: an older app refuses an unknown key
with a schema error.

Facilitate state (`facilitator.json`) is also being extended by live play (#418) and the
controller tools (#428). Until now it was a plain `z.object`, so a build that did not know a key
dropped it on the next save.

## Decision

- Two new pack kinds, `regulations/<id>.json` (`Regulation`) and `frameworks/<id>.json`
  (`Framework`), with schemas in `src/shared/schemas/compliance.ts`. Clock terms count from a
  trigger or from an earlier clock's filing, so references form no cycle by construction;
  mapping rule keywords are plain words, never regexes. Every list and string is capped.
- `PACK_FORMAT_VERSION` is 2. The reader accepts 1 and 2; a version-1 manifest that lists the new
  kinds is refused. Writers (the bundled-pack build, the export wizard, the library packs) use the
  oldest version that holds the contents and leave empty format-2 keys out, so packs without
  regulations or frameworks still install in older apps. An app that knows only format 1 refuses
  a version-2 pack with its existing "this pack needs a newer version of the app" message instead
  of a schema error.
- Precedence is project copy > installed pack > bundled pack. Enabling an item from an installed
  pack copies it into `<project>/compliance/<kind>/<id>.json` and records it in `packs.json`.
  Bundled items are not copied: they ship with the app, so a corrected deadline in a release
  reaches every project (the same rule as bundled templates).
- Clock maths is pure and in `src/shared/compliance/`: floating local scenario time (no time
  zone, DST ignored on purpose), US federal holidays computed by rule, business days counted from
  the day after the trigger at the same time of day, calendar months clamped. The renderer, the
  presentation window and the exports call the same functions.
- `FacilitatorState` becomes `z.looseObject`. Each feature adds one optional top-level key
  (`compliance` here) and never touches the others, so a key one build does not know survives a
  save by another build.
- The bundled records carry `sources`, `status` and `verifiedOn`; a unit test fails when a record
  was last checked 12 months ago or more. NIST CSF 2.0 is converted once from the NIST CPRT
  export by `scripts/import-csf.mjs` and the output is committed.

## Consequences

- A pack author can add a state breach law or a national NIS2 deadline as data; the site's
  validator must accept format 2 (listed in the PR for the site repository).
- Apps before 0.7.0 cannot install a pack with regulations or frameworks; they say so plainly.
- Every release re-checks the bundled deadlines, or the test suite fails.
- `MselRow.triggers`, `controls` and `controlSuggestions` are optional rather than defaulted, so
  rows built in code and rows written by older builds need no change.
