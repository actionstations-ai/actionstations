// Spill notification timeliness (spec 0455 FR-9, #1132): each notification the plan requires,
// matched to a Make notifications decision that names the same party (the NRC, the qualified
// individual, the state, the trustees and so on). A due notification is met when a decision
// naming its party was made at or before the due time, late when the first one came after it, and
// missed when none names it. A decision counts once for each party it names; a decision that
// names no party (saved before the form asked who) counts for no party. No order between parties
// is checked: the plan sets the call-out order, and the law does not make the NRC report wait for
// the qualified individual.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { mean, minutesText, ms, stringList, type Metric, type MetricOutput } from './types'

export const SpillNotificationConfig = z.object({
  /** Decision kinds that record a notification. */
  decisionKinds: stringList.default(['make_notifications']),
  /** Event kinds that are a required notification; the party is in `attrs.who`. */
  eventKinds: stringList.default(['notification_due']),
  /** Decision fields that each name one party notified. */
  partyFields: stringList.default(['who', 'also_notified', 'also_notified_2']),
})
export type SpillNotificationConfig = z.infer<typeof SpillNotificationConfig>

export interface SpillNotificationInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

export interface Party {
  id: string
  label: string
}

/** The parties a spill call-out reaches, with the names a plan or a form may use for each. */
const PARTIES: readonly (Party & { aliases: readonly string[] })[] = [
  { id: 'nrc', label: 'National Response Center', aliases: ['national_response_center', 'nrc'] },
  { id: 'qi', label: 'Qualified Individual', aliases: ['qualified_individual', 'qi'] },
  {
    id: 'osro',
    label: 'Oil spill removal organization',
    aliases: ['oil_spill_removal_organization', 'osro'],
  },
  {
    id: 'fosc',
    label: 'Coast Guard Sector or EPA',
    aliases: [
      'coast_guard_sector_or_epa',
      'coast_guard_sector',
      'coast_guard',
      'uscg',
      'epa',
      'fosc',
      'federal_on_scene_coordinator',
    ],
  },
  {
    id: 'state',
    label: 'State environmental agency',
    aliases: [
      'state_environmental_agency',
      'state',
      'state_agency',
      'sosc',
      'state_on_scene_coordinator',
    ],
  },
  {
    id: 'trustees',
    label: 'Natural resource trustees',
    aliases: ['natural_resource_trustees', 'natural_resource_trustee', 'trustees', 'trustee'],
  },
  {
    id: 'utility',
    label: 'Downstream water utility',
    aliases: ['downstream_water_utility', 'water_utility'],
  },
  {
    id: 'local',
    label: 'Local emergency management',
    aliases: ['local_emergency_management', 'emergency_management', 'lepc'],
  },
]

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** The party a name or option id stands for; an unknown name is its own party. */
export function partyOf(value: unknown): Party | null {
  if (typeof value !== 'string') return null
  const s = slug(value)
  if (!s) return null
  const known = PARTIES.find((p) => p.aliases.includes(s))
  return known ? { id: known.id, label: known.label } : { id: `other:${s}`, label: value.trim() }
}

/** Every party a decision names across the party fields, once each, in field order. */
export function partiesNamed(d: MetricDecision, fields: readonly string[]): Party[] {
  const out = new Map<string, Party>()
  for (const f of fields) {
    const v = d.fields[f]
    for (const item of Array.isArray(v) ? v : [v]) {
      const p = partyOf(item)
      if (p && !out.has(p.id)) out.set(p.id, p)
    }
  }
  return [...out.values()]
}

type Status = 'met' | 'late' | 'missed'
const STATUS_TEXT: Record<Status, string> = { met: 'Met', late: 'Late', missed: 'Missed' }
export const NO_PARTY = 'No party named'

interface Use {
  decision: MetricDecision
  party: Party
  used: boolean
}

interface DueRow {
  event: GroundTruthEvent
  party: Party | null
  status: Status
  /** Due time minus decision time: positive is early, negative is late. */
  marginMin: number | null
  use: Use | null
}

const byTime = <T extends { time: string; id: string }>(a: T, b: T): number =>
  ms(a.time) - ms(b.time) || a.id.localeCompare(b.id)

/** Each due notification takes the earliest unused decision that names its party. */
function matchDue(events: GroundTruthEvent[], uses: Use[]): DueRow[] {
  return [...events].sort(byTime).map((event) => {
    const party = partyOf(event.attrs.who)
    const use = party ? uses.find((u) => !u.used && u.party.id === party.id) : undefined
    if (!use) return { event, party, status: 'missed', marginMin: null, use: null }
    use.used = true
    const marginMin = (ms(event.time) - ms(use.decision.time)) / 60_000
    return { event, party, status: marginMin >= 0 ? 'met' : 'late', marginMin, use }
  })
}

const round1 = (n: number): number => Math.round(n * 10) / 10

function dueTable(rows: DueRow[]) {
  return {
    title: 'Required notifications',
    columns: ['Party', 'Due', 'Result', 'Early by', 'Late by', 'Decision', 'Decision time'],
    rows: rows.map((r) => [
      r.party?.label ?? NO_PARTY,
      r.event.time,
      STATUS_TEXT[r.status],
      r.status === 'met' ? minutesText(r.marginMin) : '',
      r.status === 'late' ? minutesText(-(r.marginMin ?? 0)) : '',
      r.use?.decision.id ?? '',
      r.use?.decision.time ?? '',
    ]),
  }
}

interface Unmatched {
  decision: MetricDecision
  party: string
}

function unmatchedTable(rows: Unmatched[]) {
  return {
    title: 'Notifications that matched no requirement',
    columns: ['Decision', 'Time', 'Party'],
    rows: rows.map((u) => [u.decision.id, u.decision.time, u.party]),
  }
}

function caveats(rows: DueRow[], noParty: number, decisions: number): string[] {
  return [
    'A decision counts once for each party it names. The parties are matched by name, so a party the plan spells differently from the form (other than common short forms such as NRC, QI and OSRO) does not match.',
    'No order between the parties is checked: the plan sets the call-out order, and the law does not make the NRC report wait for the qualified individual.',
    'The due times are the ones entered for the scenario. The NRC report is due immediately, so its time is how the plan reads "immediately".',
    ...(noParty
      ? [
          `${noParty} notification decision(s) name no party (saved before the form asked who), so they count for no required notification.`,
        ]
      : []),
    ...(rows.some((r) => !r.party)
      ? ['A required notification names no party, so no decision can meet it.']
      : []),
    ...(rows.length === 0 ? ['No required notifications were scored.'] : []),
    ...(decisions === 0 && rows.length ? ['No notifications were recorded.'] : []),
  ]
}

export function computeSpillNotifications(
  inputs: SpillNotificationInputs,
  config: SpillNotificationConfig,
): MetricOutput {
  const accepts = (list: string[], kind: string) => list.length === 0 || list.includes(kind)
  const events = inputs.events.filter((e) => accepts(config.eventKinds, e.kind))
  const decisions = inputs.decisions
    .filter((d) => accepts(config.decisionKinds, d.kind))
    .sort(byTime)
  const uses: Use[] = decisions.flatMap((decision) =>
    partiesNamed(decision, config.partyFields).map((party) => ({ decision, party, used: false })),
  )
  const rows = matchDue(events, uses)
  const noPartyDecisions = decisions.filter((d) => !uses.some((u) => u.decision === d))
  const unmatched: Unmatched[] = [
    ...uses.filter((u) => !u.used).map((u) => ({ decision: u.decision, party: u.party.label })),
    ...noPartyDecisions.map((decision) => ({ decision, party: NO_PARTY })),
  ].sort((a, b) => byTime(a.decision, b.decision))
  const count = (s: Status) => rows.filter((r) => r.status === s).length
  const early = rows.flatMap((r) => (r.status === 'met' ? [r.marginMin!] : []))
  const lateBy = rows.flatMap((r) => (r.status === 'late' ? [-r.marginMin!] : []))
  return {
    metricId: 'spill_notification_timeliness',
    title: 'Notification timeliness',
    config,
    inputs: [
      { label: 'Required notifications', value: String(events.length) },
      { label: 'Notification decisions', value: String(decisions.length) },
      { label: 'Fields naming a party', value: config.partyFields.join(', ') },
    ],
    summary: [
      { label: 'Met', value: String(count('met')) },
      { label: 'Late', value: String(count('late')) },
      { label: 'Missed', value: String(count('missed')) },
      { label: 'Mean time early (met)', value: minutesText(mean(early)) },
      { label: 'Mean time late (late)', value: minutesText(mean(lateBy)) },
      { label: 'Notifications that matched no requirement', value: String(unmatched.length) },
      { label: 'Decisions naming no party', value: String(noPartyDecisions.length) },
    ],
    tables: [dueTable(rows), unmatchedTable(unmatched)],
    caveats: caveats(rows, noPartyDecisions.length, decisions.length),
    data: {
      met: count('met'),
      late: count('late'),
      missed: count('missed'),
      unmatched: unmatched.length,
      noParty: noPartyDecisions.length,
      byDue: Object.fromEntries(
        rows.map((r) => [
          r.event.id,
          {
            party: r.party?.id ?? null,
            status: r.status,
            minutesEarly: r.status === 'met' ? round1(r.marginMin!) : null,
            minutesLate: r.status === 'late' ? round1(-r.marginMin!) : null,
            decisionId: r.use?.decision.id ?? null,
          },
        ]),
      ),
      unmatchedDecisions: unmatched.map((u) => ({ id: u.decision.id, party: u.party })),
    },
  }
}

export const spillNotificationTimeliness: Metric<SpillNotificationConfig, SpillNotificationInputs> =
  {
    id: 'spill_notification_timeliness',
    title: 'Notification timeliness',
    configSchema: SpillNotificationConfig,
    compute: computeSpillNotifications,
  }
