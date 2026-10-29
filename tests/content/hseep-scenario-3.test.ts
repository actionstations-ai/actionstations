// Golden check of the HSEEP document set (#420) against the Scenario 3 gold standard in
// reference/scenario-3/msel.md: every SitMan module names its phase goal, the Excel MSEL rows
// match the reference table in id, time, from and to, and the ExPlan (which players may read
// before the exercise) carries no inject text.
import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { hseepFixtureModel } = await import('../fixtures/export/model')
const { hseepBlocks, textOf } = await import('../../src/main/export/hseep')
const { mselWorkbook } = await import('../../src/main/export/xlsx')
const { buildDocumentHtml } = await import('../../src/main/export/documents')

const reference = readFileSync(resolve('reference/scenario-3/msel.md'), 'utf8')
const goals = [...reference.matchAll(/^Goal: (.+)$/gm)].map((m) => m[1]!.trim())
const rows = reference
  .split('\n')
  .filter((l) => /^\| \d+:\d\d \|/.test(l))
  .map((l) => l.split('|').map((c) => c.trim()))
  .map((c) => ({ time: c[1]!, id: c[2]!, from: c[3]!, to: c[4]!, event: c[5]! }))

/** The SitMan text of one module: from its heading to the next level-2 heading. */
function moduleText(n: number): string {
  const blocks = hseepBlocks(hseepFixtureModel(), 'sitman')
  const start = blocks.findIndex(
    (b) => b.kind === 'heading' && b.level === 2 && b.text.startsWith(`Module ${n}:`),
  )
  const end = blocks.findIndex((b, i) => i > start && b.kind === 'heading' && b.level === 2)
  return textOf(blocks.slice(start, end))
}

describe('HSEEP set for Scenario 3 (golden)', () => {
  it('reads four phase goals and 24 MSEL rows from the reference', () => {
    expect(goals).toHaveLength(4)
    expect(rows).toHaveLength(24)
  })

  it('each SitMan module names its phase goal', () => {
    goals.forEach((goal, i) => expect(moduleText(i + 1), `module ${i + 1}`).toContain(goal))
  })

  it('the Excel MSEL rows equal the reference rows in id, time, from and to', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await mselWorkbook(hseepFixtureModel())) as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('MSEL')!
    const cell = (r: number, c: number) => String(ws.getRow(r).getCell(c).value ?? '')
    const sheet = rows.map((_, i) => ({
      id: cell(i + 2, 1),
      time: cell(i + 2, 3),
      from: cell(i + 2, 6),
      to: cell(i + 2, 7),
    }))
    expect(sheet).toEqual(rows.map(({ id, time, from, to }) => ({ id, time, from, to })))
    expect(ws.actualRowCount - 1).toBe(rows.length)
  })

  it('the ExPlan contains no inject event text, in blocks or in the rendered PDF HTML', () => {
    const model = hseepFixtureModel()
    const text = textOf(hseepBlocks(model, 'explan'))
    const html = buildDocumentHtml(model, 'explan', 'pdf')
    for (const r of model.scenario.msel) {
      expect(text, r.id).not.toContain(r.event)
      expect(html, r.id).not.toContain(r.event.slice(0, 40))
    }
    for (const r of rows) expect(text, r.id).not.toContain(r.event.slice(0, 40))
  })
})
