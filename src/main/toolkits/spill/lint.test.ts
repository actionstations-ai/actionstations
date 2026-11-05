// The spill toolkit's format rules (#759): notification order and one volume unit per document.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ToolkitSchema } from '@shared/toolkits'
import { isMetricId } from '../../evaluation/metrics/registry'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'
import { minutesOf, notificationOrderIssues, unitIssues } from './lint'

const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), 'packs/toolkits/spill_plume.json'), 'utf8')),
)

const rows = (...r: [string, string, string?][]) => ({
  notifications: r.map(([who, time, remarks]) => ({ who, time, remarks: remarks ?? '' })),
})

describe('registration', () => {
  it('registers every rule the toolkit names, and its metrics are known', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
    expect(toolkit.lintRules).toEqual(['spill.notification_order', 'spill.units'])
    for (const m of toolkit.metrics) expect(isMetricId(m.id), m.id).toBe(true)
  })

  it('runs on the toolkit types only', () => {
    expect(fieldLintIssues('email', { body: '100 barrels and 50 gallons' })).toEqual([])
    expect(
      fieldLintIssues('closure_order', { reason: '100 barrels and 50 gallons' }).length,
    ).toBeGreaterThan(0)
  })

  it('finds no issue in any sample the toolkit ships', () => {
    for (const type of toolkit.injectTypes) {
      const preview = JSON.parse(
        readFileSync(join(process.cwd(), 'templates/injects', type, 'preview.json'), 'utf8'),
      ) as { fields: Record<string, unknown> }
      expect(fieldLintIssues(type, preview.fields), type).toEqual([])
    }
  })
})

describe('spill.notification_order', () => {
  it('accepts the Qualified Individual first, then the NRC, across midnight', () => {
    expect(
      notificationOrderIssues(
        rows(
          ['Qualified Individual', '2331'],
          ['National Response Center', '2342', 'Report number received'],
          ['State environmental agency', '0012'],
        ),
      ),
    ).toEqual([])
  })

  it('flags the NRC listed before the Qualified Individual', () => {
    const issues = notificationOrderIssues(
      rows(['National Response Center', '2331'], ['Qualified Individual', '2342']),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.path).toBe('fields.notifications[0].who')
  })

  it('flags a call to the NRC that asks for responders or boom', () => {
    const issues = notificationOrderIssues(
      rows(
        ['Qualified Individual', '2331'],
        ['National Response Center', '2342', 'Requested boom and skimmers from the NRC'],
      ),
    )
    expect(issues.map((i) => i.path)).toEqual(['fields.notifications[1].remarks'])
    expect(issues[0]!.message).toMatch(/report, not a request/)
    expect(
      notificationOrderIssues(
        rows(['National Response Center', '2342', 'Report number received; no response requested']),
      ),
    ).toEqual([])
  })

  it('flags times that run backward by more than a midnight wrap', () => {
    const issues = notificationOrderIssues(
      rows(['Qualified Individual', '1400'], ['State environmental agency', '0900']),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/run backward/)
    expect(notificationOrderIssues(rows(['A', '2350'], ['B', '0010']))).toEqual([])
  })

  it('reads times as 2331 or 23:31 and ignores what it cannot read', () => {
    expect(minutesOf('2331')).toBe(23 * 60 + 31)
    expect(minutesOf('23:31')).toBe(23 * 60 + 31)
    expect(minutesOf('soon')).toBeUndefined()
    expect(notificationOrderIssues({})).toEqual([])
    expect(notificationOrderIssues(rows(['A', 'soon'], ['B', '0900']))).toEqual([])
  })
})

describe('spill.units', () => {
  it('accepts one unit, however often and however spelled', () => {
    expect(unitIssues({ a: '4,200 barrels released', b: ['400 bbl storage', '1 barrel'] })).toEqual(
      [],
    )
    expect(unitIssues({ a: 'Boom 600 ft, 12 knots, 3 mi' })).toEqual([])
  })

  it('flags a mix of barrels and gallons, even as a conversion', () => {
    const issues = unitIssues({ product: 'Diesel, 4,200 barrels (176,400 gallons)' })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toBe(
      'Volumes are given in barrels and gallons; use one unit throughout the document (convert once, outside it).',
    )
  })

  it('finds the mix across fields and nested rows, and cubic meters too', () => {
    expect(unitIssues({ a: '500 gal', rows: [{ note: 'and 20 m3' }] })[0]!.message).toContain(
      'gallons and cubic meters',
    )
    expect(unitIssues({ a: '3 barrels', b: { c: '10 cubic meters' } })).toHaveLength(1)
  })
})
