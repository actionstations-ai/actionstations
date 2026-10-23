import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureModel } = await import('../../../tests/fixtures/export/model')
const { briefingDocx, handbookDocx } = await import('./docx')

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('DOCX export', () => {
  it('handbook: headings, lists and the rubric table as real Word structures', async () => {
    const xml = await documentXml(await handbookDocx(fixtureModel()))
    expect(xml).toContain('w:pStyle w:val="Heading2"')
    expect(xml).toContain('1. Exercise Overview')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('Metric 1: Operational Coordination')
    expect(xml).toContain('End of Handbook')
  })

  it('briefing: team table, and raw HTML in model text stays literal text', async () => {
    const model = fixtureModel()
    model.docs.briefing += '\n\n<script>alert(1)</script>\n'
    const xml = await documentXml(await briefingDocx(model))
    expect(xml).toContain('Team A: Airport Operations (Command)')
    expect(xml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(xml).not.toContain('<script>')
  })

  it('names Action Stations as the creator when the project has no organization (#233)', async () => {
    const model = fixtureModel()
    model.project.orgName = ''
    const zip = await JSZip.loadAsync(await handbookDocx(model))
    const core = await zip.file('docProps/core.xml')!.async('string')
    expect(core).toContain('<dc:creator>Action Stations</dc:creator>')
    expect(core).not.toContain('Tabletop Generator')
  })
})
