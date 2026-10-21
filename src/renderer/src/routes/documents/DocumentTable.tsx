import type { DocumentMeta } from '@shared/schemas/project'
import { DocumentRow, type DocumentPatch } from './DocumentRow'
import type { LiveMap } from './job-progress'

export function DocumentTable(props: {
  docs: DocumentMeta[]
  live: LiveMap
  selectedId: string | null
  onSelect: (doc: DocumentMeta) => void
  onPatch: (doc: DocumentMeta, patch: DocumentPatch) => void
  onReingest: (doc: DocumentMeta) => void
  onRemove: (doc: DocumentMeta) => void
}) {
  return (
    <div className="doc-table-wrap">
      <table className="table doc-table" aria-label="Project documents">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Short name</th>
            <th scope="col">Kind</th>
            <th scope="col">Tags</th>
            <th scope="col" className="num">
              Pages
            </th>
            <th scope="col" className="num">
              Chunks
            </th>
            <th scope="col">Status</th>
            <th scope="col">Ingested</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              live={props.live[doc.id]}
              selected={props.selectedId === doc.id}
              onSelect={() => props.onSelect(doc)}
              onPatch={(p) => props.onPatch(doc, p)}
              onReingest={() => props.onReingest(doc)}
              onRemove={() => props.onRemove(doc)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
