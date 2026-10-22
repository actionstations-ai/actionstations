// Map an editor's committed value onto the draft, and pick the cell Tab moves to.
import type { MselRow } from '@shared/schemas/scenario'
import { PurposeTag } from '@shared/taxonomy'
import { applyTo } from './cell-format'
import { nextEditable, type Cell, type ColumnId, type Line } from './grid-nav'
import {
  PHASE_LINE_PREFIX,
  parseExerciseTime,
  retime,
  updatePhaseGoal,
  updateRow,
  type Draft,
} from './model'

function patchFor(col: ColumnId, value: unknown): ((row: MselRow) => MselRow) | null {
  const text = typeof value === 'string' ? value : ''
  const list = Array.isArray(value) ? (value as unknown[]) : []
  switch (col) {
    case 'time': {
      const minutes = parseExerciseTime(text)
      return minutes === null ? null : (row) => retime(row, minutes)
    }
    case 'id':
      return text.trim() ? (row) => ({ ...row, id: text.trim() }) : null
    case 'from':
      return (row) => ({ ...row, from: text })
    case 'event':
      return (row) => ({ ...row, event: text })
    case 'expected':
      return (row) => ({ ...row, expectedAction: text })
    case 'to':
      return (row) => applyTo(row, list.map(String))
    case 'tag': {
      const tag = PurposeTag.safeParse(list[0])
      return tag.success ? (row) => ({ ...row, purposeTag: tag.data }) : null
    }
    case 'format':
      return (row) => {
        const { format: _old, ...rest } = row
        return list[0] ? { ...rest, format: String(list[0]) } : rest
      }
    case 'citations':
      return (row) => ({
        ...row,
        citations: list.map((i) => row.citations[Number(i)]!).filter(Boolean),
      })
    default:
      return null
  }
}

/** The draft after committing `value` into `cell` (unchanged draft when nothing changes). */
export function commitCell(d: Draft, cell: Cell, value: unknown): Draft {
  if (cell.line.startsWith(PHASE_LINE_PREFIX)) {
    const phaseId = cell.line.slice(PHASE_LINE_PREFIX.length)
    const goal = String(value)
    return d.phases.find((p) => p.id === phaseId)?.goal === goal
      ? d
      : updatePhaseGoal(d, phaseId, goal)
  }
  const patch = patchFor(cell.col, value)
  const current = d.rows.find((r) => r.key === cell.line)?.row
  if (!patch || !current) return d
  const next = patch(current)
  return JSON.stringify(next) === JSON.stringify(current) ? d : updateRow(d, cell.line, () => next)
}

/** Cell Tab / Shift+Tab moves to while editing: next editable column, wrapping to rows. */
export function tabTarget(lines: Line[], cell: Cell, move: 'next' | 'prev'): Cell | null {
  const dir = move === 'next' ? 1 : -1
  const col = nextEditable(cell.col, dir)
  if (col) return { line: cell.line, col }
  const rows = lines.filter((l) => l.kind === 'row')
  const i = rows.findIndex((l) => l.key === cell.line)
  const line = rows[i + dir]
  if (!line) return null
  return { line: line.key, col: dir === 1 ? 'time' : 'citations' }
}
