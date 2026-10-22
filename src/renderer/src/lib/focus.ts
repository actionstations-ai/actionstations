// Focus helpers for route changes and skip links (#49).

/** Focus an element that may not be focusable by default (headings, main). */
export function focusTarget(el: HTMLElement | null | undefined) {
  if (!el) return
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: false })
}

/** First h1 inside main once the route's lazy page has rendered (polls briefly). */
export function whenHeading(cb: (h: HTMLElement | null) => void): () => void {
  let tries = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const look = () => {
    const h = document.querySelector<HTMLElement>('#main h1')
    if (h?.textContent?.trim() && !/^Loading/.test(h.textContent)) return cb(h)
    if (++tries > 40) return cb(h)
    timer = setTimeout(look, 50)
  }
  look()
  return () => clearTimeout(timer)
}

/**
 * Move focus from nowhere, or from the link / button that navigated; never out of a text
 * field or an open dialog (the user is typing or deciding there).
 */
export function shouldMoveFocus(active: Element | null): boolean {
  if (!active || active === document.body || !active.isConnected) return true
  if (active.closest('[role="dialog"]')) return false
  if (active.closest('.sidebar')) return true
  const editable =
    (active as HTMLElement).isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
  return !editable
}
