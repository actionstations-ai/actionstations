// Documents left mid-import by an app exit get Retry (#309); one a live job is working on
// keeps its status. Temp project folders and a temp userData only.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentMeta, Project } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { jobs } = await import('../jobs/manager')
const { dispatch } = await import('../ipc/registry')
const documentHandlers = (await import('../ipc/handlers/documents')).default
const projectHandlers = (await import('../ipc/handlers/project')).default
const { loadMeta, saveMeta } = await import('./storage')
const { INTERRUPTED_MESSAGE } = await import('./interrupted')

async function call<T>(handlers: object, name: string, req: unknown): Promise<T> {
  const res = await dispatch(handlers as never, name, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

const listDocuments = (root: string) =>
  call<DocumentMeta[]>(documentHandlers, 'documents:list', { projectPath: root })

function doc(id: string, status: DocumentMeta['status']): DocumentMeta {
  return {
    id,
    title: `Doc ${id}`,
    filename: `${id}.md`,
    mimeType: 'text/markdown',
    kind: 'plan',
    pages: 1,
    status,
    tags: [],
    headingsPreview: [],
    chunkCount: 0,
  }
}

/** An ingest job that holds until released, standing in for one still working. */
function liveIngestJob(root: string, documentIds: string[]) {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  const job = jobs.start('ingest', () => held, {
    projectPath: root,
    payload: { documentIds, mode: 'ingest' },
  })
  return { job, release }
}

describe('documents left mid-import (#309)', () => {
  let root: string

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'NCIA' }))
      .path
  })

  it('marks a stuck embedding document as an error with no live job', async () => {
    await saveMeta(root, doc('asp', 'embedding'))
    await saveMeta(root, doc('aep', 'ok'))
    const listed = await listDocuments(root)
    const asp = listed.find((d) => d.id === 'asp')!
    expect(asp.status).toBe('error')
    expect(asp.error).toBe(INTERRUPTED_MESSAGE)
    expect(listed.find((d) => d.id === 'aep')!.status).toBe('ok')
    expect((await loadMeta(root, 'asp')).status).toBe('error')
  })

  it('marks pending and parsing documents too', async () => {
    await saveMeta(root, doc('a', 'pending'))
    await saveMeta(root, doc('b', 'parsing'))
    const listed = await listDocuments(root)
    expect(listed.map((d) => d.status)).toEqual(['error', 'error'])
  })

  it('leaves a document alone while its ingest job is live', async () => {
    await saveMeta(root, doc('asp', 'embedding'))
    const { job, release } = liveIngestJob(root, ['asp'])
    try {
      const listed = await listDocuments(root)
      expect(listed.find((d) => d.id === 'asp')!.status).toBe('embedding')
      expect((await loadMeta(root, 'asp')).status).toBe('embedding')
    } finally {
      release()
      await jobs.wait(job.id)
    }
  })

  it('still marks a document that the live job does not cover', async () => {
    await saveMeta(root, doc('asp', 'embedding'))
    await saveMeta(root, doc('tirp', 'parsing'))
    const { job, release } = liveIngestJob(root, ['tirp'])
    try {
      const listed = await listDocuments(root)
      expect(listed.find((d) => d.id === 'asp')!.status).toBe('error')
      expect(listed.find((d) => d.id === 'tirp')!.status).toBe('parsing')
    } finally {
      release()
      await jobs.wait(job.id)
    }
  })

  it('ignores live jobs of other projects', async () => {
    await saveMeta(root, doc('asp', 'embedding'))
    const other = mkdtempSync(join(tmpdir(), 'ttx-other-'))
    const { job, release } = liveIngestJob(other, ['asp'])
    try {
      expect((await listDocuments(root))[0]!.status).toBe('error')
    } finally {
      release()
      await jobs.wait(job.id)
    }
  })

  it('marks interrupted documents when the project opens', async () => {
    await saveMeta(root, doc('asp', 'embedding'))
    const opened = await call<{ path: string; project: Project }>(projectHandlers, 'project:open', {
      path: root,
    })
    expect(opened.project.documents[0]).toMatchObject({
      status: 'error',
      error: INTERRUPTED_MESSAGE,
    })
  })
})
