// The Compliance coverage section in the Word and HSEEP handbooks (#426): present when a
// framework or regulation is switched on, absent otherwise.
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { bundledFrameworks, bundledRegulations } from '@shared/compliance/bundled'
import { buildCoverage } from '@shared/compliance/coverage'
import { parseLocal } from '@shared/compliance/scenario-time'
import { ComplianceSession } from '@shared/schemas/compliance'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { handbookDocx } = await import('./docx')
const { handbookHseepDocx } = await import('./hseep/docx')
const { hseepBlocks, headingsOf } = await import('./hseep')

const coverage = () =>
  buildCoverage({
    scenarioTitle: 'Baggage ransomware',
    msel: fixtureModel().scenario.msel,
    threatFamily: 'cyber',
    frameworks: [bundledFrameworks().get('nist_csf_2')!],
    regulations: [bundledRegulations().get('circia')!],
    session: ComplianceSession.parse({}),
    start: { at: parseLocal('2026-03-12T09:00'), source: 'brief' },
    nowMin: 0,
    delivered: {},
    notes: {},
    observedRows: new Set(),
  })

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('Compliance coverage in the handbooks', () => {
  it('the Word handbook gets the section, with the not-legal-advice note', async () => {
    const model = fixtureModel()
    model.coverage = coverage()
    const xml = await documentXml(await handbookDocx(model))
    expect(xml).toContain('Compliance coverage')
    expect(xml).toContain(model.coverage.disclaimer.slice(0, 30))
  })

  it('the Word handbook is unchanged when no framework or regulation is on', async () => {
    const xml = await documentXml(await handbookDocx(fixtureModel()))
    expect(xml).not.toContain('Compliance coverage')
  })

  it('the HSEEP handbook gets Appendix F in Word and in the blocks, and not otherwise', async () => {
    const model = fixtureModel()
    model.coverage = coverage()
    const heads = headingsOf(hseepBlocks(model, 'handbook_hseep')).map((h) => h.text)
    expect(heads).toContain('Appendix F: Compliance Coverage')
    expect(await documentXml(await handbookHseepDocx(model))).toContain('Appendix F')
    const plain = headingsOf(hseepBlocks(fixtureModel(), 'handbook_hseep')).map((h) => h.text)
    expect(plain).not.toContain('Appendix F: Compliance Coverage')
  })
})
