// The deck's cards as an ARIA grid with one tab stop: arrow keys, Home/End move between cards
// (deck-nav.ts), Enter opens the inject editor (or "Create…" for a row without an inject).
// Long decks are windowed by visual row of cards: only rows near the viewport, plus the row
// of the active card, are mounted (#201).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Scenario } from '@shared/schemas/scenario'
import { useListWindow, WINDOW_AT, type ListWindow } from '../use-list-window'
import { DeckCard } from './DeckCard'
import { workState, type DeckEntry } from './deck-model'
import { gridColumns, nextDeckIndex } from './deck-nav'
import { injectUrl } from './links'

interface DeckGridProps {
  entries: DeckEntry[]
  scenario: Scenario
  projectPath: string
  typeLabel: (t: string) => string
  items: string[] | undefined
  onCreate: (row: DeckEntry['row']) => void
}

interface DeckLayout {
  cols: number
  gap: number
  /** Offset of the grid inside its scroll container's content. */
  margin: number
  scroller: HTMLElement | null
}

const NO_LAYOUT: DeckLayout = { cols: 1, gap: 0, margin: 0, scroller: null }

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p)
    if (/(auto|scroll)/.test(`${style.overflowY} ${style.overflow}`)) return p
  }
  return null
}

function measureLayout(el: HTMLElement): DeckLayout {
  const scroller = scrollParent(el)
  const top = scroller
    ? el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    : 0
  const gap = Number.parseFloat(getComputedStyle(el).rowGap) || 0
  return { cols: gridColumns(el), gap, margin: Math.max(0, top), scroller }
}

const sameLayout = (a: DeckLayout, b: DeckLayout) =>
  a.cols === b.cols && a.gap === b.gap && a.margin === b.margin && a.scroller === b.scroller

/** The grid element ref plus its column count, row gap and scroll container (kept current). */
function useDeckLayout(): [(el: HTMLDivElement | null) => () => void, DeckLayout] {
  const [layout, setLayout] = useState(NO_LAYOUT)
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return () => undefined
    const update = () => {
      const next = measureLayout(el)
      setLayout((prev) => (sameLayout(prev, next) ? prev : next))
    }
    update()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, layout]
}

/** Window over visual rows of cards, keeping the active card's row mounted. */
function useDeckWindow(count: number, current: number, layout: DeckLayout): ListWindow {
  const cols = Math.max(1, layout.cols)
  return useListWindow({
    count: Math.ceil(count / cols),
    enabled: count >= WINDOW_AT,
    getScrollElement: () => layout.scroller,
    estimateSize: () => 320,
    getItemKey: (i) => String(i),
    pinned: current >= 0 ? [Math.floor(current / cols)] : [],
    scrollMargin: layout.margin,
    gap: layout.gap,
    overscan: 2,
  })
}

/** Indexes of the cards to mount, with spacer heights before them (null = every card). */
function mountedCards(win: ListWindow, cols: number, count: number) {
  if (!win.slots) return null
  return win.slots.flatMap((s) =>
    Array.from({ length: Math.min(cols, count - s.index * cols) }, (_, k) => ({
      index: s.index * cols + k,
      gapBefore: k === 0 ? s.gapBefore : 0,
      windowRow: k === 0 ? s.index : undefined,
    })),
  )
}

function Spacer({ height }: { height: number }) {
  if (height <= 0) return null
  return <div aria-hidden="true" className="deck-grid__spacer" style={{ height }} />
}

/** Active card, focus requests and the grid's keyboard handler. */
function useDeckKeys(props: DeckGridProps) {
  const { entries, scenario, projectPath } = props
  const navigate = useNavigate()
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(0)
  const [focusTick, setFocusTick] = useState(0)
  const current = Math.min(active, entries.length - 1)
  const cell = (i: number) =>
    gridRef.current?.querySelector<HTMLElement>(`[role="gridcell"][data-card="${i}"]`) ?? null
  useEffect(() => {
    if (focusTick > 0) cell(current)?.focus()
    // `cell` reads the DOM; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== cell(current)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      const entry = entries[current]
      if (entry?.inject) navigate(injectUrl(projectPath, scenario.id, entry.inject.id))
      else if (entry) props.onCreate(entry.row)
      return
    }
    const next = nextDeckIndex(current, e.key, entries.length, gridColumns(gridRef.current))
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
    setFocusTick((t) => t + 1)
  }
  return { gridRef, current, setActive, onKeyDown }
}

/** One card of the grid; `windowRow` marks the first card of a mounted visual row. */
function cardFor(
  props: DeckGridProps,
  state: { current: number; setActive: (i: number) => void; win: ListWindow },
  i: number,
  windowRow?: number,
) {
  const { entries, scenario } = props
  const entry = entries[i]!
  return (
    <DeckCard
      key={entry.row.id}
      entry={entry}
      scenarioId={scenario.id}
      roles={scenario.roles}
      projectPath={props.projectPath}
      typeLabel={props.typeLabel}
      work={workState(entry, props.items)}
      onCreate={props.onCreate}
      active={i === state.current}
      index={i}
      onActivate={state.setActive}
      measure={windowRow === undefined ? undefined : state.win.measure}
      windowRow={windowRow}
    />
  )
}

export function DeckGrid(props: DeckGridProps) {
  const { entries } = props
  const [layoutRef, layout] = useDeckLayout()
  const { gridRef, current, setActive, onKeyDown } = useDeckKeys(props)
  const win = useDeckWindow(entries.length, current, layout)
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      gridRef.current = el
      return layoutRef(el)
    },
    [gridRef, layoutRef],
  )
  const card = (i: number, windowRow?: number) =>
    cardFor(props, { current, setActive, win }, i, windowRow)
  const mounted = mountedCards(win, Math.max(1, layout.cols), entries.length)
  return (
    <div
      ref={ref}
      role="grid"
      aria-label="Inject deck"
      aria-rowcount={entries.length}
      aria-describedby="deck-keys"
      className="deck-grid"
      onKeyDown={onKeyDown}
    >
      {mounted
        ? mounted.flatMap((m) => [
            <Spacer key={`gap-${m.index}`} height={m.gapBefore} />,
            card(m.index, m.windowRow),
          ])
        : entries.map((_, i) => card(i))}
      {mounted && <Spacer height={win.gapAfter} />}
    </div>
  )
}
