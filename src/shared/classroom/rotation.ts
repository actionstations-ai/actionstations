// Role rotation (#730, spec 0453 FR-7). A simple assignment algorithm with two rules:
//   1. every role is covered in each session;
//   2. a student does not repeat a role until they have played every role.
// Each session is a bipartite matching of roles to distinct students among those still allowed to
// play the role (Kuhn's augmenting paths); students left over take the allowed role with the
// fewest players this session. Candidates are tried in a rotating order so a full rotation comes
// out as a Latin square. Hand edits are respected: pass them as `locked` and they are kept.
// Impossible constraints are reported, not hidden.

export interface RotationInput {
  students: string[]
  roles: string[]
  sessions: number
  /** Roles each student has already played in earlier sessions, in order. */
  history?: Record<string, string[]>
  /** Session index -> student -> role, kept as given. */
  locked?: Record<number, Record<string, string>>
}

export interface RotationResult {
  sessions: Array<{ index: number; assignments: Record<string, string> }>
  problems: string[]
}

function playCounts(roles: string[], played: string[]): Map<string, number> {
  const counts = new Map(roles.map((r) => [r, 0]))
  for (const r of played) if (counts.has(r)) counts.set(r, counts.get(r)! + 1)
  return counts
}

/** Roles a student may play next: those they have played the fewest times. */
function allowedRoles(roles: string[], played: string[]): string[] {
  const counts = playCounts(roles, played)
  const min = Math.min(...counts.values())
  return roles.filter((r) => counts.get(r) === min)
}

function matchRoles(
  roles: string[],
  students: string[],
  allowed: Map<string, string[]>,
  offset: number,
): Map<string, string> {
  const owner = new Map<string, string>() // student -> role
  const order = students.map((_, i) => students[(i + offset) % students.length]!)
  const tryRole = (role: string, seen: Set<string>): boolean => {
    for (const s of order) {
      if (seen.has(s) || !allowed.get(s)!.includes(role)) continue
      seen.add(s)
      const current = owner.get(s)
      // If s already holds a role, that role must move to another student first.
      if (current === undefined || tryRole(current, seen)) {
        owner.set(s, role)
        return true
      }
    }
    return false
  }
  for (const role of roles) tryRole(role, new Set())
  return owner
}

/**
 * Seat the students the role matching left over. Roles are capped at an even load and students
 * already seated may move to make room (augmenting paths), so a late session is not painted into
 * a corner by an early greedy choice. Students that still cannot be seated take their least
 * loaded allowed role.
 */
function placeExtras(
  out: Record<string, string>,
  free: string[],
  allowed: Map<string, string[]>,
  roles: string[],
  offset: number,
  totals: Map<string, number>,
): void {
  const total = Object.keys(out).length + free.filter((s) => !(s in out)).length
  const cap = Math.ceil(total / roles.length)
  const lockedLoad = (r: string) =>
    Object.entries(out).filter(([s, role]) => !free.includes(s) && role === r).length
  const held = new Map<string, string>() // slot -> student
  const slotOf = (r: string, i: number) => `${r}\u0000${i}`
  const place = (s: string, seen: Set<string>): boolean => {
    // Least-played roles first keeps every role's plays level across the whole rotation.
    const byLoad = [...allowed.get(s)!].sort((x, y) => (totals.get(x) ?? 0) - (totals.get(y) ?? 0))
    for (const r of byLoad) {
      for (let i = 0; i < cap - lockedLoad(r); i++) {
        const slot = slotOf(r, i)
        if (seen.has(slot)) continue
        seen.add(slot)
        const other = held.get(slot)
        if (other === undefined || place(other, seen)) {
          held.set(slot, s)
          return true
        }
      }
    }
    return false
  }
  const order = free.map((_, i) => free[(i + offset) % free.length]!)
  // Students the role matching seated keep their slots, so every covered role stays covered
  // while the others move around them.
  for (const s of order) {
    const r = out[s]
    if (r === undefined) continue
    let i = 0
    while (held.has(slotOf(r, i))) i++
    held.set(slotOf(r, i), s)
  }
  for (const s of order) if (!(s in out)) place(s, new Set())
  for (const [slot, s] of held) out[s] = slot.split('\u0000')[0]!
  const load = new Map(roles.map((r) => [r, Object.values(out).filter((x) => x === r).length]))
  for (const s of free) {
    if (s in out) continue
    const role = [...allowed.get(s)!].sort((x, y) => load.get(x)! - load.get(y)!)[0]!
    out[s] = role
    load.set(role, load.get(role)! + 1)
  }
}

function planSession(
  input: RotationInput,
  index: number,
  played: Map<string, string[]>,
  problems: string[],
): Record<string, string> {
  const locked = input.locked?.[index] ?? {}
  const free = input.students.filter((s) => !(s in locked))
  const covered = new Set(Object.values(locked))
  const open = input.roles.filter((r) => !covered.has(r))
  const allowed = new Map(free.map((s) => [s, allowedRoles(input.roles, played.get(s) ?? [])]))
  const owner = matchRoles(open, free, allowed, index)
  const missing = open.filter((r) => ![...owner.values()].includes(r))
  if (missing.length > 0)
    problems.push(
      `Session ${index + 1}: no student can cover ${missing.join(', ')} without repeating a role.`,
    )
  const out: Record<string, string> = { ...locked, ...Object.fromEntries(owner) }
  const totals = new Map(input.roles.map((r) => [r, 0]))
  for (const list of played.values()) for (const r of list) totals.set(r, (totals.get(r) ?? 0) + 1)
  placeExtras(out, free, allowed, input.roles, index, totals)
  return out
}

export function planRotation(input: RotationInput): RotationResult {
  const problems: string[] = []
  if (input.roles.length === 0) return { sessions: [], problems: ['Add at least one role.'] }
  if (input.students.length < input.roles.length)
    problems.push(
      `${input.roles.length} roles need at least ${input.roles.length} students; there are ${input.students.length}.`,
    )
  const played = new Map(input.students.map((s) => [s, [...(input.history?.[s] ?? [])]]))
  const sessions: RotationResult['sessions'] = []
  for (let index = 0; index < input.sessions; index++) {
    const assignments = planSession(input, index, played, problems)
    for (const [student, role] of Object.entries(assignments)) played.get(student)?.push(role)
    sessions.push({ index, assignments })
  }
  return { sessions, problems }
}

/** For a finished plan: roles each student has not played yet. */
export function unplayedRoles(
  roles: string[],
  sessions: Array<{ assignments: Record<string, string> }>,
  studentId: string,
): string[] {
  const played = new Set(sessions.map((s) => s.assignments[studentId]))
  return roles.filter((r) => !played.has(r))
}
