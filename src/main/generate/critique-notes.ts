// Critique notes that went stale (#342). The review pass (critique) stores notes that quote
// the row they cite. When that row, or the inject written from it, changes after the review
// ran, the note may quote text that is gone: it is marked `stale` and the Warnings tab shows
// it apart from the live notes. Evidence, in order:
//   - the note's basis (written with the note): a fingerprint of the row's text then;
//   - a `before` copy of the MSEL (the stored scenario a save replaces, the rows a repair
//     started from) for notes written before the basis existed;
//   - the inject's versions: a content change recorded after the review ran.
// Pure: mutates the scenario's warnings only.
import { createHash } from 'node:crypto'
import type { Inject, LintWarning, MselRow, Scenario } from '@shared/schemas'

export const CRITIQUE = 'CRITIQUE'

/** What a critique note reads in a row: its text, not its time or its inject link. */
export function rowFingerprint(r: MselRow): string {
  const text = JSON.stringify([
    r.from,
    r.toLabel ?? '',
    r.toRoleIds,
    r.event,
    r.expectedAction,
    r.purposeTag,
    r.citations,
  ])
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** The note with its basis: the time and the cited row's fingerprint now. */
export function withBasis(note: LintWarning, s: Scenario, at: string): LintWarning {
  const row = note.rowId ? s.msel.find((r) => r.id === note.rowId) : undefined
  return { ...note, basis: { at, ...(row ? { row: rowFingerprint(row) } : {}) } }
}

/** When the last critique run finished (the time of notes written before #342). */
export function critiqueFinishedAt(s: Scenario): string | undefined {
  return s.provenance.find((r) => r.stage === 'critique' && !r.itemId && r.status === 'ok')
    ?.finishedAt
}

const snapshotKey = (v: Inject['versions'][number]): string =>
  JSON.stringify([
    v.snapshot.title,
    v.snapshot.type,
    v.snapshot.fields,
    v.snapshot.deliveryMode,
    v.snapshot.instructorNote ?? '',
  ])

/**
 * True when a version recorded after `at` changed the inject's content. The first version is
 * the inject's creation, not a change: an inject written after the review is not "changed".
 */
export function injectChangedSince(inject: Inject, at: string): boolean {
  const v = inject.versions
  return v.some((x, i) => i > 0 && x.at > at && snapshotKey(x) !== snapshotKey(v[i - 1]!))
}

export interface StaleEvidence {
  /** Injects of the scenario (or the ones just saved). */
  injects?: Inject[]
  /** The MSEL before the change being recorded (for notes without a basis). */
  before?: MselRow[]
}

const isNote = (w: LintWarning): boolean => w.source === 'critique' && !!w.rowId

function rowChanged(note: LintWarning, row: MselRow, before: Map<string, MselRow>): boolean {
  if (note.basis?.row) return rowFingerprint(row) !== note.basis.row
  const was = before.get(row.id)
  return !!was && rowFingerprint(was) !== rowFingerprint(row)
}

/**
 * Mark the critique notes whose row or inject changed after the review ran. A stale note stays
 * stale. Returns the row ids of the notes marked by this call.
 */
export function markStaleCritique(s: Scenario, evidence: StaleEvidence = {}): string[] {
  const rows = new Map(s.msel.map((r) => [r.id, r]))
  const before = new Map((evidence.before ?? []).map((r) => [r.id, r]))
  const injects = evidence.injects ?? []
  const fallbackAt = critiqueFinishedAt(s)
  const marked: string[] = []
  for (const note of s.warnings) {
    if (!isNote(note) || note.stale) continue
    const row = rows.get(note.rowId!)
    if (!row) continue
    const at = note.basis?.at ?? fallbackAt
    const inject = injects.find((i) => i.id === row.injectId || i.mselRowId === row.id)
    const changed =
      rowChanged(note, row, before) || (!!at && !!inject && injectChangedSince(inject, at))
    if (!changed) continue
    note.stale = true
    marked.push(row.id)
  }
  return marked
}
