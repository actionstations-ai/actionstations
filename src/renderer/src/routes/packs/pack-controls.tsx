// Pack controls (#268, #1152): the enabled switch and the uninstall confirmation, used by the
// pack page and Your packs.
import type { ReactNode } from 'react'
import type { InstalledPackView } from '@shared/ipc'
import { Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'

const INVALIDATES = ['packs:list', 'packs:updates'] as const

export function EnabledSwitch({ pack, ...props }: { pack: InstalledPackView; label?: ReactNode }) {
  const set = useIpcMutation('packs:setEnabled', {
    invalidates: [...INVALIDATES, 'domains:list', 'templates:list', 'templates:taxonomy'],
  })
  const id = `pack-enabled-${pack.id}`
  const hintId = `${id}-hint`
  return (
    <span className="row pack-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={pack.enabled}
        aria-describedby={pack.core ? hintId : undefined}
        disabled={set.isPending || !!pack.broken || !!pack.core}
        onChange={(e) =>
          set.mutate(
            { id: pack.id, enabled: e.target.checked },
            { onError: (err) => toast.error(`Could not change ${pack.name}`, err) },
          )
        }
      />
      <label htmlFor={id}>{props.label ?? 'Enabled'}</label>
      {pack.core && (
        <span id={hintId} className="muted">
          Always on: the app needs it.
        </span>
      )}
    </span>
  )
}

export function UninstallDialog(props: { pack: InstalledPackView | null; onClose: () => void }) {
  const remove = useIpcMutation('packs:uninstall', { invalidates: [...INVALIDATES] })
  const pack = props.pack
  return (
    <Dialog
      open={!!pack}
      onOpenChange={(o) => !o && props.onClose()}
      title={pack ? `Uninstall ${pack.name}?` : 'Uninstall'}
      description="Projects keep the copies of templates, workflows, documents and domain profiles they already use, so they keep working. Prompts from the pack stop applying to new generation."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              pack &&
              remove.mutate(
                { id: pack.id },
                {
                  onSuccess: () => {
                    toast.success(`${pack.name} uninstalled`)
                    props.onClose()
                  },
                  onError: (err) => toast.error('Could not uninstall the pack', err),
                },
              )
            }
          >
            Uninstall
          </Button>
        </>
      }
    >
      {pack && <p className="mono">{pack.id}</p>}
    </Dialog>
  )
}
