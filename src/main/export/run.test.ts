// runExport with the PDF printer stubbed: which files each target writes, the SitMan player
// edition option, export-report.md, and the players/ folder of the ZIP (#420).
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
vi.mock('./pdf', () => ({ htmlToPdf: async (html: string) => Buffer.from(html.slice(0, 64)) }))
vi.mock('../render/window', () => ({ renderPdf: async () => Buffer.from('%PDF form') }))
process.env.TTX_RESOURCES = resolve('.')
const { fixtureModel, hseepFixtureModel } = await import('../../../tests/fixtures/export/model')
const { runExport } = await import('./run')

const ctx = { progress: () => undefined, log: () => undefined, throwIfCancelled: () => undefined }
const outDir = () => mkdtempSync(join(tmpdir(), 'ttx-run-'))

describe('runExport (#420)', () => {
  it('writes the ExPlan, SitMan, HSEEP handbook and MSEL workbook targets', async () => {
    const r = await runExport(
      fixtureModel(),
      outDir(),
      ['explan_pdf', 'sitman_pdf', 'handbook_hseep_pdf', 'msel_xlsx'],
      ctx,
    )
    expect(r.files.map((f) => basename(f))).toEqual([
      'Flight-to-Nowhere-MSEL.xlsx',
      'Flight-to-Nowhere-ExPlan.pdf',
      'Flight-to-Nowhere-SitMan.pdf',
      'Flight-to-Nowhere-CE-Handbook-HSEEP.pdf',
      'export-report.md',
    ])
    const report = readFileSync(r.files.at(-1)!, 'utf8')
    expect(report).toContain('Exercise details')
  })

  it('writes the SitMan player edition only when asked', async () => {
    const r = await runExport(fixtureModel(), outDir(), ['sitman_pdf'], ctx, {
      sitmanPlayerEdition: true,
    })
    expect(r.files.map((f) => basename(f))).toContain('Flight-to-Nowhere-SitMan-Player-Edition.pdf')
  })

  it('Word documents: the classroom pair plus the HSEEP set', async () => {
    const r = await runExport(hseepFixtureModel(), outDir(), ['docx'], ctx)
    expect(r.files.map((f) => basename(f)).filter((f) => f.endsWith('.docx'))).toEqual([
      'Flight-to-Nowhere-Controller-Evaluator-Handbook.docx',
      'Flight-to-Nowhere-Player-Briefing-Packet.docx',
      'Flight-to-Nowhere-ExPlan.docx',
      'Flight-to-Nowhere-SitMan.docx',
      'Flight-to-Nowhere-CE-Handbook-HSEEP.docx',
    ])
  })

  it('ZIP: ExPlan and the player SitMan in players/, everything else in facilitator/', async () => {
    const r = await runExport(fixtureModel(), outDir(), ['zip'], ctx, {
      sitmanPlayerEdition: true,
    })
    const zip = await JSZip.loadAsync(readFileSync(r.zipPath!))
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
    expect(names.filter((n) => n.startsWith('players/')).sort()).toEqual([
      'players/Flight-to-Nowhere-ExPlan.pdf',
      'players/Flight-to-Nowhere-Player-Briefing-Packet.pdf',
      'players/Flight-to-Nowhere-SitMan-Player-Edition.pdf',
      'players/ICS-201-Incident-Briefing-blank.pdf',
      'players/ICS-203-Organization-Assignment-List-blank.pdf',
    ])
    for (const f of [
      'facilitator/Flight-to-Nowhere-SitMan.pdf',
      'facilitator/Flight-to-Nowhere-CE-Handbook-HSEEP.pdf',
      'facilitator/Flight-to-Nowhere-MSEL.xlsx',
      'facilitator/export-report.md',
    ])
      expect(names).toContain(f)
  })
})
