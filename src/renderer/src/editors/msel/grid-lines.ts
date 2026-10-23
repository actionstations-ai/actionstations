// The grid's lines (navigation order), its displayed rows and its keyboard handler.
import { useMemo, type KeyboardEvent } from 'react'
import type { Phase } from '@shared/schemas/scenario'
import type { GridContextValue } from './grid-context'
import { EDITABLE, navigate, type Line } from './grid-nav'
import { phaseLineKey, type Draft, type DraftGroup, type DraftRow } from './model'
import { lineKeys } from './operations'

/** One displayed <tr>: a phase header, the "Rows without a phase" header or an MSEL row. */
export type DisplayItem =
  | { kind: 'phase'; key: string; phase: Phase; rowKeys: string[] }
  | { kind: 'orphans'; key: string }
  | { kind: 'row'; key: string; r: DraftRow }

export function displayItems(groups: DraftGroup[]): DisplayItem[] {
  return groups.flatMap((g): DisplayItem[] => [
    g.phase
      ? {
          kind: 'phase',
          key: phaseLineKey(g.phase.id),
          phase: g.phase,
          rowKeys: g.rows.map((r) => r.key),
        }
      : { kind: 'orphans', key: phaseLineKey('none') },
    ...g.rows.map((r): DisplayItem => ({ kind: 'row', key: r.key, r })),
  ])
}

export function useLines(draft: Draft): Line[] {
  return useMemo(
    () =>
      lineKeys(draft).map((key) => ({
        key,
        kind: key.startsWith('phase:') ? ('phase' as const) : ('row' as const),
      })),
    [draft],
  )
}

/** `keys`, keeping the previous array while the order is unchanged (stable sortable items). */
export function useStableKeys(keys: string[]): string[] {
  const joined = keys.join('\n')
  return useMemo(() => (joined ? joined.split('\n') : []), [joined])
}

/** Arrow / Home / End / Page keys move the active cell; Enter or F2 edits it. */
export function gridKeyHandler(
  ctx: GridContextValue,
  lines: Line[],
  onFocusRequest: () => void,
): (e: KeyboardEvent<HTMLTableElement>) => void {
  return (e) => {
    if (ctx.editing || ctx.dragging || !ctx.active || !lines.length) return
    const next = navigate(lines, ctx.active, e.key, e.metaKey || e.ctrlKey)
    if (next) {
      e.preventDefault()
      ctx.actions.activate(next)
      onFocusRequest()
      return
    }
    if (e.key !== 'Enter' && e.key !== 'F2') return
    const isPhase = ctx.active.line.startsWith('phase:')
    if (isPhase && ctx.active.col === 'select') return
    if (isPhase || EDITABLE.has(ctx.active.col)) {
      e.preventDefault()
      ctx.actions.startEdit(isPhase ? { line: ctx.active.line, col: 'event' } : ctx.active)
    } else if (ctx.active.col === 'select' && e.key === 'Enter') {
      e.preventDefault()
      ctx.actions.toggleSelect(ctx.active.line, e.shiftKey)
    }
  }
}
