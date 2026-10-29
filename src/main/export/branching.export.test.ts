// Exports of a branched MSEL (spec 0430 FR-14): branch sub-tables in the right phase, the Excel
// workbook with a Branch column, one sheet per branch and a Decisions sheet, and the one-path
// MSEL for the default path and for the path played.
import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { resolve } from 'node:path'
import type { DecisionRecord } from '@shared/ipc/facilitator'
import type { Decision, MselRow } from '@shared/schemas/scenario'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { buildDocumentHtml } = await import('./documents')
const { mselWorkbook } = await import('./xlsx')
const { planTargets } = await import('./run')
const { scenarioMarkdown } = await import('./manifest')

const count = (html: string, needle: string) => html.split(needle).length - 1

function branchedModel() {
  const model = fixtureModel()
  const msel = model.scenario.msel
  const anchor = msel[3]!
  const next = msel[4]!
  const decision: Decision = {
    id: 'd1',
    question: 'Pay the ransom or rebuild?',
    options: [
      { id: 'pay', label: 'Pay', description: '', branchId: 'b1' },
      { id: 'rebuild', label: 'Rebuild', description: '', branchId: 'b2' },
    ],
    mode: 'anonymous',
    rule: { kind: 'majority' },
    defaultOptionId: 'rebuild',
    votingRoleIds: [],
  }
  const branchRow = (id: string, branchId: string, text: string): MselRow => ({
    ...anchor,
    id,
    branchId,
    event: text,
    purposeTag: 'CORE_NARRATIVE',
    injectId: undefined as never,
    time: anchor.time,
  })
  msel.push(branchRow('B1-1', 'b1', 'The wallet address arrives'))
  msel.push(branchRow('B2-1', 'b2', 'The vendor reports stale backups'))
  anchor.decision = decision
  anchor.purposeTag = 'DECISION_POINT'
  model.scenario.branches = [
    {
      id: 'b1',
      label: 'Pay',
      decisionId: 'd1',
      optionId: 'pay',
      rejoinRowId: next.id,
      rationale: '',
    },
    {
      id: 'b2',
      label: 'Rebuild',
      decisionId: 'd1',
      optionId: 'rebuild',
      rejoinRowId: next.id,
      rationale: '',
    },
  ]
  return { model, anchor }
}

const playedPay: DecisionRecord = {
  decisionId: 'd1',
  optionId: 'pay',
  by: 'vote',
  rule: { kind: 'majority' },
  input: { tally: { pay: 7, rebuild: 4 }, cast: 11 },
  at: '2026-03-01T10:00:00.000Z',
  exerciseTime: '1:30',
  note: '',
}

describe('MSEL PDF of a branched scenario', () => {
  it('prints the trunk table and one shaded sub-table per branch in the decision phase', () => {
    const { model } = branchedModel()
    const html = buildDocumentHtml(model, 'msel', 'pdf')
    expect(count(html, 'msel-branch msel-branch--1')).toBe(2)
    expect(html).toContain('Branch B1 — Pay (rows B1-1; rejoins')
    expect(html).toContain('Branch B2 — Rebuild')
    expect(html).toContain('Pay → Branch B1')
    expect(html).toContain('Rebuild → Branch B2')
    // branch rows are not repeated in the trunk table
    expect(count(html, 'The wallet address arrives')).toBe(1)
  })

  it('is unchanged for a scenario without branches', () => {
    const html = buildDocumentHtml(fixtureModel(), 'msel', 'pdf')
    expect(html).not.toContain('msel-branch msel-branch--')
  })
})

describe('Excel MSEL of a branched scenario', () => {
  it('adds a Branch column, a sheet per branch and a Decisions sheet', async () => {
    const { model } = branchedModel()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await mselWorkbook(model)) as unknown as ArrayBuffer)
    const names = wb.worksheets.map((w) => w.name)
    expect(names).toEqual(
      expect.arrayContaining(['MSEL', 'Branch B1 Pay', 'Branch B2 Rebuild', 'Decisions']),
    )
    const header = (wb.getWorksheet('MSEL')!.getRow(1).values as ExcelJS.CellValue[]).slice(1)
    expect(header[1]).toBe('Branch')
    const b1 = wb.getWorksheet('Branch B1 Pay')!
    expect(b1.actualRowCount).toBe(2)
    expect(String(b1.getRow(2).getCell(2).value)).toBe('B1 Pay')
    const dec = wb.getWorksheet('Decisions')!
    expect(dec.actualRowCount).toBe(3)
    expect(String(dec.getRow(2).getCell(4).value)).toBe('Pay')
  })

  it('keeps the old layout for a scenario without branches', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await mselWorkbook(fixtureModel())) as unknown as ArrayBuffer)
    expect(wb.getWorksheet('Decisions')).toBeUndefined()
    expect(wb.getWorksheet('MSEL')!.getRow(1).getCell(2).value).toBe('Phase / Module')
  })
})

describe('MSEL of one path', () => {
  it('prints the default path without the branch rows it leaves out, and lists them as alternatives', () => {
    const { model } = branchedModel()
    const html = buildDocumentHtml(model, 'path', 'pdf')
    expect(html).toContain('Events on the default path')
    expect(html).toContain('The vendor reports stale backups')
    expect(html).not.toContain('The wallet address arrives')
    expect(html).toContain('Alternatives not on this path')
    expect(html).toContain('Branch B1 — Pay')
    expect(html).not.toContain('Decisions taken')
  })

  it('prints the path played with a Decisions taken table', () => {
    const { model } = branchedModel()
    model.decisions = [playedPay]
    const html = buildDocumentHtml(model, 'path', 'pdf')
    expect(html).toContain('Events on the path played')
    expect(html).toContain('The wallet address arrives')
    expect(html).not.toContain('The vendor reports stale backups')
    expect(html).toContain('Decisions taken')
    expect(html).toContain('Pay: 7, Rebuild: 4')
    expect(html).not.toContain('Alternatives not on this path')
  })

  it('is part of the export plan and of the ZIP', () => {
    expect(planTargets(['path_pdf'])).toEqual(['path_pdf'])
    expect(planTargets(['zip'])).toContain('path_pdf')
  })
})

describe('scenario.md of a branched scenario', () => {
  it('lists decisions and branches after the phases', () => {
    const { model } = branchedModel()
    const md = scenarioMarkdown(model, [])
    expect(md).toContain('## Decisions and branches')
    expect(md).toContain('Pay the ransom or rebuild?')
    expect(md).toContain('| B1 | Pay | B1-1 |')
  })

  it('has no such section without branches', () => {
    expect(scenarioMarkdown(fixtureModel(), [])).not.toContain('Decisions and branches')
  })
})
