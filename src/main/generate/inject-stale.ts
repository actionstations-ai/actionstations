// Inject staleness (#207): an inject is written from its MSEL row, so when a pipeline step
// (msel_phase, phase_plan, critique) or the MSEL repair changes the row's event, expected
// action or format, or removes the row, the inject's inject_text and media_render runs stop
// being ok. "Write all injects" then offers the row again and the stage timeline shows the
// stale runs. Pure: mutates the scenario's provenance only.
import type { MselRow, Scenario } from '@shared/schemas'

/** What the inject text is written from; any change makes the inject out of date. */
const rowText = (r: MselRow): string => JSON.stringify([r.event, r.expectedAction, r.format])

const INJECT_STAGES = new Set(['inject_text', 'media_render'])

export interface StaleInject {
  rowId: string
  injectId: string
  /** The row is gone: its inject is an orphan the deck and the export leave out. */
  removed: boolean
}

/** Injects whose rows changed or went away between `before` and `after`. */
export function changedInjects(before: MselRow[], after: MselRow[]): StaleInject[] {
  const now = new Map(after.map((r) => [r.id, r]))
  return before.flatMap((old): StaleInject[] => {
    if (!old.injectId) return []
    const row = now.get(old.id)
    if (!row) return [{ rowId: old.id, injectId: old.injectId, removed: true }]
    if (rowText(row) === rowText(old)) return []
    return [{ rowId: old.id, injectId: row.injectId ?? old.injectId, removed: false }]
  })
}

/**
 * Mark the ok inject_text / media_render runs of the injects whose rows changed (or were
 * removed) between `before` and `s` stale. Returns the injects that had a run marked.
 */
export function markInjectsStale(before: MselRow[], s: Scenario): StaleInject[] {
  const changed = changedInjects(before, s.msel)
  const ids = new Set(changed.map((c) => c.injectId))
  const marked = new Set<string>()
  for (const run of s.provenance) {
    if (!INJECT_STAGES.has(run.stage) || !run.itemId || !ids.has(run.itemId)) continue
    if (run.status !== 'ok') continue
    run.status = 'stale'
    marked.add(run.itemId)
  }
  return changed.filter((c) => marked.has(c.injectId))
}

/** One log line for the marked injects, or undefined when nothing was marked. */
export function describeStaleInjects(stale: StaleInject[]): string | undefined {
  if (!stale.length) return undefined
  const changed = stale.filter((x) => !x.removed).map((x) => x.rowId)
  const removed = stale.filter((x) => x.removed).map((x) => x.rowId)
  const parts = [
    changed.length ? `rows ${changed.join(', ')} changed` : '',
    removed.length ? `rows ${removed.join(', ')} removed` : '',
  ].filter(Boolean)
  return `Injects marked stale (${parts.join('; ')}): write them again from the Injects tab`
}
