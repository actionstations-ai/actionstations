import { X } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentMeta } from '@shared/schemas/project'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { HeadingTree } from './HeadingTree'
import { buildHeadingTree, paginateText } from './doc-utils'

const CHUNK_PAGE = 200

function Pager(props: { page: number; count: number; onPage: (p: number) => void; label: string }) {
  if (props.count <= 1) return null
  return (
    <div className="pager" role="group" aria-label={props.label}>
      <Button size="sm" disabled={props.page === 0} onClick={() => props.onPage(props.page - 1)}>
        Previous
      </Button>
      <span className="muted">
        Page {props.page + 1} of {props.count}
      </span>
      <Button
        size="sm"
        disabled={props.page >= props.count - 1}
        onClick={() => props.onPage(props.page + 1)}
      >
        Next
      </Button>
    </div>
  )
}

function TextViewer({ projectPath, doc }: { projectPath: string; doc: DocumentMeta }) {
  const text = useIpcQuery('documents:text', { projectPath, documentId: doc.id })
  const pages = useMemo(() => paginateText(text.data ?? ''), [text.data])
  const [page, setPage] = useState(0)
  if (text.isPending) return <p className="muted">Loading text…</p>
  if (text.isError) return <p className="field__error">Could not load text: {text.error.message}</p>
  if (!text.data) return <p className="muted">No text was extracted from this document.</p>
  const current = Math.min(page, pages.length - 1)
  return (
    <div className="stack">
      <Pager page={current} count={pages.length} onPage={setPage} label="Text pages" />
      <pre className="text-viewer" tabIndex={0} aria-label={`Extracted text of ${doc.title}`}>
        {pages[current]}
      </pre>
    </div>
  )
}

function ChunkList({ projectPath, doc }: { projectPath: string; doc: DocumentMeta }) {
  const [limit, setLimit] = useState(CHUNK_PAGE)
  const chunks = useIpcQuery(
    'documents:chunks',
    { projectPath, documentId: doc.id, limit, offset: 0 },
    { placeholderData: (prev) => prev },
  )
  if (chunks.isPending) return <p className="muted">Loading chunks…</p>
  if (chunks.isError)
    return <p className="field__error">Could not load chunks: {chunks.error.message}</p>
  const list = chunks.data
  if (!list.length) return <p className="muted">No chunks yet. They appear once ingest finishes.</p>
  return (
    <div className="stack">
      <ol className="chunk-list" aria-label={`Chunks of ${doc.title}`}>
        {list.map((c) => (
          <li key={c.id} className="chunk">
            <div className="chunk__meta">
              <strong className="chunk__heading">{c.headingPath || 'Untitled section'}</strong>
              <span className="muted">
                {c.page ? `p. ${c.page} · ` : ''}
                {c.tokenCount} tokens
              </span>
            </div>
            <p className="chunk__text">{c.text}</p>
          </li>
        ))}
      </ol>
      {list.length >= limit && (
        <Button size="sm" onClick={() => setLimit((l) => l + CHUNK_PAGE)}>
          Show more chunks
        </Button>
      )}
    </div>
  )
}

function HeadingsTab({ projectPath, doc }: { projectPath: string; doc: DocumentMeta }) {
  // Fall back to chunk heading paths when the ingest did not record a preview.
  const needsFallback = doc.headingsPreview.length === 0 && doc.chunkCount > 0
  const chunks = useIpcQuery(
    'documents:chunks',
    { projectPath, documentId: doc.id, limit: CHUNK_PAGE, offset: 0 },
    { enabled: needsFallback },
  )
  const paths = needsFallback
    ? [...new Set((chunks.data ?? []).map((c) => c.headingPath).filter(Boolean))]
    : doc.headingsPreview
  const pathKey = paths.join('\n')
  const tree = useMemo(() => buildHeadingTree(pathKey ? pathKey.split('\n') : []), [pathKey])
  return <HeadingTree nodes={tree} label={`Headings of ${doc.title}`} />
}

export function DocumentDetail(props: {
  projectPath: string
  doc: DocumentMeta
  onClose: () => void
}) {
  const { doc, projectPath } = props
  const ref = useRef<HTMLElement>(null)
  // When the panel stacks below the table, bring it into view on open.
  useEffect(() => ref.current?.scrollIntoView?.({ block: 'nearest' }), [])
  return (
    <aside ref={ref} className="doc-detail card" aria-label={`Details for ${doc.title}`}>
      <header className="doc-detail__header">
        <div>
          <h2>{doc.title}</h2>
          <p className="muted mono">{doc.filename}</p>
        </div>
        <Button size="sm" variant="ghost" icon aria-label="Close details" onClick={props.onClose}>
          <X size={16} aria-hidden />
        </Button>
      </header>
      <Tabs.Root defaultValue="headings" className="doc-tabs">
        <Tabs.List className="doc-tabs__list" aria-label="Document views">
          <Tabs.Trigger value="headings" className="doc-tabs__tab">
            Headings
          </Tabs.Trigger>
          <Tabs.Trigger value="text" className="doc-tabs__tab">
            Text
          </Tabs.Trigger>
          <Tabs.Trigger value="chunks" className="doc-tabs__tab">
            Chunks ({doc.chunkCount})
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="headings" className="doc-tabs__panel">
          <HeadingsTab projectPath={projectPath} doc={doc} />
        </Tabs.Content>
        <Tabs.Content value="text" className="doc-tabs__panel">
          <TextViewer projectPath={projectPath} doc={doc} />
        </Tabs.Content>
        <Tabs.Content value="chunks" className="doc-tabs__panel">
          <ChunkList projectPath={projectPath} doc={doc} />
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  )
}
