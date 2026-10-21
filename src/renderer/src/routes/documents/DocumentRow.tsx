import { clsx } from 'clsx'
import { PanelRightOpen, RotateCcw, Trash2 } from 'lucide-react'
import type { DocumentMeta } from '@shared/schemas/project'
import { Badge, Button, ProgressBar } from '../../components/ui'
import { InlineText } from './InlineText'
import { TagEditor } from './TagEditor'
import type { LiveProgress } from './job-progress'
import {
  DOCUMENT_KINDS,
  formatDate,
  isBusy,
  statusLabel,
  statusTone,
  type DocumentKindValue,
} from './doc-utils'

export type DocumentPatch = {
  title?: string
  shortName?: string
  kind?: DocumentKindValue
  tags?: string[]
}

export interface DocumentRowProps {
  doc: DocumentMeta
  live: LiveProgress | undefined
  selected: boolean
  onSelect: () => void
  onPatch: (patch: DocumentPatch) => void
  onReingest: () => void
  onRemove: () => void
}

function StatusCell({
  doc,
  live,
  onReingest,
}: Pick<DocumentRowProps, 'doc' | 'live' | 'onReingest'>) {
  const running = !!live || isBusy(doc.status)
  return (
    <div className="doc-status">
      <span title={doc.status === 'error' ? doc.error : undefined}>
        <Badge tone={live ? 'info' : statusTone(doc.status)}>
          {live ? 'Working' : statusLabel(doc.status)}
        </Badge>
      </span>
      {live && (
        <>
          <ProgressBar value={live.progress} label={`Ingest progress for ${doc.title}`} />
          <span className="doc-status__msg">{live.message}</span>
        </>
      )}
      {!live && doc.status === 'error' && (
        <>
          {doc.error && <span className="doc-status__error">{doc.error}</span>}
          <Button size="sm" onClick={onReingest} disabled={running}>
            <RotateCcw size={14} aria-hidden /> Retry
          </Button>
        </>
      )}
    </div>
  )
}

export function DocumentRow(props: DocumentRowProps) {
  const { doc } = props
  return (
    <tr
      className={clsx('doc-row', props.selected && 'doc-row--selected')}
      aria-selected={props.selected}
      onClick={props.onSelect}
    >
      <td className="doc-row__title">
        <InlineText
          value={doc.title}
          label={`Title of ${doc.filename}`}
          onCommit={(title) => props.onPatch({ title })}
        />
        <span className="doc-row__file mono">{doc.filename}</span>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <InlineText
          value={doc.shortName ?? ''}
          label={`Short name of ${doc.title}`}
          placeholder="Add"
          allowEmpty
          onCommit={(shortName) => props.onPatch({ shortName })}
        />
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <select
          className="select select--sm"
          aria-label={`Kind of ${doc.title}`}
          value={doc.kind}
          onChange={(e) => props.onPatch({ kind: e.target.value as DocumentKindValue })}
        >
          {DOCUMENT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <TagEditor
          tags={doc.tags}
          label={`Tags of ${doc.title}`}
          onChange={(tags) => props.onPatch({ tags })}
        />
      </td>
      <td className="num">{doc.pages || '—'}</td>
      <td className="num">{doc.chunkCount}</td>
      <td onClick={(e) => e.stopPropagation()}>
        <StatusCell doc={doc} live={props.live} onReingest={props.onReingest} />
      </td>
      <td className="nowrap">{formatDate(doc.ingestedAt)}</td>
      <td className="doc-row__actions" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={`Show details for ${doc.title}`}
          aria-pressed={props.selected}
          onClick={props.onSelect}
        >
          <PanelRightOpen size={16} aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon
          aria-label={`Remove ${doc.title}`}
          onClick={props.onRemove}
        >
          <Trash2 size={16} aria-hidden />
        </Button>
      </td>
    </tr>
  )
}
