// Export as pack (#271): a pack built from the user's layers and a project passes the reader,
// installs and shows up in every layer; the archive is byte-for-byte reproducible; a document
// without a license blocks the export; an example carries no secrets, provider ids, absolute
// paths or derived data.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validPackTree } from '../../../tests/fixtures/packs/build'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { buildPackExport, exportSources, packMinAppVersion } = await import('./export')
const { readPack } = await import('./reader')
const { installPack, loadPacks, enabledItems } = await import('./index')
const { registerPackProfiles, listProfiles } = await import('@shared/domains')
const { createProject, updateProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { listTemplateInfos } = await import('../render/template-copies')
const { listWorkflows } = await import('../comfy/store')
const { listPackExamples } = await import('../examples/catalog')

const APP = '0.3.0'
const PACK_ID = 'io.github.tester.metro-kit'
const TPL = 'templates/rail_dispatch_board/'
const WF = 'yard-cctv-still'
const DOC_ID = '01JDOCEXPORT00000000000001'

let userData: string
let root: string

const write = (path: string, data: string | Buffer): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

/** A user template, a global prompt override and a user workflow, from the fixture pack. */
function seedUserLayers(): void {
  const tree = validPackTree()
  for (const [p, v] of Object.entries(tree)) {
    if (p.startsWith(TPL))
      write(join(userData, 'templates', 'injects', p.slice('templates/'.length)), v)
    if (p.startsWith('workflows/')) write(join(userData, 'comfy', 'workflows', p.slice(10)), v)
  }
  write(join(userData, 'prompts', 'inject_text.md'), tree['prompts/inject_text.md']!)
}

async function seedProject(): Promise<void> {
  root = (
    await createProject({
      parentDir: mkdtempSync(join(tmpdir(), 'ttx-exp-p-')),
      name: 'Metro Line',
      orgType: 'transit',
    })
  ).path
  write(join(root, 'documents', DOC_ID, 'original.md'), '# Metro emergency plan\n')
  await updateProject(root, (p) => {
    p.documents.push({
      id: DOC_ID,
      title: 'Metro Emergency Plan',
      filename: 'Metro Emergency Plan (v2).md',
      kind: 'plan',
      pages: 0,
      status: 'ok',
      tags: [],
      headingsPreview: [],
      chunkCount: 0,
    })
  })
}

const metadata = {
  id: PACK_ID,
  name: 'Metro kit',
  version: '1.0.0',
  summary: 'Metro domain, a dispatch board, a prompt, a workflow, a plan and an example.',
  author: { name: 'Tester' },
  license: 'CC-BY-4.0',
  domains: ['metro_rail'],
  tags: ['rail'],
}

const fullRequest = () => ({
  metadata,
  templates: ['rail_dispatch_board'],
  prompts: ['inject_text'],
  workflows: [WF],
  projectPath: root,
  domain: { id: 'metro_rail', label: 'Metro rail' },
  documents: [{ documentId: DOC_ID, license: 'CC0-1.0' }],
  example: {
    slug: 'metro-line',
    title: 'Metro Line',
    summary: 'A fictional metro line.',
    notice: 'Fictional organization for exercise use.',
  },
  redistributeConfirmed: true,
})

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'ttx-exp-ud-'))
  process.env.TTX_USER_DATA = userData
  resetSettingsCache()
  registerPackProfiles([])
  await loadPacks()
  seedUserLayers()
  await seedProject()
})

describe('exportSources', () => {
  it('lists the user layers and the project parts', async () => {
    const s = await exportSources(root, { appVersion: APP })
    expect(s.templates.map((t) => t.id)).toEqual(['rail_dispatch_board'])
    expect(s.prompts.map((t) => t.id)).toEqual(['inject_text'])
    expect(s.workflows).toEqual([{ id: WF, label: 'Yard CCTV still' }])
    expect(s.project?.domain).toMatchObject({ id: 'transit', builtin: true })
    expect(s.project?.documents[0]).toMatchObject({ id: DOC_ID, title: 'Metro Emergency Plan' })
    expect(s.project?.exampleSlug).toBe('metro-line')
    expect(s.appVersion).toBe(APP)
  })
})

describe('packMinAppVersion', () => {
  it('never declares less than the first app with pack support', () => {
    expect(packMinAppVersion('0.1.0')).toBe('0.3.0')
    expect(packMinAppVersion('0.3.0')).toBe('0.3.0')
    expect(packMinAppVersion('0.4.2')).toBe('0.4.2')
  })

  it('a dev build (0.1.0) still exports a pack that passes its own check', async () => {
    const r = await buildPackExport(fullRequest(), { appVersion: '0.1.0' })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    const read = await readPack({ buffer: r.buffer }, { appVersion: '0.3.0' })
    expect(read.ok && read.pack.manifest.minAppVersion).toBe('0.3.0')
  })
})

describe('buildPackExport', () => {
  it('round-trips: the reader accepts it, it installs, and the items appear in their layers', async () => {
    const r = await buildPackExport(fullRequest(), { appVersion: APP })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    expect(r.built.fileName).toBe(`${PACK_ID}-1.0.0.aspack`)
    const read = await readPack({ buffer: r.buffer }, { appVersion: APP })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.pack.manifest.minAppVersion).toBe(APP)
    expect(read.pack.manifest.documents).toEqual([
      {
        path: 'documents/metro-emergency-plan/Metro-Emergency-Plan-v2.md',
        title: 'Metro Emergency Plan',
        license: 'CC0-1.0',
      },
    ])
    const example = JSON.parse(read.pack.files.get('examples/metro-line/example.json')!.toString())
    expect(example).toMatchObject({
      id: 'metro-line',
      fictional: true,
      domainProfile: 'metro_rail',
    })

    // Install, then remove the user copies so the pack layer is what resolves.
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-exp-out-')), r.built.fileName)
    writeFileSync(file, r.buffer)
    await installPack(
      { path: file, source: { kind: 'file', name: r.built.fileName } },
      { appVersion: APP },
    )
    for (const d of ['templates', 'prompts', 'comfy'])
      rmSync(join(userData, d), { recursive: true })

    for (const kind of [
      'templates',
      'prompts',
      'domains',
      'workflows',
      'documents',
      'examples',
    ] as const)
      expect(enabledItems(kind).map((i) => i.pack.id)).toEqual([PACK_ID])
    const tpl = (await listTemplateInfos()).find((t) => t.type === 'rail_dispatch_board')
    expect(tpl).toMatchObject({ source: 'pack', packId: PACK_ID })
    expect((await listWorkflows()).find((w) => w.id === WF)).toMatchObject({ source: 'pack' })
    expect(listProfiles().find((p) => p.profile.id === 'metro_rail')?.source).toMatchObject({
      kind: 'pack',
      packId: PACK_ID,
    })
    expect((await listPackExamples()).find((e) => e.slug === 'metro-line')).toMatchObject({
      packId: PACK_ID,
    })
  })

  it('gives the same sha256 for the same content exported twice', async () => {
    const a = await buildPackExport(fullRequest(), { appVersion: APP })
    // Newer file times must not change the archive.
    const later = new Date('2030-01-01T00:00:00Z')
    utimesSync(join(userData, 'prompts', 'inject_text.md'), later, later)
    utimesSync(join(root, 'project.json'), later, later)
    const b = await buildPackExport(fullRequest(), { appVersion: APP })
    if (!a.ok || !b.ok) throw new Error('export failed')
    expect(b.built.sha256).toBe(a.built.sha256)
    expect(Buffer.compare(a.buffer, b.buffer)).toBe(0)
  })

  it('blocks a document without a license with a clear message', async () => {
    const req = { ...fullRequest(), documents: [{ documentId: DOC_ID }] }
    const r = await buildPackExport(req, { appVersion: APP })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.map((p) => p.message)).toEqual([
      'Document "Metro Emergency Plan" has no license. Choose the license you may redistribute it under, or leave the document out.',
    ])
  })

  it('requires the redistribution statement and at least one item', async () => {
    const r = await buildPackExport({ metadata, redistributeConfirmed: false }, { appVersion: APP })
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toEqual([
      'Confirm that you may redistribute everything in this pack under the licenses you chose.',
      'Choose at least one item to export.',
    ])
  })

  it("refuses to build a pack the reader refuses, with the reader's problems", async () => {
    write(
      join(userData, 'templates', 'injects', 'rail_dispatch_board', 'template.html'),
      '<script>x()</script>',
    )
    const r = await buildPackExport(
      { metadata, templates: ['rail_dispatch_board'], redistributeConfirmed: true },
      { appVersion: APP },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(
      r.problems.some(
        (p) => p.path?.startsWith('templates/rail_dispatch_board') && /script/i.test(p.message),
      ),
    ).toBe(true)
  })
})

describe('example export', () => {
  const exampleOnly = () => ({
    metadata: { ...metadata, domains: [] },
    projectPath: root,
    example: fullRequest().example,
    redistributeConfirmed: true,
  })

  async function seedSecrets(): Promise<void> {
    await updateProject(root, (p) => {
      p.providerRouting = { draft: { providerId: 'lmstudio-7f3a', model: 'qwen' } }
    })
    const inject = {
      id: '01JINJ0000000000000000001',
      apiKey: 'should-not-ship',
      assets: [
        {
          id: 'a1',
          provenance: { provider: 'comfy-local-91ab', createdAt: '2026-01-01T00:00:00Z' },
        },
      ],
      routing: { providerId: 'lmstudio-7f3a' },
      note: `rendered from ${root}/scenarios/s1/media/a1.png`,
    }
    write(
      join(root, 'scenarios', '01JSCN0000000000000000001', 'injects', 'i1.json'),
      JSON.stringify(inject),
    )
    write(join(root, 'index.sqlite'), 'derived')
    write(join(root, '.cache', 'x.json'), '{}')
    write(join(root, '.example.json'), '{}')
  }

  it('strips provider ids, credentials, absolute paths and derived data', async () => {
    await seedSecrets()
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    const read = await readPack({ buffer: r.buffer }, { appVersion: APP })
    if (!read.ok) throw new Error('reader refused')
    const paths = [...read.pack.files.keys()]
    expect(paths.some((p) => /index\.sqlite|\.cache|\.example\.json/.test(p))).toBe(false)
    const all = paths.map((p) => read.pack.files.get(p)!.toString('utf8')).join('\n')
    expect(all).not.toMatch(/lmstudio-7f3a|comfy-local-91ab|should-not-ship|apiKey|providerId/)
    expect(all).not.toContain(root)
    const project = JSON.parse(
      read.pack.files.get('examples/metro-line/project/project.json')!.toString(),
    )
    expect(project.providerRouting).toEqual({})
    expect(project.orgType).toBe('transit')
    const inject = JSON.parse(
      read.pack.files
        .get('examples/metro-line/project/scenarios/01JSCN0000000000000000001/injects/i1.json')!
        .toString(),
    )
    expect(inject.assets[0].provenance.provider).toBe('removed')
    expect(inject.note).toBe('rendered from /scenarios/s1/media/a1.png')
    expect(read.pack.files.get('examples/metro-line/project/.gitignore')!.toString()).toContain(
      'index.sqlite',
    )
    const example = JSON.parse(read.pack.files.get('examples/metro-line/example.json')!.toString())
    expect(example).toMatchObject({
      id: 'metro-line',
      fictional: true,
      notice: 'Fictional organization for exercise use.',
      domainProfile: 'transit',
    })
  })

  it('blocks a file that still looks like it holds a secret', async () => {
    write(join(root, 'notes.md'), 'Key for the lab: sk-abcdefghijklmnop\n')
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems[0]).toMatchObject({ path: 'examples/metro-line/project/notes.md' })
    expect(r.problems[0]!.message).toMatch(/looks like it holds a secret/)
  })

  it('keeps generic /tmp and /home paths in story text (#347)', async () => {
    write(
      join(root, 'notes.md'),
      'The log shows python3 /tmp/auto_cleaner.py run as /home/ubuntu from cron.\n',
    )
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
  })

  it('lists files a pack cannot carry as skipped', async () => {
    write(join(root, 'exports', 'handbook.html'), '<p>x</p>')
    write(join(root, 'scenarios', 'run.sh'), 'echo hi')
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    expect(r.built.skipped.map((s) => s.path).sort()).toEqual([
      'exports/handbook.html',
      'scenarios/run.sh',
    ])
  })

  it('leaves out the cloud send log and the project privacy settings (#454 review)', async () => {
    write(join(root, 'cloud-sends.jsonl'), '{"at":"2026-10-01T00:00:00.000Z"}\n')
    await updateProject(root, (p) => {
      p.privacy = { review: 'every-request' }
    })
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    expect(r.built.skipped.map((s) => s.path)).toContain('cloud-sends.jsonl')
    const read = await readPack({ buffer: r.buffer }, { appVersion: APP })
    if (!read.ok) throw new Error('reader refused')
    expect([...read.pack.files.keys()].some((p) => p.endsWith('cloud-sends.jsonl'))).toBe(false)
    const project = JSON.parse(
      read.pack.files.get('examples/metro-line/project/project.json')!.toString(),
    )
    expect(project.privacy).toBeUndefined()
  })

  it('needs the domain profile when the project is on a non-built-in domain', async () => {
    await updateProject(root, (p) => {
      p.orgType = 'metro_custom'
    })
    const r = await buildPackExport(exampleOnly(), { appVersion: APP })
    expect(r.ok ? '' : r.problems[0]!.message).toMatch(/Include the project's domain profile/)
  })
})

describe('archive layout', () => {
  it('has sorted entries, one fixed date and regular-file modes', async () => {
    const r = await buildPackExport(
      { metadata, prompts: ['inject_text'], redistributeConfirmed: true },
      { appVersion: APP },
    )
    if (!r.ok) throw new Error(JSON.stringify(r.problems))
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(r.buffer)
    const names = Object.keys(zip.files)
    expect(names).toEqual([...names].sort())
    expect(names).toEqual(['pack.json', 'prompts/inject_text.md'])
    for (const f of Object.values(zip.files)) {
      expect(f.date.toISOString()).toBe('2000-01-01T00:00:00.000Z')
      expect(f.unixPermissions).toBe(0o100644)
    }
    expect(readFileSync(join(userData, 'prompts', 'inject_text.md')).length).toBeGreaterThan(0)
  })
})
