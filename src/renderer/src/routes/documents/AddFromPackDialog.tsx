// "Add from pack" (#265): reference documents of the enabled packs, with title, source, license
// and pack; the chosen files are copied into the project and ingested like any import.
import { useState } from 'react'
import type { PackDocumentView } from '@shared/ipc/pack-documents'
import { Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'

type Track = (jobId: string, targets: string[]) => void

const keyOf = (d: PackDocumentView) => `${d.packId}\u0000${d.path}`

function PackDocumentItem(props: {
  doc: PackDocumentView
  checked: boolean
  onToggle: () => void
}) {
  const { doc } = props
  const id = `pack-doc-${keyOf(doc).replace(/[^A-Za-z0-9_-]/g, '_')}`
  const added = !!doc.importedDocumentId
  return (
    <li className="pack-doc">
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        disabled={added}
        onChange={props.onToggle}
      />
      <label htmlFor={id} className="pack-doc__body">
        <span className="pack-doc__title">
          {doc.title}
          {added && <span className="muted"> (already in this project)</span>}
        </span>
        <span className="pack-doc__meta">
          {doc.bundled ? `Included: ${doc.packName}` : `${doc.packName} ${doc.packVersion}`} ·
          License {doc.license}
          {doc.source ? ` · Source: ${doc.source}` : ''}
        </span>
        {doc.description && <span className="pack-doc__desc">{doc.description}</span>}
      </label>
    </li>
  )
}

export function AddFromPackDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPath: string
  docs: readonly PackDocumentView[]
  track: Track
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const importer = useIpcMutation('packs:importDocuments', {
    invalidates: ['documents:list', 'packs:documents'],
  })
  const setOpen = (open: boolean) => {
    if (!open) setChosen(new Set())
    props.onOpenChange(open)
  }

  const toggle = (d: PackDocumentView) =>
    setChosen((cur) => {
      const next = new Set(cur)
      if (!next.delete(keyOf(d))) next.add(keyOf(d))
      return next
    })

  const add = async () => {
    const documents = props.docs
      .filter((d) => chosen.has(keyOf(d)))
      .map((d) => ({ packId: d.packId, path: d.path }))
    try {
      const res = await importer.mutateAsync({ projectPath: props.projectPath, documents })
      props.track(
        res.jobId,
        res.documents.map((d) => d.id),
      )
      toast.info(
        `Adding ${documents.length} document${documents.length === 1 ? '' : 's'} from packs`,
      )
      setOpen(false)
    } catch (err) {
      toast.error('Could not add the documents', err)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={setOpen}
      title="Add documents from packs"
      description="Each document is copied into this project. Removing or updating the pack later does not change the copy."
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void add()}
            disabled={!chosen.size || importer.isPending}
          >
            Add {chosen.size || ''}
          </Button>
        </>
      }
    >
      {props.docs.length === 0 ? (
        <p className="muted">No enabled pack has reference documents.</p>
      ) : (
        <ul className="pack-doc-list" aria-label="Pack documents">
          {props.docs.map((d) => (
            <PackDocumentItem
              key={keyOf(d)}
              doc={d}
              checked={chosen.has(keyOf(d))}
              onToggle={() => toggle(d)}
            />
          ))}
        </ul>
      )}
    </Dialog>
  )
}
