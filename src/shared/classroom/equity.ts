// Participation equity (#736, spec 0453 FR-13c). Each student's share of a count (decisions,
// messages, hot wash contributions) against an even share. An instructor aid: nothing here is a
// grade unless the instructor links it to a criterion.

export interface ParticipationRow {
  studentId: string
  count: number
  /** Share of the total, 0 to 1. */
  share: number
  /** The even share, 1 / students. */
  evenShare: number
  /** share / evenShare; 1 is an even share. */
  ratio: number
  belowHalf: boolean
}

export interface Participation {
  total: number
  rows: ParticipationRow[]
  belowHalfCount: number
  /** Null when there is nothing to compare. */
  caveat: string | null
}

export function participation(
  studentIds: readonly string[],
  counts: ReadonlyMap<string, number>,
): Participation {
  const total = studentIds.reduce((s, id) => s + (counts.get(id) ?? 0), 0)
  const even = studentIds.length ? 1 / studentIds.length : 0
  const rows = studentIds.map((studentId) => {
    const count = counts.get(studentId) ?? 0
    const share = total ? count / total : 0
    const ratio = even && total ? share / even : 0
    return { studentId, count, share, evenShare: even, ratio, belowHalf: total > 0 && ratio < 0.5 }
  })
  return {
    total,
    rows,
    belowHalfCount: rows.filter((r) => r.belowHalf).length,
    caveat: total < 10 ? 'Fewer than 10 contributions: shares are unstable.' : null,
  }
}
