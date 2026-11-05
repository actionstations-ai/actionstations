// The weather toolkit's decisions (#663): the forms reach live play and Facilitate as valid live
// forms, the decision timeline draws what the threshold timing metric scores, and the
// integrated warning team seats agree with the profile and the templates.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DecisionForm as LiveForm } from '@shared/schemas/decisions'
import { DomainProfile } from '@shared/domains'
import { ToolkitSchema } from '@shared/toolkits'
import {
  IWT_PARTNERS,
  IWT_SEATS,
  OFFICE_PRODUCTS,
  seatOfRole,
  seesProduct,
} from '@shared/weather/iwt'
import { runMetric } from '../../evaluation/metrics/registry'
import { toLiveForm } from '../decision-forms'
import { TropicalParams, generateTropical } from './simulate-tropical'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure } = await import('../../render/figures')

const root = resolve(__dirname, '../../../..')
const read = (p: string): unknown => JSON.parse(readFileSync(join(root, p), 'utf8'))
const toolkit = ToolkitSchema.parse(read('packs/toolkits/weather.json'))
const profile = DomainProfile.parse(read('packs/domains/meteorology.json'))

describe('decision forms', () => {
  it('offers the five weather decisions, each a valid live form that logs its id as its kind', () => {
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual([
      'issue_warning',
      'issue_statement',
      'cancel_warning',
      'brief_partner',
      'order_evacuation',
    ])
    for (const form of toolkit.decisionForms) {
      const live = LiveForm.parse(toLiveForm(form))
      expect(live.id, form.id).toBe(form.id)
      expect(live.fields.length).toBeGreaterThan(1)
    }
  })

  it('lets a warning be drawn on the map or picked by county, with the fields the spec asks for', () => {
    const form = toolkit.decisionForms.find((f) => f.id === 'issue_warning')!
    const area = form.fields.find((f) => f.id === 'area')!
    expect(area).toMatchObject({ kind: 'area', draw: true, required: true })
    expect(form.fields.map((f) => f.id)).toEqual([
      'product',
      'area',
      'duration',
      'source',
      'impact',
      'basis',
      'time',
    ])
    const live = LiveForm.parse(toLiveForm(form, 'Haldane County'))
    const areaField = live.fields.find((f) => f.id === 'area')! as { areas: { label: string }[] }
    expect(areaField.areas.map((a) => a.label)).toEqual(['Haldane County'])
  })

  it('matches the decision kinds the metrics read', () => {
    const verification = toolkit.metrics.find((m) => m.id === 'decision_timing')!
    expect(verification.config.decisionKinds).toBe('issue_warning')
    const timeline = toolkit.metrics.find((m) => m.id === 'threshold_timing')!
    expect(timeline.config.actionKind).toBe('order_evacuation')
    expect(toolkit.decisionForms.map((f) => f.id)).toEqual(
      expect.arrayContaining(['issue_warning', 'order_evacuation']),
    )
  })
})

describe('hurricane decision timeline figure', () => {
  const sim = generateTropical(
    TropicalParams.parse({
      start: '2026-09-10T00:00:00Z',
      hours: 72,
      track: {
        startLat: 24,
        startLon: -90,
        landfallLat: 29.4,
        landfallLon: -89.2,
        landfallHour: 48,
      },
      intensity: { startKt: 50, peakKt: 115, peakHour: 40 },
      places: [
        { name: 'Coastal Zone A', lat: 29.2, lon: -89.5 },
        { name: 'Inland Zone B', lat: 31.2, lon: -89.0 },
      ],
    }),
  )
  const events = (sim[1]!.data as { events: { area: string; time: string }[] }).events
  const arrival = (zone: string): string => events.find((e) => e.area === zone)!.time
  const data = (orderA: number, orderB: number | undefined) => ({
    origin: 'simulated' as const,
    storm: 'Marlena',
    zones: [
      {
        name: 'Coastal Zone A',
        arrival: arrival('Coastal Zone A'),
        clearanceMin: 720,
        orderedAt: new Date(Date.parse(arrival('Coastal Zone A')) - orderA * 60_000).toISOString(),
      },
      {
        name: 'Inland Zone B',
        arrival: arrival('Inland Zone B'),
        clearanceMin: 360,
        ...(orderB === undefined
          ? {}
          : {
              orderedAt: new Date(
                Date.parse(arrival('Inland Zone B')) - orderB * 60_000,
              ).toISOString(),
            }),
      },
      { name: 'Far Zone C', arrival: null, clearanceMin: 240 },
    ],
  })

  it('states the deadline of each zone and whether the order met it', () => {
    const r = renderFigure({ kind: 'decision_timeline', data: data(900, 300) })
    expect(r.summary).toContain('Coastal Zone A')
    expect(r.summary).toMatch(
      /Coastal Zone A: tropical-storm-force winds arrive .* needs 12 h to clear.* 3 h ahead of the deadline \(on time\)/,
    )
    expect(r.summary).toMatch(/Inland Zone B:.* 1 h after the deadline \(late\)/)
    expect(r.summary).toContain('Far Zone C: tropical-storm-force winds never arrive.')
    expect(r.table!.rows.map((x) => x[6])).toEqual(['on time', 'late', 'no arrival'])
    expect(r.svg).toContain('Order on time')
    expect(r.svg).toContain('Order late')
  })

  it('says when no order was given, and draws the same bytes twice', () => {
    const a = renderFigure({ kind: 'decision_timeline', data: data(900, undefined) })
    expect(a.summary).toContain('no order was given.')
    expect(renderFigure({ kind: 'decision_timeline', data: data(900, undefined) }).svg).toBe(a.svg)
  })

  it('agrees with the threshold timing metric on the same orders', () => {
    const orders = [
      {
        id: 'o1',
        time: new Date(Date.parse(arrival('Coastal Zone A')) - 900 * 60_000).toISOString(),
        kind: 'order_evacuation',
        area: 'Coastal Zone A',
        fields: {},
      },
      {
        id: 'o2',
        time: new Date(Date.parse(arrival('Inland Zone B')) - 300 * 60_000).toISOString(),
        kind: 'order_evacuation',
        area: 'Inland Zone B',
        fields: {},
      },
    ]
    const ref = toolkit.metrics.find((m) => m.id === 'threshold_timing')!
    const wind = sim[1]!.data as { series: never[] }
    const result = runMetric(
      {
        id: ref.id,
        config: { ...ref.config, clearanceMin: 720, clearanceMinByZone: { 'Inland Zone B': 360 } },
      },
      { series: wind.series, decisions: orders },
    )
    const text = JSON.stringify(result.tables)
    expect(text).toContain('On time')
    expect(text).toContain('Late')
  })

  it('refuses zones that need no clearance time', () => {
    expect(() =>
      renderFigure({ kind: 'decision_timeline', data: { ...data(1, 1), zones: [] } }),
    ).toThrow()
  })
})

describe('integrated warning team seats', () => {
  it('seat every profile role the weather products reach, once', () => {
    const keys = profile.roles.map((r) => r.key)
    const seated = IWT_SEATS.flatMap((s) => s.roleKeys)
    expect(new Set(seated).size).toBe(seated.length)
    for (const k of seated) expect(keys, k).toContain(k)
    for (const k of keys) expect(seatOfRole(k), k).toBeDefined()
  })

  it('only route products the toolkit ships, and give the office all of them', () => {
    const shipped = new Set(toolkit.injectTypes)
    for (const s of IWT_SEATS)
      for (const p of s.products) expect(shipped.has(p), `${s.id} ${p}`).toBe(true)
    expect(IWT_SEATS[0]!.products).toEqual(OFFICE_PRODUCTS)
    expect([...shipped].filter((t) => !OFFICE_PRODUCTS.includes(t as never))).toEqual([])
  })

  it('shows each partner the products that concern it', () => {
    expect(seesProduct('ema', 'tropical_cyclone_local_statement')).toBe(true)
    expect(seesProduct('ema', 'metar_report')).toBe(false)
    expect(seesProduct('on_air', 'convective_outlook')).toBe(true)
    expect(seesProduct('on_air', 'idss_briefing')).toBe(false)
    expect(seesProduct('lead', 'sigmet_advisory')).toBe(true)
    expect(seesProduct('someone_else', 'metar_report')).toBe(true)
  })

  it('scores message consistency across the seats', () => {
    const ref = toolkit.metrics.find((m) => m.id === 'message_consistency')!
    expect(ref.config.partners).toBe(IWT_PARTNERS.join(','))
    const r = runMetric(
      { id: ref.id, config: ref.config },
      {
        facts: [{ id: 'expires', label: 'Warning expiry' }],
        statements: [
          { factId: 'expires', partner: 'Forecast office', value: '3:45 PM' },
          { factId: 'expires', partner: 'County emergency management', value: '3:45 PM' },
          { factId: 'expires', partner: 'Broadcast team', value: '4:00 PM' },
        ],
      },
    )
    expect(JSON.stringify(r)).toMatch(/Conflict/)
  })
})
