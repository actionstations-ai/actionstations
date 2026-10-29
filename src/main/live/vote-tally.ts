/**
 * Counting a vote (spec 0414 FR-6, FR-7). Pure: the session hands in the ballots it holds in
 * memory and gets back counts and, in a by-role vote, counts per role after k-anonymity folding.
 * A role with fewer than `k` devices in scope is shown as "other", so a reader of the display or
 * the log cannot tell how a small group voted.
 */

export interface Ballot {
  optionId: string
  /** Set only in a by-role vote. */
  roleId?: string
  at: number
  /** Sequence number of the frame the ballot came in, so a replayed older frame is ignored. */
  seq: number
  rationale?: string
}

export interface TallyOption {
  id: string
  label: string
}

export interface RoleCount {
  roleId: string
  optionId: string
  count: number
}

export interface TallyResult {
  /** Count per option id, in option order. */
  counts: { optionId: string; count: number }[]
  voted: number
  /** Present in a by-role vote; roles under `k` devices folded into `other`. */
  byRole?: RoleCount[]
}

export const OTHER_ROLE = 'other'

/** The role a ballot is shown under: its own, or `other` when too few devices hold it. */
export function foldedRole(
  roleId: string,
  devicesByRole: ReadonlyMap<string, number>,
  k: number,
): string {
  return (devicesByRole.get(roleId) ?? 0) >= k ? roleId : OTHER_ROLE
}

function countByOption(options: readonly TallyOption[], ballots: readonly Ballot[]) {
  const counts = new Map(options.map((o) => [o.id, 0]))
  for (const b of ballots) {
    if (counts.has(b.optionId)) counts.set(b.optionId, (counts.get(b.optionId) ?? 0) + 1)
  }
  return counts
}

function foldByRole(
  options: readonly TallyOption[],
  ballots: readonly Ballot[],
  devicesByRole: ReadonlyMap<string, number>,
  k: number,
): RoleCount[] {
  const cells = new Map<string, number>()
  for (const b of ballots) {
    if (!b.roleId) continue
    const role = foldedRole(b.roleId, devicesByRole, k)
    const key = `${role}\u0000${b.optionId}`
    cells.set(key, (cells.get(key) ?? 0) + 1)
  }
  const out: RoleCount[] = []
  for (const [key, count] of cells) {
    const [roleId = '', optionId = ''] = key.split('\u0000')
    if (options.some((o) => o.id === optionId)) out.push({ roleId, optionId, count })
  }
  return withoutLoneOther(out, devicesByRole, k)
}

/**
 * "Other" that stands for fewer than two devices would still point at one person, so it is left
 * out of the breakdown (its ballots stay in the totals).
 */
function withoutLoneOther(
  rows: RoleCount[],
  devicesByRole: ReadonlyMap<string, number>,
  k: number,
): RoleCount[] {
  let folded = 0
  for (const devices of devicesByRole.values()) if (devices < k) folded += devices
  return folded >= 2 ? rows : rows.filter((r) => r.roleId !== OTHER_ROLE)
}

export function tally(input: {
  options: readonly TallyOption[]
  ballots: readonly Ballot[]
  /** Devices in scope per role id (online now or having voted). Used in by-role votes only. */
  devicesByRole?: ReadonlyMap<string, number>
  k: number
  byRole: boolean
}): TallyResult {
  const counts = countByOption(input.options, input.ballots)
  const result: TallyResult = {
    counts: input.options.map((o) => ({ optionId: o.id, count: counts.get(o.id) ?? 0 })),
    voted: [...counts.values()].reduce((n, c) => n + c, 0),
  }
  if (input.byRole) {
    result.byRole = foldByRole(
      input.options,
      input.ballots,
      input.devicesByRole ?? new Map(),
      input.k,
    )
  }
  return result
}

/** "Shut down now (7 of 12), vote at 2:14": what Record as decision writes (spec 0414 FR-10). */
export function decisionText(
  options: readonly TallyOption[],
  counts: readonly { optionId: string; count: number }[],
  voted: number,
  at: string,
): string {
  const top = Math.max(0, ...counts.map((c) => c.count))
  if (voted === 0 || top === 0) return `No votes were cast, vote at ${at}`
  const leaders = counts
    .filter((c) => c.count === top)
    .map((c) => options.find((o) => o.id === c.optionId)?.label ?? c.optionId)
  if (leaders.length === 1) return `${leaders[0]} (${top} of ${voted}), vote at ${at}`
  return `Tied: ${leaders.join(' and ')} (${top} each of ${voted}), vote at ${at}`
}
