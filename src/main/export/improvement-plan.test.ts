import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureAar, fixtureModel } = await import('../../../tests/fixtures/export/model')
const { improvementPlanWorkbook, PLAN_COLUMNS } = await import('./improvement-plan')

async function sheets(buf: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  const rows = (name: string) => {
    const ws = wb.getWorksheet(name)!
    const out: unknown[][] = []
    ws.eachRow((row) => out.push((row.values as unknown[]).slice(1)))
    return out
  }
  return { plan: rows('Improvement Plan'), ratings: rows('Ratings') }
}

describe('Improvement Plan tracker workbook (#419)', () => {
  it('writes one row per corrective action and one per capability rating', async () => {
    const aar = fixtureAar()
    const { plan, ratings } = await sheets(await improvementPlanWorkbook(fixtureModel({ aar })))
    expect(plan[0]).toEqual(PLAN_COLUMNS.map((c) => c.header))
    const actions = aar.capabilities.flatMap((c) =>
      c.areasForImprovement.flatMap((f) => f.correctiveActions),
    )
    expect(plan).toHaveLength(actions.length + 1)
    const first = plan[1]!
    expect(first[0]).toBe('Public Information and Warning')
    expect(first[4]).toBe('NCIA Public Affairs')
    expect(first[6]).toBe('2026-11-15')
    expect(first[8]).toBe('Open')
    // An action without an organization shows the proposed role in brackets.
    expect(plan[2]![4]).toBe('[IC]')
    expect(ratings).toHaveLength(aar.capabilities.length + 1)
    expect(ratings[1]![1]).toBe('Performed with Some Challenges (S)')
    expect(ratings[2]![1]).toBe('Rating pending')
    expect(ratings[2]![2]).toBe('Performed with Major Challenges (M)')
    expect(ratings[2]!.slice(3, 7)).toEqual(['1', '2', '1', '0'])
  })

  it('neutralizes text that a spreadsheet would run as a formula, and copes without a draft', async () => {
    const aar = fixtureAar()
    aar.capabilities[1]!.areasForImprovement[0]!.correctiveActions[0]!.action = '=CMD()'
    const { plan } = await sheets(await improvementPlanWorkbook(fixtureModel({ aar })))
    expect(plan.some((r) => r[2] === ' =CMD()')).toBe(true)
    expect(plan.some((r) => r[2] === '=CMD()')).toBe(false)
    const empty = await sheets(await improvementPlanWorkbook(fixtureModel()))
    expect(empty.plan).toHaveLength(1)
    expect(empty.ratings).toHaveLength(1)
  })
})
