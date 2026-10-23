# ADR-0017: Memoized rows and windowed long lists

Date: 2026-10-23 · Status: Accepted · Issue: #201

## Context

The MSEL grid and the inject deck rendered every row on every change. Rows read one grid
context that held the active cell, selection and fresh callbacks, so each committed edit
re-rendered all rows; on a 300-row MSEL a commit took about 90 ms in the test harness and
mounting took about 350 ms. dnd-kit sensor options created inline re-created the sensors on
every render, which also re-rendered every draggable row.

## Decision

- Rows (`MselRowView`, `PhaseRowView`, `DeckCard`) are `React.memo` components. They read
  stable actions (one object whose methods call the latest handlers) and shared roles/phases
  from context, and get their own slice of the grid state as props (active / editing column,
  selected, warnings, job state). Unchanged rows keep their object identity: the draft keeps
  untouched rows, lint warnings and deck entries are reused when their content is unchanged.
- Lists of 150 or more rows or cards are windowed with `@tanstack/react-virtual` through one
  hook, `editors/use-list-window.ts`. Rows near the viewport are mounted, plus pinned rows
  (the active cell's row, the row being edited or dragged) so the roving tab stop, focus moves,
  "Go to row" and dnd-kit keep working. Spacers stand in for the rows that are not mounted.
  The deck is windowed by visual row of cards. Rows carry `aria-rowindex` and the grid
  `aria-rowcount`, so assistive technology knows each row's position.

## Consequences

- A committed edit re-renders one row; commit time on a 300-row MSEL is a few milliseconds.
- Code that looks rows up in the DOM must expect unmounted rows: focus goes through the
  grid state (the active row is always mounted), not through `querySelectorAll` indexes.
- Ctrl+F in the page finds only mounted rows of a long list; the lint summary's "Go to row"
  and the deck filters are the way to reach a specific row.
- Short lists (most exercises) render every row, as before.
