// The MSEL grid: ARIA grid semantics, roving focus, keyboard navigation and drag to retime.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Fragment, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { GridContext, type GridContextValue } from './grid-context'
import { COLUMNS, EDITABLE, cellId, navigate, type Line } from './grid-nav'
import { groupDraft, phaseLineKey, type Draft } from './model'
import { lineKeys } from './operations'
import { MselRowView } from './MselRowView'
import { PhaseRowView } from './PhaseRowView'

interface GridProps {
  ctx: GridContextValue
  draft: Draft
  focusTick: number
  setDragging: (on: boolean) => void
  onDrop: (order: string[], movedKey: string) => void
  onFocusRequest: () => void
}

function focusCell(root: HTMLElement | null, id: string): void {
  const td = root?.querySelector<HTMLElement>(`[data-cell="${CSS.escape(id)}"]`)
  if (!td) return
  const target = td.querySelector<HTMLElement>('[data-focus]') ?? td
  target.focus({ preventScroll: true })
  td.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function useLines(draft: Draft): Line[] {
  return useMemo(
    () =>
      lineKeys(draft).map((key) => ({
        key,
        kind: key.startsWith('phase:') ? ('phase' as const) : ('row' as const),
      })),
    [draft],
  )
}

export function MselGrid({
  ctx,
  draft,
  focusTick,
  setDragging,
  onDrop,
  onFocusRequest,
}: GridProps) {
  const root = useRef<HTMLTableElement>(null)
  const lines = useLines(draft)
  const groups = useMemo(() => groupDraft(draft), [draft])
  const activeLine = lines.find((l) => l.key === ctx.active?.line)
  const activeId = ctx.active ? cellId(activeLine, ctx.active.col) : ''

  useEffect(() => {
    if (focusTick > 0 && activeId) focusCell(root.current, activeId)
  }, [focusTick, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (ctx.editing || ctx.dragging || !ctx.active || !lines.length) return
    const next = navigate(lines, ctx.active, e.key, e.metaKey || e.ctrlKey)
    if (next) {
      e.preventDefault()
      ctx.activate(next)
      onFocusRequest()
      return
    }
    if (e.key !== 'Enter' && e.key !== 'F2') return
    const isPhase = activeLine?.kind === 'phase'
    if (isPhase && ctx.active.col === 'select') return
    if (isPhase || EDITABLE.has(ctx.active.col)) {
      e.preventDefault()
      ctx.startEdit(isPhase ? { line: ctx.active.line, col: 'event' } : ctx.active)
    } else if (ctx.active.col === 'select' && e.key === 'Enter') {
      e.preventDefault()
      ctx.toggleSelect(ctx.active.line, e.shiftKey)
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false)
    const moved = String(e.active.id)
    const over = e.over ? String(e.over.id) : null
    if (!over || over === moved) return
    const keys = lines.map((l) => l.key)
    onDrop(arrayMove(keys, keys.indexOf(moved), keys.indexOf(over)), moved)
  }

  return (
    <GridContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Press Space to pick up the row, arrow keys to move it, Space to drop (the time is set between its new neighbours), Escape to cancel.',
          },
        }}
      >
        <SortableContext items={lines.map((l) => l.key)} strategy={verticalListSortingStrategy}>
          <div className="msel-editor__scroll">
            <table
              ref={root}
              role="grid"
              aria-label="Master Scenario Events List"
              aria-rowcount={lines.length + 1}
              className="table msel-editor__grid"
              onKeyDown={onKeyDown}
            >
              <colgroup>
                {COLUMNS.map((c) => (
                  <col key={c.id} className={`msel-editor__col-${c.id}`} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.id} scope="col" className={`msel-editor__c-${c.id}`}>
                      {'hidden' in c ? <span className="sr-only">{c.label}</span> : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.phase?.id ?? 'orphans'}>
                    {g.phase ? (
                      <PhaseRowView phase={g.phase} rowKeys={g.rows.map((r) => r.key)} />
                    ) : (
                      <tr className="msel-editor__phase" data-row-key={phaseLineKey('none')}>
                        <th colSpan={COLUMNS.length} scope="colgroup">
                          Rows without a phase
                        </th>
                      </tr>
                    )}
                    {g.rows.map((r) => (
                      <MselRowView key={r.key} r={r} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
    </GridContext.Provider>
  )
}
