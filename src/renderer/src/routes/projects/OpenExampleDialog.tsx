// "Open a copy" of an example project (#169): choose where the copy goes, then open it.
import { useState, type FormEvent } from 'react'
import type { ExampleInfo } from '@shared/ipc'
import type { OpenProject } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'

function OpenExampleForm(props: {
  example: ExampleInfo
  defaultParent: string
  onOpened: (p: OpenProject) => void
  onCancel: () => void
}) {
  const [parentDir, setParentDir] = useState(props.defaultParent)
  const [busy, setBusy] = useState(false)

  const browse = async () => {
    const picked = await call('dialog:open-directory', {
      title: 'Choose where to put the copy',
      ...(parentDir ? { defaultPath: parentDir } : {}),
    })
    if (picked) setParentDir(picked)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const dir = parentDir.trim()
      props.onOpened(
        await call('examples:open', {
          slug: props.example.slug,
          ...(dir ? { parentDir: dir } : {}),
        }),
      )
    } catch (err) {
      toast.error('Could not open the example', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate aria-label="Open example">
      <Field
        label="Copy into"
        hint="A new project folder is created inside this folder; nothing there is overwritten. Leave empty to use the default projects folder from Settings, or Documents/Action Stations."
      >
        {({ id, describedBy }) => (
          <div className="row">
            <input
              id={id}
              className="input mono"
              value={parentDir}
              placeholder="Default projects folder"
              aria-describedby={describedBy}
              onChange={(e) => setParentDir(e.target.value)}
            />
            <Button onClick={() => void browse()}>Choose…</Button>
          </div>
        )}
      </Field>
      <div className="dialog__footer">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Copying…' : 'Copy and open'}
        </Button>
      </div>
    </form>
  )
}

export function OpenExampleDialog(props: {
  example: ExampleInfo | null
  onClose: () => void
  onOpened: (p: OpenProject) => void
}) {
  const settings = useIpcQuery('settings:get', undefined)
  const { example } = props
  return (
    <Dialog
      open={!!example}
      onOpenChange={(open) => !open && props.onClose()}
      title={example ? `Open “${example.title}”` : 'Open example'}
      description="You work on a copy, so you can change, generate and export freely. The example itself stays as it shipped."
    >
      {example && (
        <OpenExampleForm
          example={example}
          defaultParent={settings.data?.defaultProjectsDir ?? ''}
          onOpened={props.onOpened}
          onCancel={props.onClose}
        />
      )}
    </Dialog>
  )
}
