// #214: opening a project that has documents but no index.sqlite starts one rebuild; opening it
// again (or twice at once) while that rebuild runs reuses it instead of a second reset.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentMeta } from '@shared/schemas'
import { FakeIndex } from '../../../tests/fixtures/ingest/fake-index'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject } = await import('./store')
const { resetSettingsCache } = await import('../settings/store')
const { jobs } = await import('../jobs/manager')
const { dispatch } = await import('../ipc/registry')
const documents = (await import('../ipc/handlers/documents')).default
const { setIndexFactory } = await import('../ingest/pipeline')
const { ensureIndex, activeRebuild } = await import('./ensure-index')

const AEP = 'reference/ncia/airport-emergency-plan-AEP.md'

describe('ensureIndex', () => {
  let root: string
  let index: FakeIndex

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'Idx' }))
      .path
    index = new FakeIndex()
    setIndexFactory(async () => index)
    const res = await dispatch(documents, 'documents:import', {
      projectPath: root,
      filePaths: [AEP],
    })
    if (!res.ok) throw new Error(res.error.message)
    await jobs.wait((res.data as { jobId: string; documents: DocumentMeta[] }).jobId)
  })
  afterEach(() => setIndexFactory(undefined))

  /** Index factory that blocks until released, so the rebuild stays active. */
  function holdRebuild(): () => void {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    setIndexFactory(async () => {
      await gate
      return index
    })
    return release
  }

  const resetJobs = () =>
    jobs
      .list({ projectPath: root })
      .filter((j) => (j.payload as { reset?: boolean } | undefined)?.reset)

  it('starts one rebuild and reuses it on the next open', async () => {
    const release = holdRebuild()
    const project = await loadProject(root)
    const first = await ensureIndex(root, project)
    expect(first).toBeTruthy()
    expect(activeRebuild(root)?.id).toBe(first)
    expect(await ensureIndex(root, project)).toBe(first)
    expect(resetJobs()).toHaveLength(1)
    release()
    await jobs.wait(first!)
    expect(index.resets).toBe(1)
  })

  it('starts only one rebuild for two opens at the same time', async () => {
    const release = holdRebuild()
    const project = await loadProject(root)
    const [a, b] = await Promise.all([ensureIndex(root, project), ensureIndex(root, project)])
    expect(a).toBeTruthy()
    expect(b).toBe(a)
    expect(resetJobs()).toHaveLength(1)
    release()
    await jobs.wait(a!)
  })

  it('starts nothing when the project has no ingested documents', async () => {
    const project = { ...(await loadProject(root)), documents: [] }
    expect(await ensureIndex(root, project)).toBeNull()
  })
})
