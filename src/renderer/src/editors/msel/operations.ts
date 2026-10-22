// Larger MSEL operations: drag-to-retime, ID renumbering and facilitator control cards.
import { exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import {
  PHASE_LINE_PREFIX,
  newRowKey,
  retime,
  roundTo,
  sortRows,
  type Draft,
  type DraftRow,
  type Inserted,
} from './model'

// ---- Drag and drop ---------------------------------------------------------------------

/** Display lines: one per phase header followed by its rows. Drag-and-drop works on these. */
export function lineKeys(d: Draft): string[] {
  const out: string[] = []
  for (const p of d.phases) {
    out.push(`${PHASE_LINE_PREFIX}${p.id}`)
    for (const r of d.rows) if (r.row.phaseId === p.id) out.push(r.key)
  }
  const known = new Set(d.phases.map((p) => p.id))
  for (const r of d.rows) if (!known.has(r.row.phaseId)) out.push(r.key)
  return out
}

/** Midpoint of the neighbours, snapped to `step` minutes but never past either neighbour. */
export function dropTime(lower: number, upper: number, step: number): number {
  const [lo, hi] = lower <= upper ? [lower, upper] : [upper, lower]
  const snapped = roundTo((lo + hi) / 2, step)
  return Math.min(hi, Math.max(lo, snapped))
}

interface DropTarget {
  phase: Phase
  prev?: MselRow
  next?: MselRow
}

function dropTarget(d: Draft, order: string[], movedKey: string): DropTarget | null {
  const byKey = new Map(d.rows.map((r) => [r.key, r.row]))
  const at = order.indexOf(movedKey)
  let phase: Phase | undefined
  let prev: MselRow | undefined
  for (let i = at - 1; i >= 0 && !phase; i--) {
    const k = order[i]!
    if (k.startsWith(PHASE_LINE_PREFIX))
      phase = d.phases.find((p) => `${PHASE_LINE_PREFIX}${p.id}` === k)
    else prev ??= byKey.get(k)
  }
  phase ??= d.phases[0]
  if (!phase) return null
  let next: MselRow | undefined
  for (let i = at + 1; i < order.length && !next; i++) {
    const k = order[i]!
    if (k.startsWith(PHASE_LINE_PREFIX)) break
    next = byKey.get(k)
  }
  return { phase, ...(prev ? { prev } : {}), ...(next ? { next } : {}) }
}

/**
 * Apply a drop: `order` is the line order after the move. The row joins the phase whose
 * header is above it and takes the midpoint time of its new neighbours (phase bounds when it
 * lands first or last), rounded to `step` minutes; rows are then re-sorted.
 */
export function applyDrop(d: Draft, order: string[], movedKey: string, step = 5): Draft {
  const target = dropTarget(d, order, movedKey)
  const moved = d.rows.find((r) => r.key === movedKey)
  if (!target || !moved) return d
  const { phase, prev, next } = target
  const lower = prev ? exerciseMinutes(prev.time) : exerciseMinutes(phase.startTime)
  const upper = next ? exerciseMinutes(next.time) : exerciseMinutes(phase.endTime)
  const time = !prev && !next ? exerciseMinutes(phase.startTime) : dropTime(lower, upper, step)
  const updated: DraftRow = {
    key: movedKey,
    row: { ...retime(moved.row, time), phaseId: phase.id },
  }
  const byKey = new Map(d.rows.map((r) => [r.key, r]))
  byKey.set(movedKey, updated)
  const rows = order.flatMap((k) => byKey.get(k) ?? [])
  return { ...d, rows: sortRows(d.phases, rows) }
}

// ---- Renumbering ------------------------------------------------------------------------

const NUMBERED = /^I-(\d+)([a-z]*)$/i

export interface Rename {
  key: string
  from: string
  to: string
}

/**
 * Renumber "I-NN" rows in display order: I-01, I-02, … Suffixed rows ("I-07b") stay attached
 * to their base row's new number (or the nearest preceding base row when the base is gone).
 * Other ids (START, END, custom) are left alone. Returns only the rows whose id changes.
 */
export function renumberPreview(d: Draft): Rename[] {
  const numbered = d.rows.filter((r) => NUMBERED.test(r.row.id))
  const baseNew = new Map<string, string>()
  let n = 0
  for (const r of numbered) {
    const [, num, suffix] = NUMBERED.exec(r.row.id)!
    if (!suffix) baseNew.set(String(Number(num)), String(++n).padStart(2, '0'))
  }
  const used = new Set(d.rows.filter((r) => !NUMBERED.test(r.row.id)).map((r) => r.row.id))
  const out: Rename[] = []
  let current = '00'
  let next = 0
  for (const r of numbered) {
    const [, num, rawSuffix] = NUMBERED.exec(r.row.id)!
    const suffix = rawSuffix!.toLowerCase()
    if (!suffix) current = String(++next).padStart(2, '0')
    const base = suffix ? (baseNew.get(String(Number(num))) ?? current) : current
    const to = uniqueId(`I-${base}`, suffix, used)
    used.add(to)
    if (to !== r.row.id) out.push({ key: r.key, from: r.row.id, to })
  }
  return out
}

function uniqueId(base: string, suffix: string, used: Set<string>): string {
  if (!used.has(base + suffix)) return base + suffix
  for (let c = Math.max('b'.charCodeAt(0), suffix.charCodeAt(0) || 0); c <= 122; c++) {
    const id = base + String.fromCharCode(c)
    if (!used.has(id)) return id
  }
  return `${base}${suffix}-${used.size}`
}

export function applyRenames(d: Draft, renames: Rename[]): Draft {
  const to = new Map(renames.map((r) => [r.key, r.to]))
  return {
    ...d,
    rows: d.rows.map((r) => (to.has(r.key) ? { ...r, row: { ...r.row, id: to.get(r.key)! } } : r)),
  }
}

// ---- Control cards -----------------------------------------------------------------------

export type ControlCard = 'STARTEX' | 'TIME_JUMP' | 'ENDEX'

const controlBase = (phase: Phase, time: number) => ({
  phaseId: phase.id,
  time: formatExerciseTime(time),
  from: 'Facilitator',
  toRoleIds: [],
  toLabel: 'All',
  citations: [],
  locked: false,
})

function insertSorted(d: Draft, row: MselRow, first: boolean): Inserted {
  const key = newRowKey()
  const rows = first ? [{ key, row }, ...d.rows] : [...d.rows, { key, row }]
  return { draft: { ...d, rows: sortRows(d.phases, rows) }, key }
}

/** STARTEX at the start of the first phase, ahead of anything else at 0:00. */
export function insertStartex(d: Draft, startWallClock?: string): Inserted | null {
  const phase = d.phases[0]
  if (!phase) return null
  const wall = startWallClock ?? d.rows[0]?.row.wallClock
  return insertSorted(
    d,
    {
      ...controlBase(phase, exerciseMinutes(phase.startTime)),
      id: d.rows.some((r) => r.row.id === 'START') ? 'START-2' : 'START',
      ...(wall ? { wallClock: wall } : {}),
      event: 'STARTEX (Start Exercise). Read the opening situation to all players.',
      expectedAction: 'Establish baseline operations.',
      purposeTag: 'STARTEX',
      format: 'startex_card',
    },
    true,
  )
}

/** ENDEX five minutes after the last row (capped at the last phase's end). */
export function insertEndex(d: Draft): Inserted | null {
  const phase = d.phases.at(-1)
  if (!phase) return null
  const last = d.rows.filter((r) => r.row.phaseId === phase.id).at(-1)?.row
  const end = exerciseMinutes(phase.endTime)
  const time = last ? Math.min(end, exerciseMinutes(last.time) + 5) : end
  const row: MselRow = {
    ...controlBase(phase, time),
    id: d.rows.some((r) => r.row.id === 'END') ? 'END-2' : 'END',
    event: 'ENDEX (End Exercise). Stop play and move to the hot wash.',
    expectedAction: 'Players stop; facilitators open the hot wash.',
    purposeTag: 'ENDEX',
    format: 'endex_card',
  }
  return insertSorted(d, last?.wallClock ? retimeWall(row, last, time) : row, false)
}

function retimeWall(row: MselRow, ref: MselRow, time: number): MselRow {
  return retime({ ...row, time: ref.time, wallClock: ref.wallClock! }, time)
}

export interface TimeJumpInput {
  phaseId: string
  /** Exercise time of the card, "H:MM". */
  time: string
  /** New narrative wall-clock time, "HH:MM". */
  wallClock: string
  narration: string
}

/** "10:00" → "10:00 AM" for the card text. */
export function twelveHour(wall: string): string {
  const [h = 0, m = 0] = wall.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function nextTimeJumpId(d: Draft): string {
  const ids = new Set(d.rows.map((r) => r.row.id))
  let n = 1
  while (ids.has(`TJ-${n}`)) n++
  return `TJ-${n}`
}

/** TIME_JUMP card first in its slot: rows after it in the phase keep their own times. */
export function insertTimeJump(d: Draft, input: TimeJumpInput): Inserted | null {
  const phase = d.phases.find((p) => p.id === input.phaseId)
  const minutes = exerciseMinutes(input.time)
  if (!phase) return null
  const narration = input.narration.trim()
  return insertSorted(
    d,
    {
      ...controlBase(phase, minutes),
      id: nextTimeJumpId(d),
      wallClock: input.wallClock,
      event: `SCENARIO JUMP: It is now ${twelveHour(input.wallClock)}.${narration ? ` ${narration}` : ''}`,
      expectedAction: 'Players update their situation picture for the new time.',
      purposeTag: 'TIME_JUMP',
      format: 'time_jump_card',
    },
    true,
  )
}
