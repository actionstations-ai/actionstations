// Integration: retrieve:search, embeddings:status and embeddings:download-model through the
// IPC dispatcher (request/response validation included) against a real project folder.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./retrieve')).default
const { createProject } = await import('../../project/store')
const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { openIndex } = await import('../../retrieve')
const { closeAllConnections } = await import('../../db')
const { jobs } = await import('../../jobs/manager')

async function newProject(): Promise<string> {
  const parent = mkdtempSync(join(tmpdir(), 'ttx-proj-'))
  return (await createProject({ parentDir: parent, name: 'NCIA' })).path
}

describe('retrieve handlers', () => {
  beforeEach(() => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
  })
  afterAll(() => closeAllConnections())

  it('retrieve:search returns cited hits from the project index', async () => {
    const path = await newProject()
    const index = await openIndex(path)
    await index.replaceDocument(
      { id: 'tirp', title: 'TIRP', kind: 'plan', path: 'documents/tirp.pdf', pages: 60 },
      [
        {
          ord: 0,
          headingPath: 'TIRP › 13.6 FIDS / BHS System Failure',
          page: 41,
          text: 'FIDS go dark; Ops uses whiteboards and PA announcements.',
          tokenCount: 10,
        },
      ],
    )
    const res = await dispatch(handlers, 'retrieve:search', { projectPath: path, query: 'FIDS' })
    expect(res).toMatchObject({
      ok: true,
      data: [{ documentId: 'tirp', documentTitle: 'TIRP', page: 41, ftsRank: 1, vecRank: 1 }],
    })
  })

  it('retrieve:search refuses folders the user has not opened', async () => {
    const res = await dispatch(handlers, 'retrieve:search', {
      projectPath: mkdtempSync(join(tmpdir(), 'ttx-x-')),
      query: 'FIDS',
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('retrieve:search validates the request', async () => {
    const path = await newProject()
    const res = await dispatch(handlers, 'retrieve:search', { projectPath: path, query: '' })
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('embeddings:status reports the built-in embedder by default', async () => {
    const res = await dispatch(handlers, 'embeddings:status', undefined)
    expect(res).toMatchObject({ ok: true, data: { mode: 'hash', dims: 384, ready: true } })
  })

  it('embeddings:status reports a local model that is not downloaded', async () => {
    await updateSettings((s) => {
      s.embeddings = { mode: 'local-onnx', model: 'Xenova/bge-small-en-v1.5' }
    })
    const res = await dispatch(handlers, 'embeddings:status', undefined)
    expect(res).toMatchObject({
      ok: true,
      data: { mode: 'local-onnx', dims: 384, ready: false, downloaded: false },
    })
  })

  it('embeddings:status explains an unavailable provider', async () => {
    await updateSettings((s) => {
      s.embeddings = { mode: 'provider', model: 'nomic-embed-text', providerId: 'missing' }
    })
    const res = await dispatch(handlers, 'embeddings:status', undefined)
    expect(res).toMatchObject({
      ok: true,
      data: { mode: 'provider', ready: false, message: expect.stringMatching(/not configured/) },
    })
  })

  it('switching embedder keeps keyword search working until chunks are re-embedded', async () => {
    const path = await newProject()
    const index = await openIndex(path)
    await index.replaceDocument(
      { id: 'aep', title: 'AEP', kind: 'plan', path: 'documents/aep.pdf', pages: 1 },
      [{ ord: 0, headingPath: 'AEP › Appendix 6', text: 'FIDS go dark.', tokenCount: 3 }],
    )
    await updateSettings((s) => {
      s.embeddings = { mode: 'local-onnx', model: 'Xenova/bge-small-en-v1.5' }
    })
    const res = await dispatch(handlers, 'retrieve:search', { projectPath: path, query: 'FIDS' })
    expect(res).toMatchObject({ ok: true, data: [{ documentId: 'aep', ftsRank: 1 }] })
    expect((res as { data: { vecRank?: number }[] }).data[0]!.vecRank).toBeUndefined()
    expect((await openIndex(path)).status()).toMatchObject({ vectors: 0, vectorsStale: true })
  })

  it.runIf(process.env.LIVE === '1')(
    'embeddings:download-model downloads into userData/models as a job (LIVE)',
    async () => {
      const res = await dispatch(handlers, 'embeddings:download-model', undefined)
      expect(res.ok).toBe(true)
      const { jobId } = (res as { data: { jobId: string } }).data
      const job = await jobs.wait(jobId)
      expect(job).toMatchObject({ kind: 'embed-model-download', status: 'done', progress: 1 })
      const status = await dispatch(handlers, 'embeddings:status', undefined)
      expect(status).toMatchObject({ ok: true, data: { mode: 'hash' } })
      await updateSettings((s) => {
        s.embeddings = { mode: 'local-onnx', model: 'Xenova/bge-small-en-v1.5' }
      })
      expect(await dispatch(handlers, 'embeddings:status', undefined)).toMatchObject({
        ok: true,
        data: { ready: true, downloaded: true },
      })
    },
    600_000,
  )
})
