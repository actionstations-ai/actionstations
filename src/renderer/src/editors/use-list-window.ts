// Windowed rendering for long lists (#201): only the rows near the viewport are mounted, plus
// "pinned" rows that must stay in the DOM wherever the user has scrolled (the grid's active
// cell, the row being edited or dragged), so the roving tab stop, focus moves and drag and
// drop keep working. Gaps between mounted rows are filled with spacers of the estimated or
// measured height. Short lists render every row (`enabled` false).
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type VirtualItem,
} from '@tanstack/react-virtual'
import { useCallback, useMemo } from 'react'

/** Lists at or above this many rows are windowed. */
export const WINDOW_AT = 150

export interface WindowSlot {
  index: number
  /** Height of the spacer to render before this row (0 when it follows the previous one). */
  gapBefore: number
}

export interface ListWindow {
  /** Rows to mount in order, or null to mount every row (not windowed). */
  slots: WindowSlot[] | null
  /** Height of the spacer after the last mounted row. */
  gapAfter: number
  /** Ref callback for a mounted row element (needs `data-index`); undefined when not windowed. */
  measure: ((el: HTMLElement | null) => void) | undefined
}

interface WindowOptions {
  count: number
  enabled: boolean
  getScrollElement: () => HTMLElement | null
  estimateSize: (index: number) => number
  getItemKey: (index: number) => string
  /** Indexes that are always mounted. */
  pinned: number[]
  /** Distance from the scroll element's content start to the first row (e.g. a table head). */
  scrollMargin?: number
  /** Space between rows the layout adds itself (CSS grid row-gap); spacers account for it. */
  gap?: number
  overscan?: number
}

function withPinned(range: Range, pinned: number[]): number[] {
  const out = new Set(defaultRangeExtractor(range))
  for (const i of pinned) if (i >= 0 && i < range.count) out.add(i)
  return [...out].sort((a, b) => a - b)
}

/** The virtualizer's items plus pinned ones it left out (it renders none in an empty view). */
function mountedItems(items: VirtualItem[], all: VirtualItem[], pinned: number[]): VirtualItem[] {
  const seen = new Set(items.map((it) => it.index))
  const extra = pinned.filter((i) => !seen.has(i)).flatMap((i) => (all[i] ? [all[i]] : []))
  return extra.length ? [...items, ...extra].sort((a, b) => a.index - b.index) : items
}

export function useListWindow(o: WindowOptions): ListWindow {
  const pinnedKey = o.pinned.join(',')
  const pinned = useMemo(() => pinnedKey.split(',').filter(Boolean).map(Number), [pinnedKey])
  const rangeExtractor = useCallback((range: Range) => withPinned(range, pinned), [pinned])
  const margin = o.scrollMargin ?? 0
  const gap = o.gap ?? 0
  // The virtualizer is read during render on purpose (its items are this render's window).
  // eslint-disable-next-line react-hooks/incompatible-library
  const v = useVirtualizer({
    count: o.count,
    enabled: o.enabled,
    getScrollElement: o.getScrollElement,
    estimateSize: o.estimateSize,
    getItemKey: o.getItemKey,
    rangeExtractor,
    scrollMargin: margin,
    gap,
    overscan: o.overscan ?? 8,
  })
  if (!o.enabled) return { slots: null, gapAfter: 0, measure: undefined }
  const items = mountedItems(v.getVirtualItems(), v.measurementsCache, pinned)
  // A spacer sits between two layout gaps, so it is `gap` shorter than the space it fills.
  const spacer = (space: number) => (space > 0 ? Math.max(0, space - gap) : 0)
  let end = margin - gap
  const slots = items.map((it) => {
    const slot = { index: it.index, gapBefore: spacer(it.start - end - gap) }
    end = it.end
    return slot
  })
  const gapAfter = spacer(v.getTotalSize() + margin - end)
  return { slots, gapAfter, measure: v.measureElement }
}
