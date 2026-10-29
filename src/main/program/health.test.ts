// program:health and its exports (#438): the loader equals the pure result over the folder's own
// files, the CSV ZIP carries the five tables with RFC 4180 quoting, and the PDF HTML carries every
// panel and leaves owner names out when asked.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))
let lastPdfHtml = ''
vi.mock('../render/window', () => ({
  renderPdf: async (doc: { html: string }) => {
    lastPdfHtml = doc.html
    return Buffer.from('%PDF-1.4 test')
  },
}))

const store = await import('./store')
const actions = await import('./actions')
const { loadHealth } = await import('./health')
const { exportProgram } = await import('./export')
const { resetSettingsCache } = await import('../settings/store')
const { ProgramAction } = await import('@shared/schemas')

const NOW = new Date('2026-10-28T12:00:00.000Z')
let parent: string
let root: string

beforeEach(async () => {
  parent = mkdtempSync(join(tmpdir(), 'ttx-health-'))
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = await store.createProgram({ parentDir: parent, name: 'County, "Main"', startYear: 2026 })
  const program = await store.loadProgram(root)
  await actions.createAction(
    root,
    ProgramAction.parse({
      id: 'tmp',
      programId: program.id,
      title: 'Approve releases, fast',
      coreCapabilities: ['public_information_and_warning'],
      dueDate: '2026-01-31',
      owner: { name: 'Jordan Ruiz', organization: 'Airport PIO' },
      source: { kind: 'manual' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  )
})

describe('loadHealth', () => {
  it('reads an empty program: every capability never, one overdue action', async () => {
    const h = await loadHealth(root, {}, NOW)
    expect(h.capabilities).toHaveLength(32)
    expect(h.totals).toMatchObject({ exercises: 0, openActions: 1, overdueActions: 1 })
    expect(h.freshness).toEqual([])
  })
})

describe('health exports', () => {
  it('writes the five CSV files with header rows and quoted cells', async () => {
    const files = await exportProgram(root, join(parent, 'out'), ['health_csv'])
    expect(files).toHaveLength(1)
    const zip = await JSZip.loadAsync(readFileSync(files[0]!))
    expect(Object.keys(zip.files).sort()).toEqual([
      'capabilities.csv',
      'corrective-actions.csv',
      'never-tested.csv',
      'sections.csv',
      'timeline.csv',
    ])
    const actionsCsv = await zip.file('corrective-actions.csv')!.async('string')
    expect(actionsCsv.split('\r\n')[0]).toBe('Group,Item,Count or open,Overdue,Detail')
    expect(actionsCsv).toContain('"CA-0001 Approve releases, fast"')
    expect(actionsCsv).toContain('Jordan Ruiz')
  })

  it('prints every panel in the PDF and leaves owner names out when asked', async () => {
    await exportProgram(root, join(parent, 'out'), ['health_pdf'], { includeOwners: false })
    for (const caption of [
      'Core Capabilities by quarter',
      'Plan sections',
      'Corrective actions',
      'Never tested',
      'Timeline',
    ])
      expect(lastPdfHtml).toContain(`<caption>${caption}</caption>`)
    expect(lastPdfHtml).toContain('Approve releases, fast')
    expect(lastPdfHtml).not.toContain('Jordan Ruiz')
    expect(lastPdfHtml).toContain('Owner names are left out')
  })
})
