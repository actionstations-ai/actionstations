// "Update profile from pack" (ADR-0018, #263): a project on a pack domain keeps its own copy
// of the profile. When the installed pack has another version of it, this shows what would
// change, field by field, and replaces the copy only when the designer asks.
import { useId, useState } from 'react'
import {
  profileFieldDiff,
  snapshotStatus,
  type DomainProfileSnapshot,
  type ProfileFieldChange,
} from '@shared/domains'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'
import { useDomainRegistry } from '../../state/domains'

function ChangeItem({ change }: { change: ProfileFieldChange }) {
  const parts: string[] = []
  if (change.added.length) parts.push(`adds ${change.added.join(', ')}`)
  if (change.removed.length) parts.push(`removes ${change.removed.join(', ')}`)
  if (change.after !== undefined || change.before !== undefined) parts.push('changed')
  if (!parts.length) parts.push('reordered')
  return (
    <li data-testid="profile-diff-field">
      <strong>{change.label}</strong>: {parts.join('; ')}
    </li>
  )
}

export function PackProfileUpdate(props: { path: string; snapshot: DomainProfileSnapshot }) {
  useDomainRegistry()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const update = useIpcMutation('project:update', {
    invalidates: ['project:get', 'project:list-recent'],
  })
  const status = snapshotStatus(props.snapshot)
  if (!status.updateAvailable || !status.entry) return null
  const { entry } = status
  const changes = profileFieldDiff(props.snapshot.profile, entry.profile)
  const apply = () =>
    update.mutate(
      { path: props.path, patch: { refreshDomainProfileSnapshot: true } },
      {
        onSuccess: () =>
          toast.success(`Profile updated from ${entry.packName} ${entry.packVersion}`),
        onError: (err) => toast.error('Could not update the profile', err),
      },
    )
  return (
    <div className="card stack" role="status" data-testid="pack-profile-update">
      <p>
        {entry.packName} {entry.packVersion} has another version of this profile; this project uses
        its copy from version {props.snapshot.version}. Nothing changes until you update.
      </p>
      <div className="row">
        <Button
          size="sm"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide changes' : `Show changes (${changes.length})`}
        </Button>
        <Button size="sm" variant="primary" disabled={update.isPending} onClick={apply}>
          Update profile from pack
        </Button>
      </div>
      {open && (
        <ul id={listId} className="stack">
          {changes.length ? (
            changes.map((c) => <ChangeItem key={c.field} change={c} />)
          ) : (
            <li>No field differs; only the version number changes.</li>
          )}
        </ul>
      )}
    </div>
  )
}
