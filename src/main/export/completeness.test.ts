import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
const { fixtureModel, hseepFixtureModel } = await import('../../../tests/fixtures/export/model')
const { completenessMarkdown, completenessReport, missingDetails } = await import('./completeness')

const doc = (r: ReturnType<typeof completenessReport>, id: string) =>
  r.documents.find((d) => d.doc === id)!

describe('completeness report (#420)', () => {
  it('lists the blank exercise details and the content not generated yet', () => {
    const report = completenessReport(fixtureModel())
    expect(report.detailsMissing).toEqual(
      expect.arrayContaining(['Exercise dates', 'Sponsor organization', 'Point of contact']),
    )
    expect(doc(report, 'explan')).toMatchObject({ ready: false })
    expect(doc(report, 'sitman').missing[0]).toMatch(/SitMan modules not generated yet/)
    expect(doc(report, 'eeg')).toMatchObject({ ready: false })
    expect(doc(report, 'msel_xlsx')).toMatchObject({ ready: true, missing: [] })
  })

  it('is clean for a scenario with full details and SitMan modules (EEGs aside)', () => {
    const report = completenessReport(hseepFixtureModel())
    expect(report.detailsMissing).toEqual([])
    expect(doc(report, 'explan').ready).toBe(true)
    expect(doc(report, 'sitman').ready).toBe(true)
    expect(doc(report, 'handbook_hseep').missing).toEqual([
      'Exercise Evaluation Guides not prepared yet',
    ])
  })

  it('flags modules without discussion questions', () => {
    const model = hseepFixtureModel()
    model.scenario.sitman!.modules[1]!.discussionQuestions = []
    expect(doc(completenessReport(model), 'sitman').missing).toEqual([
      '1 module(s) without discussion questions',
    ])
  })

  it('renders export-report.md with checkboxes and the missing details', () => {
    const md = completenessMarkdown(completenessReport(fixtureModel()), 'Flight to Nowhere')
    expect(md).toContain('# Export report: Flight to Nowhere')
    expect(md).toContain('- [x] MSEL workbook')
    expect(md).toContain('- [ ] Situation Manual: SitMan modules not generated yet')
    expect(md).toContain('- Exercise dates')
    expect(missingDetails(hseepFixtureModel())).toEqual([])
  })
})
