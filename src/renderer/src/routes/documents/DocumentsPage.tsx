import { FileUp, Package, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { DocumentMeta } from '@shared/schemas/project'
import type { JobDoneEvent } from '@shared/schemas/job'
import { Button, Dialog, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { AddFromPackDialog } from './AddFromPackDialog'
import { DocumentDetail } from './DocumentDetail'
import { DocumentTable } from './DocumentTable'
import { DocumentsEmpty } from './DocumentsEmpty'
import { IndexStatus } from './IndexStatus'
import { IngestJobs } from './IngestJobs'
import { PlanConflicts } from './PlanConflicts'
import { INDEX_TARGET } from './job-progress'
import { useDocumentActions, useImportDocuments } from './use-document-actions'
import { useFileDrop } from './use-file-drop'
import { useJobProgress } from './use-job-progress'
import { usePackDocuments } from './use-pack-documents'
import './documents.css'
import { errorText } from '../../lib/errors'

const DOC_QUERIES = [
  'documents:list',
  'documents:chunks',
  'documents:text',
  'embeddings:status',
  'packs:documents',
] as const

function refreshDocuments() {
  for (const c of DOC_QUERIES) void queryClient.invalidateQueries({ queryKey: [c] })
}

function onJobDone(e: JobDoneEvent, targets: string[]) {
  refreshDocuments()
  const what = targets.includes(INDEX_TARGET) ? 'Index rebuild' : 'Ingest'
  if (e.status === 'error') toast.error(`${what} failed`, e.error)
  else if (e.status === 'done') toast.success(`${what} finished`)
}

/** Refresh when main reports document changes for this project. */
function useDocumentsChanged(projectPath: string) {
  useEffect(
    () =>
      subscribe('project:changed', (e) => {
        if (e.what === 'documents' && e.path === projectPath) refreshDocuments()
      }),
    [projectPath],
  )
}

function RemoveDialog(props: {
  doc: DocumentMeta | null
  onCancel: () => void
  onConfirm: (doc: DocumentMeta) => void
}) {
  const doc = props.doc
  return (
    <Dialog
      open={!!doc}
      onOpenChange={(open) => !open && props.onCancel()}
      title="Remove document?"
      {...(doc
        ? {
            description: `“${doc.title}” and its chunks will be removed from this project. The original file you imported from is not touched.`,
          }
        : {})}
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => doc && props.onConfirm(doc)}>
            Remove
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

function DropOverlay() {
  return (
    <div className="drop-overlay" aria-hidden>
      <div className="drop-overlay__panel">
        <FileUp size={32} aria-hidden />
        <p>Drop files to import them into this project</p>
      </div>
    </div>
  )
}

export default function DocumentsPage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  const docs = useIpcQuery('documents:list', { projectPath }, { enabled: !!projectPath })
  const { live, track } = useJobProgress(projectPath, onJobDone)
  const importer = useImportDocuments(projectPath, track)
  const actions = useDocumentActions(projectPath, track)
  const dragging = useFileDrop((paths) => void importer.importPaths(paths), !!projectPath)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusChunk, setFocusChunk] = useState<number | undefined>()
  const [pendingRemove, setPendingRemove] = useState<DocumentMeta | null>(null)
  const [packDialogOpen, setPackDialogOpen] = useState(false)
  const packDocs = usePackDocuments(projectPath).data ?? []
  useDocumentsChanged(projectPath)

  const list = docs.data ?? []
  const selected = list.find((d) => d.id === selectedId) ?? null
  const confirmRemove = (doc: DocumentMeta) => {
    setPendingRemove(null)
    if (selectedId === doc.id) setSelectedId(null)
    void actions.remove(doc)
  }

  return (
    <div className="page page--wide documents-page">
      <PageHeader
        eyebrow="Project"
        title="Documents"
        description="Source material the generator retrieves from and cites. Give each document a clear title, short name and kind so citations read well in the MSEL."
        actions={
          <>
            <Button onClick={actions.rebuildIndex} disabled={!!live[INDEX_TARGET] || !list.length}>
              <RefreshCw size={16} aria-hidden /> Rebuild index
            </Button>
            {packDocs.length > 0 && (
              <Button onClick={() => setPackDialogOpen(true)}>
                <Package size={16} aria-hidden /> Add from pack…
              </Button>
            )}
            <Button variant="primary" onClick={importer.pickFiles} disabled={importer.importing}>
              <FileUp size={16} aria-hidden /> Import documents…
            </Button>
          </>
        }
      />
      <IndexStatus projectPath={projectPath} rebuild={live[INDEX_TARGET]} />
      <IngestJobs projectPath={projectPath} />
      {docs.isError && (
        <p className="field__error" role="alert">
          Could not load documents: {errorText(docs.error)}
        </p>
      )}
      {docs.isSuccess && list.length === 0 && <DocumentsEmpty onImport={importer.pickFiles} />}
      {list.length > 0 && (
        <div className={selected ? 'documents-split' : undefined}>
          <DocumentTable
            docs={list}
            live={live}
            selectedId={selectedId}
            onSelect={(d) => {
              setFocusChunk(undefined)
              setSelectedId((cur) => (cur === d.id ? null : d.id))
            }}
            onPatch={actions.patch}
            onReingest={actions.retry}
            onRemove={setPendingRemove}
          />
          {selected && (
            <DocumentDetail
              key={`${selected.id}:${focusChunk ?? ''}`}
              projectPath={projectPath}
              doc={selected}
              {...(focusChunk !== undefined ? { focusChunkId: focusChunk } : {})}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
      {list.length > 0 && (
        <PlanConflicts
          projectPath={projectPath}
          docs={list}
          onOpen={(documentId, chunkId) => {
            setSelectedId(documentId)
            setFocusChunk(chunkId)
          }}
        />
      )}
      <RemoveDialog
        doc={pendingRemove}
        onCancel={() => setPendingRemove(null)}
        onConfirm={confirmRemove}
      />
      <AddFromPackDialog
        open={packDialogOpen}
        onOpenChange={setPackDialogOpen}
        projectPath={projectPath}
        docs={packDocs}
        track={track}
      />
      {dragging && <DropOverlay />}
    </div>
  )
}
