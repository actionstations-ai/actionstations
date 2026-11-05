// The humanitarian toolkit on the shared wiring: every figure kind, connector, metric and lint
// rule it names has code, and the arithmetic rules fire on the numbers they check.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const { ToolkitSchema } = await import('@shared/toolkits')
const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')
const { unknownCapabilityWarnings } = await import('../capabilities')
const { registerHumanitarianToolkit } = await import('./register')
const { connectorIds } = await import('../connectors/registry')
const { checkCampRates, checkCoverage, checkPipelineStated, checkStockBalance } =
  await import('./lint')

registerHumanitarianToolkit()
registerHumanitarianToolkit()
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(resolve('packs/toolkits/humanitarian.json'), 'utf8')),
)

describe('code the toolkit names exists', () => {
  it('has no figure kind, connector, metric or lint rule the app lacks', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(toolkit.lintRules))
    expect(connectorIds()).toEqual(expect.arrayContaining(toolkit.connectors))
    expect(unknownCapabilityWarnings(toolkit)).toEqual([])
  })
})

describe('arithmetic checks', () => {
  const figure = {
    stockOnHand: 420,
    dailyConsumption: 28,
    shipments: [
      { day: 12, quantity: 200 },
      { day: 30, quantity: 600 },
    ],
  }
  it('accepts the days of stock and break day the figure gives and flags others', () => {
    expect(checkPipelineStated({ daysOfStock: '15', breakDay: '22' }, figure)).toEqual([])
    const bad = checkPipelineStated({ daysOfStock: '30', breakDay: '40' }, figure)
    expect(bad.map((p) => p.message).join(' ')).toMatch(/Days of stock is stated as 30/)
    expect(bad.map((p) => p.message).join(' ')).toMatch(/break day is stated as 40/)
  })

  it('checks that closing stock balances', () => {
    expect(
      checkStockBalance([{ opening: '560', received: '0', issued: '140', closing: '420' }]),
    ).toEqual([])
    expect(
      checkStockBalance([
        { commodity: 'Oil', opening: '48', received: '10', issued: '12', closing: '50' },
      ]),
    ).toHaveLength(1)
  })

  it('checks coverage and camp rates', () => {
    expect(checkCoverage([{ planned: '800', reached: '600', coverage: '75%' }])).toEqual([])
    expect(
      checkCoverage([{ site: 'S', planned: '800', reached: '600', coverage: '90%' }]),
    ).toHaveLength(1)
    const ok = {
      population: '18,400',
      cases: '142',
      deaths: '3',
      attackRate: '0.77%',
      caseFatality: '2.1%',
    }
    expect(checkCampRates(ok)).toEqual([])
    expect(checkCampRates({ ...ok, attackRate: '7.7%' })).toHaveLength(1)
    expect(checkCampRates({ ...ok, caseFatality: '9%' })).toHaveLength(1)
  })

  it('runs the registered rules on inject fields', () => {
    expect(
      fieldLintIssues('humanitarian_warehouse_report', {
        stock: [{ commodity: 'Oil', opening: '1', received: '1', issued: '1', closing: '5' }],
      }),
    ).toHaveLength(1)
    expect(
      fieldLintIssues('humanitarian_pipeline_dashboard', {
        daysOfStock: '99',
        figures: {
          pipeline: { kind: 'humanitarian_pipeline', data: { ...figure, horizonDays: 45 } },
        },
      }),
    ).toHaveLength(1)
  })
})
