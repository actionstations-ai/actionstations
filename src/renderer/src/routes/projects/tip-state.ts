// Which tip of the day to show (#443). Pure helpers plus the session state: the tip shown this
// launch and whether the card was hidden, kept outside the page so leaving Projects and coming
// back shows the same tip (and keeps a hidden card hidden) until the next launch.
import { create } from 'zustand'

/** The position to show: the stored index, or 0 when tips were removed and it is out of range. */
export function wrapIndex(nextIndex: number, length: number): number {
  if (length <= 0) return 0
  return Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < length ? nextIndex : 0
}

/** The position after `index`, wrapping at the end of the list. */
export function advance(index: number, length: number): number {
  return length <= 0 ? 0 : (wrapIndex(index, length) + 1) % length
}

/** The tip at the stored position, or null when there are none. */
export function currentTip<T>(tips: readonly T[], nextIndex: number): T | null {
  return tips[wrapIndex(nextIndex, tips.length)] ?? null
}

interface TipSession {
  /** The position shown this launch; null until the Projects screen first renders a tip. */
  index: number | null
  hidden: boolean
  show: (index: number) => void
  hide: () => void
}

export const useTipSession = create<TipSession>((set) => ({
  index: null,
  hidden: false,
  show: (index) => set({ index }),
  hide: () => set({ hidden: true }),
}))

/** Tests only. */
export function resetTipSession(): void {
  useTipSession.setState({ index: null, hidden: false })
}
