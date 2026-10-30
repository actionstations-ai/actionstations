// Importing an existing corrective-action list from CSV (#504).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const store = await import('./store')
const actions = await import('./actions')
const { applyCsvImport, formulaSafe, previewCsvImport, CSV_LIMITS } = await import('./csv-import')
const { toCsv, IP_COLUMNS, ipRows } = await import('./export')
const { resetSettingsCache } = await import('../settings/store')

let root: string

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  root = await store.createProgram({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-prog-')),
    name: 'Summit County',
    startYear: 2026,
  })
})

import { join } from 'node:path'

const HEADER = 'Title,Issue/Area for Improvement,Core Capability,Status,Completion Date,Priority'

describe('previewCsvImport', () => {
  it('reads rows by header and reports warnings and errors per line', async () => {
    const csv = [
      HEADER,
      'Update the call tree,Slow notification,Planning,In progress,3/1/2026,high',
      ',No title here,,,,',
      'Buy radios,,Not a capability,Whatever,soon,',
    ].join('\n')
    const preview = await previewCsvImport(root, csv)
    expect(preview.rows).toHaveLength(3)
    expect(preview.rows[0]).toMatchObject({
      line: 2,
      title: 'Update the call tree',
      status: 'in_progress',
      warnings: [],
    })
    expect(preview.rows[1]!.error).toMatch(/No title/)
    const warnings = preview.rows[2]!.warnings.join(' ')
    expect(warnings).toMatch(/not one of the 32/)
    expect(warnings).toMatch(/not recognised/)
    expect(warnings).toMatch(/not a date/)
  })

  it('lists columns it does not use', async () => {
    const preview = await previewCsvImport(root, 'Title,Cost\nA,5')
    expect(preview.ignoredColumns).toEqual(['Cost'])
  })

  it('refuses a file with no title column, an empty file and an oversized file', async () => {
    await expect(previewCsvImport(root, 'Cost,Notes\n1,2')).rejects.toThrow(/Title/)
    await expect(previewCsvImport(root, '')).rejects.toThrow(/empty/)
    await expect(previewCsvImport(root, `Title\n${'x'.repeat(CSV_LIMITS.bytes)}`)).rejects.toThrow(
      /1 MB/,
    )
  })
})

describe('formula safety', () => {
  it('removes characters a spreadsheet reads as a formula start', () => {
    expect(formulaSafe("=cmd|' /C calc'!A0")).toBe("cmd|' /C calc'!A0")
    expect(formulaSafe('+1+1')).toBe('1+1')
    expect(formulaSafe('@SUM(A1)')).toBe('SUM(A1)')
    expect(formulaSafe('Plain text')).toBe('Plain text')
  })

  it('imports a formula cell without its leading character and says so', async () => {
    const preview = await previewCsvImport(root, 'Title\n"=HYPERLINK(""http://x"")"')
    expect(preview.rows[0]!.title).toBe('HYPERLINK("http://x")')
    expect(preview.rows[0]!.warnings[0]).toMatch(/formula character/)
  })
})

describe('applyCsvImport', () => {
  it('creates the valid rows, sets their status, and skips them the second time', async () => {
    const csv = [
      HEADER,
      'Update the call tree,Slow,Planning,Completed,2026-03-01,high',
      ',x,,,,',
      'Buy radios,,,,,',
    ].join('\n')
    expect(await applyCsvImport(root, csv)).toEqual({ created: 2, skipped: 1 })
    const list = (await actions.listAllActions(root)).actions.map((a) => a.action)
    expect(list.map((a) => a.title).sort()).toEqual(['Buy radios', 'Update the call tree'])
    const done = list.find((a) => a.title === 'Update the call tree')!
    expect(done).toMatchObject({
      status: 'completed',
      priority: 'high',
      dueDate: '2026-03-01',
      coreCapabilities: ['planning'],
    })
    expect(done.source.kind).toBe('manual')
    expect(await applyCsvImport(root, csv)).toEqual({ created: 0, skipped: 3 })
  })

  it('reads back a list exported as the Improvement Plan table', async () => {
    await applyCsvImport(
      root,
      'Title,Core Capability,Status\nFix FIDS feed,Operational Communications,Open',
    )
    const exported = toCsv(
      IP_COLUMNS,
      ipRows((await actions.listAllActions(root)).actions.map((a) => a.action)),
    )
    const again = await previewCsvImport(root, exported)
    expect(again.rows[0]).toMatchObject({ title: 'Fix FIDS feed', duplicate: true })
  })
})
