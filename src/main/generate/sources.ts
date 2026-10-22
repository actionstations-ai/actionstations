// Deterministic repairs of model output that the prompts alone do not prevent (#90):
// injects sourced from a player role, and rubric links to inject ids that do not exist.
import type { MselPhaseOutput, MselRow, Role } from '@shared/schemas'
import { roleNamedBy } from './lint'

type OutRow = MselPhaseOutput['rows'][number]

export interface SourceRepair {
  rowId: string
  from: string
  to: string
  /** The row was the player's own decision and became a facilitator prompt. */
  converted: boolean
}

/** Channel → the outside party that plausibly delivers it. First match wins. */
const CHANNEL_SOURCES: { test: RegExp; source: string }[] = [
  {
    test: /siem|system[_ ]?log|log excerpt|\blogs?\b|error[_ ]dialog|alarm[_ ]panel|alert/i,
    source: 'System Alert',
  },
  { test: /helpdesk|ticket/i, source: 'IT Helpdesk' },
  { test: /tweet|facebook|social|post\b|viral/i, source: 'Social Media' },
  { test: /media[_ ]inquiry|reporter|press|news|tv\b/i, source: 'Local Media' },
  { test: /radio/i, source: 'Field Unit (radio)' },
  { test: /vendor/i, source: 'Vendor Support Desk' },
  { test: /phone/i, source: 'Outside Caller' },
  { test: /e-?mail|memo/i, source: 'Staff Email' },
  { test: /fids|display|board/i, source: 'Terminal Staff' },
]

const CHANNEL_LABEL = /^\s*[A-Z][\w /#-]{1,30}(?:\([^)]*\))?\s*:/

const DECISION_VERBS =
  /\b(activates?|declares?|authori[sz]es?|orders?|approves?|decides?|initiates?|directs?|assumes?|announces?|confirms?|requests?|notif(?:y|ies)|isolates?|shuts? down|disconnects?|issues?)\b/i

function sourceFor(row: OutRow): string {
  const channel = `${row.format} ${row.event.slice(0, 40)}`
  return CHANNEL_SOURCES.find((c) => c.test.test(channel))?.source ?? 'Frontline Staff'
}

/** A player-role row with no channel label whose text is a decision ("Ops activates the EOC"). */
function isOwnDecision(row: OutRow): boolean {
  return !CHANNEL_LABEL.test(row.event) && DECISION_VERBS.test(row.event.slice(0, 120))
}

/**
 * Injects come from the outside world (docs/04). A row whose `from` names a player role is
 * re-sourced to the party that would deliver that channel; a row that is the player's own
 * decision becomes a facilitator prompt with the decision moved to the expected action.
 */
export function repairPlayerSources(
  rows: OutRow[],
  roles: Role[],
): { rows: OutRow[]; repairs: SourceRepair[] } {
  const repairs: SourceRepair[] = []
  const out = rows.map((row) => {
    const role = roleNamedBy(row.from, roles)
    if (!role) return row
    if (isOwnDecision(row)) {
      const who = role.abbreviation || role.name
      repairs.push({ rowId: row.id, from: row.from, to: 'Facilitator', converted: true })
      return {
        ...row,
        from: 'Facilitator',
        event: `Facilitator prompt to ${who}: the situation now demands a call. What is your call, who signs off, and who must be told?`,
        expectedAction: `${row.event.trim()} ${row.expectedAction.trim()}`.trim(),
      }
    }
    const to = sourceFor(row)
    repairs.push({ rowId: row.id, from: row.from, to, converted: false })
    return { ...row, from: to }
  })
  return { rows: out, repairs }
}

export interface LinkRepair {
  metric: string
  from: string
  to?: string
}

const parts = (id: string): { n: number; suffix: string } | undefined => {
  const m = /^I-?0*(\d+)([a-z]?)$/i.exec(id.trim())
  return m ? { n: Number(m[1]), suffix: (m[2] ?? '').toLowerCase() } : undefined
}

/**
 * Map one rubric link onto an existing row: exact, then the same number and suffix written
 * differently ("I-8b"), then the core row of a missing side inject ("I-08b" → "I-08"), then a
 * side inject of a missing core row, then the closest numbered row. Undefined when none.
 */
export function resolveInjectId(id: string, msel: MselRow[]): string | undefined {
  if (msel.some((r) => r.id === id)) return id
  const want = parts(id)
  if (!want) return undefined
  const numbered = msel
    .map((r) => ({ id: r.id, p: parts(r.id) }))
    .filter((x): x is { id: string; p: { n: number; suffix: string } } => !!x.p)
  const same = numbered.find((x) => x.p.n === want.n && x.p.suffix === want.suffix)
  if (same) return same.id
  const core = numbered.find((x) => x.p.n === want.n && !x.p.suffix)
  if (core) return core.id
  const side = numbered.find((x) => x.p.n === want.n)
  if (side) return side.id
  const nearest = [...numbered].sort(
    (a, b) => Math.abs(a.p.n - want.n) - Math.abs(b.p.n - want.n) || a.p.n - b.p.n,
  )[0]
  return nearest && Math.abs(nearest.p.n - want.n) <= 2 ? nearest.id : undefined
}

/** Repair or drop rubric links to rows that do not exist; returns what changed. */
export function repairRubricLinks(
  metrics: { name: string; linkedInjectIds: string[] }[],
  msel: MselRow[],
): LinkRepair[] {
  const repairs: LinkRepair[] = []
  for (const m of metrics) {
    const next: string[] = []
    for (const id of m.linkedInjectIds) {
      const to = resolveInjectId(id, msel)
      if (to !== id) repairs.push({ metric: m.name, from: id, ...(to ? { to } : {}) })
      if (to && !next.includes(to)) next.push(to)
    }
    m.linkedInjectIds = next
  }
  return repairs
}
