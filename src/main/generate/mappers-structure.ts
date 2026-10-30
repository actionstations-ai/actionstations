// Deterministic structural repairs of a generated MSEL (#174): exact-duplicate rows dropped,
// rows outside their phase window re-timed into it, a single ENDEX that closes the table, and
// the player roles capped at the audience list. Locked rows are never changed or dropped.
// Pure apart from mutating the scenario passed in; the engine logs what changed.
import {
  exerciseMinutes,
  formatExerciseTime,
  type MselRow,
  type Phase,
  type Role,
  type Scenario,
} from '@shared/schemas'
import type { DomainProfile } from '@shared/domains'
import type { RoleHeuristics } from './domain'
import { roleSeats } from './lint-audience'
import { normalizedEvent, sameInject } from './lint-structure'
import { buildGraph } from '@shared/branching/graph'
import { DEFAULT_START_WALL_CLOCK, wallClockAt } from './mappers'

export interface StructureRepair {
  /** Rows dropped as exact repeats of an earlier row. */
  duplicates: { rowId: string; of: string }[]
  /** Extra ENDEX rows dropped (one ENDEX closes the exercise). */
  extraEndex: string[]
  /** Rows whose time moved (outside their phase, or after ENDEX). */
  retimed: { rowId: string; from: string; to: string }[]
}

const CONTROL_TAGS = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])

/** Drop later rows that repeat an earlier one exactly (normalized text or the same quoted call). */
function dropDuplicates(s: Scenario): StructureRepair['duplicates'] {
  const out: StructureRepair['duplicates'] = []
  const kept: MselRow[] = []
  const drop = new Set<MselRow>()
  for (const row of s.msel) {
    if (CONTROL_TAGS.has(row.purposeTag) || !normalizedEvent(row.event)) {
      kept.push(row)
      continue
    }
    const earlier = kept.find((k) => !CONTROL_TAGS.has(k.purposeTag) && sameInject(k, row))
    if (!earlier || (row.locked && earlier.locked)) {
      kept.push(row)
      continue
    }
    // Keep the locked one; otherwise the earlier row stays.
    const loser = row.locked ? earlier : row
    const winner = loser === row ? earlier : row
    drop.add(loser)
    out.push({ rowId: loser.id, of: winner.id })
    if (loser === earlier) kept.splice(kept.indexOf(earlier), 1, row)
  }
  s.msel = s.msel.filter((r) => !drop.has(r))
  return out
}

/** One ENDEX closes the exercise: the last-phase (else latest) one is kept, unlocked extras go. */
function dropExtraEndex(s: Scenario): string[] {
  const ends = s.msel.filter((r) => r.purposeTag === 'ENDEX' && !r.branchId)
  if (ends.length < 2) return []
  const lastPhase = s.phases.at(-1)?.id
  const keep =
    ends.find((r) => r.locked) ??
    [...ends].reverse().find((r) => r.phaseId === lastPhase) ??
    ends.at(-1)!
  const extra = ends.filter((r) => r !== keep && !r.locked)
  s.msel = s.msel.filter((r) => !extra.includes(r))
  return extra.map((r) => r.id)
}

/** `count` minute marks spread evenly strictly inside (lo, hi], non-decreasing. */
function spread(lo: number, hi: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.min(hi, Math.max(lo, Math.round(lo + ((hi - lo) * (i + 1)) / (count + 1)))),
  )
}

/** Re-time the unlocked trunk rows of one phase that fall outside its window into it. */
function retimePhase(s: Scenario, phase: Phase, start: string): StructureRepair['retimed'] {
  const rows = s.msel.filter(
    (r) => r.phaseId === phase.id && r.purposeTag !== 'ENDEX' && !r.branchId,
  )
  return retimeWindow(rows, exerciseMinutes(phase.startTime), exerciseMinutes(phase.endTime), start)
}

/** Re-time the unlocked `rows` that fall outside [lo, hi] into it (hi may be Infinity). */
function retimeWindow(
  rows: MselRow[],
  lo: number,
  hi: number,
  start: string,
): StructureRepair['retimed'] {
  const at = (r: MselRow): number => exerciseMinutes(r.time)
  const inside = rows.filter((r) => at(r) >= lo && at(r) <= hi).map(at)
  const late = rows.filter((r) => !r.locked && at(r) > hi)
  const early = rows.filter((r) => !r.locked && at(r) < lo)
  const out: StructureRepair['retimed'] = []
  const move = (r: MselRow, minutes: number): void => {
    const to = formatExerciseTime(minutes)
    if (to === r.time) return
    out.push({ rowId: r.id, from: r.time, to })
    r.time = to
    r.wallClock = wallClockAt(start, to)
  }
  const lastInside = inside.length ? Math.max(...inside) : lo
  spread(lastInside, hi, late.length).forEach((m, i) => move(late[i]!, m))
  const firstInside = inside.length
    ? Math.min(...inside)
    : Number.isFinite(hi)
      ? hi
      : lo + 10 * early.length
  spread(lo, firstInside, early.length).forEach((m, i) => move(early[i]!, m))
  return out
}

/**
 * ENDEX is the last row: an unlocked ENDEX moves to the latest row of its phase; behind a
 * locked ENDEX, the later unlocked rows move to its time.
 */
function endexLast(rows: MselRow[], start: string): StructureRepair['retimed'] {
  const end = rows.find((r) => r.purposeTag === 'ENDEX')
  if (!end) return []
  const endAt = exerciseMinutes(end.time)
  const later = rows.filter((r) => r !== end && exerciseMinutes(r.time) > endAt)
  if (!later.length) return []
  const out: StructureRepair['retimed'] = []
  const move = (r: MselRow, minutes: number): void => {
    const to = formatExerciseTime(minutes)
    out.push({ rowId: r.id, from: r.time, to })
    r.time = to
    r.wallClock = wallClockAt(start, to)
  }
  if (!end.locked) move(end, Math.max(...later.map((r) => exerciseMinutes(r.time))))
  else for (const r of later) if (!r.locked) move(r, endAt)
  return out
}

/**
 * A branch's rows play between its decision row and the row where it rejoins (#430): rows
 * outside that window are re-timed into it, and a branch that ends the exercise keeps its ENDEX
 * row last. A branch with no window to repair (decision or rejoin row missing) is left alone.
 */
function repairBranchWindows(s: Scenario, start: string): StructureRepair['retimed'] {
  if (!s.branches?.length) return []
  const graph = buildGraph(s)
  const out: StructureRepair['retimed'] = []
  for (const node of graph.branches.values()) {
    const decisionRow = graph.decisions.get(node.branch.decisionId)?.row
    if (!decisionRow) continue
    const rejoin = s.msel.find((r) => r.id === node.branch.rejoinRowId)
    const lo = exerciseMinutes(decisionRow.time)
    const hi = rejoin ? exerciseMinutes(rejoin.time) : Infinity
    const rows = node.rows.filter((r) => r.purposeTag !== 'ENDEX')
    out.push(...retimeWindow(rows, lo, hi, start))
    out.push(...endexLast(node.rows, start))
  }
  return out
}

const TIE_RANK: Partial<Record<MselRow['purposeTag'], number>> = {
  STARTEX: 0,
  TIME_JUMP: 1,
  ENDEX: 3,
}
const rank = (r: MselRow): number => TIE_RANK[r.purposeTag] ?? 2

/** Phase order, then time; on equal times STARTEX and TIME_JUMP open and ENDEX closes. */
export function sortMsel(s: Scenario): void {
  const phaseAt = new Map(s.phases.map((p) => [p.id, p.index]))
  const idx = (r: MselRow): number => phaseAt.get(r.phaseId) ?? Number.MAX_SAFE_INTEGER
  s.msel = s.msel
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        idx(a.r) - idx(b.r) ||
        exerciseMinutes(a.r.time) - exerciseMinutes(b.r.time) ||
        rank(a.r) - rank(b.r) ||
        a.i - b.i,
    )
    .map((x) => x.r)
}

/** Every deterministic structural repair, in order; returns what changed. */
export function repairStructure(s: Scenario): StructureRepair {
  const start = s.brief.startWallClock ?? DEFAULT_START_WALL_CLOCK
  const duplicates = dropDuplicates(s)
  const extraEndex = dropExtraEndex(s)
  const retimed = s.phases.flatMap((p) => retimePhase(s, p, start))
  retimed.push(...repairBranchWindows(s, start))
  sortMsel(s)
  retimed.push(
    ...endexLast(
      s.msel.filter((r) => !r.branchId),
      start,
    ),
  )
  sortMsel(s)
  return { duplicates, extraEndex, retimed }
}

/**
 * At most `cap` player roles (#174: nine roles for a six-entry audience). A role that plays
 * an audience entry is kept first (#364: the audience list is the role list), then the
 * operational, technical, public-information and security roles, then the others in the
 * model's order; the kept roles keep that order. Returns the dropped roles.
 */
export function capRoles(
  s: Scenario,
  cap: number,
  heur: RoleHeuristics,
  profile?: DomainProfile,
): Role[] {
  if (cap < 2 || s.roles.length <= cap) return []
  const text = (r: Role): string => `${r.id} ${r.abbreviation} ${r.name}`
  const seated = (s.brief?.audience ?? [])
    .map((entry) => s.roles.find((r) => roleSeats(entry, r, heur, profile)))
    .filter((r): r is Role => !!r)
  const core = [heur.operations, heur.technical, heur.public, heur.security]
    .map((re) => s.roles.find((r) => re.test(text(r))))
    .filter((r): r is Role => !!r)
  const priority = [...new Set([...seated, ...core, ...s.roles])]
  const keep = new Set(priority.slice(0, cap))
  const dropped = s.roles.filter((r) => !keep.has(r))
  s.roles = s.roles.filter((r) => keep.has(r))
  return dropped
}

/**
 * Last resort for rows still written in a player's voice after the revision rounds (#164):
 * the row becomes a facilitator prompt that asks for the call, and the player's words move
 * to the expected action (as sources.ts does for a row sourced from a player role).
 */
export function convertToFacilitatorPrompt(s: Scenario, rowIds: Set<string>): string[] {
  const converted: string[] = []
  for (const row of s.msel) {
    if (!rowIds.has(row.id) || row.locked) continue
    const who = row.toLabel && row.toLabel !== 'All' ? row.toLabel : 'the players'
    row.expectedAction = `${row.event.trim()} ${row.expectedAction.trim()}`.trim()
    row.event = `Facilitator prompt to ${who}: the situation now demands a call. What is your call, who signs off, and who must be told?`
    row.from = 'Facilitator'
    converted.push(row.id)
  }
  return converted
}
