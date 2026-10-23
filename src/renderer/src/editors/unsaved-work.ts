// Registry of work that lives only in renderer memory (#196): inject drafts, edits parked while
// a job runs, and editors with edits not yet saved (debounce pending, save refused by a job or
// failed). Before the app quits, main sends app:quit-check; the renderer saves what it can, then
// answers with what is still unsaved and main asks the user to confirm.
import { useEffect } from 'react'
import { call, subscribe } from '../lib/api'
import { flushPendingSaves, usePendingSaves } from './docs/pending-saves'
import { useLatest } from './docs/use-latest'
import { useDrafts } from './inject/draft'

export interface UnsavedSource {
  /** What is unsaved right now ("MSEL", "Rubric"); [] when nothing is. */
  items: () => string[]
  /** Save what can be saved now. Whatever is still refused stays in items(). */
  flush?: () => Promise<unknown>
}

/** Longest the renderer spends saving before it answers main (main waits 3 s). */
export const FLUSH_BUDGET_MS = 2000
/** Lets React render the results of the saves (dirty flags) before items() are read. */
const SETTLE_MS = 50

const sources = new Set<UnsavedSource>()

export function registerUnsavedSource(source: UnsavedSource): () => void {
  sources.add(source)
  return () => {
    sources.delete(source)
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Unsaved inject drafts and edits parked after their editor closed. */
const storeSource: UnsavedSource = {
  items: () => {
    const drafts = Object.keys(useDrafts.getState().drafts).length
    const parked = Object.values(usePendingSaves.getState().entries).map(
      (e) => `${e.label} (waiting for generation to finish)`,
    )
    return [...(drafts ? [`${plural(drafts, 'unsaved inject draft')}`] : []), ...parked]
  },
  flush: () => flushPendingSaves(),
}
sources.add(storeSource)

/** Everything unsaved right now, without saving anything. */
export function unsavedItems(): string[] {
  return [...new Set([...sources].flatMap((s) => s.items()))]
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Save what can be saved (within the budget), then list what is still unsaved. */
export async function flushAndListUnsaved(budgetMs = FLUSH_BUDGET_MS): Promise<string[]> {
  const flushes = [...sources].map((s) => s.flush?.().catch(() => undefined))
  await Promise.race([Promise.all(flushes), delay(budgetMs)])
  await delay(SETTLE_MS)
  return unsavedItems()
}

/** Keep a mounted editor's unsaved state in the registry. */
export function useUnsavedSource(
  label: string,
  isUnsaved: () => boolean,
  flush?: () => Promise<unknown>,
): void {
  const ref = useLatest({ label, isUnsaved, flush })
  useEffect(
    () =>
      registerUnsavedSource({
        items: () => (ref.current.isUnsaved() ? [ref.current.label] : []),
        flush: () => ref.current.flush?.() ?? Promise.resolve(),
      }),
    [ref],
  )
}

/** Answer main's quit checks. Call once at startup; tells main the guard is listening. */
export function installQuitGuard(): () => void {
  const off = subscribe('app:quit-check', ({ requestId }) => {
    void flushAndListUnsaved()
      .then((items) => call('app:unsaved-report', { requestId, items }))
      .catch(() => undefined)
  })
  void call('app:unsaved-report', { items: [] }).catch(() => undefined)
  return off
}
