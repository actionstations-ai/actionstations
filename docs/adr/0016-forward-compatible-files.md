# ADR-0016: Forward-compatible project files

Date: 2026-10-23 · Status: Accepted · Issue: #208

## Context

Persisted JSON is parsed with zod, and `z.object` drops keys it does not know. When an older
build opened a project written by a newer one, the first `updateProject` or scenario save
silently deleted every field the newer build had added. `project.json` had a `formatVersion`
that was never bumped as fields were added, and `scenario.json` had none.

## Decision

The persisted root objects (`Project`, `Scenario`, `Inject`, `DocumentMeta`) are
`z.looseObject`: known fields are validated as before, unknown keys are kept on load and
written back on save. `scenario.json` gets a `formatVersion` (`SCENARIO_FORMAT_VERSION`, 1);
a file without one loads as 1, and a newer one is refused with an "update the app" message,
the same rule `project.json` already had.

Additive fields do not need a version bump. A change an older build cannot read correctly
(renamed or re-typed field, changed meaning) bumps the format version so older builds refuse
the file instead of misreading it.

## Consequences

Old builds keep newer data intact. Nested objects (MSEL rows, assets) are still strict, so a
field added inside them is still dropped by an older build; make the parent loose or bump the
version when that matters. Unknown root keys also reach the renderer and round-trip through
IPC saves, which is the point, but means hand-edited junk keys persist until removed.
