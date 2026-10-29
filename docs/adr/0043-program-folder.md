# ADR-0043: The exercise program folder

Date: 2026-10-29 · Status: Accepted · Issue: #424

## Context

Corrective actions from an after-action report stop being tracked when the exercise binder
closes (GAO-20-297; DHS OIG-12-118). An agency's exercise program outlives laptops, is kept by
more than one person and covers several projects, so it cannot live in one project folder or in
the per-user, hidden settings folder. It must also cost nothing and need no server or account
(ADR-0023).

## Decision

- A program is a folder the user chooses, `<Name>.asprogram/`, outside every project: visible,
  backed up, movable, and placeable on a shared drive or a synced folder. The app never creates
  or reads one before the user picks it in a dialog. `settings.json` only remembers the active
  path and a recent list; one program is active at a time.
- One JSON file per record: `program.json`, `schedule.json`, `corrective-actions/<id>.json`,
  `imports/<id>.json`, `projects/<projectId>.json` (snapshots). Small writes, and file-sync tools
  merge independent edits instead of fighting over one large file. Files are `looseObject`, so
  a newer build's keys survive a save (ADR-0016), and a newer `formatVersion` is refused.
- Everything read from the folder is validated with zod, with caps, because it may be written
  by another computer. A damaged action file is listed as a problem, never hidden or fatal.
  Ids are `SafeId` and every path goes through `safeJoin`.
- Concurrency is detection, not locking. Each record has a revision (sha256 of its file text);
  a save from an older revision fails with `CONFLICT` and carries the stored version, and the
  editor lets the person choose. Status, history and verifications change only through the
  status channel, so an edit cannot rewrite history. `.lock.json` (host, user, time) is
  advisory: it shows "Also open by <host>" and never blocks. It is written only while a program
  is open, removed on close and quit, ignored after 24 hours, and can be turned off.
- Projects link to at most one program. The link is a path stored relative to the program's
  parent when the project sits beside it, otherwise absolute, with a fallback to the recent
  projects by project id. A path from `program.json` is followed only to a project the user
  opened or one beside the program folder whose `project.json` has the same id.
- A snapshot per linked project (scenarios with exercise date, capabilities, plan sections,
  ratings, document inventory) lets the program, and the dashboard (#438), work when the
  project folder is on another computer. An unreachable project keeps its last snapshot.
- "Propose next exercise" is a pure function in `src/shared/program/propose.ts`: it scores
  capabilities and plan sections from open and overdue actions, years since last exercised,
  unaddressed cycle priorities and the schedule, and writes the reasons. No model is involved;
  only the constraint sentences, never owner fields, reach a scenario brief.

## Consequences

- Last writer wins per file, with conflicts shown; there is no real-time editing, accounts or
  permissions, and a file share that does not keep files consistent can still lose a write.
- Owner names and emails are personal data in the folder the user chose; they are never logged
  or sent unless the user exports them or sends the table to a model on purpose.
- A second program format reader must keep reading format 1.
