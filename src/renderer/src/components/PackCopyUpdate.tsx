// "Update from pack" for a project copy of a pack item (ADR-0018, #310): templates and
// workflows. Shown when the installed pack has another version of the copy. An unedited copy is
// replaced on click; an edited one (or one main reports as edited, CONFLICT) asks first, since
// the update discards the project's edits. Same pattern as "Update profile from pack" (#263).
import { useState } from 'react'
import type { PackCopyState } from '@shared/schemas/project-packs'
import { Button, Dialog } from './ui'
import { toast } from './toast-store'
import { isConflictError } from '../lib/errors'

export interface PackCopyUpdateProps {
  /** "template" or "workflow", for the dialog and toasts. */
  kind: string
  /** The item's display name. */
  name: string
  packName: string
  copy: PackCopyState | undefined
  /** Replace the copy; rejects with CONFLICT when the copy is edited and not confirmed. */
  onUpdate: (confirmEdited: boolean) => Promise<unknown>
}

export function PackCopyUpdate(props: PackCopyUpdateProps) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const { copy } = props
  if (!copy?.updateAvailable || copy.packMissing) return null
  const target = `${props.packName}${copy.installedVersion ? ` ${copy.installedVersion}` : ''}`

  const run = async (confirmEdited: boolean) => {
    setConfirming(false)
    setPending(true)
    try {
      await props.onUpdate(confirmEdited)
      toast.success(`Updated “${props.name}” from ${target}`)
    } catch (e) {
      if (!confirmEdited && isConflictError(e)) setConfirming(true)
      else toast.error(`Could not update the ${props.kind}`, e)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => (copy.edited ? setConfirming(true) : void run(false))}
      >
        Update from pack
      </Button>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Discard your edits?"
        description={`This project's copy of “${props.name}” has been edited. Updating replaces it with the version from ${target}, and your edits are discarded.`}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={() => void run(true)}>
              Discard edits and update
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </>
  )
}
