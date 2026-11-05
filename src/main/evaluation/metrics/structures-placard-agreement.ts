// Inspection throughput and consistency (spec 0471 FR-10): of the buildings the program had to
// evaluate, how many got a placard, whether the placard agrees with the ground truth (with a
// confusion table by category), how many were under- or over-restricted, whether the priority
// buildings (hospitals, shelters, schools) came first, and how many buildings each team posted
// per shift. The ground truth is the simulated damage state of each building; the decisions are
// the team's post-placard forms. A building placarded twice differently is counted as a conflict
// and scored on its last placard.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { mean, ms, NOT_AVAILABLE, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const StructuresPlacardAgreementConfig = z.object({
  placardKind: z.string().default('structures_post_placard'),
  /** Length of a shift in hours, for buildings per team per shift. */
  shiftHours: z.number().positive().max(24).default(8),
})
export type StructuresPlacardAgreementConfig = z.infer<typeof StructuresPlacardAgreementConfig>

export interface StructuresPlacardAgreementInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const CATEGORIES = ['INSPECTED', 'RESTRICTED USE', 'UNSAFE'] as const
type Category = (typeof CATEGORIES)[number]
const RANK: Record<Category, number> = { INSPECTED: 0, 'RESTRICTED USE': 1, UNSAFE: 2 }

const slug = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const categoryOf = (v: unknown): Category | undefined => {
  const s = slug(v)
  return s === 'inspected'
    ? 'INSPECTED'
    : s === 'restricted_use'
      ? 'RESTRICTED USE'
      : s === 'unsafe'
        ? 'UNSAFE'
        : undefined
}

interface Posted {
  category: Category
  time: string
  team: string
}

export function computeStructuresPlacardAgreement(
  inputs: StructuresPlacardAgreementInputs,
  config: StructuresPlacardAgreementConfig,
): MetricOutput {
  const truth = inputs.events
    .filter((e) => e.kind === 'building_truth')
    .flatMap((e) => {
      const cat = categoryOf(e.attrs.truthPlacard)
      return cat
        ? [
            {
              id: String(e.attrs.buildingId ?? e.id),
              cat,
              priority: String(e.attrs.priority ?? 'other'),
            },
          ]
        : []
    })
  const byBuilding = new Map<string, Posted[]>()
  for (const d of [...inputs.decisions].sort((a, b) => ms(a.time) - ms(b.time))) {
    if (d.kind !== config.placardKind) continue
    const cat = categoryOf(d.fields.placard)
    const id = String(d.fields.building ?? '')
      .trim()
      .toLowerCase()
    if (!cat || !id) continue
    byBuilding.set(id, [
      ...(byBuilding.get(id) ?? []),
      { category: cat, time: d.time, team: String(d.fields.team ?? '').trim() },
    ])
  }
  const rows = truth.map((t) => {
    const list = byBuilding.get(t.id.toLowerCase()) ?? []
    const last = list.at(-1)
    return {
      t,
      last,
      conflict: new Set(list.map((p) => p.category)).size > 1,
    }
  })
  const evaluated = rows.filter((r) => r.last)
  const agree = evaluated.filter((r) => r.last!.category === r.t.cat)
  const under = evaluated.filter((r) => RANK[r.last!.category] < RANK[r.t.cat])
  const over = evaluated.filter((r) => RANK[r.last!.category] > RANK[r.t.cat])
  const conflicts = rows.filter((r) => r.conflict)

  const priority = rows.filter((r) => r.t.priority !== 'other')
  const firstOther = Math.min(
    ...rows.filter((r) => r.t.priority === 'other' && r.last).map((r) => ms(r.last!.time)),
  )
  const priorityFirst = priority.filter((r) => r.last && ms(r.last.time) < firstOther)
  const priorityDone = priority.filter((r) => r.last)

  const teams = new Map<string, Posted[]>()
  for (const r of evaluated) {
    const name = r.last!.team || 'no team named'
    teams.set(name, [...(teams.get(name) ?? []), r.last!])
  }
  const teamRows = [...teams.entries()].map(([name, posts]) => {
    const times = posts.map((p) => ms(p.time))
    const hours = Math.max((Math.max(...times) - Math.min(...times)) / 3_600_000, 1)
    return { name, count: posts.length, perShift: (posts.length / hours) * config.shiftHours }
  })
  const confusion = CATEGORIES.map((c) => [
    `truth ${c}`,
    ...CATEGORIES.map((p) =>
      String(evaluated.filter((r) => r.t.cat === c && r.last!.category === p).length),
    ),
    String(rows.filter((r) => r.t.cat === c && !r.last).length),
  ])
  return {
    metricId: 'structures_placard_agreement',
    title: 'Inspection throughput and consistency',
    config,
    inputs: [
      { label: 'Buildings to evaluate', value: String(rows.length) },
      {
        label: 'Placard decisions read',
        value: String([...byBuilding.values()].reduce((n, l) => n + l.length, 0)),
      },
      { label: 'Shift length', value: `${config.shiftHours} hours (set by the designer)` },
    ],
    summary: [
      { label: 'Buildings evaluated', value: `${evaluated.length} of ${rows.length}` },
      {
        label: 'Placards in agreement with the ground truth',
        value: `${agree.length} of ${evaluated.length}`,
      },
      { label: 'Share in agreement', value: ratioText(ratio(agree.length, evaluated.length)) },
      { label: 'Under-restricted (less restrictive than the truth)', value: String(under.length) },
      { label: 'Over-restricted (more restrictive than the truth)', value: String(over.length) },
      { label: 'Buildings placarded two ways', value: String(conflicts.length) },
      {
        label: 'Priority buildings evaluated before any other building',
        value: priority.length ? `${priorityFirst.length} of ${priority.length}` : NOT_AVAILABLE,
      },
      {
        label: 'Priority buildings evaluated',
        value: priority.length ? `${priorityDone.length} of ${priority.length}` : NOT_AVAILABLE,
      },
      {
        label: 'Mean buildings per team per shift',
        value: teamRows.length ? mean(teamRows.map((t) => t.perShift))!.toFixed(1) : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Placards against the ground truth',
        columns: ['', ...CATEGORIES.map((c) => `posted ${c}`), 'not evaluated'],
        rows: confusion,
      },
      {
        title: 'Teams',
        columns: ['Team', 'Buildings posted', 'Per shift'],
        rows: teamRows.map((t) => [t.name, String(t.count), t.perShift.toFixed(1)]),
      },
    ],
    caveats: [
      'The ground truth is the simulated damage state; in a real program two qualified evaluators can reasonably differ on a borderline building. A restrictive placard is not penalized more than a permissive one here; the table shows both so the team can discuss why.',
      ...(rows.length === 0 ? ['The scenario recorded no buildings.'] : []),
    ],
    data: {
      buildings: rows.length,
      evaluated: evaluated.length,
      agree: agree.length,
      under: under.length,
      over: over.length,
      conflicts: conflicts.length,
      priorityFirst: priorityFirst.length,
      priority: priority.length,
    },
  }
}

export const structuresPlacardAgreement: Metric<
  StructuresPlacardAgreementConfig,
  StructuresPlacardAgreementInputs
> = {
  id: 'structures_placard_agreement',
  title: 'Inspection throughput and consistency',
  configSchema: StructuresPlacardAgreementConfig,
  compute: computeStructuresPlacardAgreement,
}
