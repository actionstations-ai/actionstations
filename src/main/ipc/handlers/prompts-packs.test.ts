// Integration (#262): the pack prompt layer through the prompts:* and packs:* handlers.
// project > global > pack > default; a pack's prompts apply only to the domains it lists
// (resolved through the domain registry and project snapshots), or everywhere when it lists
// none. Each test gets its own TTX_USER_DATA; packs are built at test time.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import {
  buildPack,
  validPackTree,
  type Manifest,
  type PackTree,
} from '../../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
}))
// Shipped prompts (inject_text) come from the repo; fixture packs need app 0.3.0.
process.env.TTX_RESOURCES = resolve('.')
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../registry')
const promptHandlers = (await import('./prompts')).default
const packHandlers = (await import('./packs')).default
const { createProject, updateProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { registerPackProfiles } = await import('@shared/domains')
const packs = await import('../../packs')
const { loadPrompt } = await import('../../prompts')

const NAME = 'inject_text'
const RAIL = 'ai.actionstations.freight-rail'
const DEFAULT_RAW = readFileSync(resolve('prompts', `${NAME}.md`), 'utf8')
const RULE = 'Use railroad terms: yard, mainline, dispatcher, consist.'
/** The shipped prompt with one extra line in its @system section, still valid. */
const withRule = (raw: string, rule: string) =>
  raw.replace('<!-- @system -->\n', `<!-- @system -->\n${rule}\n`)
const PACK_RAW = withRule(DEFAULT_RAW, RULE)

async function call<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const handlers = channel.startsWith('packs:') ? packHandlers : promptHandlers
  const r = await dispatch(handlers, channel, req[0])
  if (!r.ok)
    throw Object.assign(new Error(`${r.error.code} ${r.error.message}`), { code: r.error.code })
  return r.data as ChannelResponse<C>
}

let work: string

/** The rail pack tree with its prompt carrying `prompt` (PACK_RAW by default). */
function railTree(prompt = PACK_RAW): PackTree {
  return { ...validPackTree(), [`prompts/${NAME}.md`]: prompt }
}

async function install(buf: Promise<Buffer> | Buffer, file = 'pack.aspack') {
  const path = join(work, file)
  writeFileSync(path, await buf)
  return call('packs:install', { path, source: { kind: 'file', name: basename(path) } })
}

const installRail = (edit?: (m: Manifest) => void, prompt?: string) =>
  install(buildPack(railTree(prompt), edit ? { manifest: edit } : {}), 'rail.aspack')

/** A pack that only carries the prompt, scoped to freight_rail (the rail pack minus it). */
async function installSplitPacks(): Promise<void> {
  const tree = validPackTree()
  delete tree[`prompts/${NAME}.md`]
  await install(
    buildPack(tree, { manifest: (m) => ((m.contents as { prompts: string[] }).prompts = []) }),
    'rail.aspack',
  )
  await install(
    buildPack(
      { [`prompts/${NAME}.md`]: PACK_RAW },
      {
        manifest: (m) => {
          m.id = 'org.example.rail-prompts'
          m.name = 'Rail Prompts'
          m.contents = { prompts: [NAME] }
          m.documents = []
          m.domains = ['freight_rail']
        },
      },
    ),
    'prompts.aspack',
  )
}

async function newProject(orgType?: string): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  return (
    await createProject({
      parentDir: parent,
      name: 'Harbor Junction',
      ...(orgType ? { orgType } : {}),
    })
  ).path
}

const source = async (projectPath?: string) => (await loadPrompt(NAME, projectPath)).source

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  work = mkdtempSync(join(tmpdir(), 'ttx-packs-'))
  resetSettingsCache()
  registerPackProfiles([])
  await packs.loadPacks()
})

describe('pack prompt layer: domain scope', () => {
  it('applies to a project whose domain the pack lists, and not to another', async () => {
    await installRail()
    const rail = await newProject('freight_rail')
    const airport = await newProject('airport')

    const prompt = await loadPrompt(NAME, rail)
    expect(prompt).toMatchObject({
      source: 'pack',
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
    })
    expect(prompt.body).toContain(RULE)
    expect(await source(airport)).toBe('default')
  })

  it('with no project, applies only when the pack lists no domains', async () => {
    await installRail()
    expect(await source()).toBe('default')
    await installRail((m) => {
      m.version = '1.1.0'
      m.domains = []
    })
    expect(await loadPrompt(NAME)).toMatchObject({ source: 'pack', packVersion: '1.1.0' })
    expect(await source(await newProject('airport'))).toBe('pack')
  })

  it('resolves the project domain by alias, not by raw orgType', async () => {
    await installRail()
    expect(await source(await newProject('Freight Railroad'))).toBe('pack')
  })

  it('resolves the project domain from its snapshot when the domain pack is disabled', async () => {
    await installSplitPacks()
    const project = await newProject('freight_rail')
    expect(await loadPrompt(NAME, project)).toMatchObject({
      source: 'pack',
      packId: 'org.example.rail-prompts',
    })
    // The rail pack provided the domain; the project keeps its snapshot of it.
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    expect(await source(project)).toBe('pack')
    // Without a snapshot the orgType names nothing registered: generic, so no pack prompt.
    await updateProject(project, (p) => {
      delete p.domainProfileSnapshot
    })
    expect(await source(project)).toBe('default')
  })

  it('disabling the pack falls back to the default; enabling it brings it back', async () => {
    await installRail()
    const project = await newProject('freight_rail')
    expect(await source(project)).toBe('pack')
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    expect(await source(project)).toBe('default')
    await call('packs:setEnabled', { id: RAIL, enabled: true })
    expect(await source(project)).toBe('pack')
    await call('packs:uninstall', { id: RAIL })
    expect(await source(project)).toBe('default')
  })
})

describe('pack prompt layer: precedence', () => {
  it('global and project overrides still win over the pack', async () => {
    await installRail()
    const project = await newProject('freight_rail')
    await call('prompts:save', { name: NAME, scope: 'global', raw: withRule(DEFAULT_RAW, 'G.') })
    expect(await source(project)).toBe('global')
    await call('prompts:save', {
      name: NAME,
      scope: 'project',
      projectPath: project,
      raw: withRule(DEFAULT_RAW, 'P.'),
    })
    expect(await source(project)).toBe('project')

    // Reset goes back down: project -> global -> pack -> (pack disabled) default.
    await call('prompts:reset', { name: NAME, scope: 'project', projectPath: project })
    expect(await source(project)).toBe('global')
    await call('prompts:reset', { name: NAME, scope: 'global' })
    expect(await source(project)).toBe('pack')
  })

  it('lists and gets the pack layer with its provenance', async () => {
    await installRail()
    const project = await newProject('freight_rail')
    const entry = (await call('prompts:list', { projectPath: project })).find(
      (e) => e.name === NAME,
    )
    expect(entry).toMatchObject({
      effectiveSource: 'pack',
      hasPackLayer: true,
      hasGlobalOverride: false,
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
    })
    const other = (await call('prompts:list', {})).find((e) => e.name === NAME)
    expect(other).toMatchObject({ effectiveSource: 'default', hasPackLayer: false })
    expect(other).not.toHaveProperty('packId')

    const layers = await call('prompts:get', { name: NAME, projectPath: project })
    expect(layers.raw.pack).toBe(PACK_RAW)
    expect(layers.pack).toMatchObject({ source: 'pack', packId: RAIL })
    expect(layers.effective.source).toBe('pack')
    expect(layers.default.source).toBe('default')
  })

  it('records the pack text hash as the rendered prompt hash', async () => {
    await installRail()
    const project = await newProject('freight_rail')
    const { renderPrompt } = await import('../../prompts')
    const { createHash } = await import('node:crypto')
    const rendered = renderPrompt(await loadPrompt(NAME, project), {})
    expect(rendered.hash).toBe(createHash('sha256').update(PACK_RAW).digest('hex'))
  })
})

describe('pack prompt layer: YAML-only frontmatter (#257)', () => {
  const jsPrompt = PACK_RAW.replace(/^---\n/, '---js\n')

  it('refuses to install a pack whose prompt has ---js frontmatter', async () => {
    await expect(installRail(undefined, jsPrompt)).rejects.toThrow(/YAML/)
    expect((await call('packs:list')).filter((p) => !p.bundled)).toEqual([])
  })

  it('refuses a ---js pack prompt at load time too (file changed after install)', async () => {
    await installRail()
    const file = join(packs.packById(RAIL)!.dir, 'prompts', `${NAME}.md`)
    chmodSync(file, 0o644)
    writeFileSync(file, jsPrompt)
    await expect(loadPrompt(NAME, await newProject('freight_rail'))).rejects.toThrow(
      /Freight Rail Operations.*prompts\/inject_text\.md/,
    )
  })
})
