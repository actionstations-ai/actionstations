import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentMeta } from '@shared/schemas'
import { FakeIndex } from '../../../tests/fixtures/ingest/fake-index'
import { writeFixtures } from '../../../tests/fixtures/ingest/builders'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createProject, loadProject } = await import('../project/store')
const { resetSettingsCache } = await import('../settings/store')
const { onEmit } = await import('../lib/events')
const { jobs } = await import('../jobs/manager')
const { dispatch } = await import('../ipc/registry')
const handlers = (await import('../ipc/handlers/documents')).default
const { setIndexFactory, guessKind } = await import('./pipeline')

const TIRP = 'reference/ncia/terminal-incident-response-plan-TIRP.md'
const AEP = 'reference/ncia/airport-emergency-plan-AEP.md'

async function call<T>(name: string, req: unknown): Promise<T> {
  const res = await dispatch(handlers, name, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

describe('ingest pipeline (via documents:* handlers)', () => {
  let root: string
  let index: FakeIndex
  let fixtures: Awaited<ReturnType<typeof writeFixtures>>

  beforeAll(async () => {
    fixtures = await writeFixtures(mkdtempSync(join(tmpdir(), 'ttx-fx-')))
  })

  beforeEach(async () => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    root = (await createProject({ parentDir: mkdtempSync(join(tmpdir(), 'ttx-p-')), name: 'NCIA' }))
      .path
    index = new FakeIndex()
    setIndexFactory(async () => index)
  })
  afterEach(() => setIndexFactory(undefined))

  async function importAndWait(filePaths: string[]) {
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('documents:import', {
      projectPath: root,
      filePaths,
    })
    await jobs.wait(res.jobId)
    return res
  }

  it('stores original, text.md and meta.json, indexes chunks and walks the status steps', async () => {
    const statuses: string[] = []
    const progress: { stage?: string; itemId?: string }[] = []
    const off = onEmit((name, payload) => {
      if (name === 'project:changed' && (payload as { what: string }).what === 'documents') {
        const doc = readMetaJson()
        if (doc) statuses.push(doc.status)
      }
      if (name === 'job:progress') progress.push(payload as { stage?: string; itemId?: string })
    })
    let docId = ''
    const readMetaJson = () => {
      const p = join(root, 'documents', docId, 'meta.json')
      return docId && existsSync(p)
        ? DocumentMeta.parse(JSON.parse(readFileSync(p, 'utf8')))
        : undefined
    }
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('documents:import', {
      projectPath: root,
      filePaths: [TIRP],
    })
    docId = res.documents[0]!.id
    await jobs.wait(res.jobId)
    off()

    const dir = join(root, 'documents', docId)
    expect(readFileSync(join(dir, 'original.md'), 'utf8')).toBe(readFileSync(TIRP, 'utf8'))
    expect(readFileSync(join(dir, 'text.md'), 'utf8')).toMatch(/^# North Coast .*\(TIRP\)\n/)

    const meta = (await loadProject(root)).documents[0]!
    expect(meta).toMatchObject({
      id: docId,
      title:
        'North Coast International Airport (NCIA) — Airport Terminal Incident Response Plan (TIRP)',
      shortName: 'TIRP',
      filename: 'terminal-incident-response-plan-TIRP.md',
      mimeType: 'text/markdown',
      kind: 'plan',
      status: 'ok',
    })
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(meta.chunkCount).toBe(index.rows.get(docId)!.length)
    expect(meta.headingsPreview.length).toBeGreaterThan(12)
    expect(meta.headingsPreview.some((p) => p.includes(' › '))).toBe(true)
    expect(meta.ingestedAt).toBeTruthy()
    expect(DocumentMeta.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')))).toEqual(
      meta,
    )

    expect(index.docs.get(docId)).toMatchObject({
      shortName: 'TIRP',
      path: `documents/${docId}/original.md`,
    })
    const paths = index.rows.get(docId)!.map((c) => c.headingPath)
    expect(paths).toContain('TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure')

    expect(statuses).toEqual(expect.arrayContaining(['parsing', 'embedding', 'ok']))
    expect(statuses.indexOf('parsing')).toBeLessThan(statuses.indexOf('embedding'))
    const stages = progress.filter((p) => p.itemId === docId).map((p) => p.stage)
    expect(stages).toEqual(expect.arrayContaining(['parsing', 'chunking', 'embedding', 'done']))
  })

  it('re-importing identical content is a no-op that returns the existing document', async () => {
    const first = await importAndWait([TIRP])
    const copy = join(mkdtempSync(join(tmpdir(), 'ttx-copy-')), 'renamed.md')
    writeFileSync(copy, readFileSync(TIRP))
    const second = await importAndWait([copy, TIRP])
    expect(second.documents.map((d) => d.id)).toEqual([
      first.documents[0]!.id,
      first.documents[0]!.id,
    ])
    expect((await loadProject(root)).documents).toHaveLength(1)
  })

  it('ingests every binary format through the same pipeline', async () => {
    const res = await importAndWait([fixtures.pdf, fixtures.docx, fixtures.pptx, fixtures.xlsx])
    const docs = (await loadProject(root)).documents
    expect(docs.map((d) => d.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    const pdf = docs.find((d) => d.id === res.documents[0]!.id)!
    expect(pdf).toMatchObject({ shortName: 'TIRP', pages: 3 })
    const pdfChunks = index.rows.get(pdf.id)!
    expect(
      pdfChunks.find((c) => c.headingPath === 'TIRP › Section 2 › 2.1 Procedures for case 1')?.page,
    ).toBe(2)
  })

  it('marks a failing document as error and keeps going', async () => {
    const bad = join(mkdtempSync(join(tmpdir(), 'ttx-bad-')), 'broken.docx')
    writeFileSync(bad, 'not a zip')
    await importAndWait([bad, AEP])
    const docs = (await loadProject(root)).documents
    expect(docs[0]).toMatchObject({ filename: 'broken.docx', status: 'error' })
    expect(docs[0]!.error).toBeTruthy()
    expect(docs[1]).toMatchObject({ shortName: 'AEP', status: 'ok' })
  })

  it('reports an index failure on the document', async () => {
    index.failFor = 'none'
    const res = await call<{ jobId: string; documents: DocumentMeta[] }>('documents:import', {
      projectPath: root,
      filePaths: [AEP],
    })
    index.failFor = res.documents[0]!.id
    await jobs.wait(res.jobId)
    expect((await loadProject(root)).documents[0]).toMatchObject({
      status: 'error',
      error: 'embedder unavailable',
    })
  })

  it('still parses and writes text.md when the index cannot be opened', async () => {
    setIndexFactory(async () => {
      throw Object.assign(new Error('Index store lands with #14'), { name: 'Error' })
    })
    const { documents } = await importAndWait([AEP])
    const doc = (await loadProject(root)).documents[0]!
    expect(doc).toMatchObject({ status: 'error', error: 'Index store lands with #14', pages: 0 })
    expect(existsSync(join(root, 'documents', documents[0]!.id, 'text.md'))).toBe(true)
    expect(doc.headingsPreview[0]).toBe('Table of Contents')
  })

  it('rejects unsupported and missing files before copying anything', async () => {
    await expect(
      call('documents:import', { projectPath: root, filePaths: ['/tmp/x.exe'] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      call('documents:import', { projectPath: root, filePaths: ['/nope/missing.pdf'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await loadProject(root)).documents).toHaveLength(0)
  })

  it('lists, serves text and chunks, and removes a document with its index rows', async () => {
    const { documents } = await importAndWait([AEP])
    const id = documents[0]!.id
    expect(
      (await call<DocumentMeta[]>('documents:list', { projectPath: root })).map((d) => d.id),
    ).toEqual([id])
    expect(await call<string>('documents:text', { projectPath: root, documentId: id })).toContain(
      '#### 6.2 Critical Systems & Impact',
    )
    const chunks = await call<{ ord: number }[]>('documents:chunks', {
      projectPath: root,
      documentId: id,
      limit: 5,
      offset: 2,
    })
    expect(chunks.map((c) => c.ord)).toEqual([2, 3, 4, 5, 6])

    await call('documents:remove', { projectPath: root, documentId: id })
    expect(existsSync(join(root, 'documents', id))).toBe(false)
    expect(index.rows.has(id)).toBe(false)
    expect((await loadProject(root)).documents).toEqual([])
  })

  it('renaming the short name re-chunks from text.md so citations follow', async () => {
    const { documents } = await importAndWait([AEP])
    const id = documents[0]!.id
    const updated = await call<DocumentMeta>('documents:update', {
      projectPath: root,
      documentId: id,
      patch: { shortName: 'NCIA-AEP', tags: [' cyber ', 'cyber', ''] },
    })
    expect(updated).toMatchObject({ shortName: 'NCIA-AEP', tags: ['cyber'] })
    await Promise.all(jobs.list({ activeOnly: true }).map((j) => jobs.wait(j.id)))
    expect(index.rows.get(id)!.every((c) => c.headingPath.split(' › ')[0] === 'NCIA-AEP')).toBe(
      true,
    )
  })

  it('reingest re-parses from the stored original; rebuild resets and re-chunks from text.md', async () => {
    const { documents } = await importAndWait([TIRP, AEP])
    const [a, b] = documents.map((d) => d.id)
    const before = index.rows.get(a!)!.length

    const re = await call<{ jobId: string }>('documents:reingest', {
      projectPath: root,
      documentId: a,
    })
    await jobs.wait(re.jobId)
    expect(index.rows.get(a!)!.length).toBe(before)

    // Rebuild must not need the originals: text.md alone is enough.
    for (const id of [a, b]) writeFileSync(join(root, 'documents', id!, 'original.md'), '')
    const rebuild = await call<{ jobId: string }>('index:rebuild', { projectPath: root })
    await jobs.wait(rebuild.jobId)
    expect(index.resets).toBe(1)
    expect(index.rows.get(a!)!.length).toBe(before)
    expect(index.rows.get(b!)!.some((c) => c.headingPath.includes('Appendix 6'))).toBe(true)
  })

  it('refuses projects the user has not opened', async () => {
    const stranger = mkdtempSync(join(tmpdir(), 'ttx-x-'))
    await expect(call('documents:list', { projectPath: stranger })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('guessKind', () => {
  it.each([
    ['Airport Emergency Plan.pdf', 'plan'],
    ['Airport Security Program.pdf', 'policy'],
    ['NCIA Terminal Map.pdf', 'map'],
    ['ICS-201 Incident Briefing.pdf', 'form'],
    ['Scenario 3 After Action Report.docx', 'prior_exercise'],
    ['CSAAP Module 4.pptx', 'course'],
    ['notes.txt', 'other'],
  ])('%s → %s', (name, kind) => expect(guessKind(name)).toBe(kind))
})

describe('headingsPreview', () => {
  it('lists heading paths so ancestors precede descendants', async () => {
    const { headingsPreview } = await import('./pipeline')
    const doc = {
      title: 'T',
      pages: 0,
      sections: [
        { headingPath: ['Part A', 'A.1 Scope'], text: 'x' },
        { headingPath: ['Part A', 'A.2 Roles › duties'], text: 'y' },
        { headingPath: ['Part B'], text: 'z' },
      ],
    }
    expect(headingsPreview(doc)).toEqual([
      'Part A',
      'Part A › A.1 Scope',
      'Part A › A.2 Roles - duties',
      'Part B',
    ])
    expect(headingsPreview(doc, 2)).toEqual(['Part A', 'Part A › A.1 Scope'])
  })
})
