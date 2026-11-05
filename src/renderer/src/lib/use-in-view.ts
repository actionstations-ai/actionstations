import { useCallback, useEffect, useRef, useState } from 'react'

export interface InView {
  /** Attach to the element to watch. */
  ref: (el: Element | null) => void
  /** On screen (or within `rootMargin` of it) right now. */
  visible: boolean
  /** Has been on screen at least once; stays true. */
  seen: boolean
  /** Reads `visible` without re-rendering (for callbacks that run later). */
  isVisible: () => boolean
}

/**
 * Tracks whether an element is in the viewport with IntersectionObserver. Without one (old
 * engines, some test DOMs) everything counts as visible, so nothing is ever left unrendered.
 */
export function useInView(rootMargin = '0px'): InView {
  const supported = typeof IntersectionObserver !== 'undefined'
  const [el, setEl] = useState<Element | null>(null)
  const [visible, setVisible] = useState(!supported)
  const [seen, setSeen] = useState(!supported)
  const current = useRef(!supported)

  useEffect(() => {
    if (!el || !supported) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        current.current = entry.isIntersecting
        setVisible(entry.isIntersecting)
        if (entry.isIntersecting) setSeen(true)
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, rootMargin, supported])

  const isVisible = useCallback(() => current.current, [])
  return { ref: setEl, visible, seen, isVisible }
}
