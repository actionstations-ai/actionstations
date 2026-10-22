// Keyboard model of the inject deck (an ARIA grid of cards laid out in responsive columns):
// one tab stop, arrow keys move through the cards in reading order, Up/Down move a visual
// row, Home/End (Ctrl+Home/End too) jump to the first/last card.

/** Index the key moves to, or undefined when the key is not a navigation key. */
export function nextDeckIndex(
  current: number,
  key: string,
  count: number,
  columns: number,
): number | undefined {
  if (count <= 0) return undefined
  const cols = Math.max(1, Math.floor(columns))
  const last = count - 1
  const clamp = (i: number) => Math.min(last, Math.max(0, i))
  switch (key) {
    case 'ArrowRight':
      return clamp(current + 1)
    case 'ArrowLeft':
      return clamp(current - 1)
    case 'ArrowDown':
      return current + cols <= last ? current + cols : current
    case 'ArrowUp':
      return current - cols >= 0 ? current - cols : current
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return undefined
  }
}

/** Number of columns a CSS grid currently lays out ("300px 300px 300px" → 3). */
export function gridColumns(el: Element | null): number {
  if (!el) return 1
  const tracks = getComputedStyle(el).gridTemplateColumns.trim()
  if (!tracks || tracks === 'none' || tracks.includes('repeat(')) return 1
  return Math.max(1, tracks.split(/\s+/).length)
}
