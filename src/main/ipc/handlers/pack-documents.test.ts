// packs:documents and packs:importDocuments through the IPC dispatcher (#265): the fixture rail
// pack is installed into a temp userData, its documents are listed, imported into a project and
// indexed (FakeIndex, as in the ingest pipeline tests), and the copy outlives the pack.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, lstatSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { DocumentMeta } from '@shared/schemas'
import { ProjectPacks } from '@shared/schemas/project-packs'
import { buildPack, validPackTree } from '../../../../tests/fixtures/packs/build'
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
process.env.TTX_RESOURCES = resolve('.')
process.env.TTX_APP_VERSION = '0.3.0'

const { dispatch } = await import('../registry')
const handlers = {
  ...(await import('./documents')).default,
  ...(await import('./pack-documents')).default,
  ...(await import('./packs')).default,
}
const { createProject, loadProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { jobs } = await import('../../jobs/manager')
const { setIndexFactory } = await import('../../ingest/pipeline')
const { registerPackProfiles } = await import('@shared/domains')
const packs = await import('../../packs')
const { copyState } = await import('../../packs/project-copies')

async function call<T>(channel: string, req?: unknown): Promise<T> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as T
}

const RAIL = 'ai.actionstations.freight-rail'
const MD = 'documents/rail-emergency-plan/hazmat-quick-reference.md'
const PDF = 'documents/rail-emergency-plan/emergency-response-plan.pdf'

let root: string
let index: FakeIndex

async function installRail(edit?: (t: ReturnType<typeof validPackTree>) => void): Promise<void> {
  const tree = validPackTree()
  tree[MD] = '# Hazmat quick reference\n\nEvacuate 800 m downwind of a tank car breach.\n'
  edit?.(tree)
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-packs-')), 'rail.aspack')
  writeFileSync(path, await buildPack(tree))
  await call('packs:install', { path, source: { kind: 'file', name: basename(path) } })
}

const readCopies = () =>
  ProjectPacks.parse(JSON.parse(readFileSync(join(root, 'packs.json'), 'utf8'))).copies

async function importAndWait(paths: string[]) {
  const res = await call<{ jobId: string; documents: DocumentMeta[] }>('packs:importDocuments', {
    projectPath: root,
    documents: paths.map((path) => ({ packId: RAIL, path })),
  })
  await jobs.wait(res.jobId)
  return res
}

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  registerPackProfiles([])
  await packs.loadPacks()
  root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'Rail' }))
    .path
  index = new FakeIndex()
  setIndexFactory(async () => index)
})

describe('packs:documents', () => {
  it('lists the documents of enabled packs with title, source and license', async () => {
    expect(await call('packs:documents')).toEqual([])
    await installRail()
    const list = await call<{ path: string }[]>('packs:documents', { projectPath: root })
    expect(list).toEqual([
      {
        packId: RAIL,
        packVersion: '1.0.0',
        packName: 'Freight Rail Operations',
        slug: 'rail-emergency-plan',
        path: PDF,
        title: 'Railroad Emergency Response Plan (template)',
        license: 'CC-BY-4.0',
      },
      {
        packId: RAIL,
        packVersion: '1.0.0',
        packName: 'Freight Rail Operations',
        slug: 'rail-emergency-plan',
        path: MD,
        title: 'Hazmat release quick reference',
        license: 'CC0-1.0',
      },
    ])
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    expect(await call('packs:documents')).toEqual([])
  })
})

describe('packs:importDocuments', () => {
  it('copies, indexes and records a pack document; the copy outlives the pack', async () => {
    await installRail()
    const res = await importAndWait([MD])
    const id = res.documents[0]!.id

    const meta = (await loadProject(root)).documents.find((d) => d.id === id)!
    expect(meta).toMatchObject({
      title: 'Hazmat release quick reference',
      status: 'ok',
      license: 'CC0-1.0',
      source: { packId: RAIL, version: '1.0.0', path: MD, packName: 'Freight Rail Operations' },
    })
    expect(meta.chunkCount).toBeGreaterThan(0)
    expect(index.docs.get(id)?.title).toBe('Hazmat release quick reference')
    expect(
      index.rows
        .get(id)!
        .map((c) => c.text)
        .join(' '),
    ).toMatch(/800 m downwind/)
    const metaJson = JSON.parse(readFileSync(join(root, 'documents', id, 'meta.json'), 'utf8'))
    expect(metaJson.source.path).toBe(MD)

    // A real file in the project, not a link into userData/packs.
    const original = join(root, 'documents', id, 'original.md')
    expect(lstatSync(original).isSymbolicLink()).toBe(false)
    expect(lstatSync(original).isFile()).toBe(true)
    const pack = packs.packById(RAIL)!
    const inPack = packs.packFilePath(pack, MD)
    expect(statSync(original).ino).not.toBe(statSync(inPack).ino)
    expect(readFileSync(original, 'utf8')).toBe(readFileSync(inPack, 'utf8'))

    const [copy] = readCopies()
    expect(copy).toMatchObject({
      kind: 'documents',
      id: `${RAIL}/rail-emergency-plan`,
      packId: RAIL,
      version: '1.0.0',
      packName: 'Freight Rail Operations',
      files: [{ path: `documents/${id}/original.md` }],
    })
    expect(await copyState(root, copy!, { version: '1.0.0' })).toMatchObject({
      edited: false,
      updateAvailable: false,
    })

    const listed = await call<{ path: string; importedDocumentId?: string }[]>('packs:documents', {
      projectPath: root,
    })
    expect(listed.find((d) => d.path === MD)?.importedDocumentId).toBe(id)

    await call('packs:uninstall', { id: RAIL })
    expect(readFileSync(original, 'utf8')).toMatch(/800 m downwind/)
    expect((await loadProject(root)).documents.find((d) => d.id === id)?.source?.packId).toBe(RAIL)
  })

  it('re-imports after the document was removed, recording only the new copy', async () => {
    await installRail()
    const first = await importAndWait([MD])
    expect(readCopies()[0]!.files).toHaveLength(1)
    await call('documents:remove', { projectPath: root, documentId: first.documents[0]!.id })
    const again = await importAndWait([MD])
    const files = readCopies()[0]!.files.map((f) => f.path)
    expect(files).toEqual([`documents/${again.documents[0]!.id}/original.md`])
  })

  it('imports the same group slug from two packs side by side', async () => {
    await installRail()
    await importAndWait([MD])
    const other = 'org.example.rail-docs'
    const path = join(mkdtempSync(join(tmpdir(), 'ttx-packs-')), 'docs.aspack')
    const buf = await buildPack(
      { [MD]: '# Other hazmat notes\n\nDifferent text.\n' },
      {
        manifest: (m) => {
          m.id = other
          m.name = 'Rail Docs'
          m.contents = { documents: ['rail-emergency-plan'] }
          m.documents = [{ path: MD, title: 'Other notes', license: 'CC0-1.0' }]
          m.domains = []
        },
      },
    )
    writeFileSync(path, buf)
    await call('packs:install', { path, source: { kind: 'file', name: 'docs.aspack' } })
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('packs:importDocuments', {
      projectPath: root,
      documents: [{ packId: other, path: MD }],
    })
    await jobs.wait(res.jobId)
    const docs = (await loadProject(root)).documents
    expect(docs.map((d) => [d.source?.packId, d.status]).sort()).toEqual(
      [
        [RAIL, 'ok'],
        [other, 'ok'],
      ].sort(),
    )
    const copies = readCopies()
    expect(copies.map((c) => c.id).sort()).toEqual(
      [`${RAIL}/rail-emergency-plan`, `${other}/rail-emergency-plan`].sort(),
    )
    for (const c of copies) {
      expect(c.files).toHaveLength(1)
      expect(existsSync(join(root, c.files[0]!.path))).toBe(true)
    }
  })

  it('refuses a file the pack does not list and a pack that is not enabled', async () => {
    await installRail()
    await expect(
      call('packs:importDocuments', {
        projectPath: root,
        documents: [{ packId: RAIL, path: 'documents/rail-emergency-plan/missing.md' }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('packs:importDocuments', {
        projectPath: root,
        documents: [{ packId: RAIL, path: 'documents/../pack.json' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await call('packs:setEnabled', { id: RAIL, enabled: false })
    await expect(
      call('packs:importDocuments', { projectPath: root, documents: [{ packId: RAIL, path: MD }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await loadProject(root)).documents).toEqual([])
  })
})
