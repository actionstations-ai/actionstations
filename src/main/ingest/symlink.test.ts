// #205: a shared project's documents/<id>/text.md or original may be a symlink to a file outside
// the project. Ingest, rebuild and documents:text must not read it (it would reach the index and
// from there a configured cloud LLM).
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentMeta } from '@shared/schemas'
import { FakeIndex } from '../../../tests/fixtures/ingest/fake-index'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { jobs } = await import('../jobs/manager')
const { dispatch } = await import('../ipc/registry')
const handlers = (await import('../ipc/handlers/documents')).default
const { setIndexFactory } = await import('./pipeline')

const AEP = 'reference/ncia/airport-emergency-plan-AEP.md'
const SECRET = 'TOP-SECRET-OUTSIDE-PROJECT'

async function call<T>(name: string, req: unknown): Promise<T> {
  const res = await dispatch(handlers, name, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

function outsideFile(name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-outside-')), name)
  writeFileSync(path, `# Private\n\n${SECRET}\n`)
  return path
}

describe('ingest with symlinked document files (#205)', () => {
  let root: string
  let index: FakeIndex
  let docId: string

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-p-'))
    root = (await createProject({ parentDir, name: 'Shared' })).path
    index = new FakeIndex()
    setIndexFactory(async () => index)
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('documents:import', {
      projectPath: root,
      filePaths: [AEP],
    })
    docId = res.documents[0]!.id
    await jobs.wait(res.jobId)
  })
  afterEach(() => setIndexFactory(undefined))

  const swapForLink = (file: string) => {
    const path = join(root, 'documents', docId, file)
    rmSync(path)
    symlinkSync(outsideFile(file), path)
  }
  const indexedText = () =>
    [...index.rows.values()]
      .flat()
      .map((c) => c.text)
      .join('\n')

  it('documents:text refuses a text.md that links outside the project', async () => {
    swapForLink('text.md')
    await expect(
      call('documents:text', { projectPath: root, documentId: docId }),
    ).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
  })

  it('index rebuild does not index a linked text.md and marks the document failed', async () => {
    swapForLink('text.md')
    const rebuild = await call<{ jobId: string }>('index:rebuild', { projectPath: root })
    await jobs.wait(rebuild.jobId)
    expect(indexedText()).not.toContain(SECRET)
    const meta = (await loadProject(root)).documents[0]!
    expect(meta.status).toBe('error')
    expect(meta.error).toMatch(/Symlink escapes project folder/)
  })

  it('reingest does not parse a linked original', async () => {
    swapForLink('original.md')
    const job = await call<{ jobId: string }>('documents:reingest', {
      projectPath: root,
      documentId: docId,
    })
    await jobs.wait(job.jobId)
    expect(indexedText()).not.toContain(SECRET)
    expect((await loadProject(root)).documents[0]!.status).toBe('error')
  })
})
