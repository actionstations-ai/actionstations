// #205: an AI image in a template slot that is a symlink pointing outside the project is not
// handed to the renderer (preview or render:inject).
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Inject, ScenarioBrief } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir(), getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { createScenario, saveInject } = await import('../scenario/store')
const { injectSlotFiles } = await import('./inject')

const ULID = '01M5GJ27PWYJ1CJB60T579J401'
const provenance = { provider: 'comfyui', createdAt: '2026-10-21T00:00:00.000Z' }

describe('slot assets and symlinks (#205)', () => {
  it('fills a slot from a real file and skips a link that points outside', async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    const root = (
      await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'S' })
    ).path
    const scenarioId = (await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) }))
      .id
    const dir = join(root, 'scenarios', scenarioId, 'media', 'inj-1')
    mkdirSync(dir, { recursive: true })
    const rel = `scenarios/${scenarioId}/media/inj-1/attached_image-${ULID}.png`
    const inject = Inject.parse({
      id: 'inj-1',
      mselRowId: 'I-01',
      type: 'tweet',
      title: 'x',
      fields: {},
      assets: [
        { id: `attached_image-${ULID}`, kind: 'image', path: rel, role: 'generated', provenance },
      ],
    })
    await saveInject(root, scenarioId, inject, { by: 'ai' })

    writeFileSync(join(root, rel), 'png')
    const real = await injectSlotFiles(root, scenarioId, 'inj-1', 'tweet')
    expect(Object.keys(real)).toEqual(['attached_image'])

    const outside = join(mkdtempSync(join(tmpdir(), 'ttx-outside-')), 'private.png')
    writeFileSync(outside, 'secret')
    const linked = join(dir, `attached_image-${ULID}.png`)
    rmSync(linked)
    symlinkSync(outside, linked)
    expect(await injectSlotFiles(root, scenarioId, 'inj-1', 'tweet')).toEqual({})
  })
})
