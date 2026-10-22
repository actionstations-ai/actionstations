// Saved versions of an inject (newest first): who, when, note; compare with the current
// draft; restore (the restore itself becomes a new user version).
import { useState } from 'react'
import type { Inject, InjectVersion } from '@shared/schemas/inject'
import { Badge, Button } from '../../components/ui'
import type { InjectDraft } from './draft'
import { diffFields, showValue, type FieldChange } from './schema/diff'

export function ChangeList(props: { changes: FieldChange[]; label: string; empty?: string }) {
  if (!props.changes.length) return <p className="muted">{props.empty ?? 'No differences.'}</p>
  return (
    <ul className="change-list" aria-label={props.label}>
      {props.changes.map((c) => (
        <li key={`${c.kind}:${c.path}`} className={`change change--${c.kind}`}>
          <code>{c.path}</code>
          {c.kind === 'added' && <span> added: {showValue(c.after)}</span>}
          {c.kind === 'removed' && <span> removed (was {showValue(c.before)})</span>}
          {c.kind === 'changed' && (
            <span>
              {' '}
              <del>{showValue(c.before)}</del> → <ins>{showValue(c.after)}</ins>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

const snapshotView = (s: InjectVersion['snapshot'] | InjectDraft) => ({
  title: s.title,
  type: s.type,
  deliveryMode: s.deliveryMode,
  instructorNote: s.instructorNote ?? '',
  fields: s.fields,
})

function VersionItem(props: {
  version: InjectVersion
  index: number
  draft: InjectDraft
  locked: boolean
  busy: boolean
  onRestore: (index: number) => void
}) {
  const { version, index } = props
  const [open, setOpen] = useState(false)
  const at = new Date(version.at)
  return (
    <li className="version">
      <div className="version__head">
        <Badge tone={version.by === 'ai' ? 'info' : 'neutral'}>
          {version.by === 'ai' ? 'AI' : 'You'}
        </Badge>
        <span>
          <strong>Version {index + 1}</strong>{' '}
          <time dateTime={version.at} className="muted">
            {at.toLocaleString()}
          </time>
        </span>
        {version.note && <span className="muted version__note">{version.note}</span>}
      </div>
      <div className="row">
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide changes' : 'Compare with editor'}
        </Button>
        <Button
          size="sm"
          disabled={props.locked || props.busy}
          onClick={() => props.onRestore(index)}
          aria-label={`Restore version ${index + 1}`}
        >
          Restore
        </Button>
      </div>
      {open && (
        <ChangeList
          label={`Changes from version ${index + 1} to the editor`}
          changes={diffFields(snapshotView(version.snapshot), snapshotView(props.draft))}
          empty="The editor matches this version."
        />
      )}
    </li>
  )
}

export function VersionsPanel(props: {
  inject: Inject
  draft: InjectDraft
  busy: boolean
  onRestore: (index: number) => void
}) {
  const versions = props.inject.versions
  if (!versions.length) return <p className="muted">No saved versions yet.</p>
  return (
    <ol className="version-list" aria-label="Versions" reversed>
      {versions
        .map((v, i) => ({ v, i }))
        .reverse()
        .map(({ v, i }) => (
          <VersionItem
            key={`${v.at}-${i}`}
            version={v}
            index={i}
            draft={props.draft}
            locked={props.inject.locked}
            busy={props.busy}
            onRestore={props.onRestore}
          />
        ))}
    </ol>
  )
}
