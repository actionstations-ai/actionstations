// Pure MSEL editing model: the draft the grid edits, ordering, retiming and row operations.
// No React and no I/O, so every rule here is unit-tested in model.test.ts.
import { exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import type { MselRow, Phase, Scenario } from '@shared/schemas/scenario'

/** A row plus a stable key: MSEL ids are user-editable and may be duplicated mid-edit. */
export interface DraftRow {
  key: string
  row: MselRow
}

export interface Draft {
  phases: Phase[]
  rows: DraftRow[]
}

let keySeq = 0
export const newRowKey = (): string => `r${++keySeq}`

export const PHASE_LINE_PREFIX = 'phase:'
export const phaseLineKey = (phaseId: string): string => `${PHASE_LINE_PREFIX}${phaseId}`

/** Draft from a scenario, reusing keys of rows that keep their id (focus survives refreshes). */
export function draftFromScenario(s: Pick<Scenario, 'phases' | 'msel'>, prev?: Draft): Draft {
  const pool = new Map<string, string[]>()
  for (const r of prev?.rows ?? []) pool.set(r.row.id, [...(pool.get(r.row.id) ?? []), r.key])
  const rows = s.msel.map((row) => ({ key: pool.get(row.id)?.shift() ?? newRowKey(), row }))
  return { phases: [...s.phases].sort((a, b) => a.index - b.index), rows }
}

export const draftMsel = (d: Draft): MselRow[] => d.rows.map((r) => r.row)

const phaseOrder = (phases: Phase[]): Map<string, number> =>
  new Map(phases.map((p) => [p.id, p.index]))

/** Stable sort: phase order first (orphans last), then exercise time. */
export function sortRows(phases: Phase[], rows: DraftRow[]): DraftRow[] {
  const order = phaseOrder(phases)
  const rank = (r: DraftRow) => order.get(r.row.phaseId) ?? Number.MAX_SAFE_INTEGER
  return rows
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        rank(a.r) - rank(b.r) ||
        exerciseMinutes(a.r.row.time) - exerciseMinutes(b.r.row.time) ||
        a.i - b.i,
    )
    .map((x) => x.r)
}

export interface DraftGroup {
  phase: Phase | null
  rows: DraftRow[]
}

export function groupDraft(d: Draft): DraftGroup[] {
  const groups: DraftGroup[] = d.phases.map((phase) => ({
    phase,
    rows: d.rows.filter((r) => r.row.phaseId === phase.id),
  }))
  const known = new Set(d.phases.map((p) => p.id))
  const orphans = d.rows.filter((r) => !known.has(r.row.phaseId))
  if (orphans.length) groups.push({ phase: null, rows: orphans })
  return groups
}

// ---- Time ----------------------------------------------------------------------------

/** "1:15" or bare minutes ("75") → minutes; null when not a valid exercise time. */
export function parseExerciseTime(input: string): number | null {
  const v = input.trim()
  if (/^\d{1,3}$/.test(v)) return Number(v)
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Message when the time falls outside its phase window (inclusive, as lint does). */
export function phaseWindowWarning(row: MselRow, phases: Phase[]): string | null {
  const phase = phases.find((p) => p.id === row.phaseId)
  if (!phase) return 'This row belongs to no phase'
  const t = exerciseMinutes(row.time)
  if (t < exerciseMinutes(phase.startTime) || t > exerciseMinutes(phase.endTime))
    return `${row.time} is outside Phase ${phase.index + 1} (${phase.startTime}–${phase.endTime})`
  return null
}

function shiftWallClock(wall: string | undefined, delta: number): string | undefined {
  if (!wall) return wall
  const [h, m] = wall.split(':').map(Number)
  const total = ((((h ?? 0) * 60 + (m ?? 0) + delta) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Set a row's exercise time; its wall clock (if any) moves by the same amount. */
export function retime(row: MselRow, minutes: number): MselRow {
  const next = Math.max(0, Math.round(minutes))
  const delta = next - exerciseMinutes(row.time)
  const wallClock = shiftWallClock(row.wallClock, delta)
  return { ...row, time: formatExerciseTime(next), ...(wallClock ? { wallClock } : {}) }
}

export function roundTo(minutes: number, step: number): number {
  return step > 1 ? Math.round(minutes / step) * step : Math.round(minutes)
}

// ---- Row edits ------------------------------------------------------------------------

export function updateRow(d: Draft, key: string, patch: (row: MselRow) => MselRow): Draft {
  const rows = d.rows.map((r) => (r.key === key ? { ...r, row: patch(r.row) } : r))
  return { ...d, rows: sortRows(d.phases, rows) }
}

export function updatePhaseGoal(d: Draft, phaseId: string, goal: string): Draft {
  return { ...d, phases: d.phases.map((p) => (p.id === phaseId ? { ...p, goal } : p)) }
}

const ID_RE = /^I-(\d+)([a-z]*)$/i

/** Next unused id for a row inserted after `anchor`: "I-07" → "I-07b", "I-07b" → "I-07c". */
export function insertedId(anchor: MselRow | undefined, taken: Set<string>): string {
  const m = anchor ? ID_RE.exec(anchor.id) : null
  if (m) {
    for (let c = 'b'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
      const id = `I-${m[1]}${String.fromCharCode(c)}`
      if (!taken.has(id)) return id
    }
  }
  const max = Math.max(0, ...[...taken].map((id) => Number(ID_RE.exec(id)?.[1] ?? 0)))
  return `I-${String(max + 1).padStart(2, '0')}`
}

const takenIds = (d: Draft): Set<string> => new Set(d.rows.map((r) => r.row.id))

export interface Inserted {
  draft: Draft
  key: string
}

function insertAfter(d: Draft, anchorKey: string | null, row: MselRow): Inserted {
  const key = newRowKey()
  const at = d.rows.findIndex((r) => r.key === anchorKey)
  const rows = [...d.rows]
  rows.splice(at < 0 ? rows.length : at + 1, 0, { key, row })
  return { draft: { ...d, rows: sortRows(d.phases, rows) }, key }
}

/** New CORE_NARRATIVE row 5 minutes after the anchor, in the anchor's phase. */
export function addRowAfter(d: Draft, anchorKey: string | null, phaseId?: string): Inserted {
  const anchor = d.rows.find((r) => r.key === anchorKey)?.row
  const phase = d.phases.find((p) => p.id === (anchor?.phaseId ?? phaseId)) ?? d.phases[0]
  const base = anchor
    ? exerciseMinutes(anchor.time) + 5
    : exerciseMinutes(phase?.startTime ?? '0:00')
  const row: MselRow = {
    id: insertedId(anchor, takenIds(d)),
    phaseId: phase?.id ?? anchor?.phaseId ?? 'p1',
    time: formatExerciseTime(base),
    ...(anchor?.wallClock ? { wallClock: shiftWallClock(anchor.wallClock, 5)! } : {}),
    from: '',
    toRoleIds: [],
    event: '',
    expectedAction: '',
    purposeTag: 'CORE_NARRATIVE',
    citations: [],
    locked: false,
  }
  return insertAfter(d, anchor ? anchorKey : lastKeyOfPhase(d, row.phaseId), row)
}

function lastKeyOfPhase(d: Draft, phaseId: string): string | null {
  return d.rows.filter((r) => r.row.phaseId === phaseId).at(-1)?.key ?? null
}

/** Copy of a row right after it; the copy is unlocked and not linked to the inject. */
export function duplicateRow(d: Draft, key: string): Inserted | null {
  const src = d.rows.find((r) => r.key === key)?.row
  if (!src) return null
  const { injectId: _unlinked, ...rest } = src
  return insertAfter(d, key, { ...rest, id: insertedId(src, takenIds(d)), locked: false })
}

export function deleteRows(d: Draft, keys: Set<string>): Draft {
  return { ...d, rows: d.rows.filter((r) => !keys.has(r.key)) }
}

export function moveToPhase(d: Draft, keys: Set<string>, phaseId: string): Draft {
  const rows = d.rows.map((r) => (keys.has(r.key) ? { ...r, row: { ...r.row, phaseId } } : r))
  return { ...d, rows: sortRows(d.phases, rows) }
}

/** Shift every selected row by `delta` minutes (never below 0:00), then re-sort. */
export function shiftTimes(d: Draft, keys: Set<string>, delta: number): Draft {
  const rows = d.rows.map((r) =>
    keys.has(r.key) ? { ...r, row: retime(r.row, exerciseMinutes(r.row.time) + delta) } : r,
  )
  return { ...d, rows: sortRows(d.phases, rows) }
}

/** Row keys between two keys (inclusive) in display order, for shift-click selection. */
export function keyRange(d: Draft, a: string, b: string): string[] {
  const keys = d.rows.map((r) => r.key)
  const [i, j] = [keys.indexOf(a), keys.indexOf(b)].sort((x, y) => x - y)
  return i! < 0 ? [b] : keys.slice(i, j! + 1)
}
