// The MSEL grid: ARIA grid semantics, roving focus, keyboard navigation and drag to retime.
// Rows are memoized and get their own slice of the grid state; long MSELs are windowed
// (only rows near the viewport, plus the active / edited / dragged row, are mounted; #201).
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useListWindow, WINDOW_AT, type ListWindow } from '../use-list-window'
import { GridActionsContext, GridSharedContext, colOn, type GridContextValue } from './grid-context'
import { clsx } from 'clsx'
import { COLUMNS, cellId, type Cell, type Line } from './grid-nav'
import {
  displayItems,
  gridKeyHandler,
  useLines,
  useStableKeys,
  type DisplayItem,
} from './grid-lines'
import { groupDraft, type Draft } from './model'
import './criteria.css'
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

// Module constants: new option objects each render would re-create the sensors, and with them
// dnd-kit's context, re-rendering every row (#201).
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } }
const KEYBOARD_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates }

const SCREEN_READER_DRAG =
  'Press Space to pick up the row, arrow keys to move it, Space to drop (the time is set between its new neighbours), Escape to cancel.'

function GridHead({ headRef }: { headRef: (el: HTMLTableSectionElement | null) => void }) {
  return (
    <>
      <colgroup>
        {COLUMNS.map((c) => (
          <col key={c.id} className={`msel-editor__col-${c.id}`} />
        ))}
      </colgroup>
      <thead ref={headRef}>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.id} scope="col" className={`msel-editor__c-${c.id}`}>
              {'hidden' in c ? <span className="sr-only">{c.label}</span> : c.label}
            </th>
          ))}
        </tr>
      </thead>
    </>
  )
}

function Spacer({ height }: { height: number }) {
  if (height <= 0) return null
  return (
    <tr aria-hidden="true" className="msel-editor__spacer">
      <td colSpan={COLUMNS.length} style={{ height, padding: 0, border: 0 }} />
    </tr>
  )
}

/** The grid's rows (all of them, or the window's slots with spacers between them). */
function GridBody(props: { items: DisplayItem[]; ctx: GridContextValue; win: ListWindow }) {
  const { items, ctx, win } = props
  const row = (i: number): ReactNode => (
    <ItemRow key={items[i]!.key} item={items[i]!} index={i} ctx={ctx} measure={win.measure} />
  )
  if (!win.slots) return <tbody>{items.map((_, i) => row(i))}</tbody>
  return (
    <tbody>
      {win.slots.flatMap((s) => [
        s.gapBefore > 0 ? <Spacer key={`gap-${s.index}`} height={s.gapBefore} /> : null,
        row(s.index),
      ])}
      <Spacer height={win.gapAfter} />
    </tbody>
  )
}

function ItemRow(props: {
  item: DisplayItem
  index: number
  ctx: GridContextValue
  measure: ListWindow['measure']
}) {
  const { item, ctx, measure } = props
  const rowIndex = props.index + 2
  if (item.kind === 'orphans')
    return (
      <tr
        className="msel-editor__phase"
        data-row-key={item.key}
        aria-rowindex={rowIndex}
        data-index={props.index}
        ref={measure}
      >
        <th colSpan={COLUMNS.length} scope="colgroup">
          Rows without a phase
        </th>
      </tr>
    )
  if (item.kind === 'phase')
    return (
      <PhaseRowView
        phase={item.phase}
        total={item.rowKeys.length}
        picked={item.rowKeys.filter((k) => ctx.selected.has(k)).length}
        rowIndex={rowIndex}
        activeCol={colOn(ctx.active, item.key)}
        editing={ctx.editing?.line === item.key}
        measure={measure}
      />
    )
  return (
    <MselRowView
      r={item.r}
      rowIndex={rowIndex}
      activeCol={colOn(ctx.active, item.key)}
      editingCol={colOn(ctx.editing, item.key)}
      selected={ctx.selected.has(item.key)}
      warnings={ctx.warnings.get(item.r.row.id)}
      measure={measure}
    />
  )
}

/** Window over the display items, keeping the active, edited and dragged rows mounted. */
function useGridWindow(
  items: DisplayItem[],
  ctx: GridContextValue,
  dragKey: string | null,
  scroller: RefObject<HTMLDivElement | null>,
  headHeight: number,
): ListWindow {
  const indexOf = useMemo(() => new Map(items.map((it, i) => [it.key, i])), [items])
  const pinned = [ctx.active?.line, ctx.editing?.line, dragKey]
    .map((k) => (k ? (indexOf.get(k) ?? -1) : -1))
    .filter((i) => i >= 0)
  return useListWindow({
    count: items.length,
    enabled: items.length >= WINDOW_AT,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (items[i]?.kind === 'row' ? 96 : 56),
    getItemKey: (i) => items[i]?.key ?? String(i),
    pinned,
    scrollMargin: headHeight,
  })
}

/** The table head's height (rows start below it in the scroll container). */
function useHeadHeight(): [number, (el: HTMLTableSectionElement | null) => void] {
  const [height, setHeight] = useState(0)
  const ref = useCallback((el: HTMLTableSectionElement | null) => {
    if (el) setHeight(el.offsetHeight)
  }, [])
  return [height, ref]
}

/** Move DOM focus to the active cell whenever `focusTick` asks for it. */
function useFocusRequest(
  root: RefObject<HTMLTableElement | null>,
  lines: Line[],
  active: Cell | null,
  focusTick: number,
) {
  const activeLine = lines.find((l) => l.key === active?.line)
  const activeId = active ? cellId(activeLine, active.col) : ''
  useEffect(() => {
    if (focusTick > 0 && activeId) focusCell(root.current, activeId)
  }, [root, focusTick, activeId])
}

/** Drag to reorder: dnd-kit context over the grid's lines (`onDrag` gets the dragged key). */
function GridDnd(props: {
  lineKeys: string[]
  onDrag: (key: string | null) => void
  onDrop: (order: string[], movedKey: string) => void
  children: ReactNode
}) {
  const { lineKeys, onDrag, onDrop } = props
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_OPTIONS),
  )
  const onDragEnd = (e: DragEndEvent) => {
    onDrag(null)
    const moved = String(e.active.id)
    const over = e.over ? String(e.over.id) : null
    if (!over || over === moved) return
    onDrop(arrayMove(lineKeys, lineKeys.indexOf(moved), lineKeys.indexOf(over)), moved)
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => onDrag(String(e.active.id))}
      onDragCancel={() => onDrag(null)}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: { draggable: SCREEN_READER_DRAG } }}
    >
      <SortableContext items={lineKeys} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  )
}

export function MselGrid(props: GridProps) {
  const { ctx, draft, focusTick, setDragging, onDrop, onFocusRequest } = props
  const root = useRef<HTMLTableElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [headHeight, headRef] = useHeadHeight()
  const lines = useLines(draft)
  const items = useMemo(() => displayItems(groupDraft(draft)), [draft])
  const sortIds = useStableKeys(lines.map((l) => l.key))
  const [dragKey, setDragKey] = useState<string | null>(null)
  const win = useGridWindow(items, ctx, dragKey, scroller, headHeight)
  const shared = useMemo(
    () => ({
      roles: ctx.roles,
      phases: ctx.phases,
      grounding: ctx.grounding,
      seams: ctx.seams,
      branchMarks: ctx.branchMarks,
      offPath: ctx.offPath,
      criteria: ctx.criteria,
      showCriteria: ctx.showCriteria,
      regional: ctx.regional,
    }),
    [
      ctx.roles,
      ctx.phases,
      ctx.grounding,
      ctx.seams,
      ctx.branchMarks,
      ctx.offPath,
      ctx.regional,
      ctx.criteria,
      ctx.showCriteria,
    ],
  )
  const onKeyDown = gridKeyHandler(ctx, lines, onFocusRequest)
  const onDrag = useCallback(
    (key: string | null) => {
      setDragging(!!key)
      setDragKey(key)
    },
    [setDragging],
  )
  useFocusRequest(root, lines, ctx.active, focusTick)

  return (
    <GridActionsContext.Provider value={ctx.actions}>
      <GridSharedContext.Provider value={shared}>
        <GridDnd lineKeys={sortIds} onDrag={onDrag} onDrop={onDrop}>
          <div className="msel-editor__scroll" ref={scroller}>
            <table
              ref={root}
              role="grid"
              aria-label="Master Scenario Events List"
              aria-rowcount={items.length + 1}
              className={clsx('table msel-editor__grid', ctx.showCriteria && 'has-criteria')}
              onKeyDown={onKeyDown}
            >
              <GridHead headRef={headRef} />
              <GridBody items={items} ctx={ctx} win={win} />
            </table>
          </div>
        </GridDnd>
      </GridSharedContext.Provider>
    </GridActionsContext.Provider>
  )
}
