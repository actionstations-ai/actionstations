// Grid columns and keyboard navigation (ARIA grid pattern: one tab stop, arrows move).
export const COLUMNS = [
  { id: 'select', label: 'Select', hidden: true },
  { id: 'drag', label: 'Reorder', hidden: true },
  { id: 'time', label: 'Time' },
  { id: 'id', label: 'ID' },
  { id: 'from', label: 'From' },
  { id: 'to', label: 'To' },
  { id: 'event', label: 'Event / Message' },
  { id: 'expected', label: 'Expected Action' },
  { id: 'tag', label: 'Tag' },
  { id: 'format', label: 'Format' },
  { id: 'citations', label: 'Citations' },
  { id: 'locked', label: 'Locked' },
  { id: 'actions', label: 'Row actions', hidden: true },
] as const

export type ColumnId = (typeof COLUMNS)[number]['id']
export const COLUMN_IDS: ColumnId[] = COLUMNS.map((c) => c.id)

/** Columns that open an editor on Enter / F2. */
export const EDITABLE: ReadonlySet<ColumnId> = new Set<ColumnId>([
  'time',
  'id',
  'from',
  'to',
  'event',
  'expected',
  'tag',
  'format',
  'citations',
])

/** Next editable column for Tab / Shift+Tab while editing (null at the row's end). */
export function nextEditable(col: ColumnId, dir: 1 | -1): ColumnId | null {
  let i = COLUMN_IDS.indexOf(col) + dir
  while (i >= 0 && i < COLUMN_IDS.length) {
    const c = COLUMN_IDS[i]!
    if (EDITABLE.has(c)) return c
    i += dir
  }
  return null
}

export interface Cell {
  line: string
  col: ColumnId
}

export interface Line {
  key: string
  kind: 'phase' | 'row'
}

/** Phase header lines have two cells: the select checkbox and the phase (title + goal). */
export const phaseCol = (col: ColumnId): ColumnId => (col === 'select' ? 'select' : 'event')

export function cellId(line: Line | undefined, col: ColumnId): string {
  if (!line) return ''
  return `${line.key}|${line.kind === 'phase' ? phaseCol(col) : col}`
}

/** New active cell after a navigation key, or null when the key is not a navigation key. */
export function navigate(
  lines: Line[],
  active: Cell,
  key: string,
  ctrl: boolean,
  pageSize = 10,
): Cell | null {
  const li = Math.max(
    0,
    lines.findIndex((l) => l.key === active.line),
  )
  const ci = COLUMN_IDS.indexOf(active.col)
  const isPhase = lines[li]?.kind === 'phase'
  const at = (l: number, c: number): Cell => ({
    line: lines[Math.min(lines.length - 1, Math.max(0, l))]!.key,
    col: COLUMN_IDS[Math.min(COLUMN_IDS.length - 1, Math.max(0, c))]!,
  })
  switch (key) {
    case 'ArrowUp':
      return at(li - 1, ci)
    case 'ArrowDown':
      return at(li + 1, ci)
    case 'ArrowLeft':
      return isPhase ? at(li, 0) : at(li, ci - 1)
    case 'ArrowRight':
      return isPhase && active.col === 'select'
        ? at(li, COLUMN_IDS.indexOf('time'))
        : at(li, ci + 1)
    case 'Home':
      return ctrl ? at(0, 0) : at(li, 0)
    case 'End':
      return ctrl ? at(lines.length - 1, COLUMN_IDS.length - 1) : at(li, COLUMN_IDS.length - 1)
    case 'PageUp':
      return at(li - pageSize, ci)
    case 'PageDown':
      return at(li + pageSize, ci)
    default:
      return null
  }
}
