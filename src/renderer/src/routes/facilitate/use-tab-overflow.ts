// Keeps the facilitator tab strip usable when its tabs are wider than the panel (#578): the strip
// scrolls sideways, the focused or selected tab is scrolled into view, and data attributes tell
// the CSS which edges still hide tabs so it can draw a fade cue there.
import { useCallback, useEffect, useRef, type FocusEvent, type RefObject } from 'react'

const EDGE_SLACK_PX = 2

function markOverflow(list: HTMLElement): void {
  const hiddenLeft = list.scrollLeft > EDGE_SLACK_PX
  const hiddenRight = list.scrollLeft + list.clientWidth < list.scrollWidth - EDGE_SLACK_PX
  list.toggleAttribute('data-overflow-start', hiddenLeft)
  list.toggleAttribute('data-overflow-end', hiddenRight)
}

export function useTabOverflow(selected: string): {
  ref: RefObject<HTMLDivElement | null>
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onScroll: () => void
} {
  const ref = useRef<HTMLDivElement | null>(null)
  const refresh = useCallback(() => {
    if (ref.current) markOverflow(ref.current)
  }, [])

  useEffect(() => {
    const list = ref.current
    if (!list) return
    markOverflow(list)
    const observer = new ResizeObserver(refresh)
    observer.observe(list)
    return () => observer.disconnect()
  }, [refresh])

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    refresh()
  }, [selected, refresh])

  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      refresh()
    },
    [refresh],
  )
  return { ref, onFocus, onScroll: refresh }
}
