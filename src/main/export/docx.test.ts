import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
const { fixtureAar, fixtureModel, hseepFixtureModel } =
  await import('../../../tests/fixtures/export/model')
const { aarDocx, briefingDocx, eegDocx, handbookDocx } = await import('./docx')
const { explanDocx, handbookHseepDocx, sitmanDocx } = await import('./hseep/docx')
const { FILL_IN } = await import('./hseep')

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

  it('EEGs: one heading per capability and the critical tasks as a table (#421)', async () => {
    const xml = await documentXml(await eegDocx(fixtureModel()))
    expect(xml).toContain('Exercise Evaluation Guide 1: Public Information and Warning')
    expect(xml).toContain('Exercise Evaluation Guide 4: Cybersecurity')
    expect(xml).toContain('Notify the FBI Cyber Task Force and CISA')
    expect(xml).toContain('TIRP 13.7 Checklist: Cybersecurity Incident')
    expect(xml).toContain('☐ M   ☐ P   ☐ N   ☐ NO')
    expect(xml).toContain('End of Exercise Evaluation Guides')
  })

  it('AAR/IP: HSEEP headings, confirmed ratings only and the Improvement Plan table (#419)', async () => {
    const xml = await documentXml(await aarDocx(fixtureModel({ aar: fixtureAar() })))
    for (const heading of [
      'Exercise Overview',
      'Executive Summary',
      'Analysis of Core Capabilities',
      'Appendix A: Improvement Plan',
      'Appendix D: Acronyms',
    ])
      expect(xml, heading).toContain(heading)
    expect(xml).toContain('Primary Responsible Organization')
    expect(xml).toContain('Revise TIRP 13.6 so the Go Dark decision is taken jointly')
    expect(xml).toContain('Rating pending')
    expect(xml).toContain('Performed with Some Challenges (S)')
    // The proposed M appears once, in the ratings legend, never as a capability's rating.
    expect(xml.split('Performed with Major Challenges (M)')).toHaveLength(2)
    expect(xml).toContain('Evidence: note on I-09; 1 observation; 1 decision')
    expect(xml).not.toContain('obs:O-I-09-T-07')
    const none = await documentXml(await aarDocx(fixtureModel()))
    expect(none).toContain('No After-Action Report yet')
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

describe('DOCX export of the HSEEP set (#420)', () => {
  it('ExPlan: HSEEP sections as Word headings and the exercise details as a table', async () => {
    const xml = await documentXml(await explanDocx(hseepFixtureModel()))
    for (const h of ['Exercise Overview', 'Exercise Logistics', 'Appendix D: Acronyms'])
      expect(xml).toContain(h)
    expect(xml).toContain('w:pStyle w:val="Heading2"')
    expect(xml).toContain('Dana Whitfield')
    expect(xml).toContain('End of Exercise Plan')
  })

  it('blank details print a fill-in line in Word too', async () => {
    const xml = await documentXml(await explanDocx(fixtureModel()))
    expect(xml).toContain(FILL_IN)
  })

  it('SitMan player edition withholds later narratives; C/E handbook keeps the rubric', async () => {
    const model = hseepFixtureModel()
    const player = await documentXml(await sitmanDocx(model, 'player'))
    expect(player).toContain('It is 09:00 on a busy Thursday')
    expect(player).not.toContain('One flight in five on the main board')
    const facilitator = await documentXml(await sitmanDocx(model))
    expect(facilitator).toContain('One flight in five on the main board')
    const handbook = await documentXml(await handbookHseepDocx(model))
    expect(handbook).toContain('Evaluator Instructions')
    expect(handbook).toContain('Metric 1: Operational Coordination')
  })
})
