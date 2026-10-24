// documents:list carries the copy state of documents imported from a pack (#269): edited when
// the project's original no longer matches the sha256 in <project>/packs.json, pack missing
// after uninstall, update available when the installed pack is newer.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { DocumentListItem } from '@shared/ipc/documents'
import type { DocumentMeta } from '@shared/schemas'
import { buildPack, validPackTree, type BuildOptions } from '../../../../tests/fixtures/packs/build'
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
const { createProject } = await import('../../project/store')
const { resetSettingsCache } = await import('../../settings/store')
const { jobs } = await import('../../jobs/manager')
const { setIndexFactory } = await import('../../ingest/pipeline')
const { registerPackProfiles } = await import('@shared/domains')
const packs = await import('../../packs')

async function call<T>(channel: string, req?: unknown): Promise<T> {
  const r = await dispatch(handlers, channel, req)
  if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code })
  return r.data as T
}

const RAIL = 'ai.actionstations.heritage-rail'
const MD = 'documents/rail-emergency-plan/hazmat-quick-reference.md'

let root: string

async function installRail(opts: BuildOptions = {}): Promise<void> {
  const tree = validPackTree()
  tree[MD] = '# Hazmat quick reference\n\nEvacuate 800 m downwind of a tank car breach.\n'
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-packs-')), 'rail.aspack')
  writeFileSync(path, await buildPack(tree, opts))
  await call('packs:install', { path, source: { kind: 'file', name: basename(path) } })
}

async function importMd(): Promise<DocumentMeta> {
  const res = await call<{ jobId: string; documents: DocumentMeta[] }>('packs:importDocuments', {
    projectPath: root,
    documents: [{ packId: RAIL, path: MD }],
  })
  await jobs.wait(res.jobId)
  return res.documents[0]!
}

const listed = async (id: string) =>
  (await call<DocumentListItem[]>('documents:list', { projectPath: root })).find(
    (d) => d.id === id,
  )!

beforeEach(async () => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  registerPackProfiles([])
  await packs.loadPacks()
  root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'Rail' }))
    .path
  setIndexFactory(async () => new FakeIndex())
})

describe('documents:list copy state (#269)', () => {
  it('reports a fresh pack document as an unedited copy of the installed pack', async () => {
    await installRail()
    const doc = await importMd()
    expect((await listed(doc.id)).copy).toEqual({
      edited: false,
      packMissing: false,
      updateAvailable: false,
      installedVersion: '1.0.0',
    })
  })

  it('marks an edited original "edited"', async () => {
    await installRail()
    const doc = await importMd()
    appendFileSync(join(root, 'documents', doc.id, 'original.md'), '\nLocal note.\n')
    expect((await listed(doc.id)).copy?.edited).toBe(true)
  })

  it('marks the copy "not installed" after the pack is uninstalled', async () => {
    await installRail()
    const doc = await importMd()
    await call('packs:uninstall', { id: RAIL })
    expect((await listed(doc.id)).copy).toMatchObject({ packMissing: true, updateAvailable: false })
  })

  it('reports an update when the installed pack is newer', async () => {
    await installRail()
    const doc = await importMd()
    await call('packs:uninstall', { id: RAIL })
    await installRail({ manifest: (m) => void (m.version = '1.1.0') })
    expect((await listed(doc.id)).copy).toMatchObject({
      packMissing: false,
      updateAvailable: true,
      installedVersion: '1.1.0',
    })
  })

  it("leaves the project's own documents without copy state", async () => {
    const own = join(mkdtempSync(join(tmpdir(), 'ttx-doc-')), 'notes.md')
    writeFileSync(own, '# Notes\n\nOur own plan.\n')
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('documents:import', {
      projectPath: root,
      filePaths: [own],
    })
    await jobs.wait(res.jobId)
    expect((await listed(res.documents[0]!.id)).copy).toBeUndefined()
  })
})
