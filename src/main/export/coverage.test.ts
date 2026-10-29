import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { bundledFrameworks, bundledRegulations } from '@shared/compliance/bundled'
import { buildCoverage } from '@shared/compliance/coverage'
import { parseLocal } from '@shared/compliance/scenario-time'
import { ComplianceSession } from '@shared/schemas/compliance'
import { MselRow } from '@shared/schemas/scenario'
import {
  clocksCsv,
  coverageCsv,
  coverageMarkdown,
  coverageWorkbook,
  hasCoverage,
  sheetName,
} from './coverage'
import type { ExportModel } from './model'

const rows = [
  MselRow.parse({
    id: 'I-07',
    phaseId: 'P1',
    time: '1:00',
    from: 'SimCell',
    event: '=HYPERLINK("x") Ransomware confirmed, "legal" asks about reporting',
    expectedAction: 'Decide on notification',
    purposeTag: 'DECISION_POINT',
    triggers: [{ regulationId: 'circia', triggerId: 'covered_incident' }],
  }),
]

const report = buildCoverage({
  scenarioTitle: 'Baggage ransomware',
  msel: rows,
  threatFamily: 'cyber',
  frameworks: ['nist_csf_2', 'nis2_art21', 'dora'].map((id) => bundledFrameworks().get(id)!),
  regulations: [bundledRegulations().get('circia')!],
  session: ComplianceSession.parse({
    fired: [
      {
        id: 'f1',
        regulationId: 'circia',
        triggerId: 'covered_incident',
        exerciseMin: 60,
        scenarioAt: '2026-03-12T10:00',
        by: 'row',
        rowId: 'I-07',
      },
    ],
    clocks: { 'circia:incident_report': { status: 'met', exerciseMin: 150 } },
  }),
  start: { at: parseLocal('2026-03-12T09:00'), source: 'brief' },
  nowMin: 200,
  delivered: { 'I-07': { exerciseTime: '1:00' } },
  notes: {},
  observedRows: new Set(),
})

const model = { generatedAt: '2026-10-28T12:00:00.000Z' } as ExportModel

describe('coverage CSV', () => {
  const csv = coverageCsv(report)
  const lines = csv.slice(1).trimEnd().split('\r\n')

  it('has a header, one line per leaf control of every framework, and the note last', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(lines[0]).toBe(
      'Framework,Hierarchy,Control,Title,MSEL rows,Mapping,Evidence,Evidence references,Gaps',
    )
    const leafCount = report.frameworks.reduce((n, f) => n + f.rows.length, 0)
    expect(lines).toHaveLength(1 + leafCount + 1)
    expect(lines.at(-1)).toMatch(/^Note,,,"Exercise aid, not legal advice/)
  })

  it('writes the RS.CO-02 line with its evidence', () => {
    expect(lines.find((l) => l.includes(',RS.CO-02,'))).toBe(
      'NIST Cybersecurity Framework 2.0,Respond › Incident Response Reporting and Communication,RS.CO-02,Internal and external stakeholders are notified of incidents,I-07,Suggested,Observed,I-07 delivered 1:00; clock met: CIRCIA (proposed): Covered cyber incident report,',
    )
  })

  it('lists the clocks with scenario dates and neutralizes formulas', () => {
    const clocks = clocksCsv(report).slice(1).split('\r\n')
    expect(clocks[1]).toBe(
      'K1,CIRCIA (proposed),Proposed rule,Covered cyber incident report,CISA,Thu 12 Mar 2026 10:00,Sun 15 Mar 2026 10:00,Thu 12 Mar 2026 11:30,Met,',
    )
    const injected = coverageCsv({
      ...report,
      frameworks: [
        { ...report.frameworks[0]!, rows: [{ ...report.frameworks[0]!.rows[0]!, title: '=1+1' }] },
      ],
    })
    expect(injected).toContain(', =1+1,')
  })
})

describe('coverage workbook', () => {
  it('has one sheet per framework, a Clocks sheet and an About sheet', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await coverageWorkbook(model, report)) as unknown as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'NIST CSF 2.0',
      'NIS2 Art. 21 and 23',
      'DORA',
      'Clocks',
      'About',
    ])
    expect(wb.getWorksheet('NIST CSF 2.0')!.rowCount).toBe(1 + 106)
    const clocks = wb.getWorksheet('Clocks')!
    expect(clocks.getRow(1).getCell(7).value).toBe('Deadline')
    expect(clocks.getRow(2).getCell(9).value).toBe('Met')
    expect(String(wb.getWorksheet('About')!.getRow(3).getCell(2).value)).toMatch(/not legal advice/)
  })

  it('makes valid sheet names', () => {
    expect(sheetName('A/B: [C]?')).toBe('A B   C')
    expect(sheetName('')).toBe('Framework')
  })
})

describe('coverage in scenario.md', () => {
  it('shows mapped controls and the clocks, with the disclaimer', () => {
    const md = coverageMarkdown(report)
    expect(md).toMatch(/^## Compliance coverage/)
    expect(md).toContain(
      '_Exercise aid, not legal advice. Check the current rule and your counsel._',
    )
    expect(md).toContain(
      '| RS.CO-02 | Internal and external stakeholders are notified of incidents | I-07 | Observed |',
    )
    expect(md).toContain(
      '| K1 | CIRCIA (proposed) | Covered cyber incident report | Sun 15 Mar 2026 10:00 |',
    )
  })

  it('is left out when nothing is enabled', () => {
    expect(hasCoverage({ ...report, frameworks: [], clocks: [] })).toBe(false)
    expect(hasCoverage(undefined)).toBe(false)
  })
})
