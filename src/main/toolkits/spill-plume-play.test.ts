// The spill_plume decisions and metrics (spec 0455 FR-8, FR-9; #775, #779): the forms are valid
// live decision forms, and the metrics reproduce worked examples (a boom 40 minutes before the
// oil arrives, one 10 minutes late).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DECISION_COMPONENTS } from '@shared/prep'
import { DecisionForm } from '@shared/schemas/decisions'
import { ToolkitSchema } from '@shared/toolkits'
import { runMetric } from '../evaluation/metrics/registry'

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), 'packs', 'toolkits', 'spill_plume.json'), 'utf8')),
)

const AREAS = [
  { id: 'heron-bay', name: 'Heron Bay marsh' },
  { id: 'bayou-sara-intake', name: 'Bayou Sara intake' },
]
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** What the decision-form provider does with a toolkit form: the shapes the live frames use. */
function asDecisionForm(f: (typeof toolkit.decisionForms)[number]) {
  return {
    id: f.id,
    title: f.label,
    ...(f.description ? { description: f.description } : {}),
    fields: f.fields.map((x) => {
      const base = { id: x.id, label: x.label, required: x.required }
      if (x.kind === 'choice')
        return {
          ...base,
          type: 'choice',
          options: x.choices.map((c) => ({ id: slug(c), label: c.slice(0, 80) })),
        }
      if (x.kind === 'area')
        return { ...base, type: 'area', areas: AREAS.map((a) => ({ id: a.id, label: a.name })) }
      return { ...base, type: x.kind }
    }),
  }
}

describe('spill_plume decisions', () => {
  it('has the ten decisions of the spec, each a valid live decision form', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'make_notifications',
      'activate_osro',
      'set_protection_priorities',
      'deploy_protective_boom',
      'request_countermeasure',
      'close_water_intake',
      'close_fishery_or_shoreline',
      'set_safety_zone',
      'escalate_imt',
      'issue_public_statement',
    ])
    for (const f of toolkit.decisionForms) {
      const parsed = DecisionForm.safeParse(asDecisionForm(f))
      expect(parsed.success, `${f.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true)
    }
  })

  it('every decision asks when, and the PREP tags name exactly these decisions', () => {
    for (const f of toolkit.decisionForms)
      expect(
        f.fields.some((x) => x.kind === 'time'),
        f.id,
      ).toBe(true)
    expect(Object.keys(DECISION_COMPONENTS).sort()).toEqual(
      toolkit.decisionForms.map((f) => f.id).sort(),
    )
  })
})

const T0 = Date.parse('2026-11-04T12:00:00.000Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const arrival = (zone: string, minute: number) => ({
  zone,
  quantity: 'oil_presence',
  points: [
    { time: at(0), value: 0 },
    { time: at(minute - 1), value: 0 },
    { time: at(minute), value: 1 },
    { time: at(minute + 600), value: 1 },
  ],
})
const act = (id: string, min: number, kind: string, area?: string) => ({
  id,
  time: at(min),
  kind,
  fields: {},
  ...(area ? { area } : {}),
})
const config = (id: string): Record<string, unknown> =>
  toolkit.metrics.find((m) => m.id === id)!.config

describe('spill_plume metrics', () => {
  it('names four built-in metrics whose configuration the app accepts', () => {
    expect(toolkit.metrics.map((m) => m.id)).toEqual([
      'spill_notification_timeliness',
      'threshold_timing',
      'protection_coverage',
      'message_consistency',
    ])
    for (const m of toolkit.metrics)
      expect(() => runMetric({ id: m.id, config: m.config }, {}), m.id).not.toThrow()
  })

  it('scores protective boom against arrival: 40 minutes early is on time, 10 late is not', () => {
    const out = runMetric(
      { id: 'threshold_timing', config: config('threshold_timing') },
      {
        series: [arrival('Heron Bay marsh', 240), arrival('Bayou Sara intake', 300)],
        decisions: [
          act('d1', 200, 'deploy_protective_boom', 'Heron Bay marsh'),
          act('d2', 310, 'deploy_protective_boom', 'Bayou Sara intake'),
        ],
      },
    )
    expect(out.data.zones).toMatchObject({
      'Heron Bay marsh': { status: 'on_time', marginMin: 40 },
      'Bayou Sara intake': { status: 'late', marginMin: -10 },
    })
  })

  it('counts a sensitive area as protected only when a decision names it before landfall', () => {
    const out = runMetric(
      { id: 'protection_coverage', config: config('protection_coverage') },
      {
        series: [
          arrival('Heron Bay marsh', 240),
          arrival('Bayou Sara intake', 300),
          arrival('Oyster lease', 500),
          { zone: 'Far bar', quantity: 'oil_presence', points: [{ time: at(0), value: 0 }] },
        ],
        decisions: [
          act('d1', 200, 'deploy_protective_boom', 'Heron Bay marsh'),
          act('d2', 310, 'close_water_intake', 'Bayou Sara intake'),
          act('d3', 100, 'make_notifications'),
        ],
      },
    )
    // The far bar is never reached, so three areas count: one protected, one late, one not at all.
    expect(out.data).toMatchObject({ protected: 1, late: 1, unprotected: 1 })
    expect(out.data.share).toBeCloseTo(1 / 3, 6)
    expect(out.summary[0]?.value).toBe('1 of 3 (33%)')
  })

  it('a decision without an area protects nothing, and a clearance time moves the deadline', () => {
    const withClearance = { ...config('protection_coverage'), clearanceMin: 60 }
    const noArea = runMetric(
      { id: 'protection_coverage', config: withClearance },
      {
        series: [arrival('Heron Bay marsh', 240)],
        decisions: [act('d1', 150, 'deploy_protective_boom')],
      },
    )
    expect(noArea.data).toMatchObject({ protected: 0, unprotected: 1 })
    const late = runMetric(
      { id: 'protection_coverage', config: withClearance },
      {
        series: [arrival('Heron Bay marsh', 240)],
        decisions: [act('d1', 190, 'deploy_protective_boom', 'heron bay marsh')],
      },
    )
    expect(late.data).toMatchObject({ late: 1 })
  })

  it('scores notification timeliness by the party each decision names', () => {
    const due = (id: string, min: number, who: string) => ({
      id,
      time: at(min),
      kind: 'notification_due',
      attrs: { who },
    })
    const notify = (id: string, min: number, fields: Record<string, string>) => ({
      ...act(id, min, 'make_notifications'),
      fields,
    })
    const out = runMetric(
      { id: 'spill_notification_timeliness', config: config('spill_notification_timeliness') },
      {
        events: [
          due('nrc', 30, 'National Response Center'),
          due('state', 120, 'State environmental agency'),
          due('trustees', 240, 'Natural resource trustees'),
        ],
        decisions: [
          // The QI call does not meet the NRC deadline; the NRC call with the QI at 20 does.
          notify('n0', 10, { who: slug('Qualified Individual') }),
          notify('n1', 20, {
            who: slug('National Response Center'),
            also_notified: slug('Qualified Individual'),
          }),
          notify('n2', 135, { who: slug('State environmental agency') }),
        ],
      },
    )
    expect(out.data).toMatchObject({ met: 1, late: 1, missed: 1, unmatched: 2 })
    expect(out.data.byDue).toMatchObject({
      nrc: { status: 'met', minutesEarly: 10, decisionId: 'n1' },
      state: { status: 'late', minutesLate: 15, decisionId: 'n2' },
      trustees: { status: 'missed' },
    })
  })

  it('lets the player name the parties of one call-out from the same list', () => {
    const form = toolkit.decisionForms.find((f) => f.id === 'make_notifications')!
    const choices = form.fields.filter((f) => f.kind === 'choice')
    expect(choices.map((f) => f.id)).toEqual(['who', 'also_notified', 'also_notified_2'])
    for (const f of choices) {
      expect(f.choices).toContain('Natural resource trustees')
      expect(f.choices).toEqual(choices[0]!.choices)
    }
    expect(config('spill_notification_timeliness').partyFields).toEqual(choices.map((f) => f.id))
  })
})
