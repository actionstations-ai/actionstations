// #205: a shared project may contain symlinks. Export must never copy a file from outside the
// project folder into the export folder or the distribution ZIP.
import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Inject, ScenarioBrief, type MediaAsset } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario, saveInject, saveScenario } = await import('../scenario/store')
const { fixtureScenario } = await import('../../../tests/fixtures/export/model')
const { resetSettingsCache } = await import('../settings/store')
const { loadExportModel } = await import('./model')
const { exportMedia } = await import('./media')

const SECRET = 'TOP-SECRET-OUTSIDE-PROJECT'
const provenance = { provider: 'template', createdAt: '2026-10-21T00:00:00.000Z' }

function outsideFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-outside-'))
  writeFileSync(join(dir, 'private.png'), SECRET)
  return join(dir, 'private.png')
}

describe('export with symlinked project files (#205)', () => {
  let root: string
  let scenarioId: string

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-p-'))
    root = (await createProject({ parentDir, name: 'Shared' })).path
    const empty = await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) })
    scenarioId = empty.id
    // Rows from the Scenario 3 fixture, so the test inject (row I-01) is not an orphan.
    const rows = fixtureScenario().msel.map((r, i) => (i === 0 ? { ...r, id: 'I-01' } : r))
    await saveScenario(root, { ...empty, msel: rows }, { by: 'ai' })
  })

  async function injectWith(files: { name: string; link?: string }[]): Promise<MediaAsset[]> {
    const dir = join(root, 'scenarios', scenarioId, 'media', 'inj-1')
    mkdirSync(dir, { recursive: true })
    const assets = files.map(({ name, link }, i): MediaAsset => {
      if (link) symlinkSync(link, join(dir, name))
      else writeFileSync(join(dir, name), `inside-${i}`)
      const path = `scenarios/${scenarioId}/media/inj-1/${name}`
      return { id: `a${i}`, kind: 'image', path, role: 'rendered', provenance }
    })
    const inject = Inject.parse({
      id: 'inj-1',
      mselRowId: 'I-01',
      type: 'tweet',
      title: 'x',
      fields: {},
      assets,
    })
    await saveInject(root, scenarioId, inject, { by: 'ai' })
    return assets
  }

  it('leaves a symlink pointing outside the project out of the available set', async () => {
    const [inside, escaping] = await injectWith([
      { name: 'inside.png' },
      { name: 'escape.png', link: outsideFile() },
    ])
    const model = await loadExportModel(root, scenarioId)
    expect(model.available.has(inside!.path)).toBe(true)
    expect(model.available.has(escaping!.path)).toBe(false)

    const out = mkdtempSync(join(tmpdir(), 'ttx-exp-'))
    const result = await exportMedia(model, out)
    expect(result.files).toHaveLength(1)
    expect(result.warnings.join('\n')).toContain(escaping!.path)
    expect(readdirSync(join(out, 'media'))).toHaveLength(1)
  })

  it('keeps a symlink that stays inside the project', async () => {
    const target = join(root, 'scenarios', scenarioId, 'media', 'real.png')
    mkdirSync(join(root, 'scenarios', scenarioId, 'media'), { recursive: true })
    writeFileSync(target, 'inside-real')
    const [linked] = await injectWith([{ name: 'linked.png', link: target }])
    const model = await loadExportModel(root, scenarioId)
    expect(model.available.has(linked!.path)).toBe(true)
  })

  it('refuses to read an escaping file even when the plan lists it as available', async () => {
    const [escaping] = await injectWith([{ name: 'escape.png', link: outsideFile() }])
    const model = await loadExportModel(root, scenarioId)
    model.available.add(escaping!.path) // e.g. the link was swapped in after the check
    const out = mkdtempSync(join(tmpdir(), 'ttx-exp-'))
    await expect(exportMedia(model, out)).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
  })
})
