import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
const { fixtureModel, hseepFixtureModel } = await import('../../../tests/fixtures/export/model')
const { MSEL_COLUMNS, mselWorkbook, neutralizeFormula } = await import('./xlsx')

async function open(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb
}

const text = (v: ExcelJS.CellValue): string => (v === null || v === undefined ? '' : String(v))

describe('Excel MSEL', () => {
  it('has the HSEEP column layout with one row per MSEL row', async () => {
    const model = fixtureModel()
    const ws = (await open(await mselWorkbook(model))).getWorksheet('MSEL')!
    const header = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(text)
    expect(header).toEqual([
      'Inject #',
      'Phase / Module',
      'Scenario Time',
      'Wall Clock',
      'Event Type',
      'From',
      'To',
      'Delivery Method',
      'Inject Description',
      'Expected Player Action',
      'Objective(s)',
      'Core Capability(ies)',
      'Critical Task(s)',
      'Purpose',
      'Format',
      'Media File',
      'Controller Notes',
      'Delivered At',
      'Notes',
    ])
    expect(header).toEqual(MSEL_COLUMNS.map((c) => c.header))
    expect(ws.actualRowCount - 1).toBe(model.scenario.msel.length)
    const ids = model.scenario.msel.map((_, i) => text(ws.getRow(i + 2).getCell(1).value))
    expect(ids).toEqual(model.scenario.msel.map((r) => r.id))
  })

  it('freezes and filters the header row, bolds it, and sets widths and wrapping', async () => {
    const ws = (await open(await mselWorkbook(fixtureModel()))).getWorksheet('MSEL')!
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true)
    expect(ws.getColumn(9).width).toBe(60)
    expect(ws.getRow(2).getCell(9).alignment?.wrapText).toBe(true)
  })

  it('fills derived columns: delivery method, purpose, format, media and controller notes', async () => {
    const model = fixtureModel()
    const ws = (await open(await mselWorkbook(model))).getWorksheet('MSEL')!
    const row = (id: string) => {
      const i = model.scenario.msel.findIndex((r) => r.id === id)
      const values = (ws.getRow(i + 2).values as ExcelJS.CellValue[]).slice(1).map(text)
      return Object.fromEntries(MSEL_COLUMNS.map((c, k) => [c.key, values[k] ?? '']))
    }
    expect(row('I-05b')).toMatchObject({
      method: 'Radio',
      purpose: 'Red herring',
      format: 'Radio call',
      controllerNotes: 'Note for I-05b',
      phase: 'Phase 2: The Crisis',
      wallClock: '10:10',
    })
    expect(row('I-05b').media).toContain('S3-I05b-radio_call.wav')
    expect(row('I-06')).toMatchObject({ method: 'Visual (main screen)', eventType: 'Inject' })
    expect(row('START')).toMatchObject({
      eventType: 'Control card',
      method: 'Verbal / facilitator',
    })
    expect(row('I-09').objectives).toContain('Decision Making')
  })

  it('italicizes control cards and bands phases', async () => {
    const model = fixtureModel()
    const ws = (await open(await mselWorkbook(model))).getWorksheet('MSEL')!
    const at = (id: string) => ws.getRow(model.scenario.msel.findIndex((r) => r.id === id) + 2)
    expect(at('START').getCell(1).font?.italic).toBe(true)
    expect(at('I-05').getCell(1).font?.italic).toBe(true)
    expect(at('I-01').getCell(1).font?.italic).toBeFalsy()
    const fill = (id: string) => (at(id).getCell(1).fill as ExcelJS.FillPattern).fgColor?.argb
    expect(fill('I-01')).not.toBe(fill('I-05b'))
    expect(fill('I-01')).toBe(fill('I-09'))
  })

  it('never lets model text start a formula, and writes no formulas', async () => {
    const model = fixtureModel()
    model.scenario.msel[1]!.event = '=HYPERLINK("http://evil.example","click")'
    model.scenario.msel[2]!.expectedAction = '@SUM(A1:A9)'
    const buf = await mselWorkbook(model)
    const ws = (await open(buf)).getWorksheet('MSEL')!
    expect(text(ws.getRow(3).getCell(9).value)).toBe(' =HYPERLINK("http://evil.example","click")')
    expect(text(ws.getRow(4).getCell(10).value)).toBe(' @SUM(A1:A9)')
    const zip = await JSZip.loadAsync(buf)
    const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
    expect(sheets).toHaveLength(5)
    for (const name of sheets) {
      expect(await zip.file(name)!.async('string')).not.toContain('<f>')
    }
    expect(Object.keys(zip.files).some((n) => /vba|externalLink/i.test(n))).toBe(false)
    expect(neutralizeFormula('+1')).toBe(' +1')
    expect(neutralizeFormula('Plain')).toBe('Plain')
  })

  it('adds Overview, Objectives, Roles and Legend sheets', async () => {
    const model = hseepFixtureModel()
    const wb = await open(await mselWorkbook(model))
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'MSEL',
      'Overview',
      'Objectives',
      'Roles',
      'Legend',
    ])
    const overview = wb.getWorksheet('Overview')!
    const pairs = new Map<string, string>()
    overview.eachRow((r) => pairs.set(text(r.getCell(1).value), text(r.getCell(2).value)))
    expect(pairs.get('Exercise Name')).toBe('NCIA 2027 Data Integrity Tabletop Exercise')
    expect(pairs.get('Theme')).toContain('Data Integrity')
    expect(wb.getWorksheet('Roles')!.actualRowCount - 1).toBe(model.scenario.roles.length)
    expect(wb.getWorksheet('Objectives')!.actualRowCount - 1).toBe(model.scenario.objectives.length)
    expect(wb.creator).toBe('North Coast Regional Airport Authority')
  })
})
