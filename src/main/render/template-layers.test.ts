// Template layers (#261, ADR-0018): project > user > pack > built-in, the template checker on
// every non-built-in layer, the inject type registry, copy-on-use into <project>/packs.json,
// rendering after the pack is uninstalled, and "Update from pack". Main-level through the IPC
// dispatcher; each test gets its own TTX_USER_DATA. The render window is replaced by a fake that
// records the composed document (no Electron).
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { Channel, ChannelRequest, ChannelResponse } from '@shared/ipc'
import { MselRow, ScenarioBrief } from '@shared/schemas'
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
const composed: string[] = []
vi.mock('./window', () => ({
  renderPng: vi.fn(async (doc: { html: string }) => {
    composed.push(doc.html)
    return { png: Buffer.from('png'), width: 10, height: 10, scale: 2 }
  }),
  renderPdf: vi.fn(async () => Buffer.from('%PDF-1.4')),
}))
process.env.TTX_RESOURCES = resolve('.')
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../ipc/registry')
const handlers = {
  ...(await import('../ipc/handlers/packs')).default,
  ...(await import('../ipc/handlers/templates')).default,
  ...(await import('../ipc/handlers/render')).default,
  ...(await import('../ipc/handlers/injects')).default,
}
const packs = await import('../packs')
const { registerPackProfiles } = await import('@shared/domains')
const { injectTypeInfo, registerInjectTypes } = await import('@shared/taxonomy')
const { createProject } = await import('../project/store')
const { createScenario, updateScenario } = await import('../scenario/store')
const { chooseInjectType } = await import('../generate/injects/type-map')
const { readProjectPacks } = await import('../packs/project-copies')
const {
  clearTemplateCache,
  listTemplateTypes,
  loadTemplate,
  refusedTemplates,
  userTemplatesRoot,
  validateFields,
} = await import('./templates')
const { syncInjectTypes } = await import('./template-registry')

type Handlers = Parameters<typeof dispatch>[0]
async function call<C extends Channel>(
  channel: C,
  ...req: ChannelRequest<C> extends void ? [] : [ChannelRequest<C>]
): Promise<ChannelResponse<C>> {
  const r = await dispatch(handlers as Handlers, channel, req[0])
  if (!r.ok)
    throw Object.assign(new Error(r.error.message), {
      code: r.error.code,
      details: r.error.details,
    })
  return r.data as ChannelResponse<C>
}

const RAIL = 'ai.actionstations.heritage-rail'
const BOARD = 'rail_dispatch_board'
const BUILTIN_TWEET = resolve('templates/injects/tweet')
let work: string
let root: string

async function installArchive(name: string, buf: Promise<Buffer>): Promise<void> {
  const path = join(work, name)
  writeFileSync(path, await buf)
  await call('packs:install', { path, source: { kind: 'file', name: basename(path) } })
}

const railPack = (version = '1.0.0', tree: PackTree = validPackTree()) =>
  buildPack(tree, { manifest: (m) => void (m.version = version) })

/** A pack whose only item is a copy of the built-in tweet template (shadows it). */
function tweetPack(): Promise<Buffer> {
  const tree: PackTree = {}
  for (const f of ['meta.json', 'schema.json', 'preview.json', 'template.html', 'style.css'])
    if (existsSync(join(BUILTIN_TWEET, f)))
      tree[`templates/tweet/${f}`] = readFileSync(join(BUILTIN_TWEET, f))
  return buildPack(tree, {
    manifest: (m) => {
      m.id = 'org.example.social'
      m.name = 'Social Extras'
      m.contents = { templates: ['tweet'] }
      m.documents = []
      m.domains = []
    },
  })
}

/** Copy the built-in tweet into a layer folder with another label (and optional HTML). */
function tweetFolder(layerRoot: string, label: string, html?: string): string {
  const dir = join(layerRoot, 'tweet')
  mkdirSync(layerRoot, { recursive: true })
  cpSync(BUILTIN_TWEET, dir, { recursive: true })
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { label: string }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, label }))
  if (html !== undefined) writeFileSync(join(dir, 'template.html'), html)
  return dir
}

const projectLayer = () => join(root, 'templates', 'injects')

async function scenarioWithRow(): Promise<string> {
  const s = await createScenario(root, { title: 'T', brief: ScenarioBrief.parse({}) })
  await updateScenario(
    root,
    s.id,
    (sc) => {
      sc.msel.push(
        MselRow.parse({
          id: 'I-01',
          phaseId: 'ph1',
          time: '0:10',
          from: 'Dispatch desk',
          toRoleIds: ['all'],
          event: 'The board shows a held train on track 3.',
          expectedAction: 'Ops confirm the hold.',
          purposeTag: 'CORE_NARRATIVE',
        }),
      )
    },
    { by: 'user' },
  )
  return s.id
}

const boardFields = { desk: 'Harbor', trains: [{ symbol: 'M-HJ12', track: '3', status: 'Held' }] }

async function boardInject(scenarioId: string) {
  const created = await call('injects:create', {
    projectPath: root,
    scenarioId,
    mselRowId: 'I-01',
    type: BOARD,
  })
  return call('injects:save', {
    projectPath: root,
    scenarioId,
    inject: { ...created, fields: boardFields },
  })
}

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  work = mkdtempSync(join(tmpdir(), 'ttx-tl-'))
  clearTemplateCache()
  registerPackProfiles([])
  registerInjectTypes([])
  await packs.loadPacks()
  root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'P' })).path
  composed.length = 0
})

afterAll(() => registerInjectTypes([]))

describe('precedence: project > user > pack > built-in', () => {
  it('uses the bundled core template when no other layer has the type (ADR-0020)', async () => {
    const t = loadTemplate('tweet', root)
    expect(t.source).toBe('builtin')
    expect(t.pack).toMatchObject({ id: 'ai.actionstations.core', bundled: true, enabled: true })
    expect(t.replaces).toBeUndefined()
    const info = (await call('templates:list', undefined)).find((x) => x.type === 'tweet')
    expect(info).toMatchObject({
      source: 'pack',
      packId: 'ai.actionstations.core',
      packName: 'Action Stations Core',
      bundled: true,
    })
    expect(info?.hidden).toBeUndefined()
  })

  it('a pack template shadowing a built-in reports replaces: builtin', async () => {
    await installArchive('social.aspack', tweetPack())
    const t = loadTemplate('tweet', root)
    expect(t).toMatchObject({ source: 'pack', replaces: 'builtin' })
    const info = (await call('templates:list', undefined)).find((x) => x.type === 'tweet')
    expect(info).toMatchObject({
      source: 'pack',
      packId: 'org.example.social',
      packVersion: '1.0.0',
      packName: 'Social Extras',
      replaces: 'builtin',
      replacesPackName: 'Action Stations Core',
    })
  })

  it('the user layer wins over a pack', async () => {
    await installArchive('social.aspack', tweetPack())
    tweetFolder(userTemplatesRoot(), 'My tweet')
    const t = loadTemplate('tweet', root)
    expect(t).toMatchObject({ source: 'user', replaces: 'pack' })
    expect(t.meta.label).toBe('My tweet')
  })

  it('the project layer wins over the user layer', async () => {
    tweetFolder(userTemplatesRoot(), 'My tweet')
    tweetFolder(projectLayer(), 'Project tweet')
    const t = loadTemplate('tweet', root)
    expect(t).toMatchObject({ source: 'project', replaces: 'user' })
    expect(t.meta.label).toBe('Project tweet')
    // Without the project, the user layer applies.
    expect(loadTemplate('tweet').source).toBe('user')
    const list = await call('templates:list', { projectPath: root })
    expect(list.find((x) => x.type === 'tweet')).toMatchObject({
      source: 'project',
      label: 'Project tweet',
      replaces: 'user',
    })
  })
})

describe('template checker at load', () => {
  it('refuses a project template with <script> and uses the next layer', async () => {
    tweetFolder(projectLayer(), 'Scripted', '<div>{{fields.text}}</div><script>alert(1)</script>')
    const t = loadTemplate('tweet', root)
    expect(t.source).toBe('builtin')
    const refused = refusedTemplates(root)
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({ type: 'tweet', source: 'project' })
    expect(refused[0]!.problems.map((p) => p.message)).toContain('<script> is not allowed')
    const viaIpc = await call('templates:refused', { projectPath: root })
    expect(viaIpc[0]).toMatchObject({ type: 'tweet', source: 'project' })
  })

  it('a refused project-only type cannot be loaded or listed', async () => {
    mkdirSync(join(projectLayer(), 'own_card'), { recursive: true })
    const dir = join(projectLayer(), 'own_card')
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify({ type: 'own_card', label: 'Own', width: 600 }),
    )
    writeFileSync(join(dir, 'preview.json'), JSON.stringify({ fields: { text: 'x' } }))
    writeFileSync(join(dir, 'template.html'), '<img src="https://example.com/x.png" alt="">')
    expect(() => loadTemplate('own_card', root)).toThrow(/refused/)
    expect(listTemplateTypes(root)).not.toContain('own_card')
    // Fixed: the cache follows the folder's mtime.
    writeFileSync(join(dir, 'template.html'), '<p>{{fields.text}}</p>')
    expect(loadTemplate('own_card', root).source).toBe('project')
    expect(listTemplateTypes(root)).toContain('own_card')
  })

  it('checks user templates too', () => {
    tweetFolder(userTemplatesRoot(), 'Handler', '<div onclick="x()">{{fields.text}}</div>')
    expect(loadTemplate('tweet').source).toBe('builtin')
    expect(refusedTemplates()[0]).toMatchObject({ type: 'tweet', source: 'user' })
  })
})

describe('schema regex rule and symlinked layer roots at load (#302)', () => {
  const redosSchema = (dir: string) => {
    const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'))
    schema.properties.text.pattern = '^(\\w+\\s?)*$'
    writeFileSync(join(dir, 'schema.json'), JSON.stringify(schema))
  }

  it('refuses a user or project schema.json with a backtracking pattern', () => {
    redosSchema(tweetFolder(userTemplatesRoot(), 'Slow'))
    redosSchema(tweetFolder(projectLayer(), 'Slow too'))
    expect(loadTemplate('tweet', root).source).toBe('builtin')
    const refused = refusedTemplates(root)
    expect(refused.map((r) => r.source)).toEqual(['project', 'user'])
    expect(refused[0]!.problems[0]).toMatchObject({
      path: 'schema.json',
      message: expect.stringMatching(/\/properties\/text\/pattern: .* uses groups/),
    })
    // validateFields therefore never compiles the slow pattern.
    const t = Date.now()
    validateFields('tweet', { text: 'Airport ops team reports delay!' }, root)
    expect(Date.now() - t).toBeLessThan(200)
  })

  it('keeps a user copy of a built-in schema (its simple patterns are allowed)', () => {
    tweetFolder(userTemplatesRoot(), 'Mine')
    expect(loadTemplate('tweet').source).toBe('user')
  })

  it('ignores a project whose templates folder is a symlink', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'ttx-elsewhere-'))
    tweetFolder(join(elsewhere, 'injects'), 'Linked')
    symlinkSync(elsewhere, join(root, 'templates'))
    expect(loadTemplate('tweet', root).source).toBe('builtin')
    expect(refusedTemplates(root)).toEqual([])
  })

  it('ignores a project whose templates/injects folder is a symlink', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'ttx-elsewhere-'))
    tweetFolder(elsewhere, 'Linked')
    mkdirSync(join(root, 'templates'), { recursive: true })
    symlinkSync(elsewhere, projectLayer())
    expect(loadTemplate('tweet', root).source).toBe('builtin')
  })
})

describe('inject type registry', () => {
  it('adds pack types from the meta.json taxonomy block and drops them on uninstall', async () => {
    await installArchive('rail.aspack', railPack())
    await syncInjectTypes()
    const listed = await call('templates:taxonomy', undefined)
    expect(listed.find((t) => t.id === BOARD)).toMatchObject({
      label: 'Rail dispatch board',
      category: 'operational',
      defaultDelivery: 'display_main_screen',
      domains: ['heritage_rail'],
      source: 'pack',
      pack: { id: RAIL, version: '1.0.0' },
    })
    expect(listed.find((t) => t.id === 'tweet')?.source).toBeUndefined()
    expect(injectTypeInfo(BOARD)?.category).toBe('operational')

    const row = MselRow.parse({
      id: 'I-01',
      phaseId: 'ph1',
      time: '0:10',
      from: 'Dispatch',
      toRoleIds: ['all'],
      event: 'x',
      expectedAction: 'y',
      purposeTag: 'CORE_NARRATIVE',
      format: BOARD,
    })
    const installed = listTemplateTypes(root)
    expect(chooseInjectType(row, installed, 'heritage_rail')).toMatchObject({
      type: BOARD,
      hasTemplate: true,
    })
    // Domain tags apply to pack types: a transit project does not get the rail board.
    expect(chooseInjectType(row, installed, 'transit').type).not.toBe(BOARD)

    await call('packs:uninstall', { id: RAIL })
    await syncInjectTypes()
    expect(injectTypeInfo(BOARD)).toBeUndefined()
  })
})

describe('copy-on-use', () => {
  it('copies the template on create and still renders it after the pack is uninstalled', async () => {
    await installArchive('rail.aspack', railPack())
    const scenarioId = await scenarioWithRow()
    const inject = await boardInject(scenarioId)

    const { copies } = await readProjectPacks(root)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({
      kind: 'templates',
      id: BOARD,
      packId: RAIL,
      version: '1.0.0',
    })
    expect(copies[0]!.files.map((f) => f.path)).toContain(
      `templates/injects/${BOARD}/template.html`,
    )
    expect(existsSync(join(projectLayer(), BOARD, 'fonts', 'board.woff2'))).toBe(true)
    const before = (await call('templates:list', { projectPath: root })).find(
      (x) => x.type === BOARD,
    )
    expect(before).toMatchObject({
      source: 'project',
      packId: RAIL,
      packVersion: '1.0.0',
      packName: 'Freight Rail Operations',
      replaces: 'pack',
      copy: { edited: false, packMissing: false, updateAvailable: false },
    })

    await call('packs:uninstall', { id: RAIL })
    const after = (await call('templates:list', { projectPath: root })).find(
      (x) => x.type === BOARD,
    )
    expect(after).toMatchObject({ source: 'project', packId: RAIL, copy: { packMissing: true } })
    expect(after?.replaces).toBeUndefined()
    // The project's own types include it; without the project nothing provides it.
    expect((await call('templates:taxonomy', { projectPath: root })).map((t) => t.id)).toContain(
      BOARD,
    )
    expect((await call('templates:taxonomy', undefined)).map((t) => t.id)).not.toContain(BOARD)

    const assets = await call('render:inject', {
      projectPath: root,
      scenarioId,
      injectId: inject.id,
    })
    expect(assets).toHaveLength(1)
    expect(assets[0]!.provenance).toMatchObject({ provider: 'template', templateId: BOARD })
    // The project copy's markup and CSS (the pack folder is gone).
    expect(composed.at(-1)).toContain('inject-rail_dispatch_board')
    expect(composed.at(-1)).toContain('font-family: Board, monospace')
  })

  it('copies on render when the inject predates the copy', async () => {
    await installArchive('rail.aspack', railPack())
    const scenarioId = await scenarioWithRow()
    const inject = await boardInject(scenarioId)
    // Simulate a project where the copy was removed (shared without it): render copies again.
    const { forgetCopy } = await import('../packs/project-copies')
    await forgetCopy(root, 'templates', BOARD)
    const { rmSync } = await import('node:fs')
    rmSync(join(projectLayer(), BOARD), { recursive: true })
    await call('render:inject', { projectPath: root, scenarioId, injectId: inject.id })
    expect((await readProjectPacks(root)).copies.map((c) => c.id)).toEqual([BOARD])
  })

  it('does not copy built-in or user templates', async () => {
    await installArchive('rail.aspack', railPack())
    const scenarioId = await scenarioWithRow()
    await call('injects:create', {
      projectPath: root,
      scenarioId,
      mselRowId: 'I-01',
      type: 'tweet',
    })
    expect((await readProjectPacks(root)).copies).toEqual([])
  })

  it('"Update from pack" refuses an edited copy unless confirmed', async () => {
    await installArchive('rail.aspack', railPack('1.0.0'))
    const scenarioId = await scenarioWithRow()
    await boardInject(scenarioId)

    const tree = validPackTree()
    const meta = JSON.parse(tree[`templates/${BOARD}/meta.json`] as string) as { label: string }
    tree[`templates/${BOARD}/meta.json`] = JSON.stringify({ ...meta, label: 'Dispatch board v2' })
    await installArchive('rail-1.1.aspack', railPack('1.1.0', tree))
    const listed = (await call('templates:list', { projectPath: root })).find(
      (x) => x.type === BOARD,
    )
    expect(listed).toMatchObject({
      label: 'Rail dispatch board',
      packVersion: '1.0.0',
      copy: { updateAvailable: true, installedVersion: '1.1.0', edited: false },
    })

    writeFileSync(join(projectLayer(), BOARD, 'style.css'), '.board { color: red; }\n')
    const refused = await call('templates:updateFromPack', {
      projectPath: root,
      type: BOARD,
    }).catch((e: { code: string }) => e)
    expect(refused).toMatchObject({ code: 'CONFLICT' })
    expect(readFileSync(join(projectLayer(), BOARD, 'style.css'), 'utf8')).toContain('red')

    const updated = await call('templates:updateFromPack', {
      projectPath: root,
      type: BOARD,
      confirmEdited: true,
    })
    expect(updated).toMatchObject({
      label: 'Dispatch board v2',
      source: 'project',
      packVersion: '1.1.0',
      copy: { edited: false, updateAvailable: false },
    })
  })

  it('"Update from pack" replaces an unedited copy without confirmation (#310)', async () => {
    await installArchive('rail.aspack', railPack('1.0.0'))
    await boardInject(await scenarioWithRow())
    const tree = validPackTree()
    const meta = JSON.parse(tree[`templates/${BOARD}/meta.json`] as string) as { label: string }
    tree[`templates/${BOARD}/meta.json`] = JSON.stringify({ ...meta, label: 'Dispatch board v2' })
    await installArchive('rail-1.1.aspack', railPack('1.1.0', tree))

    const updated = await call('templates:updateFromPack', { projectPath: root, type: BOARD })
    expect(updated).toMatchObject({
      label: 'Dispatch board v2',
      packVersion: '1.1.0',
      copy: { edited: false, updateAvailable: false },
    })
    expect((await readProjectPacks(root)).copies).toEqual([
      expect.objectContaining({ kind: 'templates', id: BOARD, version: '1.1.0' }),
    ])
  })

  it('"Update from pack" needs a recorded copy and the pack installed', async () => {
    await expect(
      call('templates:updateFromPack', { projectPath: root, type: BOARD }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
