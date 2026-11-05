// "Add from pack" (#265): reference documents of the enabled packs, with title, source, license
// and pack; the chosen files are copied into the project and ingested like any import.
//
// A document a library lists without its file (#1101) shows "Needs your copy" with where to get
// it, a link to the publisher's page (opens in the browser) and "Add the file…": main checks the
// chosen file against the pinned hash and keeps it on this computer, after which it can be added
// like the others.
import { useState } from 'react'
import type { PackDocumentView } from '@shared/ipc/pack-documents'
import { Badge, Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'

type Track = (jobId: string, targets: string[]) => void

const keyOf = (d: PackDocumentView) => `${d.packId}\u0000${d.path}`

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`

/** Where to get a user-supplied document, and the button that adds the downloaded file. */
function NeedsYourCopy(props: { doc: PackDocumentView; describedBy: string }) {
  const { doc } = props
  const user = doc.userSupplied!
  const [refused, setRefused] = useState<string>()
  const supply = useIpcMutation('packs:addSuppliedDocument', { invalidates: ['packs:documents'] })
  const addFile = async () => {
    setRefused(undefined)
    try {
      const r = await supply.mutateAsync({ packId: doc.packId, path: doc.path })
      if (r.ok) toast.info(`Your copy of ${doc.title} is added`)
      else if (!r.canceled) setRefused(r.message ?? 'The file was not added.')
    } catch (err) {
      toast.error('Could not add the file', err)
    }
  }
  return (
    <div className="pack-doc__supply" id={props.describedBy}>
      <p className="pack-doc__getit">
        The publisher's terms do not let Action Stations include this document. Get your own copy (
        {mb(user.size)}): {user.getIt}
      </p>
      <div className="pack-doc__actions">
        <a className="btn btn--sm" href={user.landing} target="_blank" rel="noreferrer noopener">
          Open the publisher's page
        </a>
        <Button size="sm" onClick={() => void addFile()} disabled={supply.isPending}>
          Add the file…
        </Button>
      </div>
      {refused && (
        <p className="pack-doc__refused" role="alert">
          {refused}
        </p>
      )}
    </div>
  )
}

function PackDocumentItem(props: {
  doc: PackDocumentView
  checked: boolean
  onToggle: () => void
}) {
  const { doc } = props
  const id = `pack-doc-${keyOf(doc).replace(/[^A-Za-z0-9_-]/g, '_')}`
  const added = !!doc.importedDocumentId
  const needsCopy = !!doc.userSupplied && !doc.userSupplied.added
  return (
    <li className="pack-doc">
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        disabled={added || needsCopy}
        onChange={props.onToggle}
        {...(needsCopy ? { 'aria-describedby': `${id}-supply` } : {})}
      />
      <div className="pack-doc__body">
        <label htmlFor={id} className="pack-doc__title">
          {doc.title}
          {added && <span className="muted"> (already in this project)</span>}
        </label>
        {doc.userSupplied && (
          <span>
            {needsCopy ? (
              <Badge tone="warn">Needs your copy</Badge>
            ) : (
              <Badge tone="ok">Your copy</Badge>
            )}
          </span>
        )}
        <span className="pack-doc__meta">
          {doc.bundled ? `Included: ${doc.packName}` : `${doc.packName} ${doc.packVersion}`} ·
          License {doc.license}
          {doc.source ? ` · Source: ${doc.source}` : ''}
        </span>
        {doc.description && <span className="pack-doc__desc">{doc.description}</span>}
        {needsCopy && <NeedsYourCopy doc={doc} describedBy={`${id}-supply`} />}
      </div>
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
