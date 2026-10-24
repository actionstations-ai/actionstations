// Examples from packs (#266): the gallery lists the examples of enabled packs next to the
// built-in ones, examples:open copies one out of the installed pack, the marker records the
// pack, and a copy on a pack domain keeps opening after the pack is uninstalled.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { buildPack, validPackTree, type PackTree } from '../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
}))
const rebuildIndex = vi.fn(async () => ({ id: 'job-rebuild' }))
vi.mock('../ingest/pipeline', () => ({ rebuildIndex }))
process.env.TTX_RESOURCES = resolve('.')
// Fixture packs need 0.3.0; the app is 0.1.0. The packs handlers read this at the IPC boundary.
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../ipc/registry')
const { default: exampleHandlers } = await import('../ipc/handlers/examples')
const { default: projectHandlers } = await import('../ipc/handlers/project')
const { default: packHandlers } = await import('../ipc/handlers/packs')
const { resetSettingsCache } = await import('../settings/store')
const { registerPackProfiles, isDomainId } = await import('@shared/domains')
const { loadPacks } = await import('../packs')

const all = { ...exampleHandlers, ...projectHandlers, ...packHandlers }
async function call<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const r = await dispatch(all, channel, req[0])
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

const RAIL = 'ai.actionstations.freight-rail'
const FIXTURES = resolve('tests/fixtures/examples')
let work: string
let parent: string

async function install(buf: Promise<Buffer>): Promise<void> {
  const path = join(work, `pack-${Math.random().toString(36).slice(2)}.aspack`)
  writeFileSync(path, await buf)
  await call('packs:install', { path, source: { kind: 'file', name: 'rail.aspack' } })
}

/** The rail tree with its example renamed to `slug` (to collide with a built-in one). */
function packWithExampleSlug(slug: string): Promise<Buffer> {
  return buildPack(treeWithExampleSlug(slug), {
    manifest: (m) => {
      ;(m.contents as { examples: string[] }).examples = [slug]
    },
  })
}

function treeWithExampleSlug(slug: string): PackTree {
  const tree: PackTree = {}
  for (const [path, data] of Object.entries(validPackTree())) {
    const renamed = path.replace('examples/harbor-junction/', `examples/${slug}/`)
    tree[renamed] =
      renamed === `examples/${slug}/example.json`
        ? JSON.stringify({ ...JSON.parse(data as string), id: slug })
        : data
  }
  return tree
}

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  process.env.TTX_EXAMPLES_DIR = FIXTURES
  work = mkdtempSync(join(tmpdir(), 'ttx-packs-'))
  parent = mkdtempSync(join(tmpdir(), 'ttx-ex-'))
  resetSettingsCache()
  registerPackProfiles([])
  rebuildIndex.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await loadPacks()
})

describe('examples from packs', () => {
  it('lists the examples of enabled packs with the pack, its version and license', async () => {
    await install(buildPack())
    const list = await call('examples:list')
    expect(list.map((e) => [e.slug, e.packId])).toEqual([
      ['harbor-junction', RAIL],
      ['mini-transit', undefined],
    ])
    expect(list[0]).toMatchObject({
      title: 'Harbor Junction Terminal Railroad',
      domainProfile: 'freight_rail',
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      packLicense: 'CC-BY-4.0',
    })
    expect(list[1]).not.toHaveProperty('packLicense')
  })

  it('drops pack examples when the pack is disabled', async () => {
    await install(buildPack())
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    expect((await call('examples:list')).map((e) => e.slug)).toEqual(['mini-transit'])
    await expect(
      call('examples:open', { slug: 'harbor-junction', packId: RAIL, parentDir: parent }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('copies a pack example, marks the pack and snapshots its domain', async () => {
    await install(buildPack())
    const opened = await call('examples:open', {
      slug: 'harbor-junction',
      packId: RAIL,
      parentDir: parent,
    })
    expect(opened.project.name).toBe('Harbor Junction Terminal Railroad')
    expect(opened.project.orgType).toBe('freight_rail')
    expect(opened.project.domainProfileSnapshot).toMatchObject({
      packId: RAIL,
      version: '1.0.0',
      profile: { id: 'freight_rail' },
    })
    // The copy is the user's: editable, with the project's .gitignore, and no marker from the pack.
    expect(statSync(join(opened.path, 'project.json')).mode & 0o200).not.toBe(0)
    expect(existsSync(join(opened.path, '.gitignore'))).toBe(true)
    expect(await call('examples:marker', { projectPath: opened.path })).toMatchObject({
      slug: 'harbor-junction',
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      domainProfile: 'freight_rail',
      packState: { packMissing: false, updateAvailable: false, installedVersion: '1.0.0' },
    })
  })

  it('opens the copy after the pack (and its domain) is uninstalled', async () => {
    await install(buildPack())
    const opened = await call('examples:open', {
      slug: 'harbor-junction',
      packId: RAIL,
      parentDir: parent,
    })
    await call('packs:uninstall', { id: RAIL })
    expect(isDomainId('freight_rail')).toBe(false)
    expect((await call('examples:list')).map((e) => e.slug)).toEqual(['mini-transit'])
    const reopened = await call('project:open', { path: opened.path })
    expect(reopened.project.orgType).toBe('freight_rail')
    expect(reopened.project.domainProfileSnapshot?.profile.id).toBe('freight_rail')
    const saved = JSON.parse(readFileSync(join(opened.path, 'project.json'), 'utf8')) as {
      domainProfileSnapshot?: { packId: string }
    }
    expect(saved.domainProfileSnapshot?.packId).toBe(RAIL)
    // The banner badge (#269): the pack is gone.
    expect((await call('examples:marker', { projectPath: opened.path }))?.packState).toEqual({
      packMissing: true,
      updateAvailable: false,
    })
  })

  it('reports an update when the installed pack is newer than the copy (#269)', async () => {
    await install(buildPack())
    const opened = await call('examples:open', {
      slug: 'harbor-junction',
      packId: RAIL,
      parentDir: parent,
    })
    await call('packs:uninstall', { id: RAIL })
    await install(buildPack(undefined, { manifest: (m) => void (m.version = '1.1.0') }))
    expect((await call('examples:marker', { projectPath: opened.path }))?.packState).toEqual({
      packMissing: false,
      updateAvailable: true,
      installedVersion: '1.1.0',
    })
  })

  it('keeps a built-in and a pack example with the same slug apart', async () => {
    await install(packWithExampleSlug('mini-transit'))
    const list = await call('examples:list')
    expect(list.filter((e) => e.slug === 'mini-transit').map((e) => e.packId ?? 'builtin')).toEqual(
      expect.arrayContaining(['builtin', RAIL]),
    )
    const builtin = await call('examples:open', { slug: 'mini-transit', parentDir: parent })
    expect(builtin.project.orgType).toBe('transit')
    expect(await call('examples:marker', { projectPath: builtin.path })).not.toHaveProperty(
      'packId',
    )
    const fromPack = await call('examples:open', {
      slug: 'mini-transit',
      packId: RAIL,
      parentDir: parent,
    })
    expect(fromPack.project.orgType).toBe('freight_rail')
    expect(await call('examples:marker', { projectPath: fromPack.path })).toMatchObject({
      slug: 'mini-transit',
      packId: RAIL,
    })
  })

  it('refuses unknown packs, unlisted slugs and unsafe slugs', async () => {
    await install(buildPack())
    await expect(
      call('examples:open', {
        slug: 'harbor-junction',
        packId: 'org.example.none',
        parentDir: parent,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('examples:open', { slug: 'mini-transit', packId: RAIL, parentDir: parent }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('examples:open', { slug: '../harbor-junction', packId: RAIL, parentDir: parent }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
