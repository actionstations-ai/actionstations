// Installed packs through the IPC dispatcher (#260): install, reinstall, update, downgrade,
// failure cleanup, conflicts, enable/disable, uninstall, startup verification, domain
// registration, staging cleanup and catalog updates. Each test gets its own TTX_USER_DATA.
// No network: fetch and http(s).request are spied and must never be called.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import {
  PACK_FIXTURES,
  buildPack,
  validPackTree,
  type Manifest,
  type PackTree,
} from '../../../../tests/fixtures/packs/build'
import { catalogBody, catalogEntry } from '../../packs/test-server'

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
process.env.TTX_RESOURCES = resolve('.')
// Fixture packs need 0.3.0; the app is 0.1.0. The handlers read this at the IPC boundary.
process.env.TTX_APP_VERSION = '0.3.0'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
const httpSpy = vi.spyOn(http, 'request')
const httpsSpy = vi.spyOn(https, 'request')

const { dispatch } = await import('../registry')
const handlers = (await import('./packs')).default
const { onEmit } = await import('../../lib/events')
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { catalogCachePath } = await import('../../packs/catalog')
const { listProfiles, registerPackProfiles } = await import('@shared/domains')
const packs = await import('../../packs')
const { packsStagingDir, packsRoot, registryPath } = await import('../../packs/registry')

async function call<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers, channel, req[0])
  if (!r.ok)
    throw Object.assign(new Error(r.error.message), {
      code: r.error.code,
      details: r.error.details,
    })
  return r.data as ChannelResponse<C>
}

const RAIL = 'ai.actionstations.freight-rail'
let work: string

async function writePack(name: string, buf: Promise<Buffer> | Buffer): Promise<string> {
  const path = join(work, name)
  writeFileSync(path, await buf)
  return path
}

const railPack = (version = '1.0.0', edit?: (m: Manifest) => void): Promise<Buffer> =>
  buildPack(undefined, {
    manifest: (m) => {
      m.version = version
      edit?.(m)
    },
  })

/** The full rail tree under another id: every item conflicts with the rail pack. */
const twinPack = (): Promise<Buffer> =>
  railPack('1.0.0', (m) => {
    m.id = 'org.example.rail-twin'
    m.name = 'Rail Twin'
  })

/** A pack with one domain that reuses the rail domain's alias. */
function aliasPack(): Promise<Buffer> {
  const rail = JSON.parse(validPackTree()['domains/freight_rail.json'] as string) as Record<
    string,
    unknown
  >
  const tree: PackTree = {
    'domains/short_line.json': JSON.stringify({
      ...rail,
      id: 'short_line',
      label: 'Short line',
      aliases: ['freight_railroad'],
    }),
  }
  return buildPack(tree, {
    manifest: (m) => {
      m.id = 'org.example.short-line'
      m.name = 'Short Line'
      m.contents = { domains: ['short_line'] }
      m.documents = []
      m.domains = []
    },
  })
}

const fileSource = (path: string) => ({ kind: 'file' as const, name: basename(path) })
const install = (path: string, extra: { confirmDowngrade?: boolean } = {}) =>
  call('packs:install', { path, source: fileSource(path), ...extra })

const registry = () =>
  JSON.parse(readFileSync(registryPath(), 'utf8')) as {
    packs: { id: string; version: string; enabled: boolean }[]
  }
const versionsOnDisk = (id: string) =>
  existsSync(join(packsRoot(), id)) ? readdirSync(join(packsRoot(), id)).sort() : []
const packDomains = () =>
  listProfiles()
    .filter((p) => p.source.kind === 'pack')
    .map((p) => p.profile.id)

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  work = mkdtempSync(join(tmpdir(), 'ttx-packs-'))
  resetSettingsCache()
  registerPackProfiles([])
  await packs.loadPacks()
})

afterAll(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(httpSpy).not.toHaveBeenCalled()
  expect(httpsSpy).not.toHaveBeenCalled()
})

describe('packs:inspect', () => {
  it('returns the review data without installing', async () => {
    const path = await writePack('rail.aspack', railPack())
    const res = await call('packs:inspect', { filePath: path })
    if (!res.ok) throw new Error(JSON.stringify(res.problems))
    const r = res.review
    expect(r).toMatchObject({
      id: RAIL,
      version: '1.0.0',
      action: 'install',
      willEnable: true,
      source: { kind: 'file', name: 'rail.aspack' },
      size: statSync(path).size,
      conflicts: [],
    })
    expect(r.archiveSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(r.customNodes).toEqual(['UltimateSDUpscale'])
    expect(r.documents.map((d) => d.license)).toEqual(['CC-BY-4.0', 'CC0-1.0'])
    expect(r.items.find((i) => i.kind === 'prompts')).toMatchObject({
      id: 'inject_text',
      replacesBuiltin: true,
    })
    expect(existsSync(registryPath())).toBe(false)
    expect(await call('packs:list')).toEqual([])
  })

  it('returns the reader problems for a bad archive', async () => {
    const path = await writePack('bad.aspack', PACK_FIXTURES['wrong-sha']!.build())
    const res = await call('packs:inspect', { filePath: path })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.problems[0]!.message).toMatch(/sha256 does not match/)
  })

  it('says reinstall, update, downgrade and conflict against what is installed', async () => {
    await install(await writePack('a.aspack', railPack('1.1.0')))
    const action = async (buf: Promise<Buffer>) => {
      const res = await call('packs:inspect', { filePath: await writePack('x.aspack', buf) })
      if (!res.ok) throw new Error('not ok')
      return res.review
    }
    expect((await action(railPack('1.1.0'))).action).toBe('reinstall')
    expect((await action(railPack('1.2.0'))).action).toBe('update')
    expect(await action(railPack('1.0.0'))).toMatchObject({
      action: 'downgrade',
      installed: { version: '1.1.0', enabled: true },
    })
    const twin = await action(twinPack())
    expect(twin.willEnable).toBe(false)
    expect(twin.conflict).toMatch(/Freight Rail Operations \(ai.actionstations.freight-rail\)/)
  })
})

describe('packs:install', () => {
  it('installs into <id>/<version>, read-only, with a registry entry, and keeps the file', async () => {
    const events: unknown[] = []
    const off = onEmit((name, payload) => name === 'packs:changed' && events.push(payload))
    const path = await writePack('rail.aspack', railPack())
    const res = await install(path)
    off()
    expect(res.action).toBe('install')
    expect(res.pack).toMatchObject({ id: RAIL, version: '1.0.0', enabled: true, conflicts: [] })
    expect(res.pack.source).toEqual({ kind: 'file', name: 'rail.aspack' })
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
    const html = join(packsRoot(), RAIL, '1.0.0', 'templates/rail_dispatch_board/template.html')
    expect(statSync(html).mode & 0o222).toBe(0)
    expect(registry().packs).toMatchObject([{ id: RAIL, version: '1.0.0', enabled: true }])
    expect(existsSync(path)).toBe(true)
    expect(events).toEqual([{ installed: 1, enabled: 1 }])
    expect(packs.enabledPacks().map((p) => p.id)).toEqual([RAIL])
    expect(packDomains()).toEqual(['freight_rail'])
  })

  it('reinstalls the same version in place', async () => {
    const path = await writePack('rail.aspack', railPack())
    await install(path)
    const again = await install(path)
    expect(again.action).toBe('reinstall')
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
    expect(registry().packs).toHaveLength(1)
    expect(readdirSync(packsStagingDir())).toEqual([])
  })

  it('update keeps one version', async () => {
    await install(await writePack('a.aspack', railPack('1.0.0')))
    const up = await install(await writePack('b.aspack', railPack('1.1.0')))
    expect(up.action).toBe('update')
    expect(versionsOnDisk(RAIL)).toEqual(['1.1.0'])
    expect(registry().packs).toMatchObject([{ id: RAIL, version: '1.1.0' }])
    expect(packs.packById(RAIL)?.version).toBe('1.1.0')
  })

  it('refuses a downgrade unless confirmed', async () => {
    await install(await writePack('a.aspack', railPack('1.1.0')))
    const old = await writePack('b.aspack', railPack('1.0.0'))
    await expect(install(old)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(versionsOnDisk(RAIL)).toEqual(['1.1.0'])
    const down = await install(old, { confirmDowngrade: true })
    expect(down.action).toBe('downgrade')
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
  })

  it('a refused pack leaves no folder and no registry entry', async () => {
    const path = await writePack('bad.aspack', PACK_FIXTURES['template-script']!.build())
    const err = await install(path).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'VALIDATION', message: /<script> is not allowed/ })
    expect((err as { details: unknown[] }).details.length).toBeGreaterThan(0)
    expect(versionsOnDisk(RAIL)).toEqual([])
    expect(existsSync(registryPath())).toBe(false)
    expect(await call('packs:list')).toEqual([])
  })

  it('a failure while committing removes the new folder and keeps the registry', async () => {
    // registry.json as a non-empty folder: the atomic rename onto it fails.
    mkdirSync(join(registryPath(), 'blocker'), { recursive: true })
    await expect(install(await writePack('a.aspack', railPack()))).rejects.toThrow()
    expect(existsSync(join(packsRoot(), RAIL))).toBe(false)
    expect(readdirSync(packsStagingDir())).toEqual([])
    expect(packs.enabledPacks()).toEqual([])
  })

  it('a failed update keeps the installed version', async () => {
    await install(await writePack('a.aspack', railPack('1.0.0')))
    const bad = await writePack('b.aspack', PACK_FIXTURES['wrong-sha']!.build())
    await expect(install(bad)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
    expect(packs.packById(RAIL)?.version).toBe('1.0.0')
  })

  it('a pack needing a newer app is refused with "update the app"', async () => {
    const path = await writePack(
      'new.aspack',
      railPack('1.0.0', (m) => (m.minAppVersion = '9.0.0')),
    )
    await expect(install(path)).rejects.toMatchObject({ message: /needs Action Stations 9\.0\.0/ })
  })
})

describe('downloaded archives (url / catalog sources)', () => {
  async function stage(buf: Promise<Buffer>): Promise<string> {
    mkdirSync(packsStagingDir(), { recursive: true })
    const path = join(packsStagingDir(), 'download-1.aspack')
    writeFileSync(path, await buf)
    return path
  }

  it('installs a staged download and deletes it afterwards', async () => {
    const path = await stage(railPack())
    const source = { kind: 'catalog' as const, url: 'https://packs.example.org/index.json' }
    const review = await call('packs:inspect', { downloadedPath: path, source })
    expect(review.ok && review.review.source).toEqual(source)
    const res = await call('packs:install', { path, source })
    expect(res.pack.source).toEqual(source)
    expect(existsSync(path)).toBe(false)
    expect(readdirSync(packsStagingDir())).toEqual([])
  })

  it('deletes a staged download after a failed install too', async () => {
    const path = await stage(PACK_FIXTURES['wrong-size']!.build())
    const source = { kind: 'url' as const, url: 'https://example.org/p.aspack' }
    await expect(call('packs:install', { path, source })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    expect(existsSync(path)).toBe(false)
  })

  it('refuses a url or catalog source whose path is outside the staging folder', async () => {
    const path = await writePack('rail.aspack', railPack())
    const source = { kind: 'url' as const, url: 'https://example.org/p.aspack' }
    await expect(call('packs:install', { path, source })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(call('packs:inspect', { downloadedPath: path, source })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(existsSync(path)).toBe(true)
  })
})

describe('conflicts', () => {
  it('a second pack with the same items installs disabled, naming the first', async () => {
    await install(await writePack('a.aspack', railPack()))
    const twin = await install(await writePack('b.aspack', twinPack()))
    expect(twin.pack.enabled).toBe(false)
    expect(twin.pack.conflict).toMatch(/Disable Freight Rail Operations to enable this pack/)
    expect(twin.pack.conflicts).toContainEqual({
      kind: 'templates',
      id: 'rail_dispatch_board',
      packId: RAIL,
      packName: 'Freight Rail Operations',
    })
    // Documents and examples are looked up with their pack id: never a conflict.
    expect([...new Set(twin.pack.conflicts.map((c) => c.kind))].sort()).toEqual([
      'domains',
      'prompts',
      'templates',
      'workflows',
    ])
    expect(packs.enabledPacks().map((p) => p.id)).toEqual([RAIL])

    const enable = call('packs:setEnabled', { id: 'org.example.rail-twin', enabled: true })
    await expect(enable).rejects.toMatchObject({ code: 'CONFLICT' })

    await call('packs:setEnabled', { id: RAIL, enabled: false })
    const listed = await call('packs:list')
    expect(listed.find((p) => p.id === RAIL)?.conflict).toBeUndefined()
    const on = await call('packs:setEnabled', { id: 'org.example.rail-twin', enabled: true })
    expect(on).toMatchObject({ enabled: true, conflicts: [] })
    // Now the rail pack is the one in the way.
    const rail = (await call('packs:list')).find((p) => p.id === RAIL)!
    expect(rail.conflict).toMatch(/Rail Twin/)
  })

  it('a pack with the same document group installs enabled beside the first', async () => {
    await install(await writePack('a.aspack', railPack()))
    const all = validPackTree()
    const tree: PackTree = Object.fromEntries(
      Object.entries(all).filter(([p]) => p.startsWith('documents/')),
    )
    const docs = await install(
      await writePack(
        'docs.aspack',
        buildPack(tree, {
          manifest: (m) => {
            m.id = 'org.example.rail-docs'
            m.name = 'Rail Docs'
            m.contents = { documents: ['rail-emergency-plan'] }
            m.domains = []
          },
        }),
      ),
    )
    expect(docs.pack).toMatchObject({ enabled: true, conflicts: [] })
    expect(packs.enabledItems('documents').map((i) => [i.pack.id, i.id])).toEqual([
      [RAIL, 'rail-emergency-plan'],
      ['org.example.rail-docs', 'rail-emergency-plan'],
    ])
  })

  it('domain aliases conflict across packs', async () => {
    await install(await writePack('a.aspack', railPack()))
    const short = await install(await writePack('b.aspack', aliasPack()))
    expect(short.pack.enabled).toBe(false)
    expect(short.pack.conflicts).toEqual([
      {
        kind: 'domains',
        id: 'freight_railroad',
        packId: RAIL,
        packName: 'Freight Rail Operations',
      },
    ])
    expect(packDomains()).toEqual(['freight_rail'])
  })
})

describe('enable, disable, uninstall', () => {
  it('disable removes the domains and the layer; enable brings them back', async () => {
    await install(await writePack('a.aspack', railPack()))
    expect(packDomains()).toEqual(['freight_rail'])
    const off = await call('packs:setEnabled', { id: RAIL, enabled: false })
    expect(off.enabled).toBe(false)
    expect(packDomains()).toEqual([])
    expect(packs.enabledPacks()).toEqual([])
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
    // A reinstall keeps the user's choice.
    const again = await install(await writePack('b.aspack', railPack()))
    expect(again.pack.enabled).toBe(false)
    await call('packs:setEnabled', { id: RAIL, enabled: true })
    expect(packDomains()).toEqual(['freight_rail'])
  })

  it('uninstall removes the folder, the registry entry and the domains', async () => {
    await install(await writePack('a.aspack', railPack()))
    await call('packs:uninstall', { id: RAIL })
    expect(existsSync(join(packsRoot(), RAIL))).toBe(false)
    expect(registry().packs).toEqual([])
    expect(packDomains()).toEqual([])
    await expect(call('packs:uninstall', { id: RAIL })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('startup', () => {
  it('registers the enabled packs’ domains on boot', async () => {
    await install(await writePack('a.aspack', railPack()))
    registerPackProfiles([]) // a fresh process
    await packs.initPacks()
    expect(packDomains()).toEqual(['freight_rail'])
    expect(packs.enabledPacks().map((p) => p.id)).toEqual([RAIL])
  })

  it('marks a pack whose folder is missing as broken', async () => {
    await install(await writePack('a.aspack', railPack()))
    const dir = join(packsRoot(), RAIL, '1.0.0')
    const { removeTree } = await import('../../packs/tree')
    await removeTree(dir)
    await packs.initPacks()
    const [p] = await call('packs:list')
    expect(p).toMatchObject({ id: RAIL, enabled: true, broken: expect.stringMatching(/missing/) })
    expect(packs.enabledPacks()).toEqual([])
    expect(packDomains()).toEqual([])
    await expect(call('packs:setEnabled', { id: RAIL, enabled: true })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('marks a pack with a changed small file as broken', async () => {
    await install(await writePack('a.aspack', railPack()))
    const readme = join(packsRoot(), RAIL, '1.0.0', 'README.md')
    chmodSync(readme, 0o644)
    const text = readFileSync(readme, 'utf8')
    writeFileSync(readme, text.replace('A test pack.', 'A tset pack.'))
    await packs.initPacks()
    const [p] = await call('packs:list')
    expect(p!.broken).toMatch(/README.md changed since it was installed/)
    // Reinstalling repairs it.
    const fixed = await install(await writePack('b.aspack', railPack()))
    expect(fixed.pack.broken).toBeUndefined()
    expect(packs.enabledPacks()).toHaveLength(1)
  })

  it('deletes orphan staging files and unregistered pack folders', async () => {
    await install(await writePack('a.aspack', railPack()))
    mkdirSync(join(packsStagingDir(), '01ORPHAN'), { recursive: true })
    writeFileSync(join(packsStagingDir(), '01ORPHAN', 'pack.json'), '{}')
    writeFileSync(join(packsStagingDir(), '01PART.part'), 'x')
    mkdirSync(join(packsRoot(), RAIL, '0.9.0'), { recursive: true })
    mkdirSync(join(packsRoot(), 'org.example.gone', '1.0.0'), { recursive: true })
    mkdirSync(join(packsRoot(), 'catalogs'), { recursive: true })
    await packs.initPacks()
    expect(existsSync(packsStagingDir())).toBe(false)
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0'])
    expect(existsSync(join(packsRoot(), 'org.example.gone'))).toBe(false)
    expect(existsSync(join(packsRoot(), 'catalogs'))).toBe(true)
    expect(packs.enabledPacks()).toHaveLength(1)
  })

  it('disables the later of two enabled packs that conflict in a hand-edited registry', async () => {
    await install(await writePack('a.aspack', railPack()))
    await install(await writePack('b.aspack', twinPack()))
    const reg = registry()
    for (const p of reg.packs) p.enabled = true
    writeFileSync(registryPath(), JSON.stringify(reg))
    await packs.initPacks()
    const listed = await call('packs:list')
    expect(listed.map((p) => [p.id, p.enabled])).toEqual([
      [RAIL, true],
      ['org.example.rail-twin', false],
    ])
  })

  it('moves a damaged registry aside and rebuilds the entries from the pack folders', async () => {
    const installed = await install(await writePack('a.aspack', railPack()))
    // A folder that fails the quick check is not rebuilt, and is not deleted either.
    mkdirSync(join(packsRoot(), 'org.example.half', '1.0.0'), { recursive: true })
    writeFileSync(join(packsRoot(), 'org.example.half', '1.0.0', 'pack.json'), '{')
    writeFileSync(registryPath(), '{oops')
    await packs.initPacks()
    expect(readdirSync(packsRoot()).some((n) => n.startsWith('registry.json.damaged-'))).toBe(true)
    const listed = await call('packs:list')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: RAIL,
      version: '1.0.0',
      enabled: false,
      source: { kind: 'unknown' },
      archiveSha256: 'unknown',
      contentSha256: installed.pack.contentSha256,
      items: installed.pack.items,
    })
    expect(listed[0]!.broken).toBeUndefined()
    expect(registry().packs).toMatchObject([{ id: RAIL, enabled: false }])
    expect(packs.enabledPacks()).toEqual([])
    expect(existsSync(join(packsRoot(), 'org.example.half'))).toBe(true)
    // The user enables it again; the next start reads the registry cleanly.
    await call('packs:setEnabled', { id: RAIL, enabled: true })
    await packs.initPacks()
    expect(packs.enabledPacks().map((p) => p.id)).toEqual([RAIL])
    expect(packDomains()).toEqual(['freight_rail'])
    // Only that clean start removes the folder no entry lists.
    expect(existsSync(join(packsRoot(), 'org.example.half'))).toBe(false)
  })

  it('keeps the highest valid version when rebuilding, and deletes nothing that start', async () => {
    await install(await writePack('a.aspack', railPack('1.0.0')))
    // Two valid versions on disk (an update interrupted before the old folder was removed)
    // and no registry.json at all.
    const keep = join(work, 'v1')
    cpSync(join(packsRoot(), RAIL, '1.0.0'), keep, { recursive: true })
    await install(await writePack('b.aspack', railPack('1.1.0')))
    cpSync(keep, join(packsRoot(), RAIL, '1.0.0'), { recursive: true })
    rmSync(registryPath())
    await packs.initPacks()
    expect((await call('packs:list')).map((p) => [p.id, p.version, p.enabled])).toEqual([
      [RAIL, '1.1.0', false],
    ])
    expect(versionsOnDisk(RAIL)).toEqual(['1.0.0', '1.1.0'])
  })
})

describe('packs:verify', () => {
  it('re-hashes every file and marks a changed one broken', async () => {
    await install(await writePack('a.aspack', railPack()))
    expect(await call('packs:verify', {})).toEqual([{ id: RAIL, version: '1.0.0', ok: true }])
    const pdf = join(
      packsRoot(),
      RAIL,
      '1.0.0',
      'documents/rail-emergency-plan/emergency-response-plan.pdf',
    )
    chmodSync(pdf, 0o644)
    const bytes = readFileSync(pdf)
    bytes[bytes.length - 2] = 0x21
    writeFileSync(pdf, bytes)
    const [r] = await call('packs:verify', { id: RAIL })
    expect(r).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/emergency-response-plan/),
    })
    expect(packs.enabledPacks()).toEqual([])
  })
})

describe('packs:updates', () => {
  const CATALOG = 'https://packs.example.org/index.json'
  async function cacheCatalog(versions: string[]): Promise<void> {
    await updateSettings((s) => {
      s.packs.catalogs.push({ url: CATALOG, addedAt: '2026-10-23T00:00:00Z' })
    })
    const entries = versions.map((version) => catalogEntry({ id: RAIL, version }))
    mkdirSync(join(packsRoot(), 'catalogs'), { recursive: true })
    writeFileSync(
      catalogCachePath(CATALOG),
      JSON.stringify({
        url: CATALOG,
        fetchedAt: '2026-10-23T00:00:00Z',
        skipped: [],
        catalog: catalogBody(entries),
      }),
    )
  }

  it('offers the highest stable version to a stable install', async () => {
    await install(await writePack('a.aspack', railPack('1.0.0')))
    await cacheCatalog(['1.0.0', '1.1.0', '1.2.0-beta.1'])
    const updates = await call('packs:updates')
    expect(updates.map((u) => [u.id, u.installed, u.latest.version, u.catalogUrl])).toEqual([
      [RAIL, '1.0.0', '1.1.0', CATALOG],
    ])
  })

  it('offers a newer prerelease to a prerelease install', async () => {
    await install(await writePack('a.aspack', railPack('1.2.0-beta.0')))
    await cacheCatalog(['1.1.0', '1.2.0-beta.1'])
    expect((await call('packs:updates')).map((u) => u.latest.version)).toEqual(['1.2.0-beta.1'])
  })
})

describe('layer API', () => {
  it('resolves item paths and files inside the pack folder', async () => {
    await install(await writePack('a.aspack', railPack()))
    const pack = packs.packById(RAIL)!
    expect(pack.dir).toBe(join(packsRoot(), RAIL, '1.0.0'))
    expect(packs.packItemPath(pack, 'templates', 'rail_dispatch_board')).toMatch(
      /templates[/\\]rail_dispatch_board$/,
    )
    expect(readFileSync(packs.packItemPath(pack, 'prompts', 'inject_text'), 'utf8')).toMatch(/^---/)
    expect(packs.packItemFiles(pack, 'workflows', 'yard-cctv-still').map((f) => f.path)).toEqual([
      'workflows/yard-cctv-still.bindings.json',
      'workflows/yard-cctv-still.json',
    ])
    expect(() => packs.packItemPath(pack, 'templates', 'tweet')).toThrow(/no templates item/)
    expect(() => packs.packFilePath(pack, '../registry.json')).toThrow()
    expect(packs.enabledItems('examples')).toEqual([{ pack, id: 'harbor-junction' }])
    expect(packs.packAppliesToDomain(pack, 'freight_rail')).toBe(true)
    expect(packs.packAppliesToDomain(pack, 'airport')).toBe(false)
  })

  it('notifies listeners on every change and returns a stable array between changes', async () => {
    let calls = 0
    const off = packs.onPacksChanged(() => calls++)
    await install(await writePack('a.aspack', railPack()))
    const first = packs.enabledPacks()
    expect(packs.enabledPacks()).toBe(first)
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    await call('packs:uninstall', { id: RAIL })
    off()
    expect(calls).toBe(3)
    expect(packs.enabledPacks()).not.toBe(first)
  })
})
