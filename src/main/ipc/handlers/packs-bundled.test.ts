// Packs included with the app (ADR-0020, #314) through the IPC dispatcher: the build
// (assemble, validate with the reader, write), the built layout (app-resources/packs) with a
// fixture document, source mode over the repo, enable/disable, the core pack that cannot be
// turned off, and what an installed pack may and may not take from a bundled one.
// Each test gets its own TTX_USER_DATA; no network.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { DocumentMeta, Scenario } from '@shared/schemas'
import { PACK_FIXTURES, buildPack } from '../../../../tests/fixtures/packs/build'
import { FakeIndex } from '../../../../tests/fixtures/ingest/fake-index'

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
const REPO = resolve('.')
process.env.TTX_RESOURCES = REPO
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./packs')).default,
  ...(await import('./pack-documents')).default,
  ...(await import('./documents')).default,
  ...(await import('./domains')).default,
  ...(await import('./templates')).default,
  ...(await import('./render')).default,
  ...(await import('./examples')).default,
}
const packs = await import('../../packs')
const { bundledPacks, packById } = await import('../../packs/layers')
const { registryPath } = await import('../../packs/registry')
const { buildBundledPacks } = await import('../../packs/bundled-build')
const { assembleBundledPacks } = await import('../../packs/bundled-assemble')
const { BUNDLED_MAP, BundledMap, sourceBundledProfileEntries } =
  await import('../../packs/bundled-map')
const { createProject, loadProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { jobs } = await import('../../jobs/manager')
const { setIndexFactory } = await import('../../ingest/pipeline')
const { loadTemplate, validateFields } = await import('../../render/templates')
const { composeDocument } = await import('../../render/compose')
const { domainContext } = await import('../../generate/domain')
const { lintScenario } = await import('../../generate/lint')
const { builtinProfile, registerBundledProfiles, registerPackProfiles } =
  await import('@shared/domains')
const { injectTypesForDomain } = await import('@shared/taxonomy')

async function call<T>(channel: string, req?: unknown): Promise<T> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok)
    throw Object.assign(new Error(r.error.message), {
      code: r.error.code,
      details: r.error.details,
    })
  return r.data as T
}

interface View {
  id: string
  name: string
  enabled: boolean
  bundled?: boolean
  core?: boolean
  broken?: string
  source: { kind: string }
  items: { kind: string; id: string }[]
}

const CORE = 'ai.actionstations.core'
const AIRPORT = 'ai.actionstations.airport'
const TRANSIT = 'ai.actionstations.transit'
const DOC = 'documents/fta-guide/transit-security-note.md'

const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

beforeEach(async () => {
  process.env.TTX_USER_DATA = tmp('ttx-ud-')
  delete process.env.TTX_BUNDLED_PACKS
  resetSettingsCache()
  registerPackProfiles([])
  await packs.loadPacks()
})

afterAll(() => {
  delete process.env.TTX_BUNDLED_PACKS
  registerBundledProfiles(sourceBundledProfileEntries('0.1.0'))
})

// ---- the build -------------------------------------------------------------------------------

/** A small repo: two templates, a prompt, a workflow, two domains and one fixture document. */
function fixtureRepo(): string {
  const root = tmp('ttx-bundled-repo-')
  for (const t of ['tweet', 'fids_board'])
    cpSync(join(REPO, 'templates/injects', t), join(root, 'templates/injects', t), {
      recursive: true,
    })
  mkdirSync(join(root, 'prompts'), { recursive: true })
  cpSync(join(REPO, 'prompts/ideate.md'), join(root, 'prompts/ideate.md'))
  mkdirSync(join(root, 'comfy/workflows'), { recursive: true })
  for (const f of ['sdxl-photo.json', 'sdxl-photo.bindings.json'])
    cpSync(join(REPO, 'comfy/workflows', f), join(root, 'comfy/workflows', f))
  mkdirSync(join(root, 'packs/domains'), { recursive: true })
  for (const d of ['generic', 'transit'])
    cpSync(join(REPO, `packs/domains/${d}.json`), join(root, `packs/domains/${d}.json`))
  const docDir = join(root, 'packs/documents/transit/fta-guide')
  mkdirSync(docDir, { recursive: true })
  writeFileSync(
    join(docDir, 'transit-security-note.md'),
    '# Transit security note\n\nA fixture standing in for a public-domain FTA guide.\n',
  )
  return root
}

function fixtureMap(over: (m: Record<string, unknown>) => void = () => {}) {
  const m = {
    author: { name: 'Action Stations' },
    license: 'LicenseRef-Action-Stations',
    packs: [
      {
        id: CORE,
        name: 'Action Stations Core',
        summary: 'Core.',
        core: true,
        contents: {
          templates: ['tweet', 'fids_board'],
          prompts: ['ideate'],
          workflows: ['sdxl-photo'],
          domains: ['generic'],
        },
      },
      {
        id: TRANSIT,
        name: 'Transit',
        summary: 'Transit.',
        domains: ['transit'],
        contents: { domains: ['transit'] },
        documents: [
          {
            path: 'fta-guide/transit-security-note.md',
            title: 'Transit security note',
            license: 'LicenseRef-US-Government-Work',
            publisher: 'Federal Transit Administration',
            url: 'https://www.transit.dot.gov/',
          },
        ],
      },
    ],
  }
  over(m)
  return BundledMap.parse(m)
}

async function buildFixture(): Promise<string> {
  const out = join(tmp('ttx-bundled-out-'), 'packs')
  const r = await buildBundledPacks({
    root: fixtureRepo(),
    outDir: out,
    appVersion: '0.1.0',
    map: fixtureMap(),
  })
  if (!r.ok) throw new Error(r.problems.join('\n'))
  return out
}

describe('assembling the bundled packs', () => {
  it('maps every item of the repo to exactly one pack (packs/bundled.json)', () => {
    const r = assembleBundledPacks(BUNDLED_MAP, { root: REPO, appVersion: '0.1.0', strict: true })
    expect(r.problems).toEqual([])
    const ids = r.packs.map((p) => p.manifest.id)
    expect(ids).toHaveLength(BUNDLED_MAP.packs.length)
    expect(ids[0]).toBe(CORE)
    const airport = r.packs.find((p) => p.manifest.id === AIRPORT)!.manifest.contents
    expect(airport).toMatchObject({
      templates: ['bhs_scada_screen', 'fids_board'],
      domains: ['airport'],
      examples: ['airport-ncia'],
    })
    const core = r.packs[0]!.manifest.contents
    expect(core.templates).toContain('tweet')
    expect(core.templates).not.toContain('fids_board')
    expect(core.prompts).toHaveLength(12)
    expect(core.domains).toEqual(['generic'])
    // Goldens never ship.
    expect(r.packs.flatMap((p) => p.files).some((f) => f.path.includes('__golden__'))).toBe(false)
  })

  it('fails on an item mapped to no pack, to two packs, or missing from the repo', () => {
    const root = fixtureRepo()
    const unmapped = assembleBundledPacks(
      fixtureMap((m) => {
        const core = (m.packs as { contents: { templates: string[] } }[])[0]!
        core.contents.templates = ['tweet']
      }),
      { root, appVersion: '0.1.0', strict: true },
    )
    expect(unmapped.problems).toContain(
      'templates fids_board is in the repo but mapped to no pack in packs/bundled.json',
    )
    const twice = assembleBundledPacks(
      fixtureMap((m) => {
        const transit = (m.packs as { contents: Record<string, string[]> }[])[1]!
        transit.contents.templates = ['fids_board']
      }),
      { root, appVersion: '0.1.0', strict: true },
    )
    expect(twice.problems.join('\n')).toMatch(
      /templates fids_board is mapped to more than one pack/,
    )
    const missing = assembleBundledPacks(
      fixtureMap((m) => {
        const core = (m.packs as { contents: { prompts: string[] } }[])[0]!
        core.contents.prompts = ['ideate', 'nonexistent']
      }),
      { root, appVersion: '0.1.0', strict: true },
    )
    expect(missing.problems.join('\n')).toMatch(
      /prompts "nonexistent" is mapped but not in the repo/,
    )
  })

  it('keeps workflows in the core, documents described and licensed public domain', () => {
    const root = fixtureRepo()
    writeFileSync(join(root, 'packs/documents/transit/fta-guide/extra.md'), '# Extra\n')
    const r = assembleBundledPacks(
      fixtureMap((m) => {
        const transit = (m.packs as { contents: Record<string, string[]> }[])[1]!
        transit.contents.workflows = ['sdxl-photo']
      }),
      { root, appVersion: '0.1.0', strict: true },
    )
    expect(r.problems.join('\n')).toMatch(/ai.actionstations.transit: workflows belong in the core/)
    expect(r.problems.join('\n')).toMatch(/fta-guide\/extra.md has no documents\[\] entry/)
    expect(() =>
      fixtureMap((m) => {
        const transit = (m.packs as { documents: { license: string }[] }[])[1]!
        transit.documents[0]!.license = 'CC-BY-4.0'
      }),
    ).toThrow()
  })

  it('writes each pack with a full pack.json after the reader accepts it', async () => {
    const out = await buildFixture()
    const manifest = JSON.parse(readFileSync(join(out, TRANSIT, 'pack.json'), 'utf8'))
    expect(manifest).toMatchObject({
      id: TRANSIT,
      version: '0.1.0',
      contents: { domains: ['transit'], documents: ['fta-guide'] },
      documents: [
        {
          path: DOC,
          title: 'Transit security note',
          license: 'LicenseRef-US-Government-Work',
          source: 'Federal Transit Administration, https://www.transit.dot.gov/',
        },
      ],
    })
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual([
      DOC,
      'domains/transit.json',
    ])
    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
    expect(index.packs.map((p: { id: string; core: boolean }) => [p.id, p.core])).toEqual([
      [CORE, true],
      [TRANSIT, false],
    ])
    expect(existsSync(join(out, CORE, 'templates/tweet/template.html'))).toBe(true)
    expect(existsSync(join(out, CORE, 'templates/tweet/__golden__'))).toBe(false)
  })

  it('writes nothing when the reader refuses a pack', async () => {
    const root = fixtureRepo()
    writeFileSync(join(root, 'prompts/ideate.md'), '---js\n{}\n---\nbody\n')
    const out = join(tmp('ttx-bundled-out-'), 'packs')
    const r = await buildBundledPacks({ root, outDir: out, appVersion: '0.1.0', map: fixtureMap() })
    expect(r.ok).toBe(false)
    expect(existsSync(out)).toBe(false)
  })
})

// ---- built packs (app-resources/packs) ---------------------------------------------------------

describe('built bundled packs (TTX_BUNDLED_PACKS stands in for app-resources/packs)', () => {
  it('loads them in place, lists them first, and offers their documents', async () => {
    process.env.TTX_BUNDLED_PACKS = await buildFixture()
    await packs.loadPacks()
    const list = await call<View[]>('packs:list')
    expect(list.map((p) => [p.id, p.bundled, p.core, p.enabled, p.source.kind])).toEqual([
      [CORE, true, true, true, 'bundled'],
      [TRANSIT, true, false, true, 'bundled'],
    ])
    expect(bundledPacks()[0]!.dir).toBe(join(process.env.TTX_BUNDLED_PACKS, CORE))
    const docs =
      await call<{ packId: string; path: string; bundled?: boolean }[]>('packs:documents')
    expect(docs).toEqual([expect.objectContaining({ packId: TRANSIT, path: DOC, bundled: true })])
    expect(loadTemplate('fids_board').pack).toMatchObject({ id: CORE, bundled: true })
  })

  it('imports a bundled document into a project like an installed pack document', async () => {
    process.env.TTX_BUNDLED_PACKS = await buildFixture()
    await packs.loadPacks()
    const index = new FakeIndex()
    setIndexFactory(async () => index)
    const root = (await createProject({ parentDir: tmp('ttx-p-'), name: 'Transit' })).path
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('packs:importDocuments', {
      projectPath: root,
      documents: [{ packId: TRANSIT, path: DOC }],
    })
    await jobs.wait(res.jobId)
    const meta = (await loadProject(root)).documents[0]!
    expect(meta).toMatchObject({
      title: 'Transit security note',
      status: 'ok',
      license: 'LicenseRef-US-Government-Work',
      source: { packId: TRANSIT, path: DOC, packName: 'Transit' },
    })
    // Turning the pack off hides its documents from "Add from pack".
    await call('packs:setEnabled', { id: TRANSIT, enabled: false })
    expect(await call('packs:documents')).toEqual([])
  })

  it('marks a bundled pack whose files changed as damaged and leaves it out', async () => {
    const out = await buildFixture()
    writeFileSync(join(out, TRANSIT, 'domains/transit.json'), '{}')
    process.env.TTX_BUNDLED_PACKS = out
    await packs.loadPacks()
    const list = await call<View[]>('packs:list')
    expect(list.find((p) => p.id === TRANSIT)?.broken).toMatch(/domains\/transit.json/)
    expect(bundledPacks().map((p) => p.id)).toEqual([CORE])
  })
})

// ---- source mode (the repo in place) ---------------------------------------------------------

describe('bundled packs read from the repo (unpackaged runs)', () => {
  it('lists the core and every domain pack, enabled', async () => {
    const list = (await call<View[]>('packs:list')).filter((p) => p.bundled)
    expect(list).toHaveLength(BUNDLED_MAP.packs.length)
    expect(list[0]).toMatchObject({ id: CORE, core: true, enabled: true })
    expect(list.every((p) => p.enabled && p.source.kind === 'bundled')).toBe(true)
    const airport = list.find((p) => p.id === AIRPORT)!
    expect(airport.items.map((i) => `${i.kind}:${i.id}`).sort()).toEqual([
      'domains:airport',
      'examples:airport-ncia',
      'templates:bhs_scada_screen',
      'templates:fids_board',
    ])
  })

  it('never turns the core pack off and never uninstalls a bundled pack', async () => {
    await expect(call('packs:setEnabled', { id: CORE, enabled: false })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await expect(call('packs:uninstall', { id: AIRPORT })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(existsSync(registryPath())).toBe(false)
  })

  it('hides a disabled domain pack from new use; a project on it still renders and lints', async () => {
    const fixture = JSON.parse(
      readFileSync(join(REPO, 'tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
    ) as Scenario
    const ctx = () => domainContext({ orgType: 'airport' }, { brief: fixture.brief })
    const before = lintScenario(fixture, ctx()).map((w) => w.code)

    const view = await call<View>('packs:setEnabled', { id: AIRPORT, enabled: false })
    expect(view).toMatchObject({ id: AIRPORT, enabled: false, bundled: true })
    expect(JSON.parse(readFileSync(registryPath(), 'utf8')).bundledDisabled).toEqual([AIRPORT])

    // Not offered: domain picker, inject type pickers, Templates gallery, examples gallery.
    const domains =
      await call<{ profile: { id: string }; source: { enabled?: boolean } }[]>('domains:list')
    expect(domains.find((d) => d.profile.id === 'airport')?.source.enabled).toBe(false)
    const templates = await call<{ type: string; hidden?: boolean }[]>('templates:list')
    expect(templates.find((t) => t.type === 'fids_board')?.hidden).toBe(true)
    expect(templates.find((t) => t.type === 'tweet')?.hidden).toBeUndefined()
    const types = await call<{ id: string; hidden?: boolean }[]>('templates:taxonomy')
    expect(types.find((t) => t.id === 'bhs_scada_screen')?.hidden).toBe(true)
    expect(injectTypesForDomain('airport').map((t) => t.id)).not.toContain('fids_board')
    const examples = await call<{ slug: string; packId?: string }[]>('examples:list')
    expect(examples.map((e) => e.slug)).not.toContain('airport-ncia')
    expect(examples.map((e) => e.slug)).toContain('city-water')
    expect(packById(AIRPORT)).toBeUndefined()

    // Still resolves for a project that uses it: profile, templates, fields, lints.
    expect(builtinProfile('airport').id).toBe('airport')
    const fids = loadTemplate('fids_board')
    expect(fids.pack).toMatchObject({ id: AIRPORT, enabled: false })
    expect(validateFields('fids_board', fids.preview.fields)).toEqual([])
    expect(composeDocument({ type: 'fids_board', fields: fids.preview.fields }).html).toContain('<')
    expect(ctx().profile.id).toBe('airport')
    expect(lintScenario(fixture, ctx()).map((w) => w.code)).toEqual(before)

    // The choice persists, and turning it back on restores everything.
    await packs.loadPacks()
    expect((await call<View[]>('packs:list')).find((p) => p.id === AIRPORT)?.enabled).toBe(false)
    await call('packs:setEnabled', { id: AIRPORT, enabled: true })
    expect(
      (await call<{ type: string; hidden?: boolean }[]>('templates:list')).find(
        (t) => t.type === 'fids_board',
      )?.hidden,
    ).toBeUndefined()
    expect(JSON.parse(readFileSync(registryPath(), 'utf8')).bundledDisabled).toEqual([])
  })
})

// ---- installed packs next to bundled ones ----------------------------------------------------

describe('installed packs and bundled packs', () => {
  const writePack = async (buf: Promise<Buffer>) => {
    const path = join(tmp('ttx-packs-'), 'pack.aspack')
    writeFileSync(path, await buf)
    return path
  }

  it('may replace a bundled prompt or template, and the review names the bundled pack', async () => {
    const path = await writePack(buildPack())
    const res = await call<{ ok: boolean; review: { items: Record<string, unknown>[] } }>(
      'packs:inspect',
      { filePath: path },
    )
    expect(res.ok).toBe(true)
    expect(res.review.items.find((i) => i.kind === 'prompts')).toMatchObject({
      id: 'inject_text',
      replacesBuiltin: true,
      replacesPack: { id: CORE, name: 'Action Stations Core' },
    })
  })

  it('may not reuse a bundled domain id, even while its pack is disabled', async () => {
    await call('packs:setEnabled', { id: AIRPORT, enabled: false })
    const fx = PACK_FIXTURES['domain-reuses-airport']!
    const res = await call<{ ok: boolean; problems?: { message: string }[] }>('packs:inspect', {
      filePath: await writePack(fx.build()),
    })
    expect(res.ok).toBe(false)
    expect(res.problems!.map((p) => p.message).join('\n')).toMatch(fx.expect)
  })

  it('may not take the id of a bundled pack', async () => {
    const path = await writePack(
      buildPack(undefined, {
        manifest: (m) => {
          m.id = TRANSIT
        },
      }),
    )
    const res = await call<{ ok: boolean; problems?: { message: string }[] }>('packs:inspect', {
      filePath: path,
    })
    expect(res.ok).toBe(false)
    expect(res.problems![0]!.message).toMatch(/id of a pack included with the app/)
    await expect(
      call('packs:install', { path, source: { kind: 'file', name: basename(path) } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
