// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentMeta } from '@shared/schemas/project'
import DocumentsPage from './DocumentsPage'
import { PROJECT, makeDoc, mockTtx, projectUrl, renderAt, type Handlers } from './test-utils'

const ROUTE = '/p/:projectKey/documents'
const EMBEDDINGS = { mode: 'hash', model: 'hash-384', dims: 384, ready: true, downloaded: false }

function setup(docs: DocumentMeta[], extra: Handlers = {}) {
  let current = docs
  const ttx = mockTtx({
    'documents:list': () => current,
    'embeddings:status': () => EMBEDDINGS as never,
    'documents:update': (req: { documentId: string; patch: Partial<DocumentMeta> }) => {
      const doc = { ...current.find((d) => d.id === req.documentId)!, ...req.patch }
      current = current.map((d) => (d.id === doc.id ? doc : d))
      return doc
    },
    ...extra,
  })
  renderAt(projectUrl('documents'), ROUTE, DocumentsPage)
  return { ...ttx, setDocs: (d: DocumentMeta[]) => (current = d) }
}

afterEach(() => cleanup())

describe('DocumentsPage — empty project', () => {
  it('explains what to import and that files live in the project folder', async () => {
    setup([])
    const empty = await screen.findByRole('region', { name: 'No documents yet' })
    expect(empty.textContent).toMatch(/plans/)
    expect(empty.textContent).toMatch(/policies/)
    expect(empty.textContent).toMatch(/maps/)
    expect(empty.textContent).toMatch(/forms/)
    expect(empty.textContent).toMatch(/course/)
    expect(empty.textContent).toMatch(/documents\/ folder/)
  })

  it('imports picked files and shows live progress until the job finishes', async () => {
    const doc = makeDoc({ status: 'pending', chunkCount: 0 })
    const ttx = setup([], {
      'dialog:open-files': () => ['/src/TIRP.md'],
      'documents:import': () => ({ jobId: 'JOB1', documents: [doc] }),
    })
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: /Import documents/ }))[0]!)

    await waitFor(() => expect(ttx.calls('documents:import')).toHaveLength(1))
    const dialogReq = ttx.calls('dialog:open-files')[0] as { filters: { name: string }[] }
    expect(dialogReq.filters.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        'PDF',
        'Word',
        'PowerPoint',
        'Excel',
        'Markdown / Text',
        'HTML',
        'Images',
      ]),
    )
    expect(ttx.calls('documents:import')[0]).toEqual({
      projectPath: PROJECT,
      filePaths: ['/src/TIRP.md'],
    })

    ttx.setDocs([doc])
    act(() => ttx.emit('project:changed', { path: PROJECT, what: 'documents' }))
    await screen.findByRole('table', { name: 'Project documents' })
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'JOB1',
        kind: 'ingest',
        status: 'running',
        progress: 0.4,
        message: 'Parsing page 3',
        itemId: doc.id,
      }),
    )
    const bar = await screen.findByRole('progressbar', { name: /Ingest progress/ })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('Parsing page 3')).toBeTruthy()

    ttx.setDocs([{ ...doc, status: 'ok', chunkCount: 5 }])
    act(() => ttx.emit('job:done', { jobId: 'JOB1', kind: 'ingest', status: 'done' }))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
    expect(await screen.findByText('Indexed')).toBeTruthy()
  })

  it('imports files dropped anywhere on the window', async () => {
    const ttx = setup([], {
      'documents:import': () => ({ jobId: 'JOB2', documents: [] }),
    })
    await screen.findByRole('region', { name: 'No documents yet' })
    const file = new File(['# AEP'], 'AEP.md', { type: 'text/markdown' })
    const dataTransfer = { types: ['Files'], files: [file] }
    fireEvent.dragEnter(window, { dataTransfer })
    expect(await screen.findByText(/Drop files to import/)).toBeTruthy()
    fireEvent.drop(window, { dataTransfer })
    await waitFor(() =>
      expect(ttx.calls('documents:import')[0]).toEqual({
        projectPath: PROJECT,
        filePaths: ['/dropped/AEP.md'],
      }),
    )
    expect(screen.queryByText(/Drop files to import/)).toBeNull()
  })
})

describe('DocumentsPage — document list', () => {
  it('renders metadata and saves inline title edits', async () => {
    const ttx = setup([makeDoc()])
    const row = (await screen.findByText('terminal-incident-response-plan-TIRP.md')).closest('tr')!
    const cells = within(row)
    expect(cells.getByText('12')).toBeTruthy()
    expect(cells.getByText('Indexed')).toBeTruthy()
    expect(cells.getByText('terminal')).toBeTruthy()

    const user = userEvent.setup()
    await user.click(cells.getByRole('button', { name: /^Title of/ }))
    const input = cells.getByRole('textbox', { name: /^Title of/ })
    await user.clear(input)
    await user.type(input, 'TIRP 2026{Enter}')
    await waitFor(() =>
      expect(ttx.calls('documents:update')[0]).toEqual({
        projectPath: PROJECT,
        documentId: 'doc1',
        patch: { title: 'TIRP 2026' },
      }),
    )
  })

  it('cancels an inline edit on Escape without saving', async () => {
    const ttx = setup([makeDoc()])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Title of/ }))
    await user.type(screen.getByRole('textbox', { name: /^Title of/ }), ' draft{Escape}')
    expect(ttx.calls('documents:update')).toHaveLength(0)
  })

  it('changes kind and edits tags', async () => {
    const ttx = setup([makeDoc()])
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: /^Kind of/ }), 'map')
    await waitFor(() => expect(ttx.calls('documents:update')).toHaveLength(1))
    expect(ttx.calls('documents:update')[0]).toMatchObject({ patch: { kind: 'map' } })

    await user.type(screen.getByRole('textbox', { name: /^Add tag/ }), 'baggage{Enter}')
    await waitFor(() => expect(ttx.calls('documents:update')).toHaveLength(2))
    expect(ttx.calls('documents:update')[1]).toMatchObject({
      patch: { tags: ['terminal', 'baggage'] },
    })

    await user.click(await screen.findByRole('button', { name: 'Remove tag terminal' }))
    await waitFor(() => expect(ttx.calls('documents:update')).toHaveLength(3))
    expect(ttx.calls('documents:update')[2]).toMatchObject({ patch: { tags: ['baggage'] } })
  })

  it('shows ingest errors with a retry that re-ingests', async () => {
    const ttx = setup([makeDoc({ status: 'error', error: 'PDF is encrypted' })], {
      'documents:reingest': () => ({ jobId: 'JOB3' }),
    })
    expect(await screen.findByText('PDF is encrypted')).toBeTruthy()
    expect(screen.getByText('Error').closest('[title]')?.getAttribute('title')).toBe(
      'PDF is encrypted',
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() =>
      expect(ttx.calls('documents:reingest')[0]).toEqual({
        projectPath: PROJECT,
        documentId: 'doc1',
      }),
    )
    expect(await screen.findByRole('progressbar', { name: /Ingest progress/ })).toBeTruthy()
  })

  it('offers Retry for a document whose import was interrupted (#309)', async () => {
    const ttx = setup([makeDoc({ status: 'error', error: 'Import interrupted — retry' })], {
      'documents:reingest': () => ({ jobId: 'JOB4' }),
    })
    expect(await screen.findByText('Import interrupted — retry')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: /Retry/ }))
    await waitFor(() => expect(ttx.calls('documents:reingest')).toHaveLength(1))
  })

  it('asks for confirmation before removing', async () => {
    const ttx = setup([makeDoc()], { 'documents:remove': () => undefined })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Remove Terminal/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove document?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(ttx.calls('documents:remove')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /^Remove Terminal/ }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() =>
      expect(ttx.calls('documents:remove')[0]).toEqual({
        projectPath: PROJECT,
        documentId: 'doc1',
      }),
    )
  })

  it('refreshes only on document changes for this project', async () => {
    const ttx = setup([makeDoc()])
    await screen.findByRole('table')
    const before = ttx.calls('documents:list').length
    act(() => ttx.emit('project:changed', { path: '/other', what: 'documents' }))
    act(() => ttx.emit('project:changed', { path: PROJECT, what: 'scenarios' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(ttx.calls('documents:list').length).toBe(before)
    act(() => ttx.emit('project:changed', { path: PROJECT, what: 'documents' }))
    await waitFor(() => expect(ttx.calls('documents:list').length).toBe(before + 1))
  })
})

describe('DocumentsPage — detail panel', () => {
  it('shows the headings tree, extracted text and chunks', async () => {
    const ttx = setup([makeDoc()], {
      'documents:text': () => '# TIRP\n\n13.6 FIDS/BHS System Failure\nSwitch to manual boards.',
      'documents:chunks': () => [
        {
          id: 1,
          documentId: 'doc1',
          headingPath: 'TIRP › Section 13 › 13.6 FIDS/BHS System Failure',
          page: 4,
          ord: 0,
          text: 'Switch to manual boards.',
          tokenCount: 42,
        },
      ],
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Show details for/ }))
    const panel = await screen.findByRole('complementary', { name: /^Details for/ })
    const tree = within(panel).getByRole('region', { name: /^Headings of/ })
    expect(within(tree).getByText('TIRP')).toBeTruthy()
    expect(within(tree).getByText('13.6 FIDS/BHS System Failure')).toBeTruthy()
    expect(within(tree).getAllByRole('list').length).toBe(3)

    await user.click(within(panel).getByRole('tab', { name: 'Text' }))
    const text = await within(panel).findByLabelText(/^Extracted text of/)
    expect(text.tagName).toBe('PRE')
    expect(text.textContent).toContain('Switch to manual boards.')

    await user.click(within(panel).getByRole('tab', { name: /Chunks/ }))
    const chunks = await within(panel).findByRole('list', { name: /^Chunks of/ })
    expect(
      within(chunks).getByText('TIRP › Section 13 › 13.6 FIDS/BHS System Failure'),
    ).toBeTruthy()
    expect(within(chunks).getByText(/p\. 4 · 42 tokens/)).toBeTruthy()
    expect(ttx.calls('documents:chunks')[0]).toMatchObject({ documentId: 'doc1', offset: 0 })

    await user.click(within(panel).getByRole('button', { name: 'Close details' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})

describe('DocumentsPage — index', () => {
  it('shows embedding status with a settings link and tracks a rebuild', async () => {
    const ttx = setup([makeDoc()], { 'index:rebuild': () => ({ jobId: 'IDX1' }) })
    expect(await screen.findByText(/hash-384/)).toBeTruthy()
    // The status reflects this project's Embeddings routing (#160).
    expect(ttx.calls('embeddings:status')[0]).toEqual({ projectPath: PROJECT })
    expect(screen.getByRole('link', { name: 'Embedding settings' }).getAttribute('href')).toBe(
      '/settings',
    )
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /Rebuild index/ }))
    const bar = await screen.findByRole('progressbar', { name: 'Index rebuild progress' })
    expect(ttx.calls('index:rebuild')[0]).toEqual({ projectPath: PROJECT })
    expect(screen.getByRole('button', { name: /Rebuild index/ }).hasAttribute('disabled')).toBe(
      true,
    )
    act(() =>
      ttx.emit('job:progress', {
        jobId: 'IDX1',
        kind: 'reindex',
        status: 'running',
        progress: 0.75,
        message: 'Embedding chunks',
      }),
    )
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe('75'))
    act(() => ttx.emit('job:done', { jobId: 'IDX1', kind: 'reindex', status: 'done' }))
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  })

  it('degrades gracefully while backend channels are not implemented', async () => {
    mockTtx({})
    renderAt(projectUrl('documents'), ROUTE, DocumentsPage)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(await screen.findByText('Status unavailable.')).toBeTruthy()
  })
})

describe('DocumentsPage — add from pack (#265)', () => {
  const RAIL = 'ai.actionstations.freight-rail'
  const packDoc = (path: string, title: string, license: string, imported?: string) => ({
    packId: RAIL,
    packVersion: '1.0.0',
    packName: 'Freight Rail Operations',
    slug: 'rail-emergency-plan',
    path,
    title,
    license,
    source: 'FRA, fra.dot.gov',
    ...(imported ? { importedDocumentId: imported } : {}),
  })

  it('lists pack documents with source and license, imports the chosen ones', async () => {
    const imported = makeDoc({
      id: 'doc2',
      title: 'Hazmat release quick reference',
      status: 'pending',
      license: 'CC0-1.0',
      source: {
        packId: RAIL,
        version: '1.0.0',
        path: 'documents/rail-emergency-plan/hazmat.md',
        packName: 'Freight Rail Operations',
      },
    })
    const ttx = setup([makeDoc()], {
      'packs:documents': () => [
        packDoc(
          'documents/rail-emergency-plan/erp.pdf',
          'Emergency Response Plan',
          'CC-BY-4.0',
          'doc1',
        ),
        packDoc(
          'documents/rail-emergency-plan/hazmat.md',
          'Hazmat release quick reference',
          'CC0-1.0',
        ),
      ],
      'packs:importDocuments': () => ({ jobId: 'JOB2', documents: [imported] }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Add from pack/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Add documents from packs' })
    expect(dialog.textContent).toMatch(
      /Freight Rail Operations 1\.0\.0 · License CC0-1\.0 · Source: FRA/,
    )
    const done = within(dialog).getByRole('checkbox', { name: /Emergency Response Plan/ })
    expect((done as HTMLInputElement).disabled).toBe(true)
    await user.click(within(dialog).getByRole('checkbox', { name: /Hazmat release/ }))
    await user.click(within(dialog).getByRole('button', { name: /^Add 1/ }))

    await waitFor(() => expect(ttx.calls('packs:importDocuments')).toHaveLength(1))
    expect(ttx.calls('packs:importDocuments')[0]).toEqual({
      projectPath: PROJECT,
      documents: [{ packId: RAIL, path: 'documents/rail-emergency-plan/hazmat.md' }],
    })
    // documents:list adds the copy state (#269); the row shows it on the ProvenanceBadge.
    const listed = {
      ...imported,
      copy: { edited: true, packMissing: true, updateAvailable: false },
    }
    ttx.setDocs([makeDoc(), listed as typeof imported])
    act(() => ttx.emit('project:changed', { path: PROJECT, what: 'documents' }))
    const badge = await screen.findByRole('img', { name: /Freight Rail Operations/ })
    expect(badge.getAttribute('aria-label')).toBe(
      'Project copy from pack Freight Rail Operations 1.0.0, edited, pack not installed',
    )
    expect(badge.textContent).toBe('From Freight Rail Operations 1.0.0editednot installed')
    expect(badge.parentElement?.textContent).toMatch(/License CC0-1\.0$/)
  })

  it('hides the button when no enabled pack has documents', async () => {
    setup([makeDoc()], { 'packs:documents': () => [] })
    await screen.findAllByRole('button', { name: /Import documents/ })
    expect(screen.queryByRole('button', { name: /Add from pack/ })).toBeNull()
  })
})
